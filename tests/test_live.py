# SPDX-License-Identifier: GPL-3.0-or-later
"""Live scenes and areas run inside Home Control, for any light: saving, playing through ``light.turn_on``, finding a light by its unique id,
the one-time import from Hue Plus, and the plus-integration contract (decision D-13)."""

import asyncio
import json
from pathlib import Path

import pytest
import voluptuous as vol
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.home_control.const import DOMAIN

LIGHTS = [{"entity_id": "light.left", "x": -1, "y": 0, "z": 0}, {"entity_id": "light.right", "x": 1, "y": 0, "z": 0}]
ATTRIBUTES = {"supported_color_modes": ["xy"], "color_mode": "xy", "brightness": 200, "xy_color": [0.4, 0.4], "supported_features": 32}


async def setup_home_control(hass):
    entry = MockConfigEntry(domain=DOMAIN, unique_id=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def call(hass, service, data=None, *, response=False):
    return await hass.services.async_call(DOMAIN, service, data or {}, blocking=True, return_response=response)


async def wait_for(condition, seconds=3.0):
    for _ in range(int(seconds / 0.02)):
        if condition():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("the condition did not hold in time")


@pytest.fixture
async def lights(hass):
    """Two lights of makes the dashboard knows nothing about, and a recorder in place of ``light.turn_on``."""
    await setup_home_control(hass)
    registry = er.async_get(hass)
    registry.async_get_or_create("light", "matter", "bulb-left", suggested_object_id="left")
    registry.async_get_or_create("light", "zigbee", "bulb-right", suggested_object_id="right")
    for entity_id in ("light.left", "light.right"):
        hass.states.async_set(entity_id, "on", ATTRIBUTES)
    return async_mock_service(hass, "light", "turn_on")


async def test_a_scene_plays_on_lights_of_any_make_through_light_turn_on(hass, lights):
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": LIGHTS})
    await call(hass, "scene_start", {"scene_id": "now", "preset": "candle", "area": "room"})
    await wait_for(lambda: {c.data["entity_id"] for c in lights} == {"light.left", "light.right"})
    assert all("xy_color" in c.data and 1 <= c.data["brightness"] <= 255 for c in lights)
    assert hass.states.get("sensor.home_control_live_scenes").state == "1"
    await call(hass, "scene_freeze", {"scene_id": "now"})
    assert hass.states.get("sensor.home_control_live_scenes").attributes["sessions"]["now"]["state"] == "frozen"
    await call(hass, "scene_stop", {"scene_id": "now"})
    assert hass.states.get("sensor.home_control_live_scenes").state == "0"


async def test_a_bad_request_is_explained_and_starts_nothing(hass, lights):
    with pytest.raises(ServiceValidationError, match="lights"):
        await call(hass, "scene_start", {"scene_id": "x", "preset": "candle"})
    assert hass.states.get("sensor.home_control_live_scenes").state == "0" and list(lights) == []


async def test_the_library_is_read_with_the_presets(hass, lights):
    await call(hass, "scene_save", {"id": "s", "name": "S", "preset": "ocean", "lights": LIGHTS})
    library = await call(hass, "get_library", response=True)
    assert [s["id"] for s in library["scenes"]] == ["s"] and len(library["presets"]) >= 12


async def test_the_services_take_everything_the_dashboard_sends_when_it_saves(hass, lights):
    """The dashboard sends the same keys for every save (tests/frontend/liveparts.test.mjs checks that it does): a key a service did not list
    made every save of a scene fail."""
    sent = json.loads((Path(__file__).parent / "live" / "dashboard_payloads.json").read_text())
    area = {"id": "room", "name": "Room", "lights": LIGHTS, "ui": {"room": "living"}}
    scene = {
        "id": "evening",
        "name": "Evening",
        "colour_source": "palette",
        "mode": "segmented",
        "effects": [],
        "looks": {},
        "actions": [],
        "palette": [{"xy": [0.2, 0.4]}],
        "speed": 5,
        "range": 100,
        "brightness": 200,
        "spread": "radial",
        "fps": 24,
        "area": "room",
        "ui": {"room": "living"},
    }
    assert sorted(area) == sent["area_save"] and sorted(scene) == sent["scene_save"]
    await call(hass, "area_save", area)
    await call(hass, "scene_save", scene)
    library = await call(hass, "get_library", response=True)
    assert library["scenes"][0]["fps"] == 24 and library["scenes"][0]["mode"] == "segmented"


async def test_a_screen_can_read_the_library_over_the_websocket(hass, lights, hass_ws_client):
    await call(hass, "scene_save", {"id": "s", "name": "S", "preset": "ocean", "lights": LIGHTS})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "home_control/library"})
    reply = await client.receive_json()
    assert reply["success"] and [s["id"] for s in reply["result"]["scenes"]] == ["s"] and reply["result"]["running"] == {}


