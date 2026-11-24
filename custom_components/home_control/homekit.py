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
from homeassistant.config_entries import SOURCE_IMPORT, SOURCE_USER, ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entityfilter import EntityFilter, convert_filter

from .const import DOMAIN

HOMEKIT = "homekit"
# What can be put on the list: what HomeKit has an accessory for (a scene or a script is a switch that turns itself off again; climate is a heater cooler
# or a thermostat, a fan a fan or an air purifier, a media player a TV or a speaker, and so on). Cameras and activity remotes are left out: they need an
# accessory of their own.
EXPOSABLE_DOMAINS = frozenset(
    {
        "alarm_control_panel",
        "binary_sensor",
        "climate",
        "cover",
        "fan",
        "humidifier",
        "input_boolean",
        "light",
        "lock",
        "media_player",
        "scene",
        "script",
        "sensor",
        "switch",
        "vacuum",
        "valve",
        "water_heater",
    }
)
# The accessory a domain can be shown as, when it can be more than one (the bridge's own `entity_config`, key `type`).
ACCESSORY_TYPES = {"climate": ("heater_cooler", "thermostat"), "fan": ("fan", "air_purifier")}
# The keys of a bridge entry that its setup moves from `data` to `options`.
_OPTION_KEYS = ("filter", "entity_config", "mode", "devices")
# Media players of these classes are TVs to HomeKit; with locks they are the entities Home Assistant would pair on their own.
_TV_CLASSES = ("tv", "receiver", "projector")
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
    if (
        not any(new[key] for key in ("include_domains", "include_entities", "include_entity_globs"))
        and "*" not in new["exclude_entity_globs"]
    ):
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


def needs_own_accessory(hass: HomeAssistant, entity_id: str) -> bool:
    """Whether Home Assistant would rather pair this entity as an accessory of its own (a lock, a TV, a receiver, a projector). On a bridge it is
    left out unless the bridge is allowed to carry them, which is what the page asks for when it adds one."""
    state = hass.states.get(entity_id)
    if state is None:
        return False
    domain = entity_id.partition(".")[0]
    return domain == "lock" or (domain == "media_player" and state.attributes.get("device_class") in _TV_CLASSES)


def _entity_config(entry: ConfigEntry, entity_id: str, accessory_type: str | None, expose: bool) -> dict[str, dict[str, Any]]:
    """The bridge's per-entity settings with this entity's accessory type set (or taken away with the entity); the other settings are kept."""
    config = {key: dict(value) for key, value in (entry.options.get("entity_config") or {}).items() if isinstance(value, dict)}
    mine = dict(config.get(entity_id, {}))
    if expose and accessory_type is not None:
        mine["type"] = accessory_type
    elif not expose:
        mine.pop("type", None)
    if mine:
        config[entity_id] = mine
    else:
        config.pop(entity_id, None)
    return config


def set_exposed(hass: HomeAssistant, entry_id: str | None, entity_id: str, expose: bool, accessory_type: str | None = None) -> bool:
    """Shows the entity on the bridge, as the accessory asked for when there is a choice, or stops showing it. True when the bridge's settings changed."""
    domain = entity_id.partition(".")[0]
    if domain not in EXPOSABLE_DOMAINS or not _known(hass, entity_id):
        raise HomeKitError(
            f"{entity_id} cannot be put on the HomeKit list from here: it must exist and be something HomeKit has an accessory for."
        )
    if accessory_type is not None and accessory_type not in ACCESSORY_TYPES.get(domain, ()):
        raise HomeKitError(f"{entity_id} cannot be shown to HomeKit as {accessory_type!r}.")
    entry = _entry(hass, entry_id)
    new_filter = changed_lists(entry, entity_id, expose)
    options = dict(entry.options)
    if new_filter is not None:
        # The four lists the bridge's own form writes are always written; the patterns only when there were some.
        options["filter"] = {key: values for key, values in new_filter.items() if key in _LISTS or values}
    config = _entity_config(entry, entity_id, accessory_type, expose)
    if config != (entry.options.get("entity_config") or {}):
        options["entity_config"] = config
    data = dict(entry.data)
    if expose and needs_own_accessory(hass, entity_id) and data.get("exclude_accessory_mode", False):
        data["exclude_accessory_mode"] = False
    if options == dict(entry.options) and data == dict(entry.data):
        return False
    hass.config_entries.async_update_entry(entry, data=data, options=options)
    return True


