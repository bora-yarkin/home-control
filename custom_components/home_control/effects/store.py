# SPDX-License-Identifier: GPL-3.0-or-later
"""The effects catalogues the dashboard offers: each plus integration's, and the files an administrator imported (decision D-15)."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from ..const import DOMAIN
from ..live.providers import Providers
from .catalogue import Catalogue, Effect, Group, parse

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.effects"
MAX_FILES = 12
MAX_BYTES = 65536


def _effect_json(effect: Effect) -> dict[str, Any]:
    """An effect as the dashboard reads it: only what is set."""
    out = {k: v for k, v in asdict(effect).items() if v not in (None, (), [])}
    out["variants"] = [
        {"id": v.id, "label": v.label, "colour": {"hs": list(v.hs)} if v.hs is not None else {"k": v.kelvin}} for v in effect.variants
    ]
    if not effect.variants:
        del out["variants"]
    if effect.palette:
        out["palette"] = list(effect.palette)
    if effect.speed_range:
        out["speed_range"] = list(effect.speed_range)
    return out


def _source(
    identity: str,
    name: str,
    kind: str,
    lights: dict[str, list[str]],
    groups: tuple[Group, ...],
    effects: tuple[Effect, ...],
    set_effect: str | None = None,
) -> dict[str, Any]:
    return {
        "id": identity,
        "name": name,
        "kind": kind,
        "lights": lights,
        "groups": [{"id": g.id, "label": g.label} for g in groups],
        "effects": [_effect_json(e) for e in effects],
        # The plus integration's service that starts an effect with a colour and a speed (the effects page calls it); a file has none.
        **({"set_effect": set_effect} if set_effect else {}),
    }


def file_id(name: str, raw: Any) -> str:
    """A stable id for an imported file: its name, and a short hash so two files of one name can both be kept."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:24] or "effects"
    digest = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()[:6]
    return f"{slug}_{digest}"


class EffectsStore:
    def __init__(self, hass: HomeAssistant, providers: Providers) -> None:
        self._hass = hass
        self._providers = providers
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.files: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        """The imported files. One that no longer passes the validator (the syntax changed, or the file was edited) is kept in storage
        but not offered, so nothing the owner imported is lost silently."""
        stored = await self._store.async_load()
        files = stored.get("files") if isinstance(stored, dict) else None
        self.files = dict(files) if isinstance(files, dict) else {}

    def _save(self) -> None:
        self._store.async_delay_save(lambda: {"files": self.files}, 1.0)

    def sources(self) -> list[dict[str, Any]]:
        """Every catalogue on offer: those of the plus integrations that are loaded, then the imported files."""
        out: list[dict[str, Any]] = []
        for provider in self._providers.declared.values():
            if provider.domain not in self._hass.config.components or not provider.catalogue:
                continue
            platforms = [name for name, kind in provider.lights.items() if kind.effects]
            out.append(
                _source(
                    provider.domain,
                    provider.name,
                    "provider",
                    {"platforms": platforms},
                    provider.groups,
                    provider.catalogue,
                    provider.set_effect,
                )
            )
        for identity, raw in self.files.items():
            catalogue = parse(raw)
            if catalogue.problems:
                continue
            lights = {
                k: list(v)
                for k, v in (
                    ("entities", catalogue.lights.entities),
                    ("platforms", catalogue.lights.platforms),
                    ("models", catalogue.lights.models),
                )
                if v
            }
            out.append(_source(identity, catalogue.name, "file", lights, catalogue.groups, catalogue.effects))
        return out

    def plugins(self) -> list[dict[str, Any]]:
        """The loaded plus integrations: [{id, name, menu (the script, or "" when there is none), version, replaces}]."""
        return [
            {
                "id": p.domain,
                "name": p.name,
                "menu": p.menu_url or "",
                "version": self._providers.versions.get(p.domain, ""),
                "replaces": list(p.replaces),
            }
            for p in self._providers.declared.values()
            if p.domain in self._hass.config.components
        ]

    def add(self, raw: Any) -> tuple[str | None, Catalogue]:
        """Validates and keeps a file. Returns its id (None when it has problems) and what was read, with the problems."""
        catalogue = parse(raw)
        if catalogue.problems:
            return None, catalogue
        identity = file_id(catalogue.name, raw)
        if identity not in self.files and len(self.files) >= MAX_FILES:
            return None, Catalogue(catalogue.name, catalogue.lights, problems=(f"at most {MAX_FILES} files can be kept: remove one first",))
        self.files[identity] = raw
        self._save()
        return identity, catalogue

    def remove(self, identity: str) -> bool:
        if self.files.pop(identity, None) is None:
            return False
        self._save()
        return True
