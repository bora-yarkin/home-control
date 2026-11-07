# SPDX-License-Identifier: GPL-3.0-or-later
"""The effects catalogue: what is known of the effects of one brand's lights (decision D-15). No Home Assistant imports.

The same syntax serves a plus integration (its ``home_control.json``) and a file a user imports; ``docs/effects-file.md`` documents it.
Parsing is strict on purpose: a field it does not know is an error (a typo must not be silently ignored), every problem is listed with
where it is, and nothing is kept when there is any. A catalogue never carries code: the only picture a user's file may carry is a
palette of colours or the name of an icon.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION = 1

MAX_EFFECTS = 64
MAX_GROUPS = 12
MAX_VARIANTS = 8
MAX_PALETTE = 5
MAX_MATCH = 200
MAX_LABEL = 64
MAX_ART = 4000

_SLUG = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
_COLOUR = re.compile(r"^#[0-9a-fA-F]{6}$")
_ENTITY = re.compile(r"^light\.[a-z0-9_]{1,80}$")
_PLATFORM = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
# The name of an effect is whatever the light reports in its effect list ("candle", "Rainbow Chase"): printable text, no control characters.
_EFFECT_NAME = re.compile(r"^[^\x00-\x1f\x7f]{1,64}$")

FILE_KEYS = {"schema", "name", "lights", "groups", "effects"}
LIGHTS_KEYS = {"entities", "platforms", "models"}
GROUP_KEYS = {"id", "label"}
EFFECT_KEYS = {"id", "label", "group", "icon", "palette", "hue", "brightness", "speed", "speed_range", "variants", "default_label", "art"}
VARIANT_KEYS = {"id", "label", "colour"}
COLOUR_KEYS = {"hs", "k"}


@dataclass(frozen=True)
class Variant:
    id: str
    label: str
    hs: tuple[int, int] | None = None
    kelvin: int | None = None


@dataclass(frozen=True)
class Effect:
    id: str
    label: str
    group: str | None = None
    icon: str | None = None
    palette: tuple[str, ...] = ()
    hue: int | None = None
    brightness: int | None = None
    speed: int | None = None
    speed_range: tuple[float, float] | None = None
    variants: tuple[Variant, ...] = ()
    # What the effect's own first tile is called (the effect as it is by default); "Default" when not said.
    default_label: str | None = None
    art: str | None = None


@dataclass(frozen=True)
class Group:
    id: str
    label: str


@dataclass(frozen=True)
class Which:
    """Which lights a file's effects are for: a light matching any one of these."""

    entities: tuple[str, ...] = ()
    platforms: tuple[str, ...] = ()
    models: tuple[str, ...] = ()


@dataclass(frozen=True)
class Catalogue:
    name: str
    lights: Which
    groups: tuple[Group, ...] = ()
    effects: tuple[Effect, ...] = ()
    # Problems found, as "where: what". A catalogue with any is never used.
    problems: tuple[str, ...] = field(default=(), compare=False)


class _Problems:
    def __init__(self) -> None:
        self.found: list[str] = []

    def add(self, where: str, what: str) -> None:
        self.found.append(f"{where}: {what}")


def _unknown(problems: _Problems, where: str, raw: Mapping[str, Any], allowed: set[str]) -> None:
    for key in sorted(set(raw) - allowed):
        problems.add(f"{where}.{key}" if where else key, "is not a field of this syntax (check the spelling)")


def _text(problems: _Problems, where: str, value: Any, *, limit: int = MAX_LABEL) -> str | None:
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(c) < 32 for c in value):
        problems.add(where, f"must be text of 1 to {limit} characters")
        return None
    return value.strip()


