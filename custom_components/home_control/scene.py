# SPDX-License-Identifier: GPL-3.0-or-later
"""The scenes Home Control publishes: a ``scene`` entity for each live scene the dashboard shares with Siri, HomeKit and Shortcuts (``live/published.py``)."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_platform
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .published import PUBLISHED_KEY


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    await hass.data[PUBLISHED_KEY].async_attach(entity_platform.async_get_current_platform())
