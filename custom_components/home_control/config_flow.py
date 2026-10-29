# SPDX-License-Identifier: GPL-3.0-or-later
"""Setup (one question: nothing) and the panel's address, title, icon and who may open it."""

from __future__ import annotations

import re
from typing import Any

import voluptuous as vol
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import BooleanSelector, IconSelector, TextSelector

from .const import (
    CONF_ADMIN_ONLY,
    CONF_ICON,
    CONF_TITLE,
    CONF_URL_PATH,
    DEFAULT_ICON,
    DEFAULT_TITLE,
    DEFAULT_URL_PATH,
    DOMAIN,
)


class HomeControlConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Home Control", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HomeControlOptionsFlow()


ADDRESS = re.compile(r"[a-z0-9-]+")


class HomeControlOptionsFlow(OptionsFlow):
    """The sidebar entry: its address, title and icon, and who may open it. The fields are selectors because the settings screen
    receives the form as JSON, and only selectors (not arbitrary validators) can be written as JSON."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        options = self.config_entry.options
        own = options.get(CONF_URL_PATH, DEFAULT_URL_PATH)
        if user_input is not None:
            path = user_input[CONF_URL_PATH].strip()
            if not ADDRESS.fullmatch(path):
                errors[CONF_URL_PATH] = "invalid_address"
            elif path != own and path in self.hass.data.get(DATA_PANELS, {}):
                errors[CONF_URL_PATH] = "address_in_use"
            if not user_input[CONF_TITLE].strip():
                errors[CONF_TITLE] = "empty_title"
            if not errors:
                return self.async_create_entry(data={**user_input, CONF_URL_PATH: path, CONF_TITLE: user_input[CONF_TITLE].strip()})
        values = user_input or options
        schema = vol.Schema(
            {
                vol.Required(CONF_URL_PATH, default=values.get(CONF_URL_PATH, DEFAULT_URL_PATH)): TextSelector(),
                vol.Required(CONF_TITLE, default=values.get(CONF_TITLE, DEFAULT_TITLE)): TextSelector(),
                vol.Required(CONF_ICON, default=values.get(CONF_ICON, DEFAULT_ICON)): IconSelector(),
                vol.Required(CONF_ADMIN_ONLY, default=values.get(CONF_ADMIN_ONLY, False)): BooleanSelector(),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