def _integer(problems: _Problems, where: str, value: Any, low: int, high: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        problems.add(where, f"must be a whole number from {low} to {high}")
        return None
    return value


def _number(problems: _Problems, where: str, value: Any, low: float, high: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
        problems.add(where, f"must be a number from {low} to {high}")
        return None
    return float(value)


def _list(problems: _Problems, where: str, value: Any, limit: int) -> list[Any] | None:
    if not isinstance(value, list):
        problems.add(where, "must be a list")
        return None
    if len(value) > limit:
        problems.add(where, f"has {len(value)} items; at most {limit}")
        return None
    return value


def _which(problems: _Problems, raw: Any) -> Which:
    if not isinstance(raw, Mapping):
        problems.add("lights", "must be an object with entities, platforms or models")
        return Which()
    _unknown(problems, "lights", raw, LIGHTS_KEYS)
    found: dict[str, tuple[str, ...]] = {}
    for key, pattern in (("entities", _ENTITY), ("platforms", _PLATFORM), ("models", None)):
        items = _list(problems, f"lights.{key}", raw[key], MAX_MATCH) if key in raw else []
        out: list[str] = []
        for i, item in enumerate(items or []):
            ok = isinstance(item, str) and bool(item.strip()) and len(item) <= 120 and (pattern is None or pattern.match(item))
            if ok:
                out.append(item.strip() if pattern is None else item)
            else:
                what = {
                    "entities": "a light entity id such as light.strip",
                    "platforms": "an integration name such as govee",
                    "models": "the model name text",
                }[key]
                problems.add(f"lights.{key}[{i}]", f"must be {what}")
        found[key] = tuple(out)
    if not any(found.values()):
        problems.add("lights", "must name at least one light entity, one integration (platforms) or one model")
    return Which(found["entities"], found["platforms"], found["models"])


def _groups(problems: _Problems, raw: Any) -> tuple[Group, ...]:
    out: list[Group] = []
    seen: set[str] = set()
    for i, item in enumerate(_list(problems, "groups", raw, MAX_GROUPS) or []):
        where = f"groups[{i}]"
        if not isinstance(item, Mapping):
            problems.add(where, "must be an object with id and label")
            continue
        _unknown(problems, where, item, GROUP_KEYS)
        gid, label = item.get("id"), _text(problems, f"{where}.label", item.get("label"))
        if not isinstance(gid, str) or not _SLUG.match(gid):
            problems.add(f"{where}.id", "must be lower case letters, digits and _, starting with a letter (up to 32)")
        elif gid in seen:
            problems.add(f"{where}.id", f"{gid!r} is used twice")
        elif label is not None:
            seen.add(gid)
            out.append(Group(gid, label))
    return tuple(out)


def _variants(problems: _Problems, where: str, raw: Any) -> tuple[Variant, ...]:
    out: list[Variant] = []
    seen: set[str] = set()
    for i, item in enumerate(_list(problems, where, raw, MAX_VARIANTS) or []):
        at = f"{where}[{i}]"
        if not isinstance(item, Mapping):
            problems.add(at, "must be an object with id, label and colour")
            continue
        _unknown(problems, at, item, VARIANT_KEYS)
        vid, label, colour = item.get("id"), _text(problems, f"{at}.label", item.get("label")), item.get("colour")
        if not isinstance(vid, str) or not _SLUG.match(vid):
            problems.add(f"{at}.id", "must be lower case letters, digits and _, starting with a letter (up to 32)")
            continue
        if vid in seen:
            problems.add(f"{at}.id", f"{vid!r} is used twice")
            continue
        hs: tuple[int, int] | None = None
        kelvin: int | None = None
        if not isinstance(colour, Mapping) or len(set(colour) & COLOUR_KEYS) != 1 or set(colour) - COLOUR_KEYS:
            problems.add(f"{at}.colour", 'must be {"hs": [hue, saturation]} or {"k": kelvin}')
        elif "hs" in colour:
            pair = colour["hs"]
            hue = _integer(problems, f"{at}.colour.hs[0]", pair[0], 0, 360) if isinstance(pair, list) and len(pair) == 2 else None
            sat = _integer(problems, f"{at}.colour.hs[1]", pair[1], 0, 100) if isinstance(pair, list) and len(pair) == 2 else None
            if not (isinstance(pair, list) and len(pair) == 2):
                problems.add(f"{at}.colour.hs", "must be two numbers: hue 0 to 360 and saturation 0 to 100")
            elif hue is not None and sat is not None:
                hs = (hue, sat)
        else:
            kelvin = _integer(problems, f"{at}.colour.k", colour["k"], 1000, 20000)
        if label is not None and (hs is not None or kelvin is not None):
            seen.add(vid)
            out.append(Variant(vid, label, hs, kelvin))
    return tuple(out)


def _effect(problems: _Problems, where: str, item: Any, groups: set[str], allow_art: bool) -> Effect | None:
    if not isinstance(item, Mapping):
        problems.add(where, "must be an object")
        return None
    _unknown(problems, where, item, EFFECT_KEYS)
    before = len(problems.found)
    eid = item.get("id")
    if not isinstance(eid, str) or not _EFFECT_NAME.match(eid):
        problems.add(f"{where}.id", "must be the effect's name exactly as the light lists it (1 to 64 characters)")
    label = _text(problems, f"{where}.label", item["label"]) if "label" in item else (eid if isinstance(eid, str) else None)
    group = item.get("group")
    if group is not None and group not in groups:
        problems.add(f"{where}.group", f"{group!r} is not one of the groups listed above")
    icon = item.get("icon")
    if icon is not None and not (isinstance(icon, str) and _SLUG.match(icon)):
        problems.add(f"{where}.icon", "must be the name of an icon (lower case letters, digits and _)")
    palette: tuple[str, ...] = ()
    if "palette" in item:
        colours = _list(problems, f"{where}.palette", item["palette"], MAX_PALETTE) or []
        bad = [i for i, c in enumerate(colours) if not (isinstance(c, str) and _COLOUR.match(c))]
        for i in bad:
            problems.add(f"{where}.palette[{i}]", "must be a colour such as #86ecff")
        if not colours:
            problems.add(f"{where}.palette", "must have 1 to 5 colours")
        elif not bad:
            palette = tuple(c.lower() for c in colours)
    hue = _integer(problems, f"{where}.hue", item["hue"], 0, 360) if "hue" in item else None
    brightness = _integer(problems, f"{where}.brightness", item["brightness"], 1, 100) if "brightness" in item else None
    speed = _integer(problems, f"{where}.speed", item["speed"], 1, 12) if "speed" in item else None
    speed_range: tuple[float, float] | None = None
    if "speed_range" in item:
        pair = item["speed_range"]
        if not (isinstance(pair, list) and len(pair) == 2):
            problems.add(f"{where}.speed_range", "must be two numbers from 0 to 1: [slowest, fastest]")
        else:
            low = _number(problems, f"{where}.speed_range[0]", pair[0], 0.0, 1.0)
            high = _number(problems, f"{where}.speed_range[1]", pair[1], 0.0, 1.0)
            if low is not None and high is not None:
                if low < high:
                    speed_range = (low, high)
                else:
                    problems.add(f"{where}.speed_range", "the first number (slowest) must be less than the second (fastest)")
    variants = _variants(problems, f"{where}.variants", item["variants"]) if "variants" in item else ()
    default_label = _text(problems, f"{where}.default_label", item["default_label"]) if "default_label" in item else None
    art: str | None = None
    if "art" in item:
        if not allow_art:
            problems.add(f"{where}.art", "pictures are only for a plus integration; use palette or icon in a file")
        elif not isinstance(item["art"], str) or not item["art"].strip() or len(item["art"]) > MAX_ART:
            problems.add(f"{where}.art", f"must be SVG text of up to {MAX_ART} characters")
        else:
            art = item["art"].strip()
    if len(problems.found) > before or not isinstance(eid, str) or label is None:
        return None
    return Effect(eid, label, group, icon, palette, hue, brightness, speed, speed_range, variants, default_label, art)


def _effects_part(problems: _Problems, raw: Mapping[str, Any], allow_art: bool) -> tuple[tuple[Group, ...], tuple[Effect, ...]]:
    groups = _groups(problems, raw["groups"]) if "groups" in raw else ()
    group_ids = {g.id for g in groups}
    effects: list[Effect] = []
    seen: set[str] = set()
    for i, item in enumerate(_list(problems, "effects", raw.get("effects"), MAX_EFFECTS) or []):
        effect = _effect(problems, f"effects[{i}]", item, group_ids, allow_art)
        if effect is None:
            continue
        if effect.id in seen:
            problems.add(f"effects[{i}].id", f"{effect.id!r} is listed twice")
        else:
            seen.add(effect.id)
            effects.append(effect)
    if "effects" not in raw:
        problems.add("effects", "is missing")
    elif not effects and not problems.found:
        problems.add("effects", "must list at least one effect")
    return groups, tuple(effects)


def parse_effects(raw: Any, *, allow_art: bool = True) -> tuple[tuple[Group, ...], tuple[Effect, ...], tuple[str, ...]]:
    """Just the groups and effects: what a plus integration's declaration carries (the lights it is for are its own, and it has no name
    to give). Returns the groups, the effects and the problems; any problem means the catalogue is not used."""
    problems = _Problems()
    if not isinstance(raw, Mapping):
        return (), (), ("the catalogue must be an object with groups and effects",)
    _unknown(problems, "", raw, {"groups", "effects"})
    groups, effects = _effects_part(problems, raw, allow_art)
    return groups, effects, tuple(problems.found)


def parse(raw: Any, *, allow_art: bool = False) -> Catalogue:
    """The catalogue in ``raw`` (what json.loads gave). ``problems`` lists everything wrong with it; an empty list means it is good.

    ``allow_art`` is for a plus integration's catalogue, which may carry pictures; the dashboard re-checks those when it draws them."""
    problems = _Problems()
    if not isinstance(raw, Mapping):
        return Catalogue("", Which(), problems=("the file must hold one JSON object",))
    _unknown(problems, "", raw, FILE_KEYS)
    if raw.get("schema") != SCHEMA_VERSION:
        problems.add("schema", f"must be {SCHEMA_VERSION}")
    name = _text(problems, "name", raw.get("name")) or ""
    lights = _which(problems, raw.get("lights"))
    groups, effects = _effects_part(problems, raw, allow_art)
    return Catalogue(name, lights, groups, effects, tuple(problems.found))
