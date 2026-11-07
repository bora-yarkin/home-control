# SPDX-License-Identifier: GPL-3.0-or-later
"""Fake lights and clocks for the scene engine tests."""

from __future__ import annotations

import asyncio
import dataclasses
import heapq
from typing import Any

from tests.support import load

# The command rate of a Hue bridge, which Hue Plus declares (home_control.json); the fake lights are Hue lights.
HUE_RATE = 8.0

driver = load("live.driver")
LightInfo = driver.LightInfo


def info(
    state: str = "on",
    *,
    brightness: int | None = 200,
    xy: tuple[float, float] | None = (0.4, 0.4),
    kelvin: int | None = None,
    colour: bool = True,
    white: bool = True,
    transition: bool = True,
    group: str = "hue:1",
    mode: str | None = "xy",
    effects: tuple[str, ...] = (),
    rate: float | None = HUE_RATE,
) -> Any:
    return LightInfo(state, brightness, xy, kelvin, colour, white, transition, group, mode, effects, rate)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.now += seconds
        await asyncio.sleep(0)


class VirtualClock:
    """Virtual time for tests with several waiting tasks: a sleep ends only when `run` moves time to it."""

    def __init__(self) -> None:
        self.now = 1000.0
        self._timers: list[tuple[float, int, asyncio.Future[None]]] = []
        self._seq = 0

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        future: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        self._seq += 1
        heapq.heappush(self._timers, (self.now + seconds, self._seq, future))
        await future

    async def run(self, seconds: float) -> None:
        """Lets the tasks run for `seconds` of virtual time."""
        end = self.now + seconds
        while True:
            for _ in range(25):
                await asyncio.sleep(0)
            self._timers = [t for t in self._timers if not t[2].done()]
            heapq.heapify(self._timers)
            if not self._timers or self._timers[0][0] > end:
                break
            wake, _, future = heapq.heappop(self._timers)
            self.now = max(self.now, wake)
            future.set_result(None)
        self.now = end


class FakeDriver:
    """Lights that remember what they were told. `fail` makes turn_on raise for those ids."""

    def __init__(self, lights: dict[str, Any]) -> None:
        self.lights = dict(lights)
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.fail: set[str] = set()

    def info(self, entity_id: str) -> Any:
        return self.lights.get(entity_id)

    async def turn_on(self, entity_id: str, data: dict[str, Any]) -> None:
        """Records the call and makes the light show what it was told (a fade is taken as instant)."""
        if entity_id in self.fail:
            raise RuntimeError("light does not answer")
        self.calls.append(("on", entity_id, data))
        before = self.lights[entity_id]
        changes: dict[str, Any] = {"state": "on"}
        if "brightness" in data:
            changes["brightness"] = data["brightness"]
        if "xy_color" in data:
            changes["xy"] = tuple(data["xy_color"])
            changes["mode"] = "xy"
        if "color_temp_kelvin" in data:
            changes["kelvin"] = data["color_temp_kelvin"]
            changes["mode"] = "color_temp"
        self.lights[entity_id] = dataclasses.replace(before, **changes)

    async def turn_off(self, entity_id: str) -> None:
        self.calls.append(("off", entity_id, {}))
        self.lights[entity_id] = dataclasses.replace(self.lights[entity_id], state="off")

    def follow(self, commands: list[tuple[str, dict[str, Any]]]) -> None:
        """Lets lights show what a step commanded, as a real light does once its fade ends."""
        for entity_id, data in commands:
            self.lights[entity_id] = dataclasses.replace(
                self.lights[entity_id],
                brightness=data.get("brightness"),
                xy=tuple(data["xy_color"]) if "xy_color" in data else self.lights[entity_id].xy,
            )
