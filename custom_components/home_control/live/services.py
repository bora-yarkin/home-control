# SPDX-License-Identifier: GPL-3.0-or-later
"""The services of live scenes and areas, for every light."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from ..const import DOMAIN
from ..service_support import schema_for
from .actions import run_actions
from .definitions import DefinitionError, parse_brightness, parse_definition, parse_range, parse_speed
from .library import clean_area
from .resolve import attach_unique_ids, resolve_request
from .setup import LiveRuntime
from .spec import SPEC

RESPONDING = {"get_library"}


def _live(hass: HomeAssistant) -> LiveRuntime:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        raise HomeAssistantError("Home Control is not set up")
    return entries[0].runtime_data


async def scene_start(hass: HomeAssistant, call: ServiceCall) -> None:
    live = _live(hass)
    try:
        request = live.library.request(dict(call.data))
        definition = parse_definition(resolve_request(hass, request))
        live.engine.start(definition)
    except (DefinitionError, ValueError) as err:
        raise ServiceValidationError(str(err)) from err
    if definition.actions:
        hass.async_create_background_task(run_actions(hass, definition.actions, call.context), f"{DOMAIN} scene actions")


async def scene_update(hass: HomeAssistant, call: ServiceCall) -> None:
    data = call.data
    try:
        _live(hass).engine.update(
            data["scene_id"],
            speed=parse_speed(data["speed"]) if "speed" in data else None,
            range_pct=parse_range(data["range"]) if "range" in data else None,
            brightness=parse_brightness(data["brightness"]) if "brightness" in data else None,
        )
    except (DefinitionError, KeyError) as err:
        raise ServiceValidationError(str(err)) from err


def _on_running(method: str):
    async def handle(hass: HomeAssistant, call: ServiceCall) -> None:
        try:
            getattr(_live(hass).engine, method)(call.data["scene_id"])
        except KeyError as err:
            raise ServiceValidationError(str(err)) from err

    return handle


async def scene_stop(hass: HomeAssistant, call: ServiceCall) -> None:
    _live(hass).engine.stop(call.data["scene_id"])


async def scene_save(hass: HomeAssistant, call: ServiceCall) -> None:
    live = _live(hass)
    raw = dict(call.data)
    if isinstance(raw.get("lights"), list):
        raw["lights"] = attach_unique_ids(hass, live.providers, raw["lights"])
    try:
        live.library.save_scene(raw)
    except DefinitionError as err:
        raise ServiceValidationError(str(err)) from err
    live.save_later()


async def scene_delete(hass: HomeAssistant, call: ServiceCall) -> None:
    live = _live(hass)
    live.library.delete_scene(call.data["id"])
    live.save_later()


async def area_save(hass: HomeAssistant, call: ServiceCall) -> None:
    live = _live(hass)
    raw = dict(call.data)
    if isinstance(raw.get("lights"), list):
        raw["lights"] = attach_unique_ids(hass, live.providers, raw["lights"])
    try:
        live.library.save_area(clean_area(raw))
    except DefinitionError as err:
        raise ServiceValidationError(str(err)) from err
    live.save_later()


async def area_delete(hass: HomeAssistant, call: ServiceCall) -> None:
    live = _live(hass)
    live.library.delete_area(call.data["id"])
    live.save_later()


async def locate_light(hass: HomeAssistant, call: ServiceCall) -> None:
    entity_id = call.data["entity_id"]
    if not entity_id.startswith("light."):
        raise ServiceValidationError("locate_light takes a light")
    identifier = _live(hass).identifier
    try:
        await (identifier.start(entity_id) if call.data["active"] else identifier.stop(entity_id))
    except ValueError as err:
        raise ServiceValidationError(str(err)) from err


async def get_library(hass: HomeAssistant, call: ServiceCall) -> dict[str, Any]:
    return _live(hass).library.listing()


HANDLERS = {
    "scene_start": scene_start,
    "scene_update": scene_update,
    "scene_freeze": _on_running("freeze"),
    "scene_play": _on_running("play"),
    "scene_stop": scene_stop,
    "scene_save": scene_save,
    "scene_delete": scene_delete,
    "area_save": area_save,
    "area_delete": area_delete,
    "locate_light": locate_light,
    "get_library": get_library,
}
assert set(HANDLERS) == set(SPEC), "every service needs a handler and every handler a spec"


def async_register(hass: HomeAssistant) -> None:
    for name, handler in HANDLERS.items():

        async def handle(call: ServiceCall, handler=handler):
            return await handler(hass, call)

        hass.services.async_register(
            DOMAIN,
            name,
            handle,
            schema=schema_for(SPEC[name]["fields"]),
            supports_response=SupportsResponse.OPTIONAL if name in RESPONDING else SupportsResponse.NONE,
        )


def async_remove(hass: HomeAssistant) -> None:
    for name in HANDLERS:
        hass.services.async_remove(DOMAIN, name)
