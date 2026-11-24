# SPDX-License-Identifier: GPL-3.0-or-later
"""Sharing scenes with Siri, HomeKit and the Shortcuts app (decision D-23): the HomeKit Bridge's list, and live scenes published as ``scene`` entities."""

import pytest
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.home_control import homekit
from custom_components.home_control.const import DOMAIN
from custom_components.home_control.published import PUBLISHED_KEY

from .test_live import LIGHTS, call, setup_home_control


def bridge(hass, filter_=None, *, mode="bridge", source="user"):
    """A HomeKit entry with the options its own form writes (it is not set up: only its options are read and written)."""
    entry = MockConfigEntry(
        domain="homekit",
        title="HASS Bridge",
        source=source,
        data={"name": "HASS Bridge", "port": 21064},
        options={
            "mode": mode,
            "filter": filter_
            if filter_ is not None
            else {"include_domains": [], "include_entities": ["switch.kettle"], "exclude_domains": [], "exclude_entities": []},
        },
    )
    entry.add_to_hass(hass)
    return entry


def lists(entry):
    return entry.options["filter"]


async def ask(hass, hass_ws_client, token=None, **message):
    client = await hass_ws_client(hass, token) if token else await hass_ws_client(hass)
    await client.send_json_auto_id(message)
    return await client.receive_json()


def scene_entities(hass):
    return [e for e in er.async_get(hass).entities.values() if e.domain == "scene"]


def make_exist(hass, *entity_ids):
    for entity_id in entity_ids:
        hass.states.async_set(entity_id, "off")


# --- the HomeKit Bridge's list ---------------------------------------------------------------------------------------------------


async def test_a_scene_is_put_on_the_list_and_taken_off_it_without_touching_the_rest(hass):
    entry = bridge(hass)
    make_exist(hass, "scene.evening", "switch.kettle")
    assert homekit.set_exposed(hass, None, "scene.evening", True) is True
    assert lists(entry)["include_entities"] == ["switch.kettle", "scene.evening"]
    assert entry.options["mode"] == "bridge" and entry.data["port"] == 21064
    assert homekit.set_exposed(hass, None, "scene.evening", False) is True
    assert lists(entry)["include_entities"] == ["switch.kettle"]


async def test_asking_for_what_already_is_changes_nothing(hass):
    entry = bridge(hass)
    make_exist(hass, "scene.evening", "switch.kettle")
    before = dict(entry.options)
    assert homekit.set_exposed(hass, None, "switch.kettle", True) is False
    assert homekit.set_exposed(hass, None, "scene.evening", False) is False
    assert dict(entry.options) == before


async def test_taking_the_last_entity_off_leaves_a_list_that_shows_nothing_not_one_that_shows_everything(hass):
    entry = bridge(hass)
    make_exist(hass, "scene.evening", "switch.kettle", "light.lamp")
    assert homekit.set_exposed(hass, None, "switch.kettle", False) is True
    assert not any(homekit.is_exposed(entry, e) for e in ("switch.kettle", "scene.evening", "light.lamp"))
    assert lists(entry)["include_entities"] == [] and lists(entry)["exclude_entity_globs"] == ["*"]
    assert homekit.set_exposed(hass, None, "scene.evening", True) is True
    assert homekit.is_exposed(entry, "scene.evening") and not homekit.is_exposed(entry, "switch.kettle") and not homekit.is_exposed(entry, "light.lamp")
    assert lists(entry)["include_entities"] == ["scene.evening"]


async def test_a_scene_of_an_included_domain_is_taken_off_by_excluding_it(hass):
    entry = bridge(hass, {"include_domains": ["scene"], "include_entities": [], "exclude_domains": [], "exclude_entities": []})
    make_exist(hass, "scene.evening")
    assert homekit.is_exposed(entry, "scene.evening")
    assert homekit.set_exposed(hass, None, "scene.evening", False) is True
    assert lists(entry)["exclude_entities"] == ["scene.evening"] and lists(entry)["include_domains"] == ["scene"]
    assert not homekit.is_exposed(entry, "scene.evening")
    assert homekit.set_exposed(hass, None, "scene.evening", True) is True
    assert lists(entry)["exclude_entities"] == [] and homekit.is_exposed(entry, "scene.evening")


