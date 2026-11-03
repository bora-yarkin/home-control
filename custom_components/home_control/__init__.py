# SPDX-License-Identifier: GPL-3.0-or-later
"""Home Control: a dashboard panel for Home Assistant that shows and controls the home.

The integration only serves the dashboard's files and registers its panel; the dashboard itself runs in the browser and
talks to Home Assistant through the connection Home Assistant gives every panel. Its settings and layouts are kept by
Home Assistant for each user, not by this integration.
"""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    CONF_ADMIN_ONLY,
    CONF_ICON,
    CONF_TITLE,
    CONF_URL_PATH,
    DEFAULT_ICON,
    DEFAULT_TITLE,
    DEFAULT_URL_PATH,
    DOMAIN,
    PANEL_ELEMENT,
    URL_BASE,
)
from .images import URL_IMAGES, RemoteImageDeleteView, RemoteImageUploadView

FRONTEND = Path(__file__).parent / "frontend"
STATIC_REGISTERED = f"{DOMAIN}_static_registered"


def _dashboard_version() -> int:
    """The number the dashboard's files are requested with (``?v=``); raised whenever a file of the dashboard changes."""
    return int(json.loads((FRONTEND / "version.json").read_text(encoding="utf-8"))["version"])


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not hass.data.get(STATIC_REGISTERED):
        # Registering twice (after a reload) is an error, and the folder does not change while Home Assistant runs.
        folder = Path(hass.config.path("home_control_remotes"))
        await hass.async_add_executor_job(lambda: folder.mkdir(parents=True, exist_ok=True))
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(URL_BASE, str(FRONTEND), cache_headers=False),
                StaticPathConfig(URL_IMAGES, str(folder), cache_headers=False),
            ]
        )
        hass.http.register_view(RemoteImageUploadView(folder))
        hass.http.register_view(RemoteImageDeleteView(folder))
        hass.data[STATIC_REGISTERED] = True
    version = await hass.async_add_executor_job(_dashboard_version)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=entry.options.get(CONF_URL_PATH, DEFAULT_URL_PATH),
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=entry.options.get(CONF_TITLE, DEFAULT_TITLE),
        sidebar_icon=entry.options.get(CONF_ICON, DEFAULT_ICON),
        module_url=f"{URL_BASE}/dashboard-panel.js?v={version}",
        embed_iframe=True,
        require_admin=entry.options.get(CONF_ADMIN_ONLY, False),
        handle_safe_area=True,
        config={},
    )
    entry.async_on_unload(entry.add_update_listener(_reload))
    return True


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, entry.options.get(CONF_URL_PATH, DEFAULT_URL_PATH))
    return True
