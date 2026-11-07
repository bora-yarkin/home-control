# SPDX-License-Identifier: GPL-3.0-or-later
"""Finding a light again by its entity registry unique id (decision D-14).

A saved area light keeps the unique id of its entity next to the entity id. When the entity id no longer works (a plus integration was
removed, so its entities are unavailable or gone, and the integration they copied has its own entity of the same light with the same
unique id) the light is found by that unique id, so scenes and areas keep working on what Home Assistant has left.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import entity_registry as er

from .providers import Providers


def _usable(state: State | None) -> bool:
    return state is not None and state.state != "unavailable"


def attach_unique_ids(hass: HomeAssistant, providers: Providers, lights: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The lights of an area as given, each with the unique id of its entity when it has one and none was given, and, for a part of a
    light (a gradient light's zone) whose plus integration says how, the unique id of the light it belongs to."""
    out = []
    registry = er.async_get(hass)
    for light in lights:
        entry = registry.async_get(light["entity_id"])
        uid = light.get("uid") or (entry.unique_id if entry is not None else "")
        item = {**light, "uid": uid} if uid else dict(light)
        owned = providers.for_platform(entry.platform) if entry is not None else None
        parent = owned[1].parent if owned is not None else None
        if uid and parent and not light.get("alt") and (whole := re.sub(parent, "", uid)) != uid:
            item["alt"] = whole
        out.append(item)
    return out


def current_entity(hass: HomeAssistant, entity_id: str, uid: str, alt: str = "") -> str:
    """The entity to command for a saved light: its own while that works, else another light with the same unique id that does, else
    the whole light it was a part of."""
    if _usable(hass.states.get(entity_id)):
        return entity_id
    for wanted in (uid, alt):
        if not wanted:
            continue
        for entry in er.async_get(hass).entities.values():
            if (
                entry.domain == "light"
                and entry.unique_id == wanted
                and entry.entity_id != entity_id
                and _usable(hass.states.get(entry.entity_id))
            ):
                return entry.entity_id
    return entity_id


def resolve_request(hass: HomeAssistant, request: dict[str, Any]) -> dict[str, Any]:
    """A start request whose lights (and the looks, which are by entity id) name entities that can be commanded now."""
    renamed: dict[str, str] = {}
    lights = []
    seen: set[str] = set()
    for light in request["lights"]:
        now = current_entity(hass, light["entity_id"], light.get("uid", ""), light.get("alt", ""))
        if now != light["entity_id"]:
            renamed[light["entity_id"]] = now
        if now in seen:  # several parts of one light (its zones) are one light now: it keeps the place of the first
            continue
        seen.add(now)
        lights.append({**light, "entity_id": now})
    if not renamed:
        return request
    out = {**request, "lights": lights}
    looks = request.get("looks")
    if isinstance(looks, Mapping):
        out["looks"] = {renamed.get(key, key): value for key, value in looks.items()}
    return out
