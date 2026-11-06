# SPDX-License-Identifier: GPL-3.0-or-later
"""Brings live scenes up: the engine, the identify helper, the providers, and the saved scenes and areas."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store

from ..const import DOMAIN
from .engine import Engine
from .hass_driver import HassDriver
from .identify import Identifier
from .library import Library
from .migration import take_over_saved_scenes
from .providers import Providers

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.live"
SAVE_DELAY_S = 1.0


@dataclass
class LiveRuntime:
    engine: Engine
    identifier: Identifier
    library: Library
    store: Store[dict[str, Any]]
    providers: Providers

    def save_later(self) -> None:
        """Writes the saved scenes and areas soon (several changes in a row are one write)."""
        self.store.async_delay_save(self.library.as_json, SAVE_DELAY_S)


async def _load_library(hass: HomeAssistant, store: Store[dict[str, Any]]) -> Library:
    """The saved library. Anything that cannot be kept is logged, and the file as it was is copied aside first.

    The first time (no file of Home Control's own yet) the scenes and areas Hue Plus saved are taken over, and the file is written at
    once so that this happens only once."""
    stored = await store.async_load()
    if stored is None:
        library = Library()
        taken = await take_over_saved_scenes(hass, library)
        await store.async_save(library.as_json())
        if taken:
            _LOGGER.info("Took over %d saved scenes and areas from the previous owner", taken)
        return library
    library, problems = Library.restore(stored)
    if problems:
        for problem in problems:
            _LOGGER.warning("Home Control scenes: %s", problem)
        # The next save would overwrite the damaged file; keep what was in it so nothing is lost silently.
        await Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}.damaged").async_save({"stored": stored, "problems": problems})
    return library


async def async_setup(hass: HomeAssistant, entry: ConfigEntry) -> LiveRuntime:
    providers = Providers(hass)
    await providers.async_scan()
    driver = HassDriver(hass, providers)
    engine = Engine(driver, spawn=lambda coro: hass.async_create_background_task(coro, f"{DOMAIN} scene"))
    identifier = Identifier(driver, engine, spawn=lambda coro: hass.async_create_background_task(coro, f"{DOMAIN} locate"))
    store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    live = LiveRuntime(engine, identifier, await _load_library(hass, store), store, providers)

    @callback
    def state_changed(event: Event) -> None:
        """A light changed by a person (a user's call, not the engine's) leaves its scene."""
        entity_id = event.data.get("entity_id", "")
        if event.context.user_id and engine.owns(entity_id):
            engine.changed_by_someone(entity_id)

    @callback
    def component_loaded(event: Event) -> None:
        """A plus integration that loads after Home Control is found when its declaration is read again."""
        hass.async_create_task(providers.async_scan())

    entry.async_on_unload(hass.bus.async_listen("state_changed", state_changed))
    entry.async_on_unload(hass.bus.async_listen("component_loaded", component_loaded))

    async def stop() -> None:
        """Stops every scene and puts back any light being located."""
        engine.stop_all()
        await identifier.stop_all()

    entry.async_on_unload(stop)
    return live
