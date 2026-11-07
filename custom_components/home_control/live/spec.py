# SPDX-License-Identifier: GPL-3.0-or-later
"""The services of live scenes and areas. No Home Assistant imports."""

from __future__ import annotations

from typing import Any

from ..fieldspec import f
from .const import COLOUR_MODES, COLOUR_SOURCES, SPEC_SPREADS_HINT, SPREADS
from .defaults import presets

SCENE_ID = f("text", "The scene's id: 1 to 48 of a-z, 0-9, _ or -. The id of a saved scene starts that scene.", True, example="evening")
SPEED = f("int", "How fast the palette moves, from 1 (slow, two minutes a loop) to 12 (fast, eight seconds a loop).", min=1, max=12)
RANGE = f("int", "How much of the palette is on show across the lights at once, in percent.", min=0, max=100)
BRIGHTNESS = f("int", "The brightness the palette's brightest colour reaches, from 1 to 255.", min=1, max=255)
PALETTE = f(
    "object",
    'The colours, 1 to 16, each an item with "hs" ([hue, saturation]), "xy" ([x, y]) or "k" (kelvin), and an optional "b" (brightness, 1 to 100).',
    example='[{"hs": [20, 90]}, {"k": 2200, "b": 60}]',
)
SPREAD = f("select", SPEC_SPREADS_HINT, options=list(SPREADS))
LIGHTS = f("object", 'The lights: a list of items, each with "entity_id" and x, y, z from -1 to 1 saying where it stands.')
PRESET = f("select", "A shipped palette to start from.", options=list(presets()))
COLOUR_MODE = f(
    "select",
    "How the colours follow each other: linear blends each into the next, segmented shows each as it is, one after the other, with no colour in between.",
    options=list(COLOUR_MODES),
)
COLOUR_SOURCE = f(
    "select",
    "Where the colours come from: the moving palette, or a rainbow (the hue goes once round the colour wheel per loop).",
    options=list(COLOUR_SOURCES),
)
EFFECTS = f(
    "object",
    'Brightness effects, up to 4: a list of items, each with "type" (pulse, flicker, sparkle or lightning), "speed" (1 to 12) and "strength" (1 to 100). They work on any colour source.',
    example='[{"type": "pulse", "speed": 4, "strength": 60}]',
)
LOOKS = f(
    "object",
    'What single lights do differently, by light: an item for each light\'s entity id, with "palette", "brightness" (1 to 255), "effects" and "native" (for example underwater). '
    "A light with no look follows the scene. native is one of the light's own effects, played when a plus integration for the light's brand can (a Hue light's candle, for example); it plays with the look's palette colours.",
)
ACTIONS = f(
    "object",
    'Devices to switch when the scene starts: a list of items, each with "entity_id" and "do" (on or off). On or off only, for lights, switches, fans, media players, climate, humidifiers, input_booleans and covers.',
    example='[{"entity_id": "media_player.tv", "do": "off"}]',
)
FPS = f(
    "int",
    "For lights that cannot fade by themselves: updates per second, from 1 to 60 (experimental: each update is a single command, so a high rate loads the light's hub and is held to the rate it takes).",
    min=1,
    max=60,
)
UI = f("object", "Data a screen keeps next to this (icons, drawings). Stored as it is, up to 16 KB.")

SPEC: dict[str, dict[str, Any]] = {
    "scene_start": {
        "description": "Starts a live scene: a palette that moves across the lights of an area. What is not given comes from the saved scene with this id, then from its preset.",
        "fields": {
            "scene_id": SCENE_ID,
            "preset": PRESET,
            "area": f("text", "The id of a saved area; its lights play the scene."),
            "lights": LIGHTS,
            "palette": PALETTE,
            "speed": SPEED,
            "range": RANGE,
            "brightness": BRIGHTNESS,
            "spread": SPREAD,
            "colour_source": COLOUR_SOURCE,
            "mode": COLOUR_MODE,
            "effects": EFFECTS,
            "looks": LOOKS,
            "actions": ACTIONS,
            "fps": FPS,
            "wake": f("bool", "Turn on the lights that are off when the scene starts."),
        },
    },
    "scene_update": {
        "description": "Changes the speed, range or brightness of a running scene at once.",
        "fields": {"scene_id": SCENE_ID, "speed": SPEED, "range": RANGE, "brightness": BRIGHTNESS},
    },
    "scene_freeze": {"description": "Holds a running scene where it is.", "fields": {"scene_id": SCENE_ID}},
    "scene_play": {"description": "Lets a frozen scene move again.", "fields": {"scene_id": SCENE_ID}},
    "scene_stop": {"description": "Ends a scene. The lights stay as they are.", "fields": {"scene_id": SCENE_ID}},
    "scene_save": {
        "description": "Saves a scene so it can be started by its id. Give a preset to start from a shipped palette.",
        "fields": {
            "id": f("text", "The scene's id: 1 to 48 of a-z, 0-9, _ or -.", True),
            "name": f("text", "The scene's name.", True),
            "preset": PRESET,
            "palette": PALETTE,
            "speed": SPEED,
            "range": RANGE,
            "brightness": BRIGHTNESS,
            "spread": SPREAD,
            "colour_source": COLOUR_SOURCE,
            "mode": COLOUR_MODE,
            "effects": EFFECTS,
            "looks": LOOKS,
            "actions": ACTIONS,
            "fps": FPS,
            "area": f("text", "The id of a saved area it plays on."),
            "lights": LIGHTS,
            "ui": UI,
        },
    },
    "scene_delete": {
        "description": "Deletes a saved scene (a running one keeps playing until it is stopped).",
        "fields": {"id": f("text", "The scene's id.", True)},
    },
    "area_save": {
        "description": "Saves an area: the lights of a room or part of it and where each stands, which decides how a palette spreads across them.",
        "fields": {
            "id": f("text", "The area's id: 1 to 48 of a-z, 0-9, _ or -.", True),
            "name": f("text", "The area's name.", True),
            "lights": {**LIGHTS, "required": True},
            "ui": UI,
        },
    },
    "area_delete": {
        "description": "Deletes a saved area. Scenes that played on it stay saved but need another area before they can start.",
        "fields": {"id": f("text", "The area's id.", True)},
    },
    "locate_light": {
        "description": "Shows which light is which: it turns red (or dims, when it has no colour) until you turn this off, or for 30 seconds, and is then put back.",
        "fields": {
            "entity_id": f("text", "The light entity.", True, example="light.floor_light_l"),
            "active": f("bool", "Start or stop.", True),
        },
    },
    "get_library": {"description": "Returns the saved scenes and areas and the shipped presets.", "fields": {}},
}
