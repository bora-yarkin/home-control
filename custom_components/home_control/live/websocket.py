# SPDX-License-Identifier: GPL-3.0-or-later
"""Lets a screen read the saved scenes, areas and presets, and what is running, in one request."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/library"})
@websocket_api.async_response
async def library(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    live = entries[0].runtime_data
    connection.send_result(msg["id"], {**live.library.listing(), "running": live.engine.snapshot()})


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, library)
