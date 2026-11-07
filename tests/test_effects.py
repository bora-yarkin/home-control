# SPDX-License-Identifier: GPL-3.0-or-later
"""Importing an effects file, what is offered, who may change it, and what is kept (decision D-15)."""

import copy
import json

import pytest

from custom_components.home_control.effects.store import MAX_BYTES, MAX_FILES

from .test_live import HUE_DECLARATION, setup_home_control

GOOD = {
    "schema": 1,
    "name": "My Govee strips",
    "lights": {"platforms": ["govee"]},
    "groups": [{"id": "calm", "label": "Calm"}],
    "effects": [{"id": "Aurora", "label": "Aurora", "group": "calm", "palette": ["#86ecff"], "speed_range": [0.2, 0.5]}],
}


async def ask(client, command, **data):
    await client.send_json_auto_id({"type": f"home_control/{command}", **data})
    return await client.receive_json()


@pytest.fixture
async def client(hass, hass_ws_client):
    await setup_home_control(hass)
    return await hass_ws_client(hass)


async def test_a_good_file_is_kept_and_offered(hass, client):
    reply = await ask(client, "effects_import", content=json.dumps(GOOD))
    assert reply["success"] and reply["result"]["ok"] is True and reply["result"]["effects"] == 1
    sources = (await ask(client, "effects"))["result"]["sources"]
    assert len(sources) == 1
    source = sources[0]
    assert (source["name"], source["kind"], source["lights"]) == ("My Govee strips", "file", {"platforms": ["govee"]})
    assert source["groups"] == [{"id": "calm", "label": "Calm"}]
    effect = source["effects"][0]
    assert (
        effect["id"] == "Aurora" and effect["palette"] == ["#86ecff"] and effect["speed_range"] == [0.2, 0.5] and effect["group"] == "calm"
    )


async def test_the_file_may_be_sent_as_an_object_too(hass, client):
    assert (await ask(client, "effects_import", content=GOOD))["result"]["ok"] is True


async def test_a_file_with_mistakes_keeps_nothing_and_lists_every_mistake(hass, client):
    broken = copy.deepcopy(GOOD)
    broken["effects"][0]["speeed"] = 5
    broken["effects"].append({"id": "Two", "brightness": 0, "group": "nope"})
    reply = await ask(client, "effects_import", content=json.dumps(broken))
    assert reply["success"] and reply["result"]["ok"] is False
    problems = reply["result"]["problems"]
    assert any(p.startswith("effects[0].speeed:") for p in problems) and any(p.startswith("effects[1].brightness:") for p in problems)
    assert any(p.startswith("effects[1].group:") for p in problems)
    assert (await ask(client, "effects"))["result"]["sources"] == []


@pytest.mark.parametrize("content", ["not json {", "[1, 2]", '"text"', "x" * (MAX_BYTES + 1)])
async def test_text_that_is_not_a_catalogue_is_refused_with_the_reason(hass, client, content):
    reply = await ask(client, "effects_import", content=content)
    assert reply["success"] and reply["result"]["ok"] is False and reply["result"]["problems"]
    assert (await ask(client, "effects"))["result"]["sources"] == []


async def test_a_file_cannot_carry_a_picture(hass, client):
    with_art = copy.deepcopy(GOOD)
    with_art["effects"][0]["art"] = "<svg onload='alert(1)'></svg>"
    reply = await ask(client, "effects_import", content=with_art)
    assert reply["result"]["ok"] is False and any("plus integration" in p for p in reply["result"]["problems"])


async def test_importing_the_same_file_twice_keeps_one(hass, client):
    await ask(client, "effects_import", content=GOOD)
    await ask(client, "effects_import", content=GOOD)
    assert len((await ask(client, "effects"))["result"]["sources"]) == 1


async def test_only_so_many_files_are_kept(hass, client):
    for i in range(MAX_FILES):
        assert (await ask(client, "effects_import", content={**GOOD, "name": f"File {i}"}))["result"]["ok"] is True
    reply = await ask(client, "effects_import", content={**GOOD, "name": "One too many"})
    assert reply["result"]["ok"] is False and "at most" in reply["result"]["problems"][0]


async def test_a_file_can_be_removed(hass, client):
    file_id = (await ask(client, "effects_import", content=GOOD))["result"]["id"]
    assert (await ask(client, "effects_delete", file_id=file_id))["result"]["ok"] is True
    assert (await ask(client, "effects"))["result"]["sources"] == []
    assert (await ask(client, "effects_delete", file_id=file_id))["success"] is False


