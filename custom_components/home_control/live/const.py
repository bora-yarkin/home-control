# SPDX-License-Identifier: GPL-3.0-or-later
"""Limits and defaults of the scenes module (see docs/threat-model.md for why the limits exist)."""

MAX_SESSIONS = 8
MAX_LIGHTS = 32
MAX_PALETTE = 16
SPEED_STEPS = 12

# Commands per second to one bridge or hub when its integration does not say (a plus integration declares its own rate: Hue's bridge takes about 10 in total).
DEFAULT_RATE = 15.0

# Seconds an identify (red or dim) lasts at most before the light is put back.
IDENTIFY_SECONDS = 30.0

SPREADS = ("x", "y", "z", "radial")
# Where a scene's colours come from (effects.py builds each).
COLOUR_SOURCES = ("palette", "rainbow")
# Brightness effects that can be put on a scene or one of its lights (effects.py builds each).
EFFECT_TYPES = ("pulse", "flicker", "sparkle", "lightning")
MAX_EFFECTS = 4
# What a scene may switch on or off when it starts. Nothing else: no other service, no other domain (docs/threat-model.md).
ACTION_DOMAINS = ("light", "switch", "fan", "media_player", "climate", "humidifier", "input_boolean", "cover")
MAX_ACTIONS = 12

# How the spread field is explained (kept here so the words and the values stay together).
SPEC_SPREADS_HINT = "Which way the palette is spread over the lights: along x, y or z, or outward from the middle (radial)."
