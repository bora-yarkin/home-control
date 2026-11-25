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
    assert (
        homekit.is_exposed(entry, "scene.evening")
        and not homekit.is_exposed(entry, "switch.kettle")
        and not homekit.is_exposed(entry, "light.lamp")
    )
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


@pytest.mark.parametrize("entity_id", ["camera.door", "person.bob", "automation.night", "scene.missing"])
async def test_only_what_homekit_has_an_accessory_for_and_that_exists_can_be_put_on_the_list(hass, entity_id):
    entry = bridge(hass)
    make_exist(hass, "camera.door", "person.bob", "automation.night")
    before = dict(entry.options)
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, None, entity_id, True)
    assert dict(entry.options) == before


async def test_an_entity_that_no_longer_exists_can_still_be_taken_off_the_list(hass):
    entry = bridge(
        hass, {"include_domains": [], "include_entities": ["fan.renamed_away", "fan.kept"], "exclude_domains": [], "exclude_entities": []}
    )
    make_exist(hass, "fan.kept")
    assert homekit.set_exposed(hass, None, "fan.renamed_away", False) is True
    assert lists(entry)["include_entities"] == ["fan.kept"]
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, None, "fan.renamed_away", True)
    with pytest.raises(homekit.HomeKitError):
        homekit.set_exposed(hass, None, "camera.gone", False)


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


# --- the bridge itself: what a device is shown as, TVs, and making the bridge -----------------------------------------------------


async def test_an_air_conditioner_is_shown_as_a_heater_cooler_and_a_purifier_as_an_air_purifier(hass):
    entry = bridge(hass)
    make_exist(hass, "climate.ac", "fan.purifier", "fan.desk")
    assert homekit.set_exposed(hass, None, "climate.ac", True, "heater_cooler")
    assert homekit.set_exposed(hass, None, "fan.purifier", True, "air_purifier")
    assert homekit.set_exposed(hass, None, "fan.desk", True, "fan")
    assert entry.options["entity_config"] == {
        "climate.ac": {"type": "heater_cooler"},
        "fan.purifier": {"type": "air_purifier"},
        "fan.desk": {"type": "fan"},
    }
    assert {"climate.ac", "fan.purifier", "fan.desk"} <= set(lists(entry)["include_entities"])
    described = homekit.describe(hass, ["climate.ac", "fan.purifier", "light.none"])["bridges"][0]
    assert described["types"] == {"climate.ac": "heater_cooler", "fan.purifier": "air_purifier"}
    assert homekit.set_exposed(hass, None, "climate.ac", False)
    assert "climate.ac" not in entry.options["entity_config"] and "climate.ac" not in lists(entry)["include_entities"]


async def test_the_accessory_type_must_be_one_the_entity_can_be(hass):
    entry = bridge(hass)
    make_exist(hass, "climate.ac", "light.lamp")
    for entity_id, kind in (("climate.ac", "air_purifier"), ("light.lamp", "heater_cooler"), ("climate.ac", "anything")):
        with pytest.raises(homekit.HomeKitError):
            homekit.set_exposed(hass, None, entity_id, True, kind)
    assert "entity_config" not in entry.options and "climate.ac" not in lists(entry)["include_entities"]


async def test_other_settings_of_an_entity_survive_its_type_being_set_and_taken_away(hass):
    entry = bridge(hass)
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "entity_config": {"fan.purifier": {"linked_pm25_sensor": "sensor.pm25"}}}
    )
    make_exist(hass, "fan.purifier")
    homekit.set_exposed(hass, None, "fan.purifier", True, "air_purifier")
    assert entry.options["entity_config"]["fan.purifier"] == {"linked_pm25_sensor": "sensor.pm25", "type": "air_purifier"}
    homekit.set_exposed(hass, None, "fan.purifier", False)
    assert entry.options["entity_config"] == {"fan.purifier": {"linked_pm25_sensor": "sensor.pm25"}}


async def test_a_tv_or_a_lock_lets_the_bridge_carry_accessories_home_assistant_would_pair_alone(hass):
    entry = bridge(hass)
    hass.config_entries.async_update_entry(entry, data={**entry.data, "exclude_accessory_mode": True})
    hass.states.async_set("media_player.tv", "on", {"device_class": "tv"})
    hass.states.async_set("media_player.speaker", "on", {"device_class": "speaker"})
    hass.states.async_set("light.lamp", "on")
    homekit.set_exposed(hass, None, "light.lamp", True)
    homekit.set_exposed(hass, None, "media_player.speaker", True)
    assert entry.data["exclude_accessory_mode"] is True
    homekit.set_exposed(hass, None, "media_player.tv", True)
    assert entry.data["exclude_accessory_mode"] is False and entry.data["port"] == 21064


