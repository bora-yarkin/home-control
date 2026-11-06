# SPDX-License-Identifier: GPL-3.0-or-later
"""One sensor that lists the running live scenes, and how many are saved. The dashboard shows running scenes from it."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .live.setup import LiveRuntime


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([RunningScenes(entry)])


class RunningScenes(SensorEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_name = "Live scenes"
    _attr_icon = "mdi:palette"
    _unrecorded_attributes = frozenset({"sessions"})

    def __init__(self, entry: ConfigEntry) -> None:
        self._live: LiveRuntime = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_live_scenes"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Home Control")

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._live.engine.add_listener(self._changed))

    @callback
    def _changed(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self) -> int:
        return len(self._live.engine.sessions)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "sessions": self._live.engine.snapshot(),
            "saved_scenes": len(self._live.library.scenes),
            "saved_areas": len(self._live.library.areas),
        }
