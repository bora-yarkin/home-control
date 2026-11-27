// SPDX-License-Identifier: GPL-3.0-or-later
// Filtering the scenes of a lights master (or a collection) by the room or zone a plugin's scenes are in (app/autoscenes.js): which groups there are, how they are named, and what a master keeps of them.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

const auto = read("autoscenes.js");
const piece = auto.slice(auto.indexOf("function groupSlug("), auto.indexOf("/* The pages of the dashboard that have scenes made for them"));

function world(states, kinds = [{}]) {
  const sandbox = {
    A: (id) => (states[id] || {}).attributes || {},
    H: () => ({ states }),
    _T: (k) => ({ src_hue: "Hue", src_group_room: "Room", src_group_zone: "Zone" }[k] || k),
    PLUGIN_SCENE_KINDS: kinds,
    pluginSceneKind: (id) => (id.startsWith("scene.hp_") ? {} : null),
  };
  vm.createContext(sandbox);
  vm.runInContext(piece, sandbox);
  return sandbox;
}
const scene = (id, group_type, group_name) => [id, { attributes: { group_type, group_name } }];
const states = Object.fromEntries([
  scene("scene.hp_bed_read", "room", "Main bedroom"),
  scene("scene.hp_bed_night", "room", "Main bedroom"),
  scene("scene.hp_zone_all", "zone", "Main bedroom"),
  scene("scene.hp_ward", "zone", "Wardrobe"),
  scene("scene.hp_bath", "room", "Bathroom"),
  scene("scene.hp_nogroup", undefined, undefined),
  scene("scene.hp_oddtype", "home", "Whole house"),
  scene("scene.classic_one", "room", "Bathroom"),
]);

test("a group's token is its type and its name as lower case words, so accents, apostrophes and capitals do not matter", () => {
  const w = world({});
  assert.equal(w.groupSlug("Main bedroom"), "bora-s-bedroom");
  assert.equal(w.groupSlug("  Salle à manger  "), "salle-a-manger");
  assert.equal(w.groupSlug("!!!"), "group", "a name with no letters or digits still has a token");
  assert.ok(w.groupSlug("x".repeat(100)).length <= 60);
});

test("the groups are the rooms and zones the scenes of plugins say they are in, rooms first, each by name, a room and a zone of one name apart", () => {
  const w = world(states);
  const groups = plain(w.sceneGroups());
  assert.deepEqual(groups.map((g) => g.token), ["group:room:bathroom", "group:room:bora-s-bedroom", "group:zone:bora-s-bedroom", "group:zone:wardrobe"]);
  assert.deepEqual(groups.map((g) => g.label), ["Hue · Room · Bathroom", "Hue · Room · Main bedroom", "Hue · Zone · Main bedroom", "Hue · Zone · Wardrobe"]);
  assert.deepEqual(groups[1].ids, ["scene.hp_bed_read", "scene.hp_bed_night"]);
  assert.deepEqual(groups[2].ids, ["scene.hp_zone_all"], "the zone of the same name has its own scenes");
});

test("a scene that is not a plugin's, has no group, or is in a kind of group there is none of, is in no group", () => {
  const w = world(states);
  assert.equal(w.sceneGroupOf("scene.classic_one"), null, "a classic scene");
  assert.equal(w.sceneGroupOf("scene.hp_nogroup"), null);
  assert.equal(w.sceneGroupOf("scene.hp_oddtype"), null);
  assert.deepEqual(plain(w.sceneGroupOf("scene.hp_ward")), { type: "zone", name: "Wardrobe", token: "group:zone:wardrobe" });
  assert.deepEqual(plain(world(states, []).sceneGroups()), [], "no plugin, no groups");
});

test("the scenes of a group are found by its token, and a token that names no group finds none", () => {
  const w = world(states);
  assert.deepEqual(plain(w.sceneGroupIds("group:zone:bora-s-bedroom")), ["scene.hp_zone_all"]);
  assert.deepEqual(plain(w.sceneGroupIds("group:room:bora-s-bedroom")), ["scene.hp_bed_read", "scene.hp_bed_night"]);
  assert.deepEqual(plain(w.sceneGroupIds("group:zone:nope")), []);
});

test("a master and a collection keep the groups they were given, and drop a token that is not a room or a zone of lower case words", () => {
  const model = read("model.js");
  const ctx = vm.createContext({ cleanDev: () => null, cleanTags: (l) => (Array.isArray(l) ? l : []), ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
  vm.runInContext(model.slice(model.indexOf("function cleanMaster("), model.indexOf("/* A section that has a master")), ctx);
  const out = plain(ctx.cleanMaster({ msrc: ["group:zone:wardrobe", "group:room:bathroom", "group:home:x", "group:zone:Bad Name", "group:zone:", "hue:@lights", "group:zone:" + "a".repeat(61)] }, "lights"));
  assert.deepEqual(out.msrc, ["group:zone:wardrobe", "group:room:bathroom", "hue:@lights"]);
  assert.match(model, /group:\(room\|zone\):\[a-z0-9-\]\{1,60\}\)\$\/\),/, "a collection's pages and sources take them too");
});