async def test_a_bridge_with_no_list_is_not_turned_into_one(hass):
    entry = bridge(hass, {"include_domains": [], "include_entities": [], "exclude_domains": [], "exclude_entities": []})
    make_exist(hass, "scene.evening")
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, None, "scene.evening", True)
    assert lists(entry)["include_entities"] == []


@pytest.mark.parametrize("entity_id", ["light.lamp", "camera.door", "sensor.temperature", "scene.missing"])
async def test_only_scenes_scripts_and_switches_that_exist_can_be_shared(hass, entity_id):
    entry = bridge(hass)
    make_exist(hass, "light.lamp", "camera.door", "sensor.temperature")
    before = dict(entry.options)
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, None, entity_id, True)
    assert dict(entry.options) == before


async def test_only_a_bridge_that_can_be_changed_is_changed(hass):
    accessory = bridge(hass, mode="accessory")
    make_exist(hass, "scene.evening")
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, None, "scene.evening", True)
    yaml = bridge(hass, source="import")
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, yaml.entry_id, "scene.evening", True)
    assert "scene.evening" not in lists(accessory).get("include_entities", [])


async def test_the_websocket_says_which_entities_are_on_the_list(hass, hass_ws_client):
    entry = bridge(hass)
    await setup_home_control(hass)
    reply = await ask(hass, hass_ws_client, type="home_control/homekit", entity_ids=["switch.kettle", "scene.evening"])
    assert reply["success"]
    (found,) = reply["result"]["bridges"]
    assert found["entry_id"] == entry.entry_id and found["editable"] is True
    assert found["exposed"] == {"switch.kettle": True, "scene.evening": False}


async def test_the_websocket_changes_the_list(hass, hass_ws_client):
    entry = bridge(hass)
    await setup_home_control(hass)
    make_exist(hass, "scene.evening")
    reply = await ask(hass, hass_ws_client, type="home_control/homekit_expose", entity_id="scene.evening", expose=True)
    assert reply["success"] and reply["result"] == {"changed": True}
    assert "scene.evening" in lists(entry)["include_entities"]
    refused = await ask(hass, hass_ws_client, type="home_control/homekit_expose", entity_id="light.lamp", expose=True)
    assert not refused["success"] and refused["error"]["code"] == "not_supported"


async def test_only_an_administrator_can_read_or_change_the_list(hass, hass_ws_client, hass_read_only_access_token):
    entry = bridge(hass)
    await setup_home_control(hass)
    make_exist(hass, "scene.evening")
    before = dict(entry.options)
    for message in (
        {"type": "home_control/homekit", "entity_ids": ["scene.evening"]},
        {"type": "home_control/homekit_expose", "entity_id": "scene.evening", "expose": True},
    ):
        reply = await ask(hass, hass_ws_client, hass_read_only_access_token, **message)
        assert not reply["success"] and reply["error"]["code"] == "unauthorized"
    assert dict(entry.options) == before


# --- live scenes published as entities -------------------------------------------------------------------------------------------


async def save_scene(hass, scene_id="evening", name="Evening"):
    await call(hass, "scene_save", {"id": scene_id, "name": name, "preset": "ocean", "lights": LIGHTS})


async def publish(hass, hass_ws_client, scene_id="evening", on=True):
    reply = await ask(hass, hass_ws_client, type="home_control/publish", scene_id=scene_id, publish=on)
    assert reply["success"], reply
    await hass.async_block_till_done()
    return reply["result"]["entity_id"]


async def test_a_published_scene_is_an_entity_that_starts_it(hass, hass_ws_client):
    await setup_home_control(hass)
    await save_scene(hass)
    entity_id = await publish(hass, hass_ws_client)
    assert entity_id and entity_id.startswith("scene.")
    assert hass.states.get(entity_id).attributes["friendly_name"] == "Evening"
    started = async_mock_service(hass, DOMAIN, "scene_start")
    await hass.services.async_call("scene", "turn_on", {"entity_id": entity_id}, blocking=True)
    assert [call_.data for call_ in started] == [{"scene_id": "evening"}]