async def test_saved_scenes_and_areas_survive_a_restart(hass, hass_storage):
    entry = await setup_home_control(hass)
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": LIGHTS, "ui": {"things": ["tv"]}})
    await call(hass, "scene_save", {"id": "evening", "name": "Evening", "preset": "sunset_glow", "area": "room"})
    await hass.async_stop()
    stored = hass_storage["home_control.live"]["data"]
    assert stored["scenes"]["evening"]["area"] == "room" and stored["areas"]["room"]["ui"] == {"things": ["tv"]}
    assert entry.state is not None


async def test_a_light_changed_by_a_person_leaves_the_scene(hass, lights, hass_admin_user):
    from homeassistant.core import Context

    await call(hass, "scene_start", {"scene_id": "now", "preset": "ocean", "lights": LIGHTS})
    await wait_for(lambda: len(lights) >= 2)
    hass.states.async_set("light.left", "on", {**ATTRIBUTES, "brightness": 10}, context=Context(user_id=hass_admin_user.id))
    await wait_for(lambda: hass.states.get("sensor.home_control_live_scenes").attributes["sessions"]["now"]["lights"] == ["light.right"])


# --- finding a light again by its unique id (D-14) --------------------------------------------------------------------------------


async def test_a_saved_area_light_keeps_the_unique_id_of_its_entity(hass, lights):
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": LIGHTS})
    area = (await call(hass, "get_library", response=True))["areas"][0]
    assert [light["uid"] for light in area["lights"]] == ["bulb-left", "bulb-right"]


async def test_when_a_lights_entity_is_gone_the_light_is_found_by_its_unique_id(hass, lights):
    """A plus integration is removed: its entity is unavailable, and the integration it copied has an entity of the same light."""
    registry = er.async_get(hass)
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": LIGHTS})
    registry.async_get_or_create("light", "hue", "bulb-left", suggested_object_id="left_core")
    hass.states.async_set("light.left_core", "on", ATTRIBUTES)
    hass.states.async_set("light.left", "unavailable")
    await call(hass, "scene_start", {"scene_id": "now", "preset": "candle", "area": "room"})
    await wait_for(lambda: {c.data["entity_id"] for c in lights} == {"light.left_core", "light.right"})


async def test_a_light_whose_entity_works_is_not_replaced(hass, lights):
    registry = er.async_get(hass)
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": LIGHTS})
    registry.async_get_or_create("light", "hue", "bulb-left", suggested_object_id="left_core")
    hass.states.async_set("light.left_core", "on", ATTRIBUTES)
    await call(hass, "scene_start", {"scene_id": "now", "preset": "candle", "area": "room"})
    await wait_for(lambda: {c.data["entity_id"] for c in lights} == {"light.left", "light.right"})


# --- the first start takes over what Hue Plus saved (D-12) -------------------------------------------------------------------------

HUE_PLUS_SAVED = {
    "version": 1,
    "minor_version": 1,
    "key": "hue_plus.scenes.bridge1",
    "data": {
        "areas": {"room": {"id": "room", "name": "Room", "lights": LIGHTS, "ui": {}}},
        "scenes": {"evening": {"id": "evening", "name": "Evening", "preset": "sunset_glow", "area": "room"}},
    },
}


def hue_plus_file(hass, hass_storage, key="hue_plus.scenes.bridge1"):
    """Hue Plus's saved scenes: the file (the importer looks for it in the storage folder) and its content (read through the storage fixture)."""
    folder = Path(hass.config.path(".storage"))
    folder.mkdir(exist_ok=True)
    (folder / key).write_text("{}")
    hass_storage[key] = json.loads(json.dumps(HUE_PLUS_SAVED))