test("the Tags dropdown offers each group, ticks it by its token, and the master and collections list their scenes", () => {
  assert.match(auto, /o\.push\(\["@" \+ g\.token, g\.label \+ " · " \+ g\.ids\.length\]\)/);
  assert.match(auto, /v\.indexOf\("@group:"\) === 0/);
  assert.match(read("scenetab.js"), /src\.indexOf\("group:"\) === 0[\s\S]*sceneGroupIds\(src\)/);
  assert.match(read("scenes.js"), /x\.indexOf\("group:"\) === 0[\s\S]*sceneGroupIds\(x\)/);
});

/* The two dropdowns of the scene sources, built with stand-ins for the dashboard's own parts, so what they offer and what a tap does can be read. */
function tiles({ rooms: roomTokens = [], tags = [], near = {} } = {}) {
  const sandbox = {
    A: (id) => (states[id] || {}).attributes || {},
    H: () => ({ states }),
    _T: (k) => ({ src_hue: "Hue", src_group_room: "Room", src_group_zone: "Zone", src_pages: "Rooms", src_tags: "Tags", none: "None" }[k] || k),
    PLUGIN_SCENE_KINDS: [{}],
    pluginSceneKind: (id) => (id.startsWith("scene.hp_") ? {} : null),
    STORE: { scenes: [] },
    sceneTags: () => [],
    scenePages: () => [{ token: "page:bora", name: "Bora", count: 1 }],
    sceneRoomHueIds: (t) => near[t] || [],
    mk: () => ({ appendChild() {} }),
    hintRow: () => ({}),
    multiTile: (...a) => (sandbox.__tiles = (sandbox.__tiles || []).concat([a])),
  };
  vm.createContext(sandbox);
  vm.runInContext(piece, sandbox);
  vm.runInContext(auto.slice(auto.indexOf("function sceneSourceTiles("), auto.indexOf("\n}\n", auto.indexOf("function sceneSourceTiles(")) + 3), sandbox);
  let tokens = roomTokens.slice();
  sandbox.sceneSourceTiles({ appendChild() {} }, { get: () => tokens, set: (t) => (tokens = t) }, { inc: () => tags, exc: () => [], set() {} });
  const tagsTile = sandbox.__tiles[1];
  return { offered: () => plain(tagsTile[1]()).map((o) => o[0]), labels: () => plain(tagsTile[1]()).map((o) => o[1]), tap: (v) => tagsTile[3](v), tokens: () => tokens, summary: () => tagsTile[5]() };
}

test("with no room ticked every group is offered, labelled with its kind, name and number of scenes", () => {
  const t = tiles({ near: { "page:bora": ["scene.hp_bed_read"] } });
  assert.deepEqual(t.offered(), ["-", "@hue", "@ha", "@group:room:bathroom", "@group:room:bora-s-bedroom", "@group:zone:bora-s-bedroom", "@group:zone:wardrobe"]);
  assert.ok(t.labels().includes("Hue · Zone · Main bedroom · 1"));
});

test("with a room ticked only the groups that have scenes in it are offered, and a group already ticked stays", () => {
  const near = { "page:bora": ["scene.hp_bed_read", "scene.hp_zone_all", "scene.hp_ward"] };
  assert.deepEqual(tiles({ rooms: ["page:bora"], near }).offered().filter((x) => x.startsWith("@group:")), ["@group:room:bora-s-bedroom", "@group:zone:bora-s-bedroom", "@group:zone:wardrobe"], "not the Bathroom, whose scenes are elsewhere");
  assert.ok(tiles({ rooms: ["page:bora", "group:room:bathroom"], near }).offered().includes("@group:room:bathroom"), "unless it is ticked already");
});

test("ticking a group stops Hue as a whole from taking in everything, so the choice filters; ticking it again takes it off", () => {
  const t = tiles({ rooms: ["hue:@lights"] });
  t.tap("@group:zone:wardrobe");
  assert.deepEqual(t.tokens(), ["group:zone:wardrobe"], "the blanket Hue is gone");
  t.tap("@group:room:bora-s-bedroom");
  assert.deepEqual(t.tokens(), ["group:zone:wardrobe", "group:room:bora-s-bedroom"], "groups add up");
  t.tap("@group:zone:wardrobe");
  assert.deepEqual(t.tokens(), ["group:room:bora-s-bedroom"]);
  const keep = tiles({ rooms: ["page:bora", "hue:bathroom", "hue:@rooms"] });
  keep.tap("@group:zone:wardrobe");
  assert.deepEqual(keep.tokens(), ["page:bora", "hue:bathroom", "group:zone:wardrobe"], "rooms and a Hue area chosen by name are kept; only the blanket choices go");
});

test("the Tags dropdown says which groups are ticked", () => {
  assert.equal(tiles({ rooms: ["group:zone:wardrobe", "group:room:bathroom"] }).summary(), "Hue · Room · Bathroom, Hue · Zone · Wardrobe");
});
