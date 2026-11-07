# SPDX-License-Identifier: GPL-3.0-or-later
"""What a scene shows: where the colours come from, and how the brightness moves.

Free of Home Assistant. A colour source gives the colour of each light at a moment; brightness effects (pulse, flicker, sparkle,
lightning) then dim or brighten it. All of it is a pure function of the light and the time played, so the same input always gives
the same result, also for the effects that look random (they use a fixed hash, not a random generator). The engine decides
when to send and how; this module only says what.
"""

from __future__ import annotations

import math
import zlib
from collections.abc import Sequence
from typing import Protocol

from .chroma import hs_to_xy
from .colours import cycle_seconds, offsets, sample
from .definitions import BrightnessEffect, Colour, Definition

# Updates per palette colour for a light that fades by itself.
STEPS_PER_COLOUR = 3
# How many steps a full turn of the colour wheel is cut into.
RAINBOW_STEPS = 12


class ColourSource(Protocol):
    steps_per_loop: int
    """How many different colours are worth sending in one loop; with the speed it sets how often a fading light is updated."""

    def until_next(self, entity_id: str, phase: float) -> float | None:
        """Loops until the colour of a light changes, for a source that shows one colour at a time (segmented); None when it blends."""

    def colour(self, entity_id: str, phase: float, progress: float) -> tuple[float, float, float]:
        """The (x, y, brightness percent) of a light.

        ``phase`` is how far through the current loop the scene is, from 0 up to but not including 1. ``progress`` is the
        number of loops played since the start (it only goes up, also across speed changes), for sources that must not repeat
        every loop. A frozen scene stops both.
        """


def _segment(palette: Sequence[Colour], phase: float) -> tuple[float, float, float]:
    """The colour of the segment a phase falls in: each colour of the palette as it is, no colour between two of them."""
    c = palette[int((phase % 1.0) * len(palette)) % len(palette)]
    return (c.x, c.y, c.b)


def _loops_to_boundary(phase: float, segments: int) -> float | None:
    """Loops until a phase reaches the next of `segments` equal parts of the loop; None when there is one part (nothing changes)."""
    if segments < 2:
        return None
    position = (phase % 1.0) * segments
    return (1.0 - (position - int(position))) / segments


class PaletteSource:
    """A palette that moves across the lights, each light ahead of the others by where it stands (the original scene)."""

    def __init__(self, definition: Definition) -> None:
        self._palette = definition.palette
        self._segmented = definition.mode == "segmented"
        self._offsets = offsets(definition.lights, definition.spread, definition.range_pct, len(definition.palette))
        self.steps_per_loop = max(1, len(definition.palette)) * STEPS_PER_COLOUR

    def colour(self, entity_id: str, phase: float, progress: float) -> tuple[float, float, float]:
        at = phase + self._offsets[entity_id]
        return _segment(self._palette, at) if self._segmented else sample(self._palette, at)

    def until_next(self, entity_id: str, phase: float) -> float | None:
        return _loops_to_boundary(phase + self._offsets[entity_id], len(self._palette)) if self._segmented else None


class RainbowSource:
    """The hue goes once round the colour wheel per loop; at range 0 every light has the same hue, at 100 the lights span the wheel."""

    def __init__(self, definition: Definition) -> None:
        self._segmented = definition.mode == "segmented"
        self._offsets = offsets(definition.lights, definition.spread, definition.range_pct, RAINBOW_STEPS)
        self.steps_per_loop = RAINBOW_STEPS

    def colour(self, entity_id: str, phase: float, progress: float) -> tuple[float, float, float]:
        at = (phase + self._offsets[entity_id]) % 1.0
        if self._segmented:  # the wheel cut into RAINBOW_STEPS hues, each shown as it is
            at = int(at * RAINBOW_STEPS) / RAINBOW_STEPS
        x, y = hs_to_xy(at * 360.0, 100.0)
        return (x, y, 100.0)

    def until_next(self, entity_id: str, phase: float) -> float | None:
        return _loops_to_boundary(phase + self._offsets[entity_id], RAINBOW_STEPS) if self._segmented else None