async def test_the_first_start_takes_over_the_scenes_and_areas_hue_plus_saved_and_leaves_its_file_alone(hass, hass_storage):
    hue_plus_file(hass, hass_storage)
    await setup_home_control(hass)
    library = await call(hass, "get_library", response=True)
    assert [a["id"] for a in library["areas"]] == ["room"] and [s["id"] for s in library["scenes"]] == ["evening"]
    assert hass_storage["hue_plus.scenes.bridge1"] == HUE_PLUS_SAVED
    assert hass_storage["home_control.live"]["data"]["scenes"]["evening"]["area"] == "room"


async def test_a_second_start_takes_over_nothing_more(hass, hass_storage):
    hass_storage["home_control.live"] = {"version": 1, "minor_version": 1, "key": "home_control.live", "data": {"scenes": {}, "areas": {}}}
    hue_plus_file(hass, hass_storage)
    await setup_home_control(hass)
    library = await call(hass, "get_library", response=True)
    assert library["areas"] == [] and library["scenes"] == []


# --- the plus-integration contract (D-13) -----------------------------------------------------------------------------------------

from custom_components.home_control.live import providers as providers_module  # noqa: E402

HUE_DECLARATION = {
    "schema": 1,
    "name": "Hue Plus",
    "lights": {"hue_plus": {"group": "hue:plus", "rate": 8.0, "effects": True, "parent": "_zone_[0-9]+$"}, "hue": {"rate": 8.0}},
    "effects": ["candle", "underwater"],
    "play_effect": "play_effect",
}
NATIVE = {**ATTRIBUTES, "supported_color_modes": ["xy", "color_temp"], "effect_list": ["off", "candle", "underwater", "sunrise"]}


def test_a_declaration_is_read():
    provider = providers_module.parse("hue_plus", HUE_DECLARATION)
    assert provider.name == "Hue Plus" and provider.effects == {"candle", "underwater"} and provider.play_effect == "play_effect"
    assert provider.lights["hue_plus"].rate == 8.0 and provider.lights["hue"].group is None and provider.plays_effects()
    assert provider.lights["hue_plus"].effects is True and provider.lights["hue"].effects is False


@pytest.mark.parametrize(
    "bad",
    [
        {"schema": 2},
        {"name": ""},
        {"lights": {}},
        {"lights": {"hue": {"rate": 0}}},
        {"effects": ["Not An Effect"]},
        {"play_effect": "bad name"},
        {"extra": 1},
    ],
)
def test_a_wrong_declaration_is_refused(bad):
    import voluptuous as vol

    with pytest.raises(vol.Invalid):
        providers_module.parse("hue_plus", {**HUE_DECLARATION, **bad})


def test_a_declaration_may_carry_a_catalogue_with_pictures():
    raw = {
        **HUE_DECLARATION,
        "catalogue": {
            "groups": [{"id": "wavy", "label": "Wavy"}],
            "effects": [
                {
                    "id": "underwater",
                    "label": "Underwater",
                    "group": "wavy",
                    "art": "<svg viewBox='0 0 100 100'></svg>",
                    "speed_range": [0.2, 0.5],
                }
            ],
        },
    }
    provider = providers_module.parse("hue_plus", raw)
    assert [g.id for g in provider.groups] == ["wavy"] and provider.catalogue[0].speed_range == (0.2, 0.5)
    assert provider.catalogue[0].art.startswith("<svg") and provider.catalogue_problems == ()


def test_a_wrong_catalogue_is_ignored_and_the_providers_lights_still_count():
    raw = {**HUE_DECLARATION, "catalogue": {"groups": [], "effects": [{"id": "underwater", "speed": 99}]}}
    provider = providers_module.parse("hue_plus", raw)
    assert provider.catalogue == () and provider.groups == () and provider.catalogue_problems
    assert provider.lights["hue_plus"].rate == 8.0 and provider.plays_effects()


async def test_nothing_is_read_from_an_integration_that_declares_nothing(hass):
    entry = await setup_home_control(hass)
    assert entry.runtime_data.providers.declared == {}


@pytest.fixture
async def hue_lights(hass):
    """Hue Plus's lights, with Hue Plus loaded and declared; a recorder for its effect service and for ``light.turn_on``."""
    entry = await setup_home_control(hass)
    providers = entry.runtime_data.providers
    providers.declared["hue_plus"] = providers_module.parse("hue_plus", HUE_DECLARATION)
    hass.config.components.add("hue_plus")
    registry = er.async_get(hass)
    for name in ("left", "right"):
        registry.async_get_or_create("light", "hue_plus", f"hue-{name}", suggested_object_id=name)
        hass.states.async_set(f"light.{name}", "on", NATIVE)
    return providers, async_mock_service(hass, "light", "turn_on"), async_mock_service(hass, "hue_plus", "play_effect")


