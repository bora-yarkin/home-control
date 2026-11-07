# SPDX-License-Identifier: GPL-3.0-or-later
"""Running scenes: sessions held in memory, and the commands they send.

A session is a scene while it plays (D-4: nothing about it is stored). The engine owns
the sessions; a light belongs to at most one of them. Time and sleeping are passed in
so tests can drive a session step by step.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections.abc import Awaitable, Callable, Coroutine
from dataclasses import dataclass, field, replace
from typing import Any

from .chroma import nearest_kelvin
from .colours import cycle_seconds
from .const import DEFAULT_RATE, MAX_SESSIONS, SPEED_STEPS
from .definitions import Definition
from .driver import Driver, LightInfo
from .effects import build
from .limiter import Limiter

_LOGGER = logging.getLogger(__name__)

# A light is taken to have been changed by someone else when it is this far from every one of
# the last few colours the engine sent it, once the latest should have been reached. The limits
# are generous, and several colours count, because a light that is behind in a fade must not be
# mistaken for that: a hub reports a fade when it ends, so on a fast palette the light can still
# show the colour of the command before (or the one before that), which is far from the latest.
CHANGED_XY = 0.12
CHANGED_BRIGHTNESS = 80
RECENT_TARGETS = 3

# Updates of a light that fades by itself: as often as the palette needs, within these seconds.
MIN_INTERVAL = 1.5
MAX_INTERVAL = 6.0
# A light playing its own effect is recoloured no more often than this (every change is a write to the bridge).
NATIVE_MIN_INTERVAL = 3.0


@dataclass
class _Light:
    next_due: float = 0.0
    target: tuple[float, float, int] | None = None  # the (x, y, brightness) last sent
    # What the light showed before the first command and the last few commands sent, the latest included.
    recent: list[tuple[float, float, int]] = field(default_factory=list)
    reach_at: float = 0.0
    driven: bool = False
    native: bool = False  # playing one of the light's own effects, which the engine only recolours


@dataclass
class StepResult:
    commands: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)


class Session:
    """One playing scene: its definition, how far through the palette it is, and its lights."""

    def __init__(self, definition: Definition, now: float) -> None:
        self.definition = definition
        self.phase = 0.0  # how far through the current loop, 0 up to 1
        self.progress = 0.0  # loops played since the start; only goes up
        self.seconds = 0.0  # seconds played since the start; only goes up (brightness effects run on this)
        self.last = now
        self.frozen = False
        self.wake = asyncio.Event()  # set to make the loop look at the session now
        self.lights: dict[str, _Light] = {light.entity_id: _Light(driven=definition.wake) for light in definition.lights}
        self._look = build(definition)

    def retune(self, definition: Definition) -> None:
        """Takes new settings (speed, range, brightness) without changing which lights play."""
        self.definition = definition
        self._look = build(definition)

    def _interval(self, entity_id: str, info: LightInfo) -> float:
        if not info.can_transition:
            return 1.0 / self.definition.fps
        wanted, floor = self._look.interval(entity_id, cycle_seconds(self.definition.speed))
        lowest = MIN_INTERVAL if floor is None else min(MIN_INTERVAL, floor)
        return max(lowest, min(MAX_INTERVAL, wanted))

    def _target(self, entity_id: str, phase: float, progress: float, seconds: float) -> tuple[float, float, int]:
        x, y, b = self._look.colour(entity_id, phase, progress, seconds)
        bri = round(self._look.brightness(entity_id) * b / 100)
        return (x, y, max(1, min(255, bri)))

    @staticmethod
    def _changed(info: LightInfo, target: tuple[float, float, int], *, brightness_moves: bool = False) -> bool:
        """Whether a light is far from what the scene last sent it. A light playing brightness effects swings further, and
        lags further behind, than any fixed limit (lightning went from 15% to 100% in a fraction of a second), so for it only
        being switched off or given another colour counts."""
        if info.state == "off":
            return True
        if info.can_colour and info.xy is not None and math.hypot(info.xy[0] - target[0], info.xy[1] - target[1]) > CHANGED_XY:
            return True
        return not brightness_moves and info.brightness is not None and abs(info.brightness - target[2]) > CHANGED_BRIGHTNESS

    def _advance(self, now: float) -> None:
        """Moves the scene's clock on to ``now``; a frozen scene keeps its place."""
        elapsed = max(0.0, now - self.last)
        self.last = now
        if self.frozen:
            return
        loops = elapsed / cycle_seconds(self.definition.speed)
        self.phase = (self.phase + loops) % 1.0
        self.progress += loops
        self.seconds += elapsed

    def _left_the_scene(self, entity_id: str, light: _Light, info: LightInfo, now: float) -> bool:
        """Whether something else has taken the light from the scene (a frozen scene is still watched for this)."""
        if light.native and info.state == "off":
            return True  # someone switched it off while it played its own effect
        if light.target is None or now < light.reach_at - 0.25:
            return False
        moves = self._look.moves_brightness(entity_id)
        return all(self._changed(info, sent, brightness_moves=moves) for sent in light.recent)

    def _command(self, entity_id: str, light: _Light, info: LightInfo, now: float) -> dict[str, Any]:
        """What to send a light that is due: its own effect with the scene's colour, or the colour and brightness for this moment."""
        native = self._look.native(entity_id)
        if native is not None and native in info.effects and info.can_colour:
            return self._native_command(entity_id, native, light, now)
        interval = self._interval(entity_id, info)
        ahead = interval if info.can_transition else 0.0
        ahead_loops = ahead / cycle_seconds(self.definition.speed)
        x, y, bri = self._target(entity_id, self.phase + ahead_loops, self.progress + ahead_loops, self.seconds + ahead)
        data: dict[str, Any] = {"brightness": bri}
        if info.can_colour:
            data["xy_color"] = [round(x, 4), round(y, 4)]
        elif info.can_white:
            data["color_temp_kelvin"] = nearest_kelvin((x, y))
        if info.can_transition:
            data["transition"] = round(interval, 1)
        light.target = (x, y, bri)
        if not light.recent and info.xy is not None:
            # Until the first fade ends the light still shows what it showed before the scene: that is not someone else either.
            light.recent.append((info.xy[0], info.xy[1], info.brightness if info.brightness is not None else bri))
        light.recent = [*light.recent, light.target][-(RECENT_TARGETS + 1) :]
        light.reach_at = now + ahead
        light.next_due = now + interval
        light.driven = True
        return data

    def step(self, now: float, driver: Driver, held: set[str]) -> StepResult:
        """What to do at this moment: the commands that are due, and the lights that left the scene."""
        result = StepResult()
        self._advance(now)
        for entity_id, light in self.lights.items():
            if entity_id in held:
                continue
            info = driver.info(entity_id)
            if info is None or info.state == "unavailable":
                continue
            if info.state == "off" and not light.driven:
                continue  # never turned on by a scene
            if self._left_the_scene(entity_id, light, info, now):
                result.dropped.append(entity_id)
            elif not self.frozen and now >= light.next_due:
                result.commands.append((entity_id, self._command(entity_id, light, info, now)))
        return result

    def _native_command(self, entity_id: str, native: str, light: _Light, now: float) -> dict[str, Any]:
        """The light plays its own effect; the scene only changes its colour (the palette's, moving) and brightness, and not often."""
        interval = max(NATIVE_MIN_INTERVAL, min(MAX_INTERVAL, cycle_seconds(self.definition.speed) / self._look.steps(entity_id)))
        x, y, bri = self._target(entity_id, self.phase, self.progress, self.seconds)
        light.target = None  # the light's colour is not the one sent while its effect plays, so it cannot be compared
        light.recent = []
        light.native = True
        light.driven = True
        light.next_due = now + interval
        speed = round((self.definition.speed - 1) / (SPEED_STEPS - 1), 2)
        return {"brightness": bri, "native_effect": {"effect": native, "xy": [round(x, 4), round(y, 4)], "speed": speed}}

    def next_wake(self, now: float) -> float:
        """The next moment a light is due (at least a little ahead)."""
        due = [light.next_due for light in self.lights.values()]
        return max(now + 0.1, min(due)) if due else now + 1.0


