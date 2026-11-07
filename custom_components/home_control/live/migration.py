# SPDX-License-Identifier: GPL-3.0-or-later
"""The one-time takeover of what Hue Plus saved (decision D-12). Temporary: it goes once every install has moved over.

Hue Plus kept the saved scenes and areas of each bridge in its own storage until live scenes moved into Home Control. The first time Home
Control starts with no saved scenes of its own it takes them over; what Hue Plus holds is only read, never changed or deleted.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .library import Library

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
HUE_PLUS_STORAGE = "hue_plus.scenes."


def _keys(folder: Path) -> list[str]:
    """The storage keys Hue Plus kept scenes under (one per bridge), not the copies it set aside when a file was damaged."""
    return sorted(p.name for p in folder.glob(f"{HUE_PLUS_STORAGE}*") if not p.name.endswith(".damaged"))


async def take_over_saved_scenes(hass: HomeAssistant, library: Library) -> int:
    """Takes the scenes and areas Hue Plus has saved into ``library``, and says how many. Nothing in Hue Plus's files changes."""
    taken = 0
    for key in await hass.async_add_executor_job(_keys, Path(hass.config.path(".storage"))):
        stored = await Store(hass, STORAGE_VERSION, key).async_load()
        theirs, problems = Library.restore(stored)
        for problem in problems:
            _LOGGER.warning("Saved scenes of Hue Plus (%s): %s", key, problem)
        for area in theirs.areas.values():
            if area["id"] not in library.areas:
                library.areas[area["id"]] = area
                taken += 1
        for scene in theirs.scenes.values():
            if scene["id"] not in library.scenes:
                library.scenes[scene["id"]] = scene
                taken += 1
    return taken
