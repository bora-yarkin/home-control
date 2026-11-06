# SPDX-License-Identifier: GPL-3.0-or-later
"""What a scene switches when it starts: devices that are not part of its colours, such as a TV or a light left out of the scene.

The services are on and off only, in a fixed list of domains (docs/threat-model.md): a scene can be started by any user, so it
must not become a way to run other services. The calls carry the starting user's context, so Home Assistant's own permission
checks apply to them as if that user had made them. One failing action never stops the others or the scene.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence

from homeassistant.core import Context, HomeAssistant

from .definitions import Action

_LOGGER = logging.getLogger(__name__)

_COVER = {"on": "open_cover", "off": "close_cover"}


def service_for(action: Action) -> tuple[str, str]:
    domain = action.entity_id.split(".")[0]
    if domain == "cover":
        return domain, _COVER[action.do]
    return domain, f"turn_{action.do}"


async def run_actions(hass: HomeAssistant, actions: Sequence[Action], context: Context | None) -> None:
    async def one(action: Action) -> None:
        domain, service = service_for(action)
        try:
            await hass.services.async_call(domain, service, {"entity_id": action.entity_id}, blocking=True, context=context)
        except Exception as err:
            _LOGGER.warning("Scene action %s %s failed: %s", service, action.entity_id, err)

    await asyncio.gather(*(one(a) for a in actions))