def pairing(entry: ConfigEntry) -> dict[str, Any]:
    """Whether the bridge is paired with the Home app and, when it is not, the code to enter and the picture to scan. Read from the running bridge
    (Home Assistant shows the same two things in a notification); when it is not running, nothing is known and nothing is said."""
    data = getattr(entry, "runtime_data", None)
    driver = getattr(getattr(data, "homekit", None), "driver", None)
    state = getattr(driver, "state", None)
    if state is None:
        return {"running": False, "paired": False, "pin": None, "qr": None}
    paired = bool(getattr(state, "paired", False))
    pin = getattr(state, "pincode", None)
    secret = getattr(data, "pairing_qr_secret", None)
    return {
        "running": True,
        "paired": paired,
        "pin": pin.decode() if not paired and isinstance(pin, bytes) else None,
        "qr": f"/api/homekit/pairingqr?{entry.entry_id}-{secret}" if not paired and secret else None,
    }


def describe(hass: HomeAssistant, entity_ids: list[str]) -> dict[str, Any]:
    """Which bridges there are and, for each of the entities, whether it is on the bridge's list and as what; what else is on the list; the pairing."""
    out = []
    for entry in bridges(hass):
        config = entry.options.get("entity_config") or {}
        out.append(
            {
                "entry_id": entry.entry_id,
                "title": entry.title,
                "editable": entry.source != SOURCE_IMPORT,
                "exposed": {entity_id: is_exposed(entry, entity_id) for entity_id in entity_ids},
                "types": {
                    entity_id: config[entity_id]["type"]
                    for entity_id in entity_ids
                    if isinstance(config.get(entity_id), dict) and "type" in config[entity_id]
                },
                "listed": list(_lists(entry)["include_entities"]),
                "carries_own_accessories": not entry.data.get("exclude_accessory_mode", False),
                "pairing": pairing(entry),
            }
        )
    return {"bridges": out}


async def async_create_bridge(hass: HomeAssistant) -> str:
    """Makes the one HomeKit Bridge, through Home Assistant's own setup form, and empties its list: a bridge made with nothing chosen shows every
    entity, so its list is first set to show nothing. The bridge may carry TVs and locks (the page adds them one by one). The entry id."""
    if bridges(hass):
        raise HomeKitError("There is a HomeKit Bridge already: the dashboard uses one.")
    flow = hass.config_entries.flow
    try:
        result = await flow.async_init(HOMEKIT, context={"source": SOURCE_USER})
        result = await flow.async_configure(result["flow_id"], {"include_domains": []})
        result = await flow.async_configure(result["flow_id"], {})
    except HomeAssistantError as err:
        raise HomeKitError(f"The HomeKit Bridge could not be made: {err}") from err
    entry = result.get("result")
    if result.get("type") != FlowResultType.CREATE_ENTRY or entry is None:
        raise HomeKitError("The HomeKit Bridge could not be made: Home Assistant did not finish its setup.")
    nothing = {"include_domains": [], "include_entities": [], "exclude_domains": [], "exclude_entities": [], "exclude_entity_globs": ["*"]}
    data = {key: value for key, value in entry.data.items() if key not in _OPTION_KEYS}
    data["exclude_accessory_mode"] = False
    options = {**entry.options, "mode": "bridge", "filter": nothing, "entity_config": {}}
    hass.config_entries.async_update_entry(entry, data=data, options=options)
    return entry.entry_id


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
        vol.Optional("accessory_type"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def homekit_expose(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        changed = set_exposed(hass, msg.get("entry_id"), msg["entity_id"], msg["expose"], msg.get("accessory_type"))
    except HomeKitError as err:
        connection.send_error(msg["id"], "not_supported", str(err))
        return
    connection.send_result(msg["id"], {"changed": changed})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/homekit_create"})
@websocket_api.require_admin
@websocket_api.async_response
async def homekit_create(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        entry_id = await async_create_bridge(hass)
    except HomeKitError as err:
        connection.send_error(msg["id"], "not_supported", str(err))
        return
    connection.send_result(msg["id"], {"entry_id": entry_id})


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, homekit)
    websocket_api.async_register_command(hass, homekit_expose)
    websocket_api.async_register_command(hass, homekit_create)
