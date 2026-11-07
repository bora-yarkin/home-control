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
from itertools import pairwise
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
# A light the colour check let go of is watched this long while the scene still has other lights; it rejoins when it shows one of
# the scene's colours again.
WATCH_SECONDS = 120.0

# Updates of a light that fades by itself: as often as the palette needs, within these seconds.
MIN_INTERVAL = 1.5
MAX_INTERVAL = 6.0
# A segmented scene changes a light's colour as its segment ends, never sooner than this after the last change, and a little after the
# boundary so the change is not made just before it.
SEGMENT_MIN_INTERVAL = 0.1
SEGMENT_PAST_BOUNDARY = 0.03
# The motion of a light never stops (as in the bridge's own scenes): each command fades the light to its colour over the time until the
# next command can reach it, and a little longer, so the next one arrives while the light is still moving. That time is how often
# the light really is sent a command, which is more than its interval when the hub's rate holds it back (a bridge takes about 8 a
# second for all its lights, so 17 lights are 2 seconds apart).
FADE_OVERLAP = 0.6
MAX_FADE = 120.0
# A light playing its own effect is recoloured no more often than this (every change is a write to the bridge), and only when its colour
# or brightness has really moved (a new colour may start the effect's animation again), or this long after the last time.
NATIVE_MIN_INTERVAL = 3.0
NATIVE_MIN_XY = 0.01
NATIVE_MIN_BRIGHTNESS = 8
NATIVE_REFRESH_SECONDS = 60.0
# A light that was off when it was sent its first command is not taken to have been switched off by someone else for this long after
# the command was sent: a hub, a cloud or a queue behind other lights can take that long to switch it on.
WAKE_GRACE_SECONDS = 10.0


@dataclass
class _Light:
    next_due: float = 0.0
    target: tuple[float, float, int] | None = None  # the (x, y, brightness) last sent
    # What the light showed before the first command (reached at 0) and the last few commands sent, the latest included, each with the
    # time its fade is to end: (x, y, brightness, reached at).
    recent: list[tuple[float, float, int, float]] = field(default_factory=list)
    driven: bool = False
    native: bool = False  # playing one of the light's own effects, which the engine only recolours
    ahead: float = 0.0  # how far ahead of now the last command's colour is meant to be reached
    last_sent: float = 0.0  # when the last command went out (0: none yet, or the scene was frozen since)
    period: float = 0.0  # how often the light really is sent a command (smoothed): the hub's rate can hold it back past its interval
    waking: bool = False  # it was off when the last command was built: that command is to switch it on
    grace_until: float = 0.0  # until then a waking light that shows as off, or as on but part way to its colour, has only not finished
    refresh: bool = False  # a change of the scene's settings is to be shown even though the scene is frozen
    native_pending: tuple[float, float, int, float] | None = None  # (x, y, brightness, speed) of the effect command built last
    native_sent: tuple[float, float, int, float] | None = None  # the same, once it was sent
    native_sent_at: float = 0.0