class Engine:
    """All running scenes."""

    def __init__(
        self,
        driver: Driver,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        spawn: Callable[[Coroutine[Any, Any, None]], asyncio.Task[None]] | None = None,
    ) -> None:
        self._driver = driver
        self._clock = clock
        self._sleep = sleep
        self._spawn = spawn or (lambda coro: asyncio.get_running_loop().create_task(coro))
        self.sessions: dict[str, Session] = {}
        self._owner: dict[str, str] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._limiters: dict[str, Limiter] = {}
        self.held: set[str] = set()
        self._listeners: list[Callable[[], None]] = []

    # --- listeners and state ----------------------------------------------

    def add_listener(self, callback: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(callback)
        return lambda: self._listeners.remove(callback) if callback in self._listeners else None

    def _notify(self) -> None:
        for callback in list(self._listeners):
            callback()

    def snapshot(self) -> dict[str, dict[str, Any]]:
        return {
            sid: {
                "state": "frozen" if s.frozen else "running",
                "lights": list(s.lights),
                "speed": s.definition.speed,
                "range": s.definition.range_pct,
                "brightness": s.definition.brightness,
                "spread": s.definition.spread,
                "colour_source": s.definition.colour_source,
            }
            for sid, s in self.sessions.items()
        }

    # --- starting and stopping --------------------------------------------

    def start(self, definition: Definition) -> None:
        """Starts a scene (replacing a running one with the same id). Newer scenes take over shared lights."""
        if definition.scene_id not in self.sessions and len(self.sessions) >= MAX_SESSIONS:
            raise ValueError(f"at most {MAX_SESSIONS} scenes can run at once")
        self.stop(definition.scene_id, notify=False)
        session = Session(definition, self._clock())
        for light in definition.lights:
            previous = self._owner.get(light.entity_id)
            if previous is not None:
                self._release(previous, light.entity_id)
            self._owner[light.entity_id] = definition.scene_id
        self.sessions[definition.scene_id] = session
        self._tasks[definition.scene_id] = self._spawn(self._run(definition.scene_id))
        self._notify()

    def stop(self, scene_id: str, *, notify: bool = True) -> None:
        """Ends a scene. The lights stay as they are (D-2)."""
        session = self.sessions.pop(scene_id, None)
        task = self._tasks.pop(scene_id, None)
        if task is not None:
            task.cancel()
        if session is None:
            return
        for entity_id in session.lights:
            if self._owner.get(entity_id) == scene_id:
                del self._owner[entity_id]
        if notify:
            self._notify()

    def stop_all(self) -> None:
        for scene_id in list(self.sessions):
            self.stop(scene_id, notify=False)
        self._notify()

    def update(
        self,
        scene_id: str,
        *,
        speed: int | None = None,
        range_pct: int | None = None,
        brightness: int | None = None,
    ) -> None:
        session = self._session(scene_id)
        changes = {k: v for k, v in (("speed", speed), ("range_pct", range_pct), ("brightness", brightness)) if v is not None}
        session.retune(replace(session.definition, **changes))
        for light in session.lights.values():
            light.next_due = 0.0  # a change is shown at once
        session.wake.set()
        self._notify()

    def freeze(self, scene_id: str) -> None:
        session = self._session(scene_id)
        session.frozen = True
        self._notify()

    def play(self, scene_id: str) -> None:
        session = self._session(scene_id)
        session.frozen = False
        session.last = self._clock()
        for light in session.lights.values():
            light.next_due = 0.0
        session.wake.set()
        self._notify()

    def _session(self, scene_id: str) -> Session:
        session = self.sessions.get(scene_id)
        if session is None:
            raise KeyError(f"no running scene {scene_id}")
        return session

    # --- lights leaving a scene ------------------------------------------

    def _release(self, scene_id: str, entity_id: str) -> None:
        session = self.sessions.get(scene_id)
        if session is None:
            return
        session.lights.pop(entity_id, None)
        if self._owner.get(entity_id) == scene_id:
            del self._owner[entity_id]
        if not session.lights:
            self.stop(scene_id)

    def owns(self, entity_id: str) -> bool:
        """Whether a running scene has this light."""
        return entity_id in self._owner

    def changed_by_someone(self, entity_id: str) -> None:
        """A light was changed by a person (D-3): it leaves the scene it was in."""
        scene_id = self._owner.get(entity_id)
        if scene_id is not None and entity_id not in self.held:
            self._release(scene_id, entity_id)
            self._notify()

    # --- the loop ----------------------------------------------------------

    def _limiter(self, info: LightInfo) -> Limiter:
        if info.group not in self._limiters:
            rate = info.rate or DEFAULT_RATE
            self._limiters[info.group] = Limiter(rate, self._clock, self._sleep)
        return self._limiters[info.group]

    async def _run(self, scene_id: str) -> None:
        """Plays a scene until it is stopped. An unexpected error ends the scene (it is logged), so a scene is never listed as running with nothing playing it."""
        try:
            await self._play(scene_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            _LOGGER.exception("Scene %s stopped because of an error", scene_id)
            self.stop(scene_id)

    async def _play(self, scene_id: str) -> None:
        while True:
            session = self.sessions.get(scene_id)
            if session is None:
                return
            result = session.step(self._clock(), self._driver, self.held)
            for entity_id in result.dropped:
                self._release(scene_id, entity_id)
            if result.dropped:
                self._notify()
            for entity_id, data in result.commands:
                await self._send(entity_id, data)
            session = self.sessions.get(scene_id)
            if session is None:
                return
            now = self._clock()
            await self._nap(session, 1.0 if session.frozen else max(0.1, session.next_wake(now) - now))

    async def _nap(self, session: Session, seconds: float) -> None:
        """Sleeps, but wakes at once when the session's settings change."""
        session.wake.clear()
        sleeper = asyncio.ensure_future(self._sleep(seconds))
        waker = asyncio.ensure_future(session.wake.wait())
        try:
            await asyncio.wait({sleeper, waker}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            sleeper.cancel()
            waker.cancel()

    async def _send(self, entity_id: str, data: dict[str, Any]) -> None:
        info = self._driver.info(entity_id)
        if info is None:
            return
        await self._limiter(info).acquire()
        try:
            await self._driver.turn_on(entity_id, data)
        except Exception as err:
            _LOGGER.warning("Could not send a colour to %s: %s", entity_id, err)
