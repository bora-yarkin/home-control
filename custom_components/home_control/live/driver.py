# SPDX-License-Identifier: GPL-3.0-or-later
"""What the engine needs from the outside: the state of a light and a way to command it.

The engine knows nothing of Home Assistant; `hass_driver.py` implements this for it and
the tests implement it with fake lights.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class LightInfo:
    state: str  # "on", "off" or "unavailable"
    brightness: int | None  # 1 to 255
    xy: tuple[float, float] | None
    kelvin: int | None
    can_colour: bool
    can_white: bool
    can_transition: bool
    group: str  # lights sharing a bridge or hub share this key (and a command rate)
    mode: str | None = None  # the colour mode now: "color_temp" or a colour mode
    effects: tuple[str, ...] = ()  # the light's own effects it can play (a Hue light: "candle", "underwater", ...)
    rate: float | None = None  # commands per second its bridge or hub takes, when a plus integration knows; None: the default


class Driver(Protocol):
    def info(self, entity_id: str) -> LightInfo | None:
        """The light's state, or None when it does not exist."""

    async def turn_on(self, entity_id: str, data: dict[str, Any]) -> None: ...

    async def turn_off(self, entity_id: str) -> None: ...
