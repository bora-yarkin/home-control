# SPDX-License-Identifier: GPL-3.0-or-later
"""The scenes and areas that are saved, and how a start request is put together from them.

Free of Home Assistant. Everything that comes in goes through the validators of ``definitions``; what is stored is what
was validated. An area is where lights stand (``lights`` with x, y, z); a scene is a palette that plays over an area's
lights. ``ui`` is data a screen keeps next to a scene or area (icons, drawings); it is stored as it is, within a size limit.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from .const import COLOUR_SOURCES, MAX_LIGHTS, MAX_PALETTE, SPREADS
from .defaults import presets
from .definitions import (
    AreaLight,
    DefinitionError,
    parse_actions,
    parse_brightness,
    parse_colour,
    parse_effects,
    parse_lights,
    parse_looks,
    parse_range,
    parse_speed,
)

MAX_SCENES = 200
MAX_AREAS = 48
MAX_UI_BYTES = 16_384

_ID = re.compile(r"^[a-z0-9_-]{1,48}$")


def _text(value: Any, name: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise DefinitionError(f"{name} must be text of 1 to {limit} characters")
    return value.strip()


def _ui(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise DefinitionError("ui must be an object")
    if len(json.dumps(value, default=str)) > MAX_UI_BYTES:
        raise DefinitionError(f"ui is larger than {MAX_UI_BYTES} bytes")
    return dict(value)


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or not _ID.match(value):
        raise DefinitionError(f"{name} must be 1 to 48 of a-z, 0-9, _ or -")
    return value


def _effects_json(raw: Any) -> list[dict[str, Any]]:
    return [{"type": e.kind, "speed": e.speed, "strength": e.strength} for e in parse_effects(raw)]


def _looks_json(raw: Any) -> dict[str, dict[str, Any]]:
    """Validated per-light looks. Which lights the scene has is not known when it is saved (an area may supply them), so any
    light entity may have one; a look for a light the scene does not have is dropped when the scene starts."""
    if not isinstance(raw, Mapping) or len(raw) > MAX_LIGHTS:
        raise DefinitionError(f"looks must be an object of at most {MAX_LIGHTS} lights")
    parse_looks(raw, tuple(AreaLight(entity_id, 0, 0, 0) for entity_id in raw))
    out: dict[str, dict[str, Any]] = {}
    for entity_id, item in raw.items():
        if not isinstance(entity_id, str) or not entity_id.startswith("light."):
            raise DefinitionError(f"not a light entity: {entity_id!r}")
        look: dict[str, Any] = {}
        if item.get("palette") is not None:
            look["palette"] = [dict(c) for c in item["palette"]]
        if item.get("brightness") is not None:
            look["brightness"] = parse_brightness(item["brightness"])
        if item.get("effects") is not None:
            look["effects"] = _effects_json(item["effects"])
        if item.get("native") is not None:
            look["native"] = item["native"]
        out[entity_id] = look
    return out


def clean_area(raw: Mapping[str, Any]) -> dict[str, Any]:
    """A validated area: id, name, lights and the screen's own data."""
    lights = _clean_lights(raw.get("lights"))
    return {"id": _id(raw.get("id"), "id"), "name": _text(raw.get("name"), "name", 80), "lights": lights, "ui": _ui(raw.get("ui"))}


def _clean_palette(palette: Any) -> list[dict[str, Any]]:
    if not isinstance(palette, (list, tuple)) or not 1 <= len(palette) <= MAX_PALETTE:
        raise DefinitionError(f"palette must be a list of 1 to {MAX_PALETTE} colours")
    for colour in palette:
        parse_colour(colour)
    return [dict(c) for c in palette]


def _one_of(name: str, allowed: Iterable[str]):
    """A cleaner for a field that must be one of a fixed set of words."""
    allowed = tuple(allowed)

    def clean(value: Any) -> Any:
        if value not in allowed:
            raise DefinitionError(f"{name} must be one of {', '.join(allowed)}")
        return value

    return clean


def _clean_actions(raw: Any) -> list[dict[str, Any]]:
    return [{"entity_id": a.entity_id, "do": a.do} for a in parse_actions(raw)]


def _clean_lights(raw: Any) -> list[dict[str, Any]]:
    return [
        {"entity_id": light.entity_id, "x": light.x, "y": light.y, "z": light.z, **({"uid": light.uid} if light.uid else {})}
        for light in parse_lights(raw)
    ]


def _clean_preset(value: Any) -> str:
    if value not in presets():
        raise DefinitionError(f"unknown preset {value!r}")
    return value


# The optional fields of a scene, in the order they are stored: each says how to validate and normalise what was given.
SCENE_FIELDS: dict[str, Callable[[Any], Any]] = {
    "palette": _clean_palette,
    "speed": parse_speed,
    "range": parse_range,
    "brightness": parse_brightness,
    "spread": _one_of("spread", SPREADS),
    "effects": _effects_json,
    "looks": _looks_json,
    "actions": _clean_actions,
    "colour_source": _one_of("colour_source", COLOUR_SOURCES),
    "area": lambda value: _id(value, "area"),
    "lights": _clean_lights,
    "preset": _clean_preset,
}


