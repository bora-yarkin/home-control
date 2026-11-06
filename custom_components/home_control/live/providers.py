# SPDX-License-Identifier: GPL-3.0-or-later
"""The "plus" integrations that expand what Home Control does for the lights of one brand (decision D-13).

A plus integration (Hue Plus, a future Govee Plus) declares itself with a file ``home_control.json`` in its own folder and provides
the services the declaration names. Nothing is imported from it, so load order does not matter and one that is not installed simply
is not there. Home Control plays every light through ``light.turn_on``; a declared provider adds, for the lights it owns, the
commands per second their bridge takes and a service that plays one of the light's own effects with a colour.

``home_control.json`` (schema 1)::

    {"schema": 1, "name": "Hue Plus",
     "lights": {"hue_plus": {"group": "hue:plus", "rate": 8.0}, "hue": {"rate": 8.0}},
     "effects": ["candle", "underwater"],
     "play_effect": "play_effect"}

``lights`` maps an entity registry platform to what is known of its lights: ``rate`` (commands per second to share) and ``group``
(lights of one group share a rate; the default is the platform and its config entry). ``effects`` lists the ids of the light's own
effects that can be played with a colour; ``play_effect`` names the service of the plus integration that plays one (entity_id, effect,
xy, brightness, speed).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.loader import async_get_custom_components

_LOGGER = logging.getLogger(__name__)

DECLARATION = "home_control.json"
SCHEMA_VERSION = 1

_ID = vol.All(cv.string, vol.Match(r"^[a-z][a-z0-9_]{0,31}$"))
_LIGHTS = vol.Schema(
    {
        vol.Required(cv.string): vol.Schema(
            {
                vol.Optional("group"): vol.All(cv.string, vol.Length(min=1, max=48)),
                vol.Optional("rate"): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=100)),
            }
        )
    }
)
_DECLARATION = vol.Schema(
    {
        vol.Required("schema"): SCHEMA_VERSION,
        vol.Required("name"): vol.All(cv.string, vol.Length(min=1, max=64)),
        vol.Required("lights"): _LIGHTS,
        vol.Optional("effects", default=list): [_ID],
        vol.Optional("play_effect"): vol.All(cv.string, vol.Match(r"^[a-z][a-z0-9_]{0,63}$")),
    }
)


@dataclass(frozen=True)
class LightClass:
    """What a provider knows of the lights of one platform."""

    group: str | None
    rate: float | None


@dataclass(frozen=True)
class Provider:
    domain: str
    name: str
    lights: dict[str, LightClass]
    effects: frozenset[str]
    play_effect: str | None

    def plays_effects(self) -> bool:
        return bool(self.effects) and self.play_effect is not None


def parse(domain: str, raw: Any) -> Provider:
    """A provider from the content of its declaration; raises ``vol.Invalid`` when the declaration is wrong."""
    data = _DECLARATION(raw)
    return Provider(
        domain=domain,
        name=data["name"],
        lights={platform: LightClass(item.get("group"), item.get("rate")) for platform, item in data["lights"].items()},
        effects=frozenset(data["effects"]),
        play_effect=data.get("play_effect"),
    )


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass
class Providers:
    """The declared providers whose integration is loaded. Looked up when a light is read, so one that was removed stops counting."""

    hass: HomeAssistant
    declared: dict[str, Provider] = field(default_factory=dict)

    async def async_scan(self) -> None:
        """Reads every custom integration's declaration. A bad one is logged and left out: it can never stop Home Control."""
        found: dict[str, Provider] = {}
        for domain, integration in (await async_get_custom_components(self.hass)).items():
            path = integration.file_path / DECLARATION
            if not await self.hass.async_add_executor_job(path.is_file):
                continue
            try:
                found[domain] = parse(domain, await self.hass.async_add_executor_job(_read, path))
            except (OSError, ValueError, vol.Invalid) as err:
                _LOGGER.warning("%s of %s is not valid and is ignored: %s", DECLARATION, domain, err)
        self.declared = found

    def for_platform(self, platform: str) -> tuple[Provider, LightClass] | None:
        """The provider that owns the lights of this entity platform, when its integration is loaded."""
        for provider in self.declared.values():
            if provider.domain in self.hass.config.components and platform in provider.lights:
                return provider, provider.lights[platform]
        return None

    async def async_play_effect(self, entity_id: str, platform: str, data: dict[str, Any]) -> bool:
        """Plays a light's own effect through its provider. False when no provider can (the caller plays the colour without it)."""
        found = self.for_platform(platform)
        if found is None or not found[0].plays_effects():
            return False
        provider = found[0]
        try:
            await self.hass.services.async_call(provider.domain, provider.play_effect, {"entity_id": entity_id, **data}, blocking=True)
        except HomeAssistantError as err:
            _LOGGER.warning("%s could not play %s on %s: %s", provider.name, data.get("effect"), entity_id, err)
        return True