async def test_a_provider_gives_its_lights_a_rate_and_their_own_effects(hass, hue_lights):
    from custom_components.home_control.live.hass_driver import HassDriver

    info = HassDriver(hass, hue_lights[0]).info("light.left")
    assert info.rate == 8.0 and info.group == "hue:plus" and info.effects == ("candle", "underwater")


async def test_a_light_of_a_platform_that_cannot_play_effects_gets_the_rate_and_no_effects(hass, hue_lights):
    from custom_components.home_control.live.hass_driver import HassDriver

    er.async_get(hass).async_get_or_create("light", "hue", "core-1", suggested_object_id="core")
    hass.states.async_set("light.core", "on", NATIVE)
    info = HassDriver(hass, hue_lights[0]).info("light.core")
    assert info.rate == 8.0 and info.effects == ()


async def test_a_lights_own_effect_is_played_through_its_providers_service(hass, hue_lights):
    _providers, turn_on, play_effect = hue_lights
    looks = {"light.left": {"native": "underwater", "palette": [{"hs": [200, 100]}, {"hs": [280, 100]}]}}
    await call(hass, "scene_start", {"scene_id": "sea", "preset": "ocean", "lights": LIGHTS, "looks": looks})
    await wait_for(lambda: play_effect and turn_on)
    first = play_effect[0].data
    assert first["entity_id"] == "light.left" and first["effect"] == "underwater"
    assert len(first["xy"]) == 2 and 1 <= first["brightness"] <= 255 and 0 <= first["speed"] <= 1
    assert {c.data["entity_id"] for c in turn_on} == {"light.right"}  # the other light is driven normally


async def test_without_its_provider_the_same_scene_plays_the_colours_and_refuses_nothing(hass, hue_lights):
    providers, turn_on, play_effect = hue_lights
    hass.config.components.remove("hue_plus")
    looks = {"light.left": {"native": "underwater"}}
    await call(hass, "scene_start", {"scene_id": "sea", "preset": "ocean", "lights": LIGHTS, "looks": looks})
    await wait_for(lambda: {c.data["entity_id"] for c in turn_on} == {"light.left", "light.right"})
    assert list(play_effect) == [] and all("effect" not in c.data for c in turn_on)
    assert providers.for_platform("hue_plus") is None


# --- a strip's look: the effect runs on the strip, not under its zones --------------------------------------------------------------


def _strip(hass, *, parent_effects=True):
    """A gradient strip of Hue Plus: the light itself (unique id L1) and its three zones, as an area saves them."""
    registry = er.async_get(hass)
    registry.async_get_or_create("light", "hue_plus", "L1", suggested_object_id="strip")
    hass.states.async_set("light.strip", "on", NATIVE if parent_effects else ATTRIBUTES)
    zones = []
    for i in (1, 2, 3):
        registry.async_get_or_create("light", "hue_plus", f"L1_zone_{i}", suggested_object_id=f"strip_zone_{i}")
        hass.states.async_set(f"light.strip_zone_{i}", "on", ATTRIBUTES)
        zones.append({"entity_id": f"light.strip_zone_{i}", "x": 0.5 + i / 20, "y": 0, "z": 0})
    return zones


async def test_a_strip_with_its_own_effect_plays_it_as_one_light_in_the_scenes_colour_and_its_zones_are_left_alone(hass, hue_lights):
    _providers, turn_on, play_effect = hue_lights
    zones = _strip(hass)
    request = {"scene_id": "sea", "preset": "ocean", "lights": [*LIGHTS, *zones], "looks": {"light.strip": {"native": "candle"}}}
    await call(hass, "scene_start", request)
    await wait_for(lambda: play_effect and turn_on)
    assert hass.states.get("sensor.home_control_live_scenes").attributes["sessions"]["sea"]["lights"] == [
        "light.left",
        "light.right",
        "light.strip",
    ]
    assert play_effect[0].data["entity_id"] == "light.strip" and play_effect[0].data["effect"] == "candle"
    assert len(play_effect[0].data["xy"]) == 2
    await asyncio.sleep(0.3)
    assert not {c.data["entity_id"] for c in turn_on} & {f"light.strip_zone_{i}" for i in (1, 2, 3)}