@dataclass
class StepResult:
    commands: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)
    rejoined: list[str] = field(default_factory=list)


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
        # Lights the colour check let go of, with the time they stop being watched.
        self.watching: dict[str, tuple[_Light, float]] = {}
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

    def _segment_interval(self, entity_id: str) -> float:
        """Seconds until a light of a segmented scene is next to be updated: when its colour next changes, or sooner for its brightness effects."""
        loops = self._look.until_next(entity_id, self.phase)
        change = loops * cycle_seconds(self.definition.speed) + SEGMENT_PAST_BOUNDARY if loops is not None else math.inf
        effects, _floor = self._look.effect_interval(entity_id)
        return max(SEGMENT_MIN_INTERVAL, min(change, effects if effects is not None else math.inf, 3600.0))

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

    @staticmethod
    def _on_the_way(
        info: LightInfo, a: tuple[float, float, int, float], b: tuple[float, float, int, float], *, brightness_moves: bool
    ) -> bool:
        """Whether a light shows what a fade from one command's colour to the next has it at: near the straight line between the two in
        colour, and between their brightnesses."""
        if info.can_colour and info.xy is not None:
            ax, ay, bx, by = a[0], a[1], b[0], b[1]
            dx, dy = bx - ax, by - ay
            length = dx * dx + dy * dy
            t = 0.0 if length == 0 else max(0.0, min(1.0, ((info.xy[0] - ax) * dx + (info.xy[1] - ay) * dy) / length))
            if math.hypot(info.xy[0] - (ax + t * dx), info.xy[1] - (ay + t * dy)) > CHANGED_XY:
                return False
        if brightness_moves or info.brightness is None:
            return True
        return min(a[2], b[2]) - CHANGED_BRIGHTNESS <= info.brightness <= max(a[2], b[2]) + CHANGED_BRIGHTNESS

    def _far_from_what_was_sent(self, info: LightInfo, recent: list[tuple[float, float, int, float]], *, brightness_moves: bool) -> bool:
        """Whether a light shows nothing the scene gave it: it is off, or far from every one of the last colours sent (and the colour it
        had before) and from every fade between two of them. The fades overlap, so a light is at one of the colours or on its way
        between two."""
        if info.state == "off":
            return True
        if any(not self._changed(info, r[:3], brightness_moves=brightness_moves) for r in recent):
            return False
        return not any(self._on_the_way(info, a, b, brightness_moves=brightness_moves) for a, b in pairwise(recent))

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
        if now < light.grace_until:
            return False  # a light sent its command to switch it on has not finished: off, or on and still fading up, is not someone else
        if light.native and info.state == "off":
            return True  # someone switched it off while it played its own effect
        if light.target is None:
            return False
        # The fades overlap, so a light is judged once one of the scene's fades has ended, against everything it may show: the colours sent
        # and the paths between them.
        if not any(0 < r[3] <= now + 0.25 for r in light.recent):
            return False
        return self._far_from_what_was_sent(info, light.recent, brightness_moves=self._look.moves_brightness(entity_id))

    def _command(self, entity_id: str, light: _Light, info: LightInfo, now: float) -> dict[str, Any] | None:
        """What to send a light that is due: its own effect with the scene's colour, or the colour and brightness for this moment.
        None when it plays its own effect and nothing about it has changed enough to send."""
        light.waking = info.state == "off"
        light.refresh = False
        native = self._look.native(entity_id)
        if native is not None and native in info.effects and info.can_colour:
            return self._native_command(entity_id, native, light, now)
        segmented = self.definition.mode == "segmented"
        interval = self._segment_interval(entity_id) if segmented else self._interval(entity_id, info)
        # The fade outlasts the time to the next command, so the light never rests. A blend aims at the colour the palette will have when the
        # fade ends; a segment's colour is the one that has begun (the next boundary is where the next colour begins).
        fade = min(max(interval, light.period) + FADE_OVERLAP, MAX_FADE)
        ahead = fade if info.can_transition else 0.0
        looks_ahead = 0.0 if segmented else ahead
        ahead_loops = looks_ahead / cycle_seconds(self.definition.speed)
        x, y, bri = self._target(entity_id, self.phase + ahead_loops, self.progress + ahead_loops, self.seconds + looks_ahead)
        data: dict[str, Any] = {"brightness": bri}
        if info.can_colour:
            data["xy_color"] = [round(x, 4), round(y, 4)]
        elif info.can_white:
            data["color_temp_kelvin"] = nearest_kelvin((x, y))
        if info.can_transition:
            data["transition"] = round(fade, 1)
        light.target = (x, y, bri)
        if not light.recent and info.xy is not None:
            # Until the first fade ends the light still shows what it showed before the scene: that is not someone else either.
            light.recent.append((info.xy[0], info.xy[1], info.brightness if info.brightness is not None else bri, 0.0))
        light.recent = [*light.recent, (x, y, bri, now + ahead)][-(RECENT_TARGETS + 1) :]
        light.ahead = ahead
        light.next_due = now + interval
        light.driven = True
        return data

    def sent(self, entity_id: str, at: float) -> None:
        """A command for a light has gone out (``at`` is when, which is later than when it was built when the hub's rate held it back):
        the time its colour is to be reached, and the time a light that was off is given to switch on, run from now."""
        light = self.lights.get(entity_id)
        if light is None:
            return
        if light.recent and light.recent[-1][3] > 0 and not light.native:
            light.recent[-1] = (*light.recent[-1][:3], max(light.recent[-1][3], at + light.ahead))
        if light.last_sent:
            gap = min(at - light.last_sent, MAX_FADE)
            light.period = gap if not light.period else 0.5 * (light.period + gap)
        light.last_sent = at
        if light.waking:
            light.grace_until = at + WAKE_GRACE_SECONDS
        if light.native_pending is not None:
            light.native_sent, light.native_sent_at, light.native_pending = light.native_pending, at, None

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
            if info.state == "on":
                light.waking = False
            if self._left_the_scene(entity_id, light, info, now):
                result.dropped.append(entity_id)
            elif (not self.frozen or light.refresh) and now >= light.next_due:
                command = self._command(entity_id, light, info, now)
                if command is not None:
                    result.commands.append((entity_id, command))
        self._look_for_lights_that_came_back(now, driver, held, result)
        return result

    def _look_for_lights_that_came_back(self, now: float, driver: Driver, held: set[str], result: StepResult) -> None:
        """A light let go of by the colour check (it may only have been behind) rejoins when it shows a colour the scene sent it, and
        is forgotten when it has not within WATCH_SECONDS."""
        for entity_id, (light, until) in list(self.watching.items()):
            if now >= until:
                del self.watching[entity_id]
                continue
            info = driver.info(entity_id)
            if entity_id in held or info is None or info.state != "on" or not light.recent:
                continue
            moves = self._look.moves_brightness(entity_id)
            if not self._far_from_what_was_sent(info, light.recent, brightness_moves=moves):
                result.rejoined.append(entity_id)

    def _native_command(self, entity_id: str, native: str, light: _Light, now: float) -> dict[str, Any] | None:
        """The light plays its own effect; the scene only changes its colour (the palette's, moving) and brightness, and not often: a
        new colour may start the effect's animation again, so nothing is sent while the colour, the brightness and the speed are as sent."""
        interval = max(NATIVE_MIN_INTERVAL, min(MAX_INTERVAL, cycle_seconds(self.definition.speed) / self._look.steps(entity_id)))
        x, y, bri = self._target(entity_id, self.phase, self.progress, self.seconds)
        light.target = None  # the light's colour is not the one sent while its effect plays, so it cannot be compared
        light.recent = []
        light.native = True
        light.driven = True
        light.next_due = now + interval
        speed = round((self.definition.speed - 1) / (SPEED_STEPS - 1), 2)
        wanted = (round(x, 4), round(y, 4), bri, speed)
        before = light.native_sent
        if (
            before is not None
            and light.native_pending is None
            and light.waking is False
            and speed == before[3]
            and math.hypot(x - before[0], y - before[1]) < NATIVE_MIN_XY
            and abs(bri - before[2]) < NATIVE_MIN_BRIGHTNESS
            and now - light.native_sent_at < NATIVE_REFRESH_SECONDS
        ):
            return None
        light.ahead = 0.0
        light.native_pending = wanted
        return {"brightness": bri, "native_effect": {"effect": native, "xy": [wanted[0], wanted[1]], "speed": speed}}

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
            light.next_due = 0.0  # a change is shown at once, also by a frozen scene
            light.refresh = True
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
            light.last_sent = 0.0  # the pause is not how often the light is sent a command
        session.wake.set()
        self._notify()

    def _session(self, scene_id: str) -> Session:
        session = self.sessions.get(scene_id)
        if session is None:
            raise KeyError(f"no running scene {scene_id}")
        return session

    # --- lights leaving a scene ------------------------------------------

    def _release(self, scene_id: str, entity_id: str, *, watch: bool = False) -> None:
        """A light leaves a scene. With `watch` (the colour check let it go, which may be a mistake) it is looked at for a while and
        can rejoin; without it (a person changed it, or another scene took it) it is gone."""
        session = self.sessions.get(scene_id)
        if session is None:
            return
        light = session.lights.pop(entity_id, None)
        if watch and light is not None:
            session.watching[entity_id] = (light, self._clock() + WATCH_SECONDS)
        if self._owner.get(entity_id) == scene_id:
            del self._owner[entity_id]
        if not session.lights:
            self.stop(scene_id)  # nothing left to play (everything was taken by something else): no light is left to rejoin it

    def _rejoin(self, scene_id: str, entity_id: str) -> None:
        """A watched light shows the scene's colours again: it plays again, unless another scene has it by now."""
        session = self.sessions.get(scene_id)
        watched = session.watching.pop(entity_id, None) if session is not None else None
        if session is None or watched is None or self._owner.get(entity_id) not in (None, scene_id):
            return
        light = watched[0]
        light.next_due = 0.0
        light.native_sent = None  # its effect may have ended while it was away
        session.lights[entity_id] = light
        self._owner[entity_id] = scene_id
        session.wake.set()

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
                self._release(scene_id, entity_id, watch=True)
            for entity_id in result.rejoined:
                self._rejoin(scene_id, entity_id)
            if result.dropped or result.rejoined:
                self._notify()
            if not session.lights:
                self.stop(scene_id)
                return
            for entity_id, data in result.commands:
                if await self._send(entity_id, data):
                    session.sent(entity_id, self._clock())
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

    async def _send(self, entity_id: str, data: dict[str, Any]) -> bool:
        """Sends one command, held back to the rate of the light's hub. True when it went out."""
        info = self._driver.info(entity_id)
        if info is None:
            return False
        await self._limiter(info).acquire()
        try:
            await self._driver.turn_on(entity_id, data)
        except Exception as err:
            _LOGGER.warning("Could not send a colour to %s: %s", entity_id, err)
            return False
        return True
