# SPDX-License-Identifier: GPL-3.0-or-later
"""What a scene and its lights are: validated, immutable, free of Home Assistant.

A caller (the dashboard) sends the whole definition when it starts a scene. Nothing
else in the integration reads raw caller data: it goes through `parse_definition`,
which rejects the whole definition when anything in it is wrong.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from .chroma import hs_to_xy, kelvin_to_xy
from .const import (
    ACTION_DOMAINS,
    COLOUR_SOURCES,
    EFFECT_TYPES,
    MAX_ACTIONS,
    MAX_EFFECTS,
    MAX_LIGHTS,
    MAX_PALETTE,
    SPEED_STEPS,
    SPREADS,
)

_SCENE_ID = re.compile(r"^[a-z0-9_-]{1,48}$")
_LIGHT_ID = re.compile(r"^light\.[a-z0-9_]{1,80}$")
_ENTITY_ID = re.compile(r"^[a-z_]{1,24}\.[a-z0-9_]{1,80}$")


class DefinitionError(ValueError):
    """The definition is not valid; the message says what is wrong."""


@dataclass(frozen=True)
class AreaLight:
    entity_id: str
    x: float
    y: float
    z: float
    uid: str = (
        ""  # the light's entity registry unique id: finds the light again when its entity id is gone (a plus integration was removed)
    )


@dataclass(frozen=True)
class Colour:
    """A palette colour as an xy chromaticity and a brightness factor in percent."""

    x: float
    y: float
    b: float = 100.0


@dataclass(frozen=True)
class BrightnessEffect:
    """A brightness effect on a scene or a light: its kind, how fast it goes (1 to 12) and how strongly (1 to 100)."""

    kind: str
    speed: int
    strength: int


@dataclass(frozen=True)
class Action:
    """A device the scene switches when it starts: ``do`` is "on" or "off"."""

    entity_id: str
    do: str


@dataclass(frozen=True)
class Look:
    """What one light does differently from the rest of the scene. What is not given follows the scene."""

    palette: tuple[Colour, ...] | None = None
    brightness: int | None = None  # 1 to 255
    effects: tuple[BrightnessEffect, ...] | None = None  # () means none, not "the scene's"
    native: str | None = None  # one of the Hue lights' own effects, played with the palette's colours


@dataclass(frozen=True)
class Definition:
    scene_id: str
    lights: tuple[AreaLight, ...]
    palette: tuple[Colour, ...]
    speed: int
    range_pct: int
    brightness: int
    spread: str
    fps: int
    wake: bool  # turn on the lights that are off when the scene starts
    colour_source: str = "palette"  # where the colours come from (const.COLOUR_SOURCES)
    effects: tuple[BrightnessEffect, ...] = ()
    looks: Mapping[str, Look] = field(default_factory=dict)  # by light entity id
    actions: tuple[Action, ...] = ()


def _number(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DefinitionError(f"{name} must be a number")
    if not math.isfinite(value) or not low <= value <= high:
        raise DefinitionError(f"{name} must be between {low} and {high}")
    return float(value)


def _integer(value: Any, name: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        else:
            raise DefinitionError(f"{name} must be a whole number")
    if not low <= value <= high:
        raise DefinitionError(f"{name} must be between {low} and {high}")
    return value


def _flag(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise DefinitionError(f"{name} must be true or false")
    return value


def _pair(value: Any, name: str) -> tuple[Any, Any]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise DefinitionError(f"{name} must be a pair of numbers")
    return value[0], value[1]


def parse_colour(raw: Any) -> Colour:
    """One palette colour: {"xy": [x, y]}, {"hs": [hue, saturation]} or {"k": kelvin}, and an optional "b" (1 to 100)."""
    if not isinstance(raw, Mapping):
        raise DefinitionError("a palette colour must be an object")
    kinds = [k for k in ("xy", "hs", "k") if k in raw]
    if len(kinds) != 1:
        raise DefinitionError("a palette colour needs exactly one of xy, hs or k")
    kind = kinds[0]
    if kind == "xy":
        a, b = _pair(raw["xy"], "xy")
        x, y = _number(a, "x", 0.0, 0.8), _number(b, "y", 0.0, 0.9)
    elif kind == "hs":
        a, b = _pair(raw["hs"], "hs")
        x, y = hs_to_xy(_number(a, "hue", 0, 360), _number(b, "saturation", 0, 100))
    else:
        x, y = kelvin_to_xy(_number(raw["k"], "kelvin", 1000, 20000))
    brightness = _number(raw.get("b", 100), "b", 1, 100)
    return Colour(round(x, 4), round(y, 4), brightness)


_EFFECT_ID = re.compile(r"^[a-z][a-z0-9_]{0,31}$")


def _uid(value: Any) -> str:
    if value is None or value == "":
        return ""
    if not isinstance(value, str) or len(value) > 128:
        raise DefinitionError("a light's uid must be text of at most 128 characters")
    return value


def parse_lights(raw: Any) -> tuple[AreaLight, ...]:
    if not isinstance(raw, (list, tuple)) or not 1 <= len(raw) <= MAX_LIGHTS:
        raise DefinitionError(f"lights must be a list of 1 to {MAX_LIGHTS}")
    out: list[AreaLight] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, Mapping):
            raise DefinitionError("a light must be an object")
        entity_id = item.get("entity_id")
        if not isinstance(entity_id, str) or not _LIGHT_ID.match(entity_id):
            raise DefinitionError(f"not a light entity: {entity_id!r}")
        if entity_id in seen:
            raise DefinitionError(f"light listed twice: {entity_id}")
        seen.add(entity_id)
        out.append(
            AreaLight(
                entity_id,
                _number(item.get("x", 0), "x", -1, 1),
                _number(item.get("y", 0), "y", -1, 1),
                _number(item.get("z", 0), "z", -1, 1),
                _uid(item.get("uid")),
            )
        )
    return tuple(out)


def parse_speed(value: Any) -> int:
    return _integer(value, "speed", 1, SPEED_STEPS)


def parse_range(value: Any) -> int:
    return _integer(value, "range", 0, 100)


def parse_brightness(value: Any) -> int:
    return _integer(value, "brightness", 1, 255)


def parse_effects(raw: Any) -> tuple[BrightnessEffect, ...]:
    """Brightness effects as {"type", "speed" (1 to 12, default 6), "strength" (1 to 100, default 60)}."""
    if not isinstance(raw, (list, tuple)) or len(raw) > MAX_EFFECTS:
        raise DefinitionError(f"effects must be a list of at most {MAX_EFFECTS}")
    out: list[BrightnessEffect] = []
    for item in raw:
        if not isinstance(item, Mapping) or item.get("type") not in EFFECT_TYPES:
            raise DefinitionError(f"an effect needs a type, one of {', '.join(EFFECT_TYPES)}")
        out.append(
            BrightnessEffect(
                item["type"],
                _integer(item.get("speed", 6), "effect speed", 1, SPEED_STEPS),
                _integer(item.get("strength", 60), "effect strength", 1, 100),
            )
        )
    return tuple(out)


def parse_actions(raw: Any) -> tuple[Action, ...]:
    """Devices to switch when the scene starts: {"entity_id", "do": "on" or "off"}, in the allowed domains only."""
    if not isinstance(raw, (list, tuple)) or len(raw) > MAX_ACTIONS:
        raise DefinitionError(f"actions must be a list of at most {MAX_ACTIONS}")
    out: list[Action] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, Mapping):
            raise DefinitionError("an action must be an object")
        entity_id = item.get("entity_id")
        if not isinstance(entity_id, str) or not _ENTITY_ID.match(entity_id) or entity_id.split(".")[0] not in ACTION_DOMAINS:
            raise DefinitionError(f"an action can switch only {', '.join(ACTION_DOMAINS)}: {entity_id!r}")
        if item.get("do") not in ("on", "off"):
            raise DefinitionError("an action's do must be on or off")
        if entity_id in seen:
            raise DefinitionError(f"device listed twice: {entity_id}")
        seen.add(entity_id)
        out.append(Action(entity_id, item["do"]))
    return tuple(out)


def parse_looks(raw: Any, lights: tuple[AreaLight, ...]) -> dict[str, Look]:
    """Per-light looks by entity id; every key must be one of the scene's lights."""
    if not isinstance(raw, Mapping):
        raise DefinitionError("looks must be an object")
    known = {light.entity_id for light in lights}
    out: dict[str, Look] = {}
    for entity_id, item in raw.items():
        if entity_id not in known:
            raise DefinitionError(f"a look for a light that is not in the scene: {entity_id!r}")
        if not isinstance(item, Mapping):
            raise DefinitionError("a look must be an object")
        palette = item.get("palette")
        if palette is not None and (not isinstance(palette, (list, tuple)) or not 1 <= len(palette) <= MAX_PALETTE):
            raise DefinitionError(f"a look's palette must be a list of 1 to {MAX_PALETTE} colours")
        native = item.get("native")
        if native is not None and not (isinstance(native, str) and _EFFECT_ID.match(native)):
            raise DefinitionError("native must be the id of one of the light's own effects (a-z, 0-9 and _)")
        out[entity_id] = Look(
            palette=tuple(parse_colour(c) for c in palette) if palette is not None else None,
            brightness=parse_brightness(item["brightness"]) if item.get("brightness") is not None else None,
            effects=parse_effects(item["effects"]) if item.get("effects") is not None else None,
            native=native,
        )
    return out


