# SPDX-License-Identifier: GPL-3.0-or-later
"""The "plus" integrations that expand what Home Control does for the lights of one brand (decision D-13).

A plus integration (Hue Plus, a future Govee Plus) declares itself with a file ``home_control.json`` in its own folder and provides
the services the declaration names. Nothing is imported from it, so load order does not matter and one that is not installed simply
is not there. Home Control plays every light through ``light.turn_on``; a declared provider adds, for the lights it owns, the
commands per second their bridge takes and a service that plays one of the light's own effects with a colour.

``home_control.json`` (schema 1)::

    {"schema": 1, "name": "Hue Plus",
     "lights": {"hue_plus": {"group": "hue:plus", "rate": 8.0, "effects": true}, "hue": {"rate": 8.0}},
     "effects": ["candle", "underwater"],
     "play_effect": "play_effect",
     "catalogue": {"groups": [...], "effects": [...]}}

``lights`` maps an entity registry platform to what is known of its lights: ``rate`` (commands per second to share), ``group`` (lights of
one group share a rate; the default is the platform and its config entry), ``effects`` (true when the plus integration can play a
light's own effect on the lights of this platform) and ``parent`` (a regular expression: what to cut from the unique id of a light that is
a part of another, like a gradient light's zone, to get the unique id of the light it belongs to; saved with an area so that the part
can be played as the whole light when the plus integration is gone). ``effects`` at the top lists the ids of the effects that can be played with a colour;
``play_effect`` names the service of the plus integration that plays one (entity_id, effect, xy, brightness, speed). ``catalogue`` is what the
dashboard shows of the effects (their groups, labels, pictures, defaults and colour variants) in the syntax of ``docs/effects-file.md``; a
catalogue with a problem is ignored and logged, and the provider's lights and rates still count.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.loader import async_get_custom_components

from ..effects.catalogue import Effect, Group, parse_effects

_LOGGER = logging.getLogger(__name__)

DECLARATION = "home_control.json"
SCHEMA_VERSION = 1


def _regex(value: str) -> str:
    try:
        re.compile(value)
    except re.error as err:
        raise vol.Invalid(f"not a regular expression: {err}") from err
    return value


_ID = vol.All(cv.string, vol.Match(r"^[a-z][a-z0-9_]{0,31}$"))
_LIGHTS = vol.Schema(
    {
        vol.Required(cv.string): vol.Schema(
            {
                vol.Optional("group"): vol.All(cv.string, vol.Length(min=1, max=48)),
                vol.Optional("rate"): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=100)),
                vol.Optional("effects", default=False): cv.boolean,
                vol.Optional("parent"): vol.All(cv.string, vol.Length(max=64), _regex),
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
        vol.Optional("catalogue"): dict,
    }
)


@dataclass(frozen=True)
class LightClass:
    """What a provider knows of the lights of one platform."""

    group: str | None
    rate: float | None
    effects: bool  # its lights can play their own effects through the provider
    parent: str | None = None  # cut from a part's unique id to get its light's


@dataclass(frozen=True)
class Provider:
    domain: str
    name: str
    lights: dict[str, LightClass]
    effects: frozenset[str]
    play_effect: str | None
    groups: tuple[Group, ...] = ()
    catalogue: tuple[Effect, ...] = ()
    catalogue_problems: tuple[str, ...] = ()

    def plays_effects(self) -> bool:
        return bool(self.effects) and self.play_effect is not None


def parse(domain: str, raw: Any) -> Provider:
    """A provider from the content of its declaration; raises ``vol.Invalid`` when the declaration is wrong."""
    data = _DECLARATION(raw)
    groups: tuple[Group, ...] = ()
    shown: tuple[Effect, ...] = ()
    problems: tuple[str, ...] = ()
    if "catalogue" in data:
        groups, shown, problems = parse_effects(data["catalogue"], allow_art=True)
        if problems:
            groups, shown = (), ()
    return Provider(
        domain=domain,
        name=data["name"],
        lights={
            platform: LightClass(item.get("group"), item.get("rate"), item["effects"], item.get("parent"))
            for platform, item in data["lights"].items()
        },
        effects=frozenset(data["effects"]),
        play_effect=data.get("play_effect"),
        groups=groups,
        catalogue=shown,
        catalogue_problems=problems,
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
                provider = parse(domain, await self.hass.async_add_executor_job(_read, path))
                for problem in provider.catalogue_problems:
                    _LOGGER.warning("The effects catalogue in %s of %s is ignored: %s", DECLARATION, domain, problem)
                found[domain] = provider
            except (OSError, ValueError, vol.Invalid) as err:
                _LOGGER.warning("%s of %s is not valid and is ignored: %s", DECLARATION, domain, err)
        self.declared = found

    def for_platform(self, platform: str, *, loaded: bool = True) -> tuple[Provider, LightClass] | None:
        """The provider that owns the lights of this entity platform. By default only when its integration is loaded, which playing
        needs; what a declaration says about a light (its parent) is true whether or not the integration has loaded yet."""
        for provider in self.declared.values():
            if (not loaded or provider.domain in self.hass.config.components) and platform in provider.lights:
                return provider, provider.lights[platform]
        return None

    async def async_play_effect(self, entity_id: str, platform: str, data: dict[str, Any]) -> bool:
        """Plays a light's own effect through its provider. False when no provider can (the caller plays the colour without it)."""
        found = self.for_platform(platform)
        if found is None or not found[0].plays_effects() or not found[1].effects:
            return False
        provider = found[0]
        try:
            await self.hass.services.async_call(provider.domain, provider.play_effect, {"entity_id": entity_id, **data}, blocking=True)
        except HomeAssistantError as err:
            _LOGGER.warning("%s could not play %s on %s: %s", provider.name, data.get("effect"), entity_id, err)
        return True