async def test_the_strip_stands_where_its_zones_stood(hass, hue_lights):
    from custom_components.home_control.live.resolve import resolve_request

    providers = hue_lights[0]
    zones = _strip(hass)
    request = {"lights": [*LIGHTS, *zones], "looks": {"light.strip": {"native": "candle"}}}
    out = resolve_request(hass, providers, request)
    strip = next(light for light in out["lights"] if light["entity_id"] == "light.strip")
    assert [light["entity_id"] for light in out["lights"]] == ["light.left", "light.right", "light.strip"]
    assert strip["x"] == pytest.approx(sum(z["x"] for z in zones) / 3) and strip["uid"] == "L1"
    assert list(out["looks"]) == ["light.strip"]


async def test_a_strips_other_looks_go_to_each_of_its_zones_and_its_zones_stay_zones(hass, hue_lights):
    from custom_components.home_control.live.resolve import resolve_request

    zones = _strip(hass)
    request = {"lights": zones, "looks": {"light.strip": {"brightness": 40}, "light.gone": {"brightness": 9}}}
    out = resolve_request(hass, hue_lights[0], request)
    assert [light["entity_id"] for light in out["lights"]] == [z["entity_id"] for z in zones]
    assert out["looks"] == {z["entity_id"]: {"brightness": 40} for z in zones}  # and the look of a light that is not in the scene is gone


async def test_a_zones_own_look_wins_over_the_strips(hass, hue_lights):
    from custom_components.home_control.live.resolve import resolve_request

    zones = _strip(hass)
    request = {"lights": zones, "looks": {"light.strip": {"brightness": 40}, "light.strip_zone_2": {"brightness": 90}}}
    out = resolve_request(hass, hue_lights[0], request)
    assert out["looks"]["light.strip_zone_2"] == {"brightness": 90} and out["looks"]["light.strip_zone_1"] == {"brightness": 40}


async def test_an_effect_the_strip_cannot_play_leaves_its_zones_to_play_the_colours(hass, hue_lights):
    from custom_components.home_control.live.resolve import resolve_request

    providers = hue_lights[0]
    zones = _strip(hass, parent_effects=False)  # the strip does not list the effect
    out = resolve_request(hass, providers, {"lights": zones, "looks": {"light.strip": {"native": "candle"}}})
    assert [light["entity_id"] for light in out["lights"]] == [z["entity_id"] for z in zones]
    hass.states.async_set("light.strip", "on", NATIVE)
    hass.config.components.remove("hue_plus")  # and nothing plays effects once Hue Plus is gone
    out = resolve_request(hass, providers, {"lights": zones, "looks": {"light.strip": {"native": "candle"}}})
    assert [light["entity_id"] for light in out["lights"]] == [z["entity_id"] for z in zones]


# --- a strip is played by all of its zones, as separate lights next to each other (D-19) ---------------------------------------------


SEPARATE = {"service": "set_style", "field": "light", "data": {"style": "segmented"}}


def _five_zones(hass, *, available=(1, 2, 3, 4, 5), saved=(1, 2, 3)):
    """A strip of Hue Plus with five zone lights; the bridge blends two of them in some styles, so those are unavailable. An area saved in
    such a style holds only `saved` of them, at -0.3, 0 and 0.3 along x."""
    registry = er.async_get(hass)
    for i in (1, 2, 3, 4, 5):
        registry.async_get_or_create("light", "hue_plus", f"L1_zone_{i}", suggested_object_id=f"strip_zone_{i}")
        hass.states.async_set(f"light.strip_zone_{i}", "on" if i in available else "unavailable", ATTRIBUTES)
    return [{"entity_id": f"light.strip_zone_{i}", "x": -0.3 + 0.3 * k, "y": 0.1, "z": 0.2} for k, i in enumerate(saved)]


@pytest.fixture
async def separating(hass, hue_lights):
    providers, turn_on, _play_effect = hue_lights
    providers.declared["hue_plus"] = providers_module.parse("hue_plus", {**HUE_DECLARATION, "separate_zones": SEPARATE})
    return providers, turn_on, async_mock_service(hass, "hue_plus", "set_style")