def parse_definition(data: Mapping[str, Any]) -> Definition:
    """Validates a whole start request. Raises DefinitionError; returns nothing half-valid."""
    scene_id = data.get("scene_id")
    if not isinstance(scene_id, str) or not _SCENE_ID.match(scene_id):
        raise DefinitionError("scene_id must be 1 to 48 of a-z, 0-9, _ or -")
    palette_raw = data.get("palette")
    if not isinstance(palette_raw, (list, tuple)) or not 1 <= len(palette_raw) <= MAX_PALETTE:
        raise DefinitionError(f"palette must be a list of 1 to {MAX_PALETTE} colours")
    spread = data.get("spread", "x")
    if spread not in SPREADS:
        raise DefinitionError(f"spread must be one of {', '.join(SPREADS)}")
    colour_source = data.get("colour_source", "palette")
    if colour_source not in COLOUR_SOURCES:
        raise DefinitionError(f"colour_source must be one of {', '.join(COLOUR_SOURCES)}")
    lights = parse_lights(data.get("lights"))
    return Definition(
        scene_id=scene_id,
        lights=lights,
        palette=tuple(parse_colour(c) for c in palette_raw),
        speed=parse_speed(data.get("speed", 6)),
        range_pct=parse_range(data.get("range", 100)),
        brightness=parse_brightness(data.get("brightness", 255)),
        spread=spread,
        fps=_integer(data.get("fps", 2), "fps", 1, 4),
        wake=_flag(data.get("wake", False), "wake"),
        colour_source=colour_source,
        effects=parse_effects(data.get("effects", [])),
        looks=parse_looks(data.get("looks", {}), lights),
        actions=parse_actions(data.get("actions", [])),
    )
