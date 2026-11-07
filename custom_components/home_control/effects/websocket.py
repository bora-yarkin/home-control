# SPDX-License-Identifier: GPL-3.0-or-later
"""What the dashboard asks about effects: the catalogues on offer, and (for administrators) importing and removing a file."""

from __future__ import annotations

import json
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from .store import MAX_BYTES, EffectsStore


def _store(hass: HomeAssistant) -> EffectsStore | None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0].runtime_data.effects if entries else None


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/effects"})
@websocket_api.async_response
async def effects(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    store = _store(hass)
    if store is None:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    connection.send_result(msg["id"], {"sources": store.sources()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/effects_import", vol.Required("content"): vol.Any(str, dict)})
@websocket_api.require_admin
@websocket_api.async_response
async def effects_import(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Checks a file and keeps it. A file with mistakes is not an error of the call: the answer lists every mistake and where it is."""
    store = _store(hass)
    if store is None:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    content = msg["content"]
    if isinstance(content, str):
        if len(content.encode()) > MAX_BYTES:
            connection.send_result(msg["id"], {"ok": False, "problems": [f"the file is larger than {MAX_BYTES // 1024} KB"]})
            return
        try:
            content = json.loads(content)
        except ValueError as err:
            connection.send_result(msg["id"], {"ok": False, "problems": [f"the file is not valid JSON: {err}"]})
            return
    identity, catalogue = store.add(content)
    if identity is None:
        connection.send_result(msg["id"], {"ok": False, "problems": list(catalogue.problems)})
        return
    connection.send_result(msg["id"], {"ok": True, "id": identity, "name": catalogue.name, "effects": len(catalogue.effects)})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/effects_delete", vol.Required("file_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def effects_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    store = _store(hass)
    if store is None or not store.remove(msg["file_id"]):
        connection.send_error(msg["id"], "not_found", "No such effects file")
        return
    connection.send_result(msg["id"], {"ok": True})


def async_register(hass: HomeAssistant) -> None:
    for command in (effects, effects_import, effects_delete):
        websocket_api.async_register_command(hass, command)