class _OwnPalette:
    """A light's own colours, rotating at the scene's speed, for a light that has a look of its own."""

    def __init__(self, palette: Sequence[Colour], segmented: bool = False) -> None:
        self._palette = tuple(palette)
        self._segmented = segmented
        self.steps_per_loop = len(self._palette) * STEPS_PER_COLOUR

    def colour(self, entity_id: str, phase: float, progress: float) -> tuple[float, float, float]:
        return _segment(self._palette, phase) if self._segmented else sample(self._palette, phase)

    def until_next(self, entity_id: str, phase: float) -> float | None:
        return _loops_to_boundary(phase, len(self._palette)) if self._segmented else None


BUILDERS = {"palette": PaletteSource, "rainbow": RainbowSource}


# --- brightness effects ------------------------------------------------------------------------------------------------------


def _unit(seed: int, a: int, b: int = 0) -> float:
    """A repeatable number in [0, 1] from three whole numbers (a fixed integer hash; the same everywhere, every run)."""
    n = (seed * 73856093 ^ a * 19349663 ^ b * 83492791) & 0xFFFFFFFF
    n = ((n ^ (n >> 15)) * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 3266489917) & 0xFFFFFFFF
    return (n ^ (n >> 16)) / 0xFFFFFFFF


def _seed(entity_id: str) -> int:
    return zlib.crc32(entity_id.encode())


class Modulator(Protocol):
    interval: float
    """Seconds between updates that show the effect well."""
    floor: float
    """The shortest interval the effect needs; the engine's usual minimum is lowered to this while the effect plays."""

    def factor(self, entity_id: str, seconds: float) -> float:
        """What the brightness is multiplied by at this moment, above 0 and at most 1."""


class Pulse:
    """Breathing: the brightness rises and falls once per cycle, each light a little behind the one before it."""

    floor = 1.5

    def __init__(self, effect: BrightnessEffect, place: dict[str, float]) -> None:
        self._cycle = cycle_seconds(effect.speed)
        self._depth = 0.7 * effect.strength / 100
        self._place = place
        self.interval = self._cycle / 12

    def factor(self, entity_id: str, seconds: float) -> float:
        u = seconds / self._cycle + self._place[entity_id]
        return 1.0 - self._depth * (0.5 - 0.5 * math.cos(2 * math.pi * u))


class Flicker:
    """A candle's wander: the brightness drifts irregularly, each light on its own course."""

    floor = 0.6

    def __init__(self, effect: BrightnessEffect) -> None:
        self._rate = 30.0 / cycle_seconds(effect.speed)  # fresh random values per second
        self._depth = 0.6 * effect.strength / 100
        self.interval = max(self.floor, 0.5 / self._rate)

    def factor(self, entity_id: str, seconds: float) -> float:
        k = seconds * self._rate
        index, fraction = int(k), k - int(k)
        smooth = fraction * fraction * (3 - 2 * fraction)
        seed = _seed(entity_id)
        noise = _unit(seed, index) * (1 - smooth) + _unit(seed, index + 1) * smooth
        return 1.0 - self._depth * noise


class Sparkle:
    """Lights sit dim and now and then one brightens for a moment."""

    floor = 0.5

    def __init__(self, effect: BrightnessEffect) -> None:
        self._rate = 24.0 / cycle_seconds(effect.speed)  # slots per second
        self._depth = 0.7 * effect.strength / 100
        self.interval = max(self.floor, 0.4 / self._rate)

    def factor(self, entity_id: str, seconds: float) -> float:
        k = seconds * self._rate
        slot, within = int(k), k - int(k)
        sparkling = _unit(_seed(entity_id), slot) < 0.25
        lift = math.sin(math.pi * within) if sparkling else 0.0
        return 1.0 - self._depth * (1.0 - lift)