async def test_the_websocket_adds_a_device_with_its_type(hass, hass_ws_client):
    entry = bridge(hass)
    await setup_home_control(hass)
    make_exist(hass, "climate.ac")
    reply = await ask(
        hass, hass_ws_client, type="home_control/homekit_expose", entity_id="climate.ac", expose=True, accessory_type="heater_cooler"
    )
    assert reply["success"] and entry.options["entity_config"]["climate.ac"] == {"type": "heater_cooler"}
    wrong = await ask(
        hass, hass_ws_client, type="home_control/homekit_expose", entity_id="climate.ac", expose=True, accessory_type="air_purifier"
    )
    assert not wrong["success"] and wrong["error"]["code"] == "not_supported"


class FakeRuntime:
    """The parts of a running bridge the pairing is read from."""

    def __init__(self, paired):
        state = type("State", (), {"paired": paired, "pincode": b"031-45-154"})()
        self.homekit = type("HomeKit", (), {"driver": type("Driver", (), {"state": state})()})()
        self.pairing_qr_secret = "s3cret"


async def test_a_bridge_that_is_not_paired_shows_its_code_and_picture_and_one_that_is_does_not(hass):
    entry = bridge(hass)
    assert homekit.pairing(entry) == {"running": False, "paired": False, "pin": None, "qr": None}
    entry.runtime_data = FakeRuntime(paired=False)
    assert homekit.pairing(entry) == {
        "running": True,
        "paired": False,
        "pin": "031-45-154",
        "qr": f"/api/homekit/pairingqr?{entry.entry_id}-s3cret",
    }
    entry.runtime_data = FakeRuntime(paired=True)
    assert homekit.pairing(entry) == {"running": True, "paired": True, "pin": None, "qr": None}


class FakeFlows:
    """Home Assistant's own setup form for the bridge, as far as the dashboard goes through it: choose domains, pairing, done."""

    def __init__(self, hass, entry):
        self.hass, self.entry, self.steps = hass, entry, []

    async def async_init(self, handler, *, context):
        self.steps.append(("init", handler, context["source"]))
        return {"flow_id": "f1", "type": "form", "step_id": "user"}

    async def async_configure(self, flow_id, user_input):
        self.steps.append(("configure", user_input))
        if len(self.steps) < 3:
            return {"flow_id": flow_id, "type": "form", "step_id": "pairing"}
        self.entry.add_to_hass(self.hass)
        return {"flow_id": flow_id, "type": "create_entry", "result": self.entry}


async def test_the_bridge_is_made_through_home_assistants_form_and_starts_with_an_empty_list(hass, monkeypatch):
    made = MockConfigEntry(
        domain="homekit",
        title="HASS Bridge:21064",
        data={
            "name": "HASS Bridge",
            "port": 21064,
            "exclude_accessory_mode": True,
            "mode": "bridge",
            "filter": {"include_domains": [], "include_entities": []},
        },
    )
    flows = FakeFlows(hass, made)
    monkeypatch.setattr(hass.config_entries, "flow", flows)
    entry_id = await homekit.async_create_bridge(hass)
    assert entry_id == made.entry_id
    assert flows.steps == [("init", "homekit", "user"), ("configure", {"include_domains": []}), ("configure", {})]
    assert made.options["mode"] == "bridge" and made.options["entity_config"] == {}
    assert made.data == {"name": "HASS Bridge", "port": 21064, "exclude_accessory_mode": False}
    make_exist(hass, "light.lamp", "scene.evening")
    assert not homekit.is_exposed(made, "light.lamp") and not homekit.is_exposed(made, "scene.evening"), (
        "a new bridge shows nothing until something is added"
    )
    assert (
        homekit.set_exposed(hass, None, "light.lamp", True)
        and homekit.is_exposed(made, "light.lamp")
        and not homekit.is_exposed(made, "scene.evening")
    )


async def test_there_is_only_one_bridge(hass):
    bridge(hass)
    with pytest.raises(homekit.HomeKitError, match="already"):
        await homekit.async_create_bridge(hass)


async def test_a_bridge_that_could_not_be_set_up_is_explained(hass, monkeypatch):
    class Broken:
        async def async_init(self, handler, *, context):
            raise homekit.HomeAssistantError("no such integration")

    monkeypatch.setattr(hass.config_entries, "flow", Broken())
    with pytest.raises(homekit.HomeKitError, match="could not be made"):
        await homekit.async_create_bridge(hass)
    assert not hass.config_entries.async_entries("homekit")


async def test_only_an_administrator_can_make_the_bridge(hass, hass_ws_client, hass_read_only_access_token):
    await setup_home_control(hass)
    reply = await ask(hass, hass_ws_client, hass_read_only_access_token, type="home_control/homekit_create")
    assert not reply["success"] and reply["error"]["code"] == "unauthorized"
    assert not hass.config_entries.async_entries("homekit")


