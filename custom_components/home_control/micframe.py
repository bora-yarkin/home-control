# SPDX-License-Identifier: GPL-3.0-or-later
"""The page that records a dashboard's microphone when the dashboard itself is on plain http (``mic_frame.html``).

A browser gives no microphone to an http page, but a frame of Home Assistant's https address may use it, and the dashboard embeds
this page there. Home Assistant adds ``X-Frame-Options: SAMEORIGIN`` to every response it serves, which would keep any http page
from embedding it. The page is therefore written by the view itself: a response whose headers are already sent when Home
Assistant's header middleware runs keeps the headers the view gave it. The page holds no secret and no state; it records only
when the page that framed it asks and the browser's own prompt is allowed, and it hands the audio only to a dashboard on this host,
a ``.local`` name or a private network address (the check is in the page). The headers below keep it to that purpose.
"""

from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

from aiohttp import web
from homeassistant.components.http import KEY_HASS, HomeAssistantView

URL_MIC_FRAME = "/home_control_mic_frame"
_PAGE = Path(__file__).parent / "mic_frame.html"


def load_page() -> tuple[bytes, str]:
    """The page and the Content-Security-Policy that lets only its own script run."""
    page = _PAGE.read_bytes()
    script = re.search(rb"<script>(.*)</script>", page, re.DOTALL).group(1)
    digest = base64.b64encode(hashlib.sha256(script).digest()).decode()
    policy = f"default-src 'none'; script-src 'sha256-{digest}'; frame-ancestors http: https:; base-uri 'none'; form-action 'none'"
    return page, policy


class MicFrameView(HomeAssistantView):
    url = URL_MIC_FRAME
    name = "home_control:mic_frame"
    requires_auth = False

    async def get(self, request: web.Request) -> web.StreamResponse:
        page, policy = await request.app[KEY_HASS].async_add_executor_job(load_page)
        response = web.StreamResponse(
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Security-Policy": policy,
                "Permissions-Policy": "microphone=(self)",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
            }
        )
        response.content_length = len(page)
        await response.prepare(request)
        await response.write(page)
        await response.write_eof()
        return response
