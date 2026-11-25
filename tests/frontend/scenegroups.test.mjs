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
  scene("scene.hp_bed_read", "room", "Bora’s Bedroom"),
  scene("scene.hp_bed_night", "room", "Bora’s Bedroom"),
  scene("scene.hp_zone_all", "zone", "Bora’s Bedroom"),
  scene("scene.hp_ward", "zone", "Wardrobe"),
  scene("scene.hp_bath", "room", "Bathroom"),
  scene("scene.hp_nogroup", undefined, undefined),
  scene("scene.hp_oddtype", "home", "Whole house"),
  scene("scene.classic_one", "room", "Bathroom"),
]);

test("a group's token is its type and its name as lower case words, so accents, apostrophes and capitals do not matter", () => {
  const w = world({});
  assert.equal(w.groupSlug("Bora’s Bedroom"), "bora-s-bedroom");
  assert.equal(w.groupSlug("  Salle à manger  "), "salle-a-manger");
  assert.equal(w.groupSlug("!!!"), "group", "a name with no letters or digits still has a token");
  assert.ok(w.groupSlug("x".repeat(100)).length <= 60);
});

test("the groups are the rooms and zones the scenes of plugins say they are in, rooms first, each by name, a room and a zone of one name apart", () => {
  const w = world(states);
  const groups = plain(w.sceneGroups());
  assert.deepEqual(groups.map((g) => g.token), ["group:room:bathroom", "group:room:bora-s-bedroom", "group:zone:bora-s-bedroom", "group:zone:wardrobe"]);
  assert.deepEqual(groups.map((g) => g.label), ["Hue · Room · Bathroom", "Hue · Room · Bora’s Bedroom", "Hue · Zone · Bora’s Bedroom", "Hue · Zone · Wardrobe"]);
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
