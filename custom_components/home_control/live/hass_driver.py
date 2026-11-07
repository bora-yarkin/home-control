# SPDX-License-Identifier: GPL-3.0-or-later
"""The engine's view of Home Assistant: light states, and ``light.turn_on`` / ``light.turn_off`` calls.

Every light is played the same way. A plus integration (``providers.py``) adds, for the lights it owns, their command rate and their own
effects, and plays an effect with a colour itself.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .driver import LightInfo
from .providers import Providers

_COLOUR_MODES = {"xy", "hs", "rgb", "rgbw", "rgbww"}
_TRANSITION_FEATURE = 32  # LightEntityFeature.TRANSITION


class HassDriver:
    def __init__(self, hass: HomeAssistant, providers: Providers) -> None:
        self._hass = hass
        self._providers = providers

    def _platform(self, entity_id: str) -> er.RegistryEntry | None:
        return er.async_get(self._hass).async_get(entity_id)

    def info(self, entity_id: str) -> LightInfo | None:
        state = self._hass.states.get(entity_id)
        if state is None:
            return None
        status = state.state if state.state in ("on", "off") else "unavailable"
        attrs = state.attributes
        modes = set(attrs.get("supported_color_modes") or [])
        xy = attrs.get("xy_color")
        entry = self._platform(entity_id)
        group, rate, effects = "default", None, ()
        if entry is not None:
            group = f"{entry.platform}:{entry.config_entry_id or ''}"
            owned = self._providers.for_platform(entry.platform)
            if owned is not None:
                provider, kind = owned
                group = kind.group or group
                rate = kind.rate
                if kind.effects and provider.plays_effects():
                    effects = tuple(e for e in (attrs.get("effect_list") or ()) if e in provider.effects)
        return LightInfo(
            state=status,
            brightness=attrs.get("brightness"),
            xy=(float(xy[0]), float(xy[1])) if xy else None,
            kelvin=attrs.get("color_temp_kelvin"),
            can_colour=bool(modes & _COLOUR_MODES),
            can_white="color_temp" in modes,
            can_transition=bool((attrs.get("supported_features") or 0) & _TRANSITION_FEATURE),
            group=group,
            mode=attrs.get("color_mode"),
            effects=effects,
            rate=rate,
        )

    async def turn_on(self, entity_id: str, data: dict[str, Any]) -> None:
        spec = data.get("native_effect")
        if spec is not None:
            entry = self._platform(entity_id)
            played = entry is not None and await self._providers.async_play_effect(
                entity_id,
                entry.platform,
                {"effect": spec["effect"], "xy": spec["xy"], "brightness": data["brightness"], "speed": spec["speed"]},
            )
            if not played:  # its provider is gone: the colour without the effect
                await self._hass.services.async_call(
                    "light", "turn_on", {"entity_id": entity_id, "brightness": data["brightness"], "xy_color": spec["xy"]}, blocking=False
                )
            return
        await self._hass.services.async_call("light", "turn_on", {"entity_id": entity_id, **data}, blocking=False)

    async def turn_off(self, entity_id: str) -> None:
        await self._hass.services.async_call("light", "turn_off", {"entity_id": entity_id}, blocking=False)
