# SPDX-License-Identifier: GPL-3.0-or-later
"""Showing which light is which: a light turns red (dims if it has no colour) and is put back.

Used by the placement screen so a light being placed can be recognised in the room. The
light's state is saved first and restored when the identify ends, when it times out, or
when the integration unloads, so a light is never left red.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any

from .const import IDENTIFY_SECONDS
from .driver import Driver, LightInfo
from .engine import Engine

_LOGGER = logging.getLogger(__name__)

RED = [0.675, 0.322]
DIM_BRIGHTNESS = 25


class Identifier:
    def __init__(
        self,
        driver: Driver,
        engine: Engine,
        *,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        spawn: Callable[[Coroutine[Any, Any, None]], asyncio.Task[None]] | None = None,
        seconds: float = IDENTIFY_SECONDS,
    ) -> None:
        self._driver = driver
        self._engine = engine
        self._sleep = sleep
        self._spawn = spawn or (lambda coro: asyncio.get_running_loop().create_task(coro))
        self._seconds = seconds
        self._saved: dict[str, LightInfo] = {}
        self._timers: dict[str, asyncio.Task[None]] = {}

    async def start(self, entity_id: str) -> None:
        info = self._driver.info(entity_id)
        if info is None or info.state == "unavailable":
            raise ValueError(f"{entity_id} is not available")
        if entity_id not in self._saved:  # a second start keeps the first saved state
            self._saved[entity_id] = info
        self._engine.held.add(entity_id)
        data: dict[str, Any] = {"brightness": 255}
        if info.can_colour:
            data["xy_color"] = RED
        else:
            data["brightness"] = DIM_BRIGHTNESS if info.state == "on" else 255
        await self._driver.turn_on(entity_id, data)
        timer = self._timers.pop(entity_id, None)
        if timer is not None:
            timer.cancel()
        self._timers[entity_id] = self._spawn(self._expire(entity_id))

    async def _expire(self, entity_id: str) -> None:
        await self._sleep(self._seconds)
        self._timers.pop(entity_id, None)
        await self.stop(entity_id)

    async def stop(self, entity_id: str) -> None:
        """Puts the light back. Does nothing when it is not being identified."""
        timer = self._timers.pop(entity_id, None)
        if timer is not None and timer is not asyncio.current_task():
            timer.cancel()
        saved = self._saved.pop(entity_id, None)
        if saved is None:
            return
        try:
            if saved.state == "off":
                await self._driver.turn_off(entity_id)
            else:
                data: dict[str, Any] = {}
                if saved.brightness is not None:
                    data["brightness"] = saved.brightness
                if saved.mode == "color_temp" and saved.kelvin is not None:
                    data["color_temp_kelvin"] = saved.kelvin
                elif saved.can_colour and saved.xy is not None:
                    data["xy_color"] = list(saved.xy)
                elif saved.kelvin is not None:
                    data["color_temp_kelvin"] = saved.kelvin
                await self._driver.turn_on(entity_id, data)
        except Exception as err:
            _LOGGER.warning("Could not put %s back after identifying it: %s", entity_id, err)
        finally:
            self._engine.held.discard(entity_id)

    async def stop_all(self) -> None:
        for entity_id in list(self._saved):
            await self.stop(entity_id)
