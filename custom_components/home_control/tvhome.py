# SPDX-License-Identifier: GPL-3.0-or-later
"""The Info button of a TV in the Home app's remote, made the TV's Home button (decision D-24).

HomeKit's remote has an Info key that Home Assistant does not use: it announces it with the event ``homekit_tv_remote_key_pressed`` and leaves it to
whoever listens. For a TV that the page set up, this sends the key the TV's own remote has for Home. What to send is chosen by the dashboard (it knows
the TV's integration and remote) and kept here, because it has to work with the dashboard closed. Only the two calls a TV's Home key can be are
accepted, and only for administrators.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.tv_home"
TV_HOME_KEY = f"{DOMAIN}_tv_home"
# The event Home Assistant fires for a remote key it does not handle itself, and the name it gives the Info key.
EVENT_KEY_PRESSED = "homekit_tv_remote_key_pressed"
KEY_INFORMATION = "information"
# What the Home key of a TV can be: a remote entity sent a command, or a webOS TV sent a button.
ALLOWED = {("remote", "send_command"): "command", ("webostv", "button"): "button"}
_ENTITY = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
_KEY = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


def clean_call(call: Any) -> dict[str, Any]:
    """A Home key call as it is kept, or ValueError saying what is wrong."""
    if not isinstance(call, dict) or not isinstance(call.get("domain"), str) or not isinstance(call.get("service"), str):
        raise ValueError("a call is a domain, a service and its data")
    field = ALLOWED.get((call["domain"], call["service"]))
    data = call.get("data")
    if field is None or not isinstance(data, dict) or set(data) != {"entity_id", field}:
        raise ValueError("only a remote's send_command (with a command) or a webOS TV's button (with a button) can be a Home key")
    entity_id, key = data["entity_id"], data[field]
    if not isinstance(entity_id, str) or not _ENTITY.match(entity_id) or entity_id.partition(".")[0] not in ("remote", "media_player"):
        raise ValueError("the call is for a remote or a media player")
    if not isinstance(key, str) or not _KEY.match(key):
        raise ValueError("the key is 1 to 64 letters, digits, _, . or -")
    return {"domain": call["domain"], "service": call["service"], "data": {"entity_id": entity_id, field: key}}


class TvHome:
    """The Home key call of each TV, by the TV's media player."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.calls: dict[str, dict[str, Any]] = {}
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self) -> None:
        """Reads the file; an entry that is not a TV and a valid call is left out (the file can be edited by hand)."""
        stored = await self._store.async_load()
        raw = stored.get("calls", {}) if isinstance(stored, dict) else {}
        for entity_id, call in (raw if isinstance(raw, dict) else {}).items():
            if isinstance(entity_id, str) and entity_id.startswith("media_player."):
                try:
                    self.calls[entity_id] = clean_call(call)
                except ValueError as err:
                    _LOGGER.warning("Home Control TV Home key for %s left out: %s", entity_id, err)

    def set(self, entity_id: str, call: Any) -> None:
        if not isinstance(entity_id, str) or not entity_id.startswith("media_player."):
            raise ValueError("a TV is a media player")
        if call is None:
            self.calls.pop(entity_id, None)
        else:
            self.calls[entity_id] = clean_call(call)
        self._store.async_delay_save(lambda: {"calls": self.calls}, 1.0)

    @callback
    def key_pressed(self, event: Event) -> None:
        """Info on the Home app's remote: the TV's Home key, when this TV has one set."""
        if event.data.get("key_name") != KEY_INFORMATION:
            return
        call = self.calls.get(event.data.get("entity_id", ""))
        if call is None:
            return
        self.hass.async_create_task(self._send(call, event), f"{DOMAIN} TV Home key")

    async def _send(self, call: dict[str, Any], event: Event) -> None:
        try:
            await self.hass.services.async_call(call["domain"], call["service"], dict(call["data"]), context=event.context)
        except Exception as err:  # a TV that is off or unreachable must not break the listener
            _LOGGER.warning("Home Control could not send the Home key to %s: %s", call["data"]["entity_id"], err)


async def async_setup(hass: HomeAssistant, entry: ConfigEntry) -> TvHome:
    keeper = TvHome(hass)
    await keeper.async_load()
    hass.data[TV_HOME_KEY] = keeper
    entry.async_on_unload(hass.bus.async_listen(EVENT_KEY_PRESSED, keeper.key_pressed))

    @callback
    def forget() -> None:
        hass.data.pop(TV_HOME_KEY, None)

    entry.async_on_unload(forget)
    return keeper


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/tv_home"})
@websocket_api.require_admin
@websocket_api.async_response
async def tv_home(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    keeper = hass.data.get(TV_HOME_KEY)
    if keeper is None:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    connection.send_result(msg["id"], {"calls": keeper.calls})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/tv_home_set", vol.Required("entity_id"): str, vol.Required("call"): vol.Any(None, dict)}
)
@websocket_api.require_admin
@websocket_api.async_response
async def tv_home_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    keeper = hass.data.get(TV_HOME_KEY)
    if keeper is None:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    try:
        keeper.set(msg["entity_id"], msg["call"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"calls": keeper.calls})


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, tv_home)
    websocket_api.async_register_command(hass, tv_home_set)
