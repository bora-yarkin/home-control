# SPDX-License-Identifier: GPL-3.0-or-later
"""The integration serves the dashboard's files and registers its panel."""

import json
from pathlib import Path

from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import ConfigEntryState
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.home_control.const import CONF_ADMIN_ONLY, CONF_TITLE, CONF_URL_PATH, DOMAIN

FRONTEND = Path(__file__).parent.parent / "custom_components" / "home_control" / "frontend"


async def _setup(hass, **options):
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options=options)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_the_panel_is_registered_with_the_dashboards_own_version(hass):
    await _setup(hass)
    panel = hass.data[DATA_PANELS]["dashboard"]
    version = json.loads((FRONTEND / "version.json").read_text())["version"]
    assert panel.config["_panel_custom"]["name"] == "dashboard-panel"
    assert panel.config["_panel_custom"]["module_url"] == f"/home_control_static/dashboard-panel.js?v={version}"
    assert panel.sidebar_title == "Dashboard" and panel.require_admin is False


async def test_the_options_change_the_address_title_and_who_may_open_it(hass):
    entry = await _setup(hass, **{CONF_URL_PATH: "house", CONF_TITLE: "House", CONF_ADMIN_ONLY: True})
    panel = hass.data[DATA_PANELS]["house"]
    assert panel.sidebar_title == "House" and panel.require_admin is True
    assert "dashboard" not in hass.data[DATA_PANELS]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert "house" not in hass.data[DATA_PANELS]


async def test_the_files_are_served_and_a_reload_does_not_register_them_twice(hass, hass_client):
    entry = await _setup(hass)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    client = await hass_client()
    for path in ("dashboard-panel.js", "version.json", "app/main.js"):
        response = await client.get(f"/home_control_static/{path}")
        assert response.status == 200, path
    assert (await client.get("/home_control_static/nothing.js")).status == 404


def test_every_file_the_application_loads_exists():
    source = (FRONTEND / "dashboard-app.js").read_text()
    listed = [name for name in __import__("re").findall(r'"((?:app/)?[a-z0-9_-]+\.js)"', source)]
    assert listed and all((FRONTEND / name).exists() for name in listed)
