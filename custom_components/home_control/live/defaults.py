# SPDX-License-Identifier: GPL-3.0-or-later
"""The scenes that ship with the integration: palettes, speeds and spreads that suit most rooms.

A preset has no lights. Start one on an area (``preset`` and ``area`` of ``scene_start``), or copy it into a scene of
your own with ``scene_save``. The colours are given as hue and saturation (``hs``) or white temperature (``k``).
"""

from __future__ import annotations

from typing import Any

# id -> (name, palette, speed 1-12, range 0-100, spread, brightness 1-255)
_PRESETS: dict[str, tuple[str, list[dict[str, Any]], int, int, str, int]] = {
    "aurora": (
        "Aurora",
        [{"hs": [150, 80], "b": 80}, {"hs": [175, 90], "b": 100}, {"hs": [260, 70], "b": 70}, {"hs": [290, 60], "b": 80}],
        4,
        100,
        "x",
        200,
    ),
    "candle": ("Candle", [{"k": 2000, "b": 100}, {"k": 2200, "b": 60}, {"k": 2000, "b": 85}, {"k": 2100, "b": 45}], 9, 40, "radial", 140),
    "fireplace": (
        "Fireplace",
        [{"hs": [18, 100], "b": 100}, {"hs": [8, 100], "b": 55}, {"hs": [30, 95], "b": 90}, {"hs": [12, 100], "b": 45}],
        8,
        70,
        "y",
        180,
    ),
    "sunset_glow": (
        "Sunset glow",
        [{"hs": [8, 85], "b": 90}, {"hs": [25, 90], "b": 100}, {"hs": [335, 70], "b": 75}, {"hs": [280, 55], "b": 55}],
        3,
        100,
        "y",
        190,
    ),
    "twilight": (
        "Twilight",
        [{"hs": [240, 85], "b": 60}, {"hs": [270, 75], "b": 70}, {"hs": [310, 65], "b": 80}, {"hs": [195, 80], "b": 60}],
        3,
        100,
        "x",
        160,
    ),
    "prism": (
        "Prism",
        [
            {"hs": [0, 100], "b": 100},
            {"hs": [60, 100], "b": 100},
            {"hs": [120, 100], "b": 100},
            {"hs": [180, 100], "b": 100},
            {"hs": [240, 100], "b": 100},
            {"hs": [300, 100], "b": 100},
        ],
        5,
        100,
        "x",
        220,
    ),
    "galaxy": (
        "Galaxy",
        [{"hs": [255, 90], "b": 70}, {"hs": [285, 80], "b": 90}, {"hs": [215, 85], "b": 60}, {"hs": [320, 70], "b": 80}],
        4,
        100,
        "radial",
        170,
    ),
    "lava": (
        "Lava",
        [{"hs": [2, 100], "b": 100}, {"hs": [15, 100], "b": 70}, {"hs": [350, 95], "b": 85}, {"hs": [28, 100], "b": 55}],
        2,
        80,
        "y",
        200,
    ),
    "sunrise": (
        "Sunrise",
        [{"k": 2000, "b": 40}, {"hs": [20, 85], "b": 70}, {"hs": [38, 70], "b": 90}, {"k": 3500, "b": 100}],
        1,
        100,
        "y",
        200,
    ),
    "ocean": (
        "Ocean",
        [{"hs": [195, 90], "b": 80}, {"hs": [210, 95], "b": 100}, {"hs": [180, 70], "b": 70}, {"hs": [225, 80], "b": 60}],
        5,
        90,
        "x",
        190,
    ),
    "forest": (
        "Forest",
        [{"hs": [110, 85], "b": 70}, {"hs": [135, 90], "b": 90}, {"hs": [85, 75], "b": 80}, {"hs": [150, 65], "b": 60}],
        3,
        80,
        "z",
        170,
    ),
    "blossom": (
        "Blossom",
        [{"hs": [335, 55], "b": 100}, {"hs": [350, 40], "b": 85}, {"hs": [310, 45], "b": 90}, {"k": 3000, "b": 75}],
        3,
        100,
        "radial",
        190,
    ),
    "ember": ("Ember", [{"hs": [10, 100], "b": 50}, {"hs": [22, 100], "b": 30}, {"hs": [5, 100], "b": 40}], 6, 60, "radial", 90),
    "relax": ("Relax", [{"k": 2200, "b": 60}, {"k": 2700, "b": 80}, {"k": 2400, "b": 65}], 1, 40, "x", 150),
}


def presets() -> dict[str, dict[str, Any]]:
    """The shipped presets by id."""
    return {
        preset_id: {
            "id": preset_id,
            "name": name,
            "palette": [dict(c) for c in palette],
            "speed": speed,
            "range": span,
            "spread": spread,
            "brightness": brightness,
            "builtin": True,
        }
        for preset_id, (name, palette, speed, span, spread, brightness) in _PRESETS.items()
    }