class Lightning:
    """Dim, with irregular bright flashes, sometimes two close together. The lights flash almost, not exactly, together."""

    floor = 0.4
    interval = 0.4
    _GLOBAL = 7919

    def __init__(self, effect: BrightnessEffect) -> None:
        self._window = cycle_seconds(effect.speed)
        self._depth = 0.85 * effect.strength / 100

    @staticmethod
    def _flash(since: float) -> float:
        return 1.0 - since / 0.18 if 0.0 <= since < 0.18 else 0.0

    def factor(self, entity_id: str, seconds: float) -> float:
        window = int(seconds // self._window)
        start = _unit(self._GLOBAL, window) * self._window * 0.8 + _unit(_seed(entity_id), window) * 0.15
        since = seconds - window * self._window - start
        flash = self._flash(since)
        if _unit(self._GLOBAL, window, 1) < 0.4:
            flash = max(flash, self._flash(since - 0.3))
        return 1.0 - self._depth * (1.0 - flash)


def _modulator(effect: BrightnessEffect, place: dict[str, float]) -> Modulator:
    if effect.kind == "pulse":
        return Pulse(effect, place)
    if effect.kind == "flicker":
        return Flicker(effect)
    if effect.kind == "sparkle":
        return Sparkle(effect)
    return Lightning(effect)


# --- one scene's look ----------------------------------------------------------------------------------------------------------


class Appearance:
    """What each light of a scene shows: its colour source, its brightness effects, its own brightness and native effect.

    A light with a look of its own uses what the look gives; anything the look leaves out follows the scene.
    """

    def __init__(self, definition: Definition) -> None:
        self._scene_brightness = definition.brightness
        self._default = BUILDERS[definition.colour_source](definition)
        place = offsets(definition.lights, definition.spread, definition.range_pct, 2)
        self._own: dict[str, ColourSource] = {}
        self._brightness: dict[str, int] = {}
        self._native: dict[str, str] = {}
        self._mods: dict[str, tuple[Modulator, ...]] = {}
        for light in definition.lights:
            look = definition.looks.get(light.entity_id)
            effects = definition.effects
            if look is not None:
                if look.palette:
                    self._own[light.entity_id] = _OwnPalette(look.palette, definition.mode == "segmented")
                if look.brightness is not None:
                    self._brightness[light.entity_id] = look.brightness
                if look.native:
                    self._native[light.entity_id] = look.native
                if look.effects is not None:
                    effects = look.effects
            self._mods[light.entity_id] = tuple(_modulator(e, place) for e in effects)

    def brightness(self, entity_id: str) -> int:
        return self._brightness.get(entity_id, self._scene_brightness)

    def moves_brightness(self, entity_id: str) -> bool:
        """Whether brightness effects change this light's brightness, so its brightness says nothing about who set it."""
        return bool(self._mods[entity_id])

    def native(self, entity_id: str) -> str | None:
        return self._native.get(entity_id)

    def colour(self, entity_id: str, phase: float, progress: float, seconds: float) -> tuple[float, float, float]:
        x, y, b = self._own.get(entity_id, self._default).colour(entity_id, phase, progress)
        for mod in self._mods[entity_id]:
            b = max(1.0, b * mod.factor(entity_id, seconds))
        return (x, y, b)

    def steps(self, entity_id: str) -> int:
        """How many different colours a loop of this light's colour source is worth."""
        return self._own.get(entity_id, self._default).steps_per_loop

    def until_next(self, entity_id: str, phase: float) -> float | None:
        """Loops until a segmented light's colour changes; None when its colours blend."""
        return self._own.get(entity_id, self._default).until_next(entity_id, phase)

    def effect_interval(self, entity_id: str) -> tuple[float | None, float | None]:
        """How often the brightness effects of a light need an update, and the shortest interval they need (None: no effects)."""
        mods = self._mods[entity_id]
        if not mods:
            return None, None
        return min(m.interval for m in mods), min(m.floor for m in mods)

    def interval(self, entity_id: str, loop_seconds: float) -> tuple[float, float | None]:
        """How often to update a light that fades by itself, and the shortest interval its effects need (None: no effects)."""
        wanted = loop_seconds / self._own.get(entity_id, self._default).steps_per_loop
        mods = self._mods[entity_id]
        if not mods:
            return wanted, None
        return min([wanted, *(m.interval for m in mods)]), min(m.floor for m in mods)


def build(definition: Definition) -> Appearance:
    return Appearance(definition)
