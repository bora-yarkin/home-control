# SPDX-License-Identifier: GPL-3.0-or-later
"""Uploading the picture of an image remote: who may, what is accepted, and where it goes."""

import re
from pathlib import Path

import aiohttp
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.home_control import images
from custom_components.home_control.const import DOMAIN

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 64


@pytest.fixture
async def setup(hass, tmp_path):
    hass.config.config_dir = str(tmp_path)  # pictures go to a folder of this test only
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


def form(data: bytes, field: str = "file") -> aiohttp.FormData:
    body = aiohttp.FormData()
    body.add_field(field, data, filename="remote.bin", content_type="application/octet-stream")
    return body


@pytest.mark.parametrize(("data", "extension"), [(PNG, "png"), (JPG, "jpg"), (WEBP, "webp")])
async def test_a_picture_is_kept_under_a_name_the_server_makes_and_served(hass, hass_client, setup, data, extension):
    client = await hass_client()
    response = await client.post(images.UPLOAD_URL, data=form(data))
    assert response.status == 200
    url = (await response.json())["url"]
    assert re.fullmatch(rf"/home_control_remotes/[a-f0-9]{{12}}\.{extension}", url)
    assert (hass.config.path("home_control_remotes") + "/" + url.rsplit("/", 1)[1]).startswith(hass.config.config_dir)
    served = await client.get(url)
    assert served.status == 200 and await served.read() == data


async def test_what_is_not_a_picture_is_refused_and_stores_nothing(hass, hass_client, setup):
    client = await hass_client()
    response = await client.post(images.UPLOAD_URL, data=form(b"<svg onload=alert(1)>"))
    assert response.status == 415
    assert list(Path(hass.config.path("home_control_remotes")).iterdir()) == []
    assert (await client.post(images.UPLOAD_URL, data=form(PNG, field="other"))).status == 400


async def test_a_picture_over_the_limit_is_refused(hass, hass_client, setup, monkeypatch):
    monkeypatch.setattr(images, "MAX_BYTES", 100)
    client = await hass_client()
    response = await client.post(images.UPLOAD_URL, data=form(PNG + b"\x00" * 200))
    assert response.status == 413


async def test_only_an_administrator_uploads_or_removes(hass, hass_client, hass_read_only_access_token, setup):
    reader = await hass_client(hass_read_only_access_token)
    assert (await reader.post(images.UPLOAD_URL, data=form(PNG))).status == 403
    assert (await reader.delete(images.UPLOAD_URL + "/0123456789ab.png")).status == 403


async def test_a_picture_is_removed_by_its_own_name_only(hass, hass_client, setup):
    client = await hass_client()
    url = (await (await client.post(images.UPLOAD_URL, data=form(PNG))).json())["url"]
    name = url.rsplit("/", 1)[1]
    assert (await client.delete(f"{images.UPLOAD_URL}/..%2Fconfiguration.yaml")).status in (400, 404)
    assert (await client.delete(f"{images.UPLOAD_URL}/notmine.png")).status == 400
    assert (await client.delete(f"{images.UPLOAD_URL}/{name}")).status == 200
    assert (await client.get(url)).status == 404


async def test_without_signing_in_nothing_is_accepted(hass, hass_client_no_auth, setup):
    client = await hass_client_no_auth()
    assert (await client.post(images.UPLOAD_URL, data=form(PNG))).status == 401
