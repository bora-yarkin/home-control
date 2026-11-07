# SPDX-License-Identifier: GPL-3.0-or-later
"""Finding a light again by its entity registry unique id (decision D-14).

A saved area light keeps the unique id of its entity next to the entity id. When the entity id no longer works (a plus integration was
removed, so its entities are unavailable or gone, and the integration they copied has its own entity of the same light with the same
unique id) the light is found by that unique id, so scenes and areas keep working on what Home Assistant has left.

A light made of zones (a gradient strip) is saved in an area as its zones, and a look for it (its own effect, its brightness, its colours)
is given for the light itself. ``fold_strips`` brings the two together when a scene starts.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import entity_registry as er

from .providers import Provider, Providers


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
        owned = providers.for_platform(entry.platform, loaded=False) if entry is not None else None
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


def _plays_effect(hass: HomeAssistant, providers: Providers, entry: er.RegistryEntry, effect: str) -> bool:
    """Whether the light behind a registry entry can play one of its own effects through its plus integration."""
    owned = providers.for_platform(entry.platform)
    if owned is None:
        return False
    provider, kind = owned
    state = hass.states.get(entry.entity_id)
    listed = (state.attributes.get("effect_list") or ()) if state is not None else ()
    return kind.effects and provider.plays_effects() and effect in provider.effects and effect in listed


def fold_strips(
    hass: HomeAssistant, providers: Providers, lights: list[dict[str, Any]], looks: Mapping[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """The lights and looks a scene plays, with each look given for a strip brought to the lights that are played.

    The zones of a strip are lights of their own (``alt`` is the unique id of the strip), but a person gives a look to the strip.
    A look that names one of the strip's own effects, which its plus integration can play, is for the strip as one light: the zones
    are left out and the strip takes their place (the middle of them), so the effect runs on the strip, in the scene's colour,
    and no zone is commanded to a colour of its own over it. Any other look (brightness, colours, brightness effects) is given to
    each zone. A look for a light the scene does not have is left out.
    """
    present = {light["entity_id"] for light in lights}
    kept = {entity_id: look for entity_id, look in looks.items() if entity_id in present}
    zones_of: dict[str, list[dict[str, Any]]] = {}
    for light in lights:
        if light.get("alt"):
            zones_of.setdefault(light["alt"], []).append(light)
    if not zones_of:
        return lights, kept
    registry = er.async_get(hass)
    out = list(lights)
    for entity_id, look in looks.items():
        entry = registry.async_get(entity_id) if entity_id not in present else None
        zones = zones_of.get(entry.unique_id) if entry is not None else None
        if not zones:
            continue
        native = look.get("native") if isinstance(look, Mapping) else None
        if native and _plays_effect(hass, providers, entry, native):
            at = out.index(zones[0])
            out = [light for light in out if light not in zones]
            whole = {
                "entity_id": entity_id,
                "x": sum(zone.get("x", 0) for zone in zones) / len(zones),
                "y": sum(zone.get("y", 0) for zone in zones) / len(zones),
                "z": sum(zone.get("z", 0) for zone in zones) / len(zones),
                "uid": entry.unique_id,
            }
            out.insert(min(at, len(out)), whole)
            kept[entity_id] = look
        else:
            for zone in zones:
                kept.setdefault(zone["entity_id"], look)
    return out, kept


def _zone_number(entry: er.RegistryEntry) -> tuple[int, str]:
    numbers = re.findall(r"\d+", entry.unique_id or "")
    return (int(numbers[-1]) if numbers else 0, entry.entity_id)


def separate_strips(
    hass: HomeAssistant, providers: Providers, request: dict[str, Any]
) -> tuple[dict[str, Any], list[tuple[Provider, str]]]:
    """The request with every strip it plays on, played by all of its zones, and what has to be called first to make them lights of their own.

    A strip (a light made of zones, found by the unique id of the light its zones are parts of) is played as its zones, as separate
    lights next to each other along the strip. When its plus integration says how (``separate_zones``), every zone it has is played, in
    order, whether or not the area saved them all (the bridge blends some zones in some styles, and an area saved then has fewer), and
    the call that makes them separate is returned for each strip that has a zone that is unavailable. The zones keep the strip's length,
    from the first zone saved to the last, and the rest are put evenly between them."""
    lights = list(request["lights"])
    groups: dict[str, list[dict[str, Any]]] = {}
    for light in lights:
        if light.get("alt"):
            groups.setdefault(light["alt"], []).append(light)
    registry = er.async_get(hass)
    calls: list[tuple[Provider, str]] = []
    for alt, zones in groups.items():
        entries = [registry.async_get(zone["entity_id"]) for zone in zones]
        first = next((entry for entry in entries if entry is not None), None)
        owned = providers.for_platform(first.platform, loaded=False) if first is not None else None
        if owned is None or owned[0].separate_zones is None or not owned[1].parent:
            continue
        provider, kind = owned
        every = sorted(
            (
                entry
                for entry in registry.entities.values()
                if entry.domain == "light"
                and entry.platform == first.platform
                and entry.unique_id != alt
                and re.sub(kind.parent, "", entry.unique_id or "") == alt
            ),
            key=_zone_number,
        )
        if len(every) < 2:
            continue
        number = {entry.entity_id: _zone_number(entry) for entry in entries if entry is not None}
        saved = sorted(zones, key=lambda zone: number.get(zone["entity_id"], (0, "")))
        start, end = saved[0], saved[-1]
        placed = []
        for k, entry in enumerate(every):
            t = k / (len(every) - 1)
            placed.append(
                {
                    "entity_id": entry.entity_id,
                    "uid": entry.unique_id,
                    "alt": alt,
                    **{axis: start.get(axis, 0) + (end.get(axis, 0) - start.get(axis, 0)) * t for axis in ("x", "y", "z")},
                }
            )
        at = min(lights.index(zone) for zone in zones)
        lights = [light for light in lights if light not in zones]
        lights[at:at] = placed
        if any((state := hass.states.get(entry.entity_id)) is None or state.state == "unavailable" for entry in every):
            calls.append((provider, every[0].entity_id))
    return {**request, "lights": lights}, calls


def resolve_request(hass: HomeAssistant, providers: Providers, request: dict[str, Any]) -> dict[str, Any]:
    """A start request whose lights (and the looks, which are by entity id) name entities that can be commanded now, with the looks
    of strips brought to the lights that are played (``fold_strips``)."""
    lights_with_ids = attach_unique_ids(hass, providers, list(request["lights"]))
    request = {**request, "lights": lights_with_ids}
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
    looks = request.get("looks")
    if isinstance(looks, Mapping) and renamed:
        looks = {renamed.get(key, key): value for key, value in looks.items()}
    if isinstance(looks, Mapping):
        lights, looks = fold_strips(hass, providers, lights, looks)
        return {**request, "lights": lights, "looks": looks}
    return {**request, "lights": lights}