async def test_a_scene_that_is_not_saved_cannot_be_published(hass, hass_ws_client):
    await setup_home_control(hass)
    reply = await ask(hass, hass_ws_client, type="home_control/publish", scene_id="nothing", publish=True)
    assert not reply["success"] and reply["error"]["code"] == "not_found"
    assert not scene_entities(hass)


async def test_the_entity_follows_the_name_of_the_scene(hass, hass_ws_client):
    await setup_home_control(hass)
    await save_scene(hass)
    entity_id = await publish(hass, hass_ws_client)
    await save_scene(hass, name="Late evening")
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).attributes["friendly_name"] == "Late evening"


async def test_unpublishing_removes_the_entity_and_its_place_on_the_bridge_list(hass, hass_ws_client):
    entry = bridge(hass)
    await setup_home_control(hass)
    await save_scene(hass)
    entity_id = await publish(hass, hass_ws_client)
    assert homekit.set_exposed(hass, None, entity_id, True)
    assert entity_id in lists(entry)["include_entities"]
    assert await publish(hass, hass_ws_client, on=False) is None
    assert hass.states.get(entity_id) is None and er.async_get(hass).async_get(entity_id) is None
    assert lists(entry)["include_entities"] == ["switch.kettle"]


async def test_deleting_the_scene_unpublishes_it(hass, hass_ws_client):
    entry = bridge(hass)
    await setup_home_control(hass)
    await save_scene(hass)
    entity_id = await publish(hass, hass_ws_client)
    homekit.set_exposed(hass, None, entity_id, True)
    await call(hass, "scene_delete", {"id": "evening"})
    await hass.async_block_till_done()
    assert hass.states.get(entity_id) is None
    assert lists(entry)["include_entities"] == ["switch.kettle"]
    reply = await ask(hass, hass_ws_client, type="home_control/published")
    assert reply["result"] == {"scenes": {}}


def stored_scene(scene_id, name):
    return {"id": scene_id, "name": name, "ui": {}, "preset": "ocean", "lights": [dict(light) for light in LIGHTS]}


async def test_published_scenes_come_back_when_home_assistant_starts(hass, hass_ws_client, hass_storage):
    hass_storage["home_control.live"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.live",
        "data": {"scenes": {"evening": stored_scene("evening", "Evening"), "morning": stored_scene("morning", "Morning")}, "areas": {}},
    }
    hass_storage["home_control.published"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.published",
        "data": {"scenes": ["evening", "morning"]},
    }
    await setup_home_control(hass)
    reply = await ask(hass, hass_ws_client, type="home_control/published")
    assert sorted(reply["result"]["scenes"]) == ["evening", "morning"]
    assert hass.states.get("scene.evening").attributes["friendly_name"] == "Evening"


async def test_a_damaged_published_file_is_read_as_far_as_it_can_be(hass, hass_ws_client, hass_storage):
    hass_storage["home_control.live"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.live",
        "data": {"scenes": {"ok": stored_scene("ok", "Ok")}, "areas": {}},
    }
    hass_storage["home_control.published"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.published",
        "data": {"scenes": ["ok", "ok", 5, "not valid!", None, "fine_2"]},
    }
    await setup_home_control(hass)
    reply = await ask(hass, hass_ws_client, type="home_control/published")
    assert reply["result"]["scenes"].keys() == {"ok"}, "a scene that is no longer saved (fine_2) is dropped, what is not an id is ignored"


async def test_publishing_is_written_to_its_file(hass, hass_storage):
    await setup_home_control(hass)
    await save_scene(hass)
    await hass.data[PUBLISHED_KEY].async_publish("evening", True)
    await hass.async_stop()
    assert hass_storage["home_control.published"]["data"] == {"scenes": ["evening"]}


async def test_only_an_administrator_can_publish(hass, hass_ws_client, hass_read_only_access_token):
    await setup_home_control(hass)
    await save_scene(hass)
    for message in ({"type": "home_control/publish", "scene_id": "evening", "publish": True}, {"type": "home_control/published"}):
        reply = await ask(hass, hass_ws_client, hass_read_only_access_token, **message)
        assert not reply["success"] and reply["error"]["code"] == "unauthorized"
    assert not scene_entities(hass)