def clean_scene(raw: Mapping[str, Any]) -> dict[str, Any]:
    """A validated scene. Fields left out are left out of the stored scene, so a preset or default fills them at start."""
    out: dict[str, Any] = {"id": _id(raw.get("id"), "id"), "name": _text(raw.get("name"), "name", 80), "ui": _ui(raw.get("ui"))}
    for key, clean in SCENE_FIELDS.items():
        if key in raw:
            out[key] = clean(raw[key])
    return out


class Library:
    """The saved scenes and areas of one bridge."""

    def __init__(self) -> None:
        self.scenes: dict[str, dict[str, Any]] = {}
        self.areas: dict[str, dict[str, Any]] = {}

    @classmethod
    def restore(cls, stored: Any) -> tuple[Library, list[str]]:
        """A library from what storage returned, and what was wrong with it.

        Storage can be damaged or edited by hand, so every entry goes through the same validation as a save. An entry that
        fails, is stored under another id, or is over the limit is left out and named; unreadable data gives an empty
        library. Nothing here raises, so a bad file can never stop the integration from starting.
        """
        library = cls()
        problems: list[str] = []
        if stored is None:
            return library, problems
        if not isinstance(stored, Mapping):
            return library, ["the saved scenes and areas could not be read; starting with none"]
        for kind, save in (("areas", library.save_area), ("scenes", library.save_scene)):
            entries = stored.get(kind)
            if entries is None:
                continue
            if not isinstance(entries, Mapping):
                problems.append(f"the saved {kind} could not be read; starting with none")
                continue
            for key, raw in entries.items():
                try:
                    if not isinstance(raw, Mapping) or raw.get("id") != key:
                        raise DefinitionError("it is stored under a different id")
                    save(raw)
                except DefinitionError as err:
                    problems.append(f"saved {kind[:-1]} {key!r} left out: {err}")
        return library, problems

    def as_json(self) -> dict[str, Any]:
        return {"scenes": self.scenes, "areas": self.areas}

    def listing(self) -> dict[str, Any]:
        """Everything a screen needs: saved scenes, areas, and the shipped presets."""
        return {"scenes": list(self.scenes.values()), "areas": list(self.areas.values()), "presets": list(presets().values())}

    def save_scene(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        scene = clean_scene(raw)
        if scene["id"] not in self.scenes and len(self.scenes) >= MAX_SCENES:
            raise DefinitionError(f"at most {MAX_SCENES} scenes can be saved")
        self.scenes[scene["id"]] = scene
        return scene

    def save_area(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        area = clean_area(raw)
        if area["id"] not in self.areas and len(self.areas) >= MAX_AREAS:
            raise DefinitionError(f"at most {MAX_AREAS} areas can be saved")
        self.areas[area["id"]] = area
        return area

    def delete_scene(self, scene_id: str) -> bool:
        return self.scenes.pop(scene_id, None) is not None

    def delete_area(self, area_id: str) -> bool:
        """Removes an area. Scenes that play on it are kept, but they need another area before they can start."""
        return self.areas.pop(area_id, None) is not None

    def request(self, data: Mapping[str, Any]) -> dict[str, Any]:
        """The start request for ``parse_definition``, from the shipped defaults, a preset, a saved scene of this id and what the
        call gives, in that order (later ones win). The lights come from the call, else the area it names, else the saved scene's."""
        merged: dict[str, Any] = {}
        scene = self.scenes.get(data["scene_id"], {})
        preset_id = data.get("preset") or scene.get("preset")
        if preset_id:
            preset = presets().get(preset_id)
            if preset is None:
                raise DefinitionError(f"unknown preset {preset_id!r}")
            merged.update({k: preset[k] for k in ("palette", "speed", "range", "spread", "brightness")})
        for source in (scene, data):
            merged.update(
                {
                    k: v
                    for k, v in source.items()
                    if k
                    in ("palette", "speed", "range", "brightness", "spread", "fps", "wake", "colour_source", "effects", "looks", "actions")
                    and v is not None
                }
            )
        merged["scene_id"] = data["scene_id"]
        lights = data.get("lights")
        if lights is None:
            area_id = data.get("area") or scene.get("area")
            area = self.areas.get(area_id) if area_id else None
            if area_id and area is None:
                raise DefinitionError(f"unknown area {area_id!r}")
            lights = area["lights"] if area else scene.get("lights")
        if lights is None:
            raise DefinitionError("give lights, or an area (or a saved scene that has one)")
        merged["lights"] = lights
        # A look for a light the scene no longer has (its area changed) is left out, not an error.
        if isinstance(merged.get("looks"), Mapping):
            present = {light["entity_id"] for light in lights}
            merged["looks"] = {k: v for k, v in merged["looks"].items() if k in present}
        if "palette" not in merged:
            raise DefinitionError("give a palette, or a preset (or a saved scene that has one)")
        return merged