# --- Info on the Home app's remote is the TV's Home key -----------------------------------------------------------------------------

HOME_CALL = {"domain": "remote", "service": "send_command", "data": {"entity_id": "remote.living_tv", "command": "HOME"}}


async def set_home(hass, hass_ws_client, entity_id="media_player.tv", call=HOME_CALL):
    return await ask(hass, hass_ws_client, type="home_control/tv_home_set", entity_id=entity_id, call=call)


async def test_info_on_the_remote_sends_the_tvs_home_key_and_nothing_else_does(hass, hass_ws_client):
    await setup_home_control(hass)
    sent = async_mock_service(hass, "remote", "send_command")
    reply = await set_home(hass, hass_ws_client)
    assert reply["success"] and reply["result"]["calls"] == {"media_player.tv": HOME_CALL}
    for key_name, entity_id in (("information", "media_player.tv"), ("back", "media_player.tv"), ("information", "media_player.other")):
        hass.bus.async_fire("homekit_tv_remote_key_pressed", {"key_name": key_name, "entity_id": entity_id})
        await hass.async_block_till_done()
    assert [call_.data for call_ in sent] == [{"entity_id": "remote.living_tv", "command": "HOME"}]


async def test_a_webos_tv_gets_its_button(hass, hass_ws_client):
    await setup_home_control(hass)
    sent = async_mock_service(hass, "webostv", "button")
    call = {"domain": "webostv", "service": "button", "data": {"entity_id": "media_player.lg", "button": "HOME"}}
    assert (await set_home(hass, hass_ws_client, "media_player.lg", call))["success"]
    hass.bus.async_fire("homekit_tv_remote_key_pressed", {"key_name": "information", "entity_id": "media_player.lg"})
    await hass.async_block_till_done()
    assert [call_.data for call_ in sent] == [{"entity_id": "media_player.lg", "button": "HOME"}]


async def test_taking_the_home_key_away_stops_it(hass, hass_ws_client):
    await setup_home_control(hass)
    sent = async_mock_service(hass, "remote", "send_command")
    await set_home(hass, hass_ws_client)
    assert (await set_home(hass, hass_ws_client, call=None))["result"]["calls"] == {}
    hass.bus.async_fire("homekit_tv_remote_key_pressed", {"key_name": "information", "entity_id": "media_player.tv"})
    await hass.async_block_till_done()
    assert sent == []


@pytest.mark.parametrize(
    "call",
    [
        {"domain": "light", "service": "turn_off", "data": {"entity_id": "light.lamp"}},
        {"domain": "remote", "service": "send_command", "data": {"entity_id": "light.lamp", "command": "HOME"}},
        {"domain": "remote", "service": "send_command", "data": {"entity_id": "remote.tv", "command": "HOME", "extra": 1}},
        {"domain": "remote", "service": "send_command", "data": {"entity_id": "remote.tv", "command": "x" * 65}},
        {"domain": "remote", "service": "send_command", "data": {"entity_id": "remote.tv", "command": "HOME; rm"}},
        {"domain": "remote", "service": "send_command"},
        "HOME",
    ],
)
async def test_only_a_home_key_can_be_kept(hass, hass_ws_client, call):
    await setup_home_control(hass)
    reply = await set_home(hass, hass_ws_client, call=call)
    assert not reply["success"] and reply["error"]["code"] in ("invalid_format", "unknown_error")
    assert hass.data["home_control_tv_home"].calls == {}


async def test_only_a_tv_has_a_home_key_and_only_an_administrator_sets_it(hass, hass_ws_client, hass_read_only_access_token):
    await setup_home_control(hass)
    reply = await set_home(hass, hass_ws_client, "light.lamp")
    assert not reply["success"] and reply["error"]["code"] == "invalid_format"
    for message in (
        {"type": "home_control/tv_home"},
        {"type": "home_control/tv_home_set", "entity_id": "media_player.tv", "call": HOME_CALL},
    ):
        denied = await ask(hass, hass_ws_client, hass_read_only_access_token, **message)
        assert not denied["success"] and denied["error"]["code"] == "unauthorized"
    assert hass.data["home_control_tv_home"].calls == {}


async def test_the_home_keys_are_kept_across_a_restart_and_a_bad_entry_is_left_out(hass, hass_storage):
    hass_storage["home_control.tv_home"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.tv_home",
        "data": {
            "calls": {
                "media_player.tv": HOME_CALL,
                "media_player.bad": {"domain": "light", "service": "turn_on", "data": {}},
                "light.lamp": HOME_CALL,
            }
        },
    }
    await setup_home_control(hass)
    assert hass.data["home_control_tv_home"].calls == {"media_player.tv": HOME_CALL}
