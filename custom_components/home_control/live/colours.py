# SPDX-License-Identifier: GPL-3.0-or-later
"""The colour of each light at a moment: a palette that moves across the lights of an area.

Pure functions, free of Home Assistant. A palette is a loop of colours. The scene has a
phase (how far through one loop it is); each light is ahead of the phase by an offset
that depends on where it is placed, so the palette is spread across the area.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from .const import SPEED_STEPS
from .definitions import AreaLight, Colour

# Seconds for one loop of the palette at the slowest and at the fastest speed step.
SLOWEST_CYCLE = 120.0
FASTEST_CYCLE = 8.0


def cycle_seconds(step: int) -> float:
    """Seconds for one loop of the palette at a speed step (1 to 12), evenly spaced on a log scale."""
    step = max(1, min(SPEED_STEPS, step))
    return SLOWEST_CYCLE * (FASTEST_CYCLE / SLOWEST_CYCLE) ** ((step - 1) / (SPEED_STEPS - 1))


def offsets(lights: Sequence[AreaLight], spread: str, range_pct: int, colours: int) -> dict[str, float]:
    """How far ahead of the phase each light is, in loops.

    The lights are put in order along the chosen direction (x, y, z, or outward from the
    middle of the area). At range 0 every light has offset 0; at 100 the first and last
    differ by the whole loop except one colour step, so the whole palette is on show.
    """
    if spread == "x":
        proj = {light.entity_id: light.x for light in lights}
    elif spread == "y":
        proj = {light.entity_id: light.y for light in lights}
    elif spread == "z":
        proj = {light.entity_id: light.z for light in lights}
    else:
        cx = sum(light.x for light in lights) / len(lights)
        cy = sum(light.y for light in lights) / len(lights)
        proj = {light.entity_id: math.hypot(light.x - cx, light.y - cy) for light in lights}
    low, high = min(proj.values()), max(proj.values())
    span = (1 - 1 / colours) if colours > 1 else 0.0
    scale = span * range_pct / 100
    if high - low < 1e-9:
        return dict.fromkeys(proj, 0.0)
    return {k: (v - low) / (high - low) * scale for k, v in proj.items()}


def sample(palette: Sequence[Colour], phase: float) -> tuple[float, float, float]:
    """The (x, y, brightness percent) at a phase: a straight blend between neighbouring colours, looping."""
    n = len(palette)
    if n == 1:
        c = palette[0]
        return (c.x, c.y, c.b)
    position = (phase % 1.0) * n
    index = int(position)
    fraction = position - index
    a, b = palette[index % n], palette[(index + 1) % n]
    return (
        a.x + (b.x - a.x) * fraction,
        a.y + (b.y - a.y) * fraction,
        a.b + (b.b - a.b) * fraction,
    )
