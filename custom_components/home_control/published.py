# SPDX-License-Identifier: GPL-3.0-or-later
"""Live scenes made available to Siri, HomeKit and the Shortcuts app: each published scene is a Home Assistant ``scene`` entity that starts it.

A live scene is kept by Home Control and has no entity of its own, so nothing outside the dashboard could run it. Publishing makes one
(decision D-23): activating the entity starts the scene, the entity follows the scene's name, and it goes when the scene is unpublished
or deleted (and with it its place on the HomeKit Bridge's list). Which scenes are published is kept in a small file of its own.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.scene import Scene
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import EntityPlatform
from homeassistant.helpers.storage import Store

from .const import DOMAIN, SIGNAL_LIBRARY_CHANGED
from .homekit import HomeKitError, bridges, is_exposed, set_exposed
from .live.library import Library

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.published"
_ID = re.compile(r"^[a-z0-9_-]{1,48}$")


class PublishedScene(Scene):
    """The entity of one published live scene."""

    _attr_should_poll = False
    # No device and no entity-name prefix: the name is the scene's own, as it is said to Siri and shown in the Home app ("Evening", not
    # "Home Control Evening"), and the entity id follows it.
    _attr_has_entity_name = False
    _attr_icon = "mdi:palette"

    def __init__(self, published: Published, scene_id: str) -> None:
        self._published = published
        self._scene_id = scene_id
        self._attr_unique_id = f"{published.entry_id}_scene_{scene_id}"

    @property
    def name(self) -> str:
        scene = self._published.library.scenes.get(self._scene_id)
        return scene["name"] if scene else self._scene_id

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"scene_id": self._scene_id, "live": True}

    async def async_activate(self, **kwargs: Any) -> None:
        await self.hass.services.async_call(DOMAIN, "scene_start", {"scene_id": self._scene_id}, blocking=True, context=self._context)


class Published:
    """Which live scenes are published, and the entities that stand for them."""

    def __init__(self, hass: HomeAssistant, library: Library, entry_id: str) -> None:
        self.hass = hass
        self.library = library
        self.entry_id = entry_id
        self.ids: list[str] = []
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._platform: EntityPlatform | None = None
        self._entities: dict[str, PublishedScene] = {}

    async def async_load(self) -> None:
        """Reads the file; an id that is not an id, or is there twice, is left out (the file can be edited by hand)."""
        stored = await self._store.async_load()
        ids = stored.get("scenes", []) if isinstance(stored, dict) else []
        self.ids = (
            [i for n, i in enumerate(ids) if isinstance(i, str) and _ID.match(i) and i not in ids[:n]] if isinstance(ids, list) else []
        )

    def _save(self) -> None:
        self._store.async_delay_save(lambda: {"scenes": self.ids}, 1.0)

    async def async_attach(self, platform: EntityPlatform) -> None:
        """The scene platform is ready: the published scenes that still exist get their entities, those whose scene is gone are dropped."""
        self._platform = platform
        await self.async_changed()

    def entity_id(self, scene_id: str) -> str | None:
        return er.async_get(self.hass).async_get_entity_id("scene", DOMAIN, f"{self.entry_id}_scene_{scene_id}")

    def entity_ids(self) -> dict[str, str | None]:
        return {scene_id: self.entity_id(scene_id) for scene_id in self.ids}

    async def async_changed(self) -> None:
        """Brings the entities in line with the library: one for each published scene that exists, a new name shown, the rest removed."""
        gone = [scene_id for scene_id in self.ids if scene_id not in self.library.scenes]
        for scene_id in gone:
            await self._async_drop(scene_id)
        if gone:
            self._save()
        if self._platform is None:
            return
        new = [PublishedScene(self, scene_id) for scene_id in self.ids if scene_id not in self._entities]
        for entity in new:
            self._entities[entity._scene_id] = entity
        if new:
            await self._platform.async_add_entities(new)
        for entity in self._entities.values():
            if entity.hass is not None:
                entity.async_write_ha_state()

    async def _async_drop(self, scene_id: str) -> None:
        """Takes a scene's entity away, off the HomeKit Bridge's list first (a list must not keep an entity that is gone)."""
        entity_id = self.entity_id(scene_id)
        if entity_id:
            for entry in bridges(self.hass):
                try:
                    if is_exposed(entry, entity_id):
                        set_exposed(self.hass, entry.entry_id, entity_id, False)
                except HomeKitError as err:
                    _LOGGER.warning("%s could not be taken off the HomeKit Bridge list: %s", entity_id, err)
            er.async_get(self.hass).async_remove(entity_id)
        self._entities.pop(scene_id, None)
        self.ids = [i for i in self.ids if i != scene_id]

    async def async_publish(self, scene_id: str, publish: bool) -> str | None:
        """Publishes or unpublishes a saved live scene; the entity id of a published one."""
        if publish:
            if scene_id not in self.library.scenes:
                raise ValueError(f"There is no saved live scene {scene_id!r}.")
            if scene_id not in self.ids:
                self.ids.append(scene_id)
                self._save()
            await self.async_changed()
            return self.entity_id(scene_id)
        if scene_id in self.ids:
            await self._async_drop(scene_id)
            self._save()
        return None


PUBLISHED_KEY = f"{DOMAIN}_published"


def _published(hass: HomeAssistant) -> Published | None:
    return hass.data.get(PUBLISHED_KEY)


async def async_setup(hass: HomeAssistant, entry: ConfigEntry) -> Published:
    """The published scenes of this entry: read from their file, and following the saved scenes from now on."""
    keeper = Published(hass, entry.runtime_data.library, entry.entry_id)
    await keeper.async_load()
    hass.data[PUBLISHED_KEY] = keeper

    @callback
    def library_changed() -> None:
        hass.async_create_task(keeper.async_changed(), f"{DOMAIN} published scenes")

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_LIBRARY_CHANGED, library_changed))

    @callback
    def forget() -> None:
        hass.data.pop(PUBLISHED_KEY, None)

    entry.async_on_unload(forget)
    return keeper


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/published"})
@websocket_api.require_admin
@websocket_api.async_response
async def published(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    keeper = _published(hass)
    if keeper is None:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    connection.send_result(msg["id"], {"scenes": keeper.entity_ids()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/publish", vol.Required("scene_id"): str, vol.Required("publish"): bool})
@websocket_api.require_admin
@websocket_api.async_response
async def publish(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    keeper = _published(hass)
    if keeper is None:
        connection.send_error(msg["id"], "not_found", "Home Control is not set up")
        return
    try:
        entity_id = await keeper.async_publish(msg["scene_id"], msg["publish"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], {"entity_id": entity_id})


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, published)
    websocket_api.async_register_command(hass, publish)
