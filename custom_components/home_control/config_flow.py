# SPDX-License-Identifier: GPL-3.0-or-later
"""Setup (one question: nothing) and the panel's address, title, icon and who may open it."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import config_validation as cv

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


class HomeControlOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        options = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(CONF_URL_PATH, default=options.get(CONF_URL_PATH, DEFAULT_URL_PATH)): vol.All(
                    cv.string, vol.Match(r"^[a-z0-9-]+$")
                ),
                vol.Required(CONF_TITLE, default=options.get(CONF_TITLE, DEFAULT_TITLE)): cv.string,
                vol.Required(CONF_ICON, default=options.get(CONF_ICON, DEFAULT_ICON)): cv.icon,
                vol.Required(CONF_ADMIN_ONLY, default=options.get(CONF_ADMIN_ONLY, False)): cv.boolean,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