async def test_every_zone_of_a_strip_is_played_in_order_even_when_the_area_saved_only_some(hass, separating):
    _providers, turn_on, set_style = separating
    saved = _five_zones(hass, available=(1, 2, 3, 4, 5))
    await call(hass, "scene_start", {"scene_id": "z", "preset": "ocean", "lights": saved})
    lights = hass.states.get("sensor.home_control_live_scenes").attributes["sessions"]["z"]["lights"]
    assert lights == [f"light.strip_zone_{i}" for i in (1, 2, 3, 4, 5)]
    assert list(set_style) == []  # all five are available: nothing to change
    await wait_for(lambda: {c.data["entity_id"] for c in turn_on} == set(lights))


async def test_the_zones_keep_the_strips_length_and_the_new_ones_stand_evenly_between_the_first_and_the_last(hass, separating):
    from custom_components.home_control.live.resolve import resolve_request, separate_strips

    providers = separating[0]
    saved = _five_zones(hass)
    request, _calls = separate_strips(hass, providers, resolve_request(hass, providers, {"lights": saved}))
    xs = [light["x"] for light in request["lights"]]
    assert xs == pytest.approx([-0.3, -0.15, 0.0, 0.15, 0.3])
    assert {light["y"] for light in request["lights"]} == {0.1} and all(light["alt"] == "L1" for light in request["lights"])


async def test_a_strip_whose_zones_are_blended_is_made_separate_first_and_then_played_as_five(hass, separating):
    _providers, turn_on, set_style = separating
    saved = _five_zones(hass, available=(1, 2, 3))
    await call(hass, "scene_start", {"scene_id": "z", "preset": "ocean", "lights": saved, "wake": True})
    assert [c.data for c in set_style] == [{"light": "light.strip_zone_1", "style": "segmented"}]
    assert len(hass.states.get("sensor.home_control_live_scenes").attributes["sessions"]["z"]["lights"]) == 5
    hass.states.async_set("light.strip_zone_4", "on", ATTRIBUTES)  # the bridge makes the rest available
    hass.states.async_set("light.strip_zone_5", "on", ATTRIBUTES)
    await wait_for(lambda: {"light.strip_zone_4", "light.strip_zone_5"} <= {c.data["entity_id"] for c in turn_on})


async def test_a_strip_of_a_provider_that_says_nothing_is_played_as_it_was_saved(hass, hue_lights):
    from custom_components.home_control.live.resolve import resolve_request, separate_strips

    providers, _turn_on, _play = hue_lights  # its declaration has no separate_zones
    saved = _five_zones(hass, available=(1, 2, 3))
    request, calls = separate_strips(hass, providers, resolve_request(hass, providers, {"lights": saved}))
    assert [light["entity_id"] for light in request["lights"]] == [z["entity_id"] for z in saved] and calls == []


@pytest.mark.parametrize(
    "bad",
    [
        {"service": "Set Style"},
        {"service": "set_style", "field": "Light"},
        {"service": "set_style", "data": {"style": ["a"]}},
        {"service": "set_style", "data": {f"k{i}": 1 for i in range(9)}},
        {"data": {"style": "segmented"}},
        "set_style",
    ],
)
def test_how_to_separate_zones_is_a_service_a_field_and_a_little_data(bad):
    with pytest.raises(vol.Invalid):
        providers_module.parse("hue_plus", {**HUE_DECLARATION, "separate_zones": bad})
    parsed = providers_module.parse("hue_plus", {**HUE_DECLARATION, "separate_zones": SEPARATE}).separate_zones
    assert (parsed.service, parsed.light_field, dict(parsed.data)) == ("set_style", "light", {"style": "segmented"})


# --- a gradient light's zones, and what is left when its plus integration is gone (D-14) ------------------------------------------


