# SPDX-License-Identifier: GPL-3.0-or-later
"""Puts entities on, and takes them off, the list of the HomeKit Bridge (Home Assistant's own integration), for the dashboard's Siri and HomeKit page.

A bridge keeps the entities it shows in its ``filter`` option (``include_entities`` and so on, the same four lists its own form writes).
This changes only that option, only for the entity asked about, and only for ``scene``, ``script`` and ``switch`` entities; the bridge
reloads itself when its options change, which Home Assistant does for any change made in its settings. Decision D-23.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entityfilter import EntityFilter, convert_filter

from .const import DOMAIN

HOMEKIT = "homekit"
# What can be shared: HomeKit shows a scene or a script as a switch that turns itself off again, and a switch as a switch.
EXPOSABLE_DOMAINS = frozenset({"scene", "script", "switch"})
MAX_ENTITIES_ASKED = 500

_LISTS = ("include_domains", "include_entities", "exclude_domains", "exclude_entities")
_GLOBS = ("include_entity_globs", "exclude_entity_globs")


class HomeKitError(HomeAssistantError):
    """What cannot be done with the bridge, said so that the dashboard can show it."""


def bridges(hass: HomeAssistant) -> list[ConfigEntry]:
    """The HomeKit entries that show a list of entities (bridge mode), not those that are one accessory of their own."""
    return [
        entry
        for entry in hass.config_entries.async_entries(HOMEKIT)
        if entry.options.get("mode", entry.data.get("mode", "bridge")) == "bridge"
    ]


def _lists(entry: ConfigEntry) -> dict[str, list[str]]:
    """The filter of an entry as lists of text, the six keys all there."""
    stored = entry.options.get("filter") or {}
    out: dict[str, list[str]] = {}
    for key in (*_LISTS, *_GLOBS):
        value = stored.get(key, [])
        out[key] = [str(item) for item in value] if isinstance(value, (list, tuple)) else []
    return out


def entity_filter(config: dict[str, list[str]]) -> EntityFilter:
    return convert_filter({key: list(config.get(key, [])) for key in (*_LISTS, *_GLOBS)})


def is_exposed(entry: ConfigEntry, entity_id: str) -> bool:
    return bool(entity_filter(_lists(entry))(entity_id))


def changed_lists(entry: ConfigEntry, entity_id: str, expose: bool) -> dict[str, list[str]] | None:
    """The filter the entry should have for the entity to be shown (or not), or None when it already is as asked. It adds the entity to,
    or removes it from, the lists, and puts it on the other list only when a domain or a pattern decides otherwise; nothing else moves."""
    config = _lists(entry)
    current = entity_filter(config)
    if current.empty_filter:
        raise HomeKitError("This HomeKit Bridge has no list: it shows everything. Change that in the bridge's own settings first.")
    if bool(current(entity_id)) == expose:
        return None
    new = {key: list(values) for key, values in config.items()}
    if expose:
        new["exclude_entities"] = [x for x in new["exclude_entities"] if x != entity_id]
        if not entity_filter(new)(entity_id):
            new["include_entities"].append(entity_id)
    else:
        new["include_entities"] = [x for x in new["include_entities"] if x != entity_id]
        if not any(new[key] for key in ("include_domains", "include_entities", "include_entity_globs")):
            if "*" not in new["exclude_entity_globs"]:
                new["exclude_entity_globs"].append("*")
        elif entity_filter(new)(entity_id):
            new["exclude_entities"].append(entity_id)
    if not any(new[key] for key in ("include_domains", "include_entities", "include_entity_globs")) and "*" not in new["exclude_entity_globs"]:
        # No list is left, and a filter with nothing in it shows everything: "show nothing" is written as an exclusion of every entity.
        new["exclude_entity_globs"].append("*")
    if bool(entity_filter(new)(entity_id)) != expose:
        raise HomeKitError("The bridge's list could not be changed for this entity. Change it in the bridge's own settings.")
    return new


def _entry(hass: HomeAssistant, entry_id: str | None) -> ConfigEntry:
    found = [e for e in bridges(hass) if entry_id is None or e.entry_id == entry_id]
    if not found:
        raise HomeKitError("There is no HomeKit Bridge to change." if entry_id is None else "That HomeKit Bridge was not found.")
    if found[0].source == SOURCE_IMPORT:
        raise HomeKitError("This HomeKit Bridge is set up in configuration.yaml and cannot be changed from here.")
    return found[0]


def _known(hass: HomeAssistant, entity_id: str) -> bool:
    return hass.states.get(entity_id) is not None or er.async_get(hass).async_get(entity_id) is not None


def set_exposed(hass: HomeAssistant, entry_id: str | None, entity_id: str, expose: bool) -> bool:
    """Shows the entity on the bridge or stops showing it. True when the bridge's options changed."""
    domain = entity_id.partition(".")[0]
    if domain not in EXPOSABLE_DOMAINS or not _known(hass, entity_id):
        raise HomeKitError(f"{entity_id} cannot be shared with HomeKit from here: only scenes, scripts and switches that exist can.")
    entry = _entry(hass, entry_id)
    new = changed_lists(entry, entity_id, expose)
    if new is None:
        return False
    # The four lists the bridge's own form writes are always written; the patterns only when there were some.
    kept = {key: values for key, values in new.items() if key in _LISTS or values}
    hass.config_entries.async_update_entry(entry, options={**entry.options, "filter": kept})
    return True


def describe(hass: HomeAssistant, entity_ids: list[str]) -> dict[str, Any]:
    """Which bridges there are and, for each of the entities, whether it is on the bridge's list."""
    return {
        "bridges": [
            {
                "entry_id": entry.entry_id,
                "title": entry.title,
                "editable": entry.source != SOURCE_IMPORT,
                "exposed": {entity_id: is_exposed(entry, entity_id) for entity_id in entity_ids},
            }
            for entry in bridges(hass)
        ]
    }


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/homekit", vol.Required("entity_ids"): vol.All([str], vol.Length(max=MAX_ENTITIES_ASKED))}
)
@websocket_api.require_admin
@websocket_api.async_response
async def homekit(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], describe(hass, msg["entity_ids"]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/homekit_expose",
        vol.Required("entity_id"): str,
        vol.Required("expose"): bool,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def homekit_expose(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        changed = set_exposed(hass, msg.get("entry_id"), msg["entity_id"], msg["expose"])
    except HomeKitError as err:
        connection.send_error(msg["id"], "not_supported", str(err))
        return
    connection.send_result(msg["id"], {"changed": changed})


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, homekit)
    websocket_api.async_register_command(hass, homekit_expose)