async def test_a_person_who_is_not_an_administrator_can_read_but_not_change(hass, hass_ws_client, hass_read_only_access_token):
    await setup_home_control(hass)
    admin = await hass_ws_client(hass)
    file_id = (await ask(admin, "effects_import", content=GOOD))["result"]["id"]
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    assert (await ask(reader, "effects"))["success"] is True
    for reply in (await ask(reader, "effects_import", content=GOOD), await ask(reader, "effects_delete", file_id=file_id)):
        assert reply["success"] is False and reply["error"]["code"] == "unauthorized"
    assert len((await ask(admin, "effects"))["result"]["sources"]) == 1


async def test_what_was_imported_is_kept_across_a_restart(hass, hass_storage, hass_ws_client):
    entry = await setup_home_control(hass)
    client = await hass_ws_client(hass)
    await ask(client, "effects_import", content=GOOD)
    await entry.runtime_data.effects._store.async_save({"files": entry.runtime_data.effects.files})
    assert hass_storage["home_control.effects"]["data"]["files"]
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    reply = await ask(await hass_ws_client(hass), "effects")
    assert [s["name"] for s in reply["result"]["sources"]] == ["My Govee strips"]


async def test_a_stored_file_that_no_longer_passes_is_kept_but_not_offered(hass, hass_storage, hass_ws_client):
    hass_storage["home_control.effects"] = {
        "version": 1,
        "minor_version": 1,
        "key": "home_control.effects",
        "data": {"files": {"old_1": {"schema": 99, "name": "Old"}}},
    }
    entry = await setup_home_control(hass)
    assert (await ask(await hass_ws_client(hass), "effects"))["result"]["sources"] == []
    assert "old_1" in entry.runtime_data.effects.files


async def test_a_plus_integrations_catalogue_is_offered_only_while_it_is_loaded(hass, client):
    from custom_components.home_control.live import providers as providers_module

    entry = hass.config_entries.async_loaded_entries("home_control")[0]
    raw = {
        **HUE_DECLARATION,
        "set_effect": "set_effect",
        "catalogue": {
            "groups": [{"id": "wavy", "label": "Wavy"}],
            "effects": [{"id": "underwater", "label": "Underwater", "group": "wavy"}],
        },
    }
    entry.runtime_data.providers.declared["hue_plus"] = providers_module.parse("hue_plus", raw)
    assert (await ask(client, "effects"))["result"]["sources"] == []
    hass.config.components.add("hue_plus")
    sources = (await ask(client, "effects"))["result"]["sources"]
    assert [(s["id"], s["kind"], s["lights"]) for s in sources] == [("hue_plus", "provider", {"platforms": ["hue_plus"]})]
    assert sources[0]["effects"][0]["id"] == "underwater"
    assert sources[0]["set_effect"] == "set_effect", "the service the effects page calls for a colour or a speed"
    hass.config.components.remove("hue_plus")
    assert (await ask(client, "effects"))["result"]["sources"] == []


@pytest.mark.parametrize(
    "url",
    ["/hue_plus_static/menu.js", "/hue_plus_static/sub/menu-2.js"],
)
def test_a_menu_script_under_the_integrations_own_folder_is_accepted(url):
    from custom_components.home_control.live import providers as providers_module

    assert providers_module.parse("hue_plus", {**HUE_DECLARATION, "menu": {"url": url}}).menu_url == url


@pytest.mark.parametrize(
    "url",
    [
        "/other_static/menu.js",  # another integration's folder
        "/api/webhook/x.js",
        "https://evil.example/menu.js",
        "//evil.example/menu.js",
        "/hue_plus_static/../local/x.js",
        "/hue_plus_static/menu.html",
        "/hue_plus_static/menu.js?x=1",
        "javascript:alert(1)",
        "menu.js",
        "",
    ],
)
def test_a_menu_script_anywhere_else_is_refused(url):
    import voluptuous as vol

    from custom_components.home_control.live import providers as providers_module

    with pytest.raises(vol.Invalid):
        providers_module.parse("hue_plus", {**HUE_DECLARATION, "menu": {"url": url}})


async def test_the_plugins_listed_are_the_loaded_integrations_with_a_menu(hass, client):
    from custom_components.home_control.live import providers as providers_module

    entry = hass.config_entries.async_loaded_entries("home_control")[0]
    entry.runtime_data.providers.declared["hue_plus"] = providers_module.parse(
        "hue_plus", {**HUE_DECLARATION, "menu": {"url": "/hue_plus_static/menu.js"}}
    )
    assert (await ask(client, "plugins"))["result"]["plugins"] == []
    hass.config.components.add("hue_plus")
    assert (await ask(client, "plugins"))["result"]["plugins"] == [
        {"id": "hue_plus", "name": "Hue Plus", "menu": "/hue_plus_static/menu.js"}
    ]
    hass.config.components.remove("hue_plus")
    assert (await ask(client, "plugins"))["result"]["plugins"] == []
