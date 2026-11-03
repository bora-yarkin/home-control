# SPDX-License-Identifier: GPL-3.0-or-later
"""Pictures of remotes.

An image remote is a picture of a real remote with touch areas over it. An administrator uploads the picture here; it is checked
(a PNG, JPEG or WebP by its first bytes, at most 5 MB) and kept under a name the server makes up, so the name a person sends is
never used as a path. The pictures are served from ``/home_control_remotes`` like the dashboard's own files.
"""

from __future__ import annotations

import re
import secrets
from http import HTTPStatus
from pathlib import Path

from aiohttp import web
from homeassistant.components.http import HomeAssistantView

URL_IMAGES = "/home_control_remotes"
UPLOAD_URL = "/api/home_control/remote_image"
MAX_BYTES = 5 * 1024 * 1024
NAME_RE = re.compile(r"[a-f0-9]{12}\.(png|jpg|webp)")


def _extension(head: bytes) -> str | None:
    """The file extension for what the first bytes say the file is, or None when it is not a picture this accepts."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def _refuse(status: HTTPStatus, message: str) -> web.Response:
    return web.json_response({"message": message}, status=status)


class RemoteImageUploadView(HomeAssistantView):
    """``POST``: one multipart field named ``file``. Answers ``{"url": "/home_control_remotes/<name>"}``."""

    url = UPLOAD_URL
    name = "api:home_control:remote_image"
    requires_auth = True

    def __init__(self, folder: Path) -> None:
        self._folder = folder

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return _refuse(HTTPStatus.FORBIDDEN, "Only an administrator can upload a picture")
        reader = await request.multipart()
        field = await reader.next()
        if field is None or getattr(field, "name", None) != "file":
            return _refuse(HTTPStatus.BAD_REQUEST, "Send the picture as the field 'file'")
        data = bytearray()
        while chunk := await field.read_chunk(64 * 1024):
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                return _refuse(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "The picture is larger than 5 MB")
        extension = _extension(bytes(data[:16]))
        if extension is None:
            return _refuse(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPEG and WebP pictures are accepted")
        name = f"{secrets.token_hex(6)}.{extension}"
        await request.app["hass"].async_add_executor_job(self._write, name, bytes(data))
        return web.json_response({"url": f"{URL_IMAGES}/{name}"})

    def _write(self, name: str, data: bytes) -> None:
        self._folder.mkdir(parents=True, exist_ok=True)
        (self._folder / name).write_bytes(data)


class RemoteImageDeleteView(HomeAssistantView):
    """``DELETE``: removes a picture this integration made (only a name of its own shape, never a path)."""

    url = UPLOAD_URL + "/{name}"
    name = "api:home_control:remote_image_delete"
    requires_auth = True

    def __init__(self, folder: Path) -> None:
        self._folder = folder

    async def delete(self, request: web.Request, name: str) -> web.Response:
        if not request["hass_user"].is_admin:
            return _refuse(HTTPStatus.FORBIDDEN, "Only an administrator can remove a picture")
        if not NAME_RE.fullmatch(name):
            return _refuse(HTTPStatus.BAD_REQUEST, "That is not the name of a picture")
        await request.app["hass"].async_add_executor_job(lambda: (self._folder / name).unlink(missing_ok=True))
        return web.json_response({"removed": name})