async def test_the_zones_of_a_gradient_light_are_played_as_the_one_light_when_their_plus_integration_is_gone(hass, hue_lights):
    providers, turn_on, _play = hue_lights
    registry = er.async_get(hass)
    zones = [{"entity_id": f"light.strip_zone_{i}", "x": i / 10, "y": 0, "z": 0} for i in (1, 2, 3)]
    for light in zones:
        registry.async_get_or_create(
            "light",
            "hue_plus",
            f"L1_{light['entity_id'].removeprefix('light.strip_')}",
            suggested_object_id=light["entity_id"].removeprefix("light."),
        )
        hass.states.async_set(light["entity_id"], "on", ATTRIBUTES)
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": zones})
    saved = (await call(hass, "get_library", response=True))["areas"][0]["lights"]
    assert [(x["uid"], x["alt"]) for x in saved] == [("L1_zone_1", "L1"), ("L1_zone_2", "L1"), ("L1_zone_3", "L1")]

    # Hue Plus is uninstalled: its zones are gone, and the Hue integration's own light of the strip is what is left.
    hass.config.components.remove("hue_plus")
    providers.declared.clear()
    registry.async_get_or_create("light", "hue", "L1", suggested_object_id="strip_core")
    hass.states.async_set("light.strip_core", "on", ATTRIBUTES)
    for light in zones:
        hass.states.async_set(light["entity_id"], "unavailable")
    await call(hass, "scene_start", {"scene_id": "now", "preset": "candle", "area": "room"})
    await wait_for(lambda: {c.data["entity_id"] for c in turn_on} == {"light.strip_core"})
    assert hass.states.get("sensor.home_control_live_scenes").attributes["sessions"]["now"]["lights"] == ["light.strip_core"]


async def test_a_light_that_is_not_a_part_gets_no_parent(hass, hue_lights):
    await call(hass, "area_save", {"id": "room", "name": "Room", "lights": LIGHTS})
    saved = (await call(hass, "get_library", response=True))["areas"][0]["lights"]
    assert all("alt" not in light for light in saved) and [light["uid"] for light in saved] == ["hue-left", "hue-right"]


# --- what was saved without unique ids (everything taken over from Hue Plus) gets them (D-14) -------------------------------------


async def test_areas_saved_without_unique_ids_get_them_when_home_control_starts(hass, hass_storage):
    registry = er.async_get(hass)
    registry.async_get_or_create("light", "matter", "bulb-left", suggested_object_id="left")
    registry.async_get_or_create("light", "zigbee", "bulb-right", suggested_object_id="right")
    hass_storage["home_control.live"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.live",
        "data": {"areas": {"room": {"id": "room", "name": "Room", "lights": LIGHTS, "ui": {}}}, "scenes": {}},
    }
    await setup_home_control(hass)
    area = (await call(hass, "get_library", response=True))["areas"][0]
    assert [light["uid"] for light in area["lights"]] == ["bulb-left", "bulb-right"]
    assert [light["uid"] for light in hass_storage["home_control.live"]["data"]["areas"]["room"]["lights"]] == ["bulb-left", "bulb-right"]


async def test_a_light_that_has_no_entity_yet_is_left_without_one_and_the_area_still_loads(hass, hass_storage):
    hass_storage["home_control.live"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.live",
        "data": {"areas": {"room": {"id": "room", "name": "Room", "lights": LIGHTS, "ui": {}}}, "scenes": {}},
    }
    await setup_home_control(hass)
    area = (await call(hass, "get_library", response=True))["areas"][0]
    assert all("uid" not in light for light in area["lights"])


async def test_a_zone_gets_its_lights_unique_id_at_start_even_before_its_plus_integration_has_loaded(hass, hass_storage):
    """Home Control can start before Hue Plus: what a declaration says about a light's parts does not depend on that."""
    from custom_components.home_control.live import providers as providers_module

    registry = er.async_get(hass)
    zones = [{"entity_id": f"light.strip_zone_{i}", "x": i / 10, "y": 0, "z": 0} for i in (1, 2)]
    for light in zones:
        registry.async_get_or_create(
            "light", "hue_plus", "L1_zone_" + light["entity_id"][-1], suggested_object_id=light["entity_id"].removeprefix("light.")
        )
    hass_storage["home_control.live"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.live",
        "data": {"areas": {"room": {"id": "room", "name": "Room", "lights": zones, "ui": {}}}, "scenes": {}},
    }
    from custom_components.home_control.live.setup import _attach_identities

    entry = await setup_home_control(hass)
    providers = entry.runtime_data.providers
    providers.declared["hue_plus"] = providers_module.parse("hue_plus", HUE_DECLARATION)
    assert "hue_plus" not in hass.config.components  # not loaded (yet)
    assert _attach_identities(hass, providers, entry.runtime_data.library) is True
    lights = entry.runtime_data.library.areas["room"]["lights"]
    assert [(x["uid"], x["alt"]) for x in lights] == [("L1_zone_1", "L1"), ("L1_zone_2", "L1")]
