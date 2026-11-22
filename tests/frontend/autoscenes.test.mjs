// SPDX-License-Identifier: GPL-3.0-or-later
// Auto scenes and scene tags (app/autoscenes.js).
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const piece = (file, from, to) => {
  const s = read(file);
  const a = s.indexOf(from);
  return s.slice(a, to ? s.indexOf(to, a) : undefined);
};

function sandbox(extra = {}) {
  const ctx = vm.createContext({ STORE: { scenes: [] }, Math, JSON, Array, Object, ...extra });
  vm.runInContext(piece("model.js", "/* The tags of a scene", "function cleanLayout"), ctx);
  vm.runInContext(piece("store.js", "/* An auto scene: up to ten colours", "function cleanStore"), ctx);
  vm.runInContext(piece("scenes.js", "/* Whether a scene has any of these tags. */", "function scnToggle"), ctx);
  return ctx;
}

test("tags are lower case words, once each, at most twelve, and the search of them ignores case", () => {
  const c = sandbox({ sceneAllowed: () => true, sceneById: () => null });
  assert.deepEqual(plain(c.cleanTags(["Bathroom", " bathroom ", "BED  room", "", 5, "x"])), ["bathroom", "bed room", "x"]);
  assert.equal(c.cleanTags(Array.from({ length: 30 }, (_, i) => "t" + i)).length, 12);
});

test("the tags of the home are the tags the scenes have; a tag no scene has is gone", () => {
  const c = sandbox();
  c.STORE.scenes = [{ id: "a", tags: ["bath", "warm"] }, { id: "b", tags: ["warm"] }];
  assert.deepEqual(plain(c.sceneTags()), ["bath", "warm"]);
  c.STORE.scenes = [{ id: "b", tags: ["warm"] }];
  assert.deepEqual(plain(c.sceneTags()), ["warm"], "its last scene was deleted");
});

test("an auto scene keeps up to ten colours, each a colour or a white with a brightness, and drops what is not one", () => {
  const c = sandbox();
  const out = plain(c.cleanAuto({ colors: [{ h: 10, s: 80, b: 50 }, { k: 2700 }, { h: 999, s: 1 }, { k: 100 }, ...Array.from({ length: 12 }, () => ({ h: 1, s: 1, b: 500 }))] }));
  assert.equal(out.colors.length, 10);
  assert.deepEqual(out.colors[0], { h: 10, s: 80, b: 50 });
  assert.deepEqual(out.colors[1], { k: 2700, b: 100 });
  assert.equal(out.colors[2].b, 100, "brightness is at most 100");
  assert.equal(c.cleanAuto({ colors: [] }), null);
});

test("a scenes section takes in the scenes with a tag it names, and not the tagged ones it leaves out", () => {
  const c = sandbox({ sceneAllowed: () => true });
  const sc = [{ id: "a", tags: ["bath"] }, { id: "b", tags: ["bed"] }, { id: "c", tags: ["bed", "bath"] }, { id: "d" }];
  c.STORE.scenes = sc;
  c.sceneById = (id) => sc.find((x) => x.id === id) || null;
  const ids = (e) => plain(c.secScenes(e)).map((x) => x.id);
  assert.deepEqual(ids({ scn: ["d"], stag: ["bed"] }), ["d", "b", "c"]);
  assert.deepEqual(ids({ scn: ["d"], stag: ["bed"], xtag: ["bath"] }), ["d", "b"], "c is also tagged bath");
  assert.deepEqual(ids({ scn: ["a"], xtag: ["bath"] }), ["a"], "a scene chosen for it is always in");
});

test("playing an auto scene gives every light one colour of it at random, uses every colour when there are lights enough, and lights that cannot show a colour keep to the brightness", () => {
  const calls = [];
  const ctx = vm.createContext({
    Math, JSON, Array, Object,
    lightIndividuals: (ids) => ids,
    V_: () => "on",
    gate: (ids, go) => go(),
    liveStopOn() {},
    lightCaps: (id) => (id === "light.w" ? { white: true } : { color: true, white: true }),
    call: (d, s, data) => calls.push(plain(data)),
    toast() {},
    _T: (k) => k,
  });
  vm.runInContext(piece("autoscenes.js", "function autoScenePlay", "/* ---- the editor ---- */"), ctx);
  const sc = { name: "S", auto: { colors: [{ h: 0, s: 100, b: 40 }, { h: 120, s: 100, b: 60 }, { k: 2700, b: 80 }] } };
  ctx.autoScenePlay(sc, ["light.a", "light.b", "light.c", "light.d", "light.e", "light.w"]);
  const lit = calls.flatMap((c) => c.entity_id);
  assert.deepEqual(lit.sort(), ["light.a", "light.b", "light.c", "light.d", "light.e", "light.w"], "every light is given something");
  const used = new Set(calls.filter((c) => c.hs_color || c.color_temp_kelvin).map((c) => JSON.stringify(c.hs_color || c.color_temp_kelvin)));
  assert.ok(used.size >= 2);
  assert.ok(calls.every((c) => typeof c.brightness_pct === "number"));
  assert.ok(!calls.some((c) => c.entity_id.includes("light.w") && c.hs_color), "a white-only light is never given a hue");
});

test("auto scenes and tags are wired: the new scene page offers Auto scene, the editors have a Tags row, a master and a scenes section can take in or leave out by tag", () => {
  assert.match(read("scenenew.js"), /autoSceneNew\(scope, target\)/);
  assert.match(read("staticmaker.js"), /sceneTagsRow\(d\)/);
  assert.match(read("livemaker.js"), /sceneTagsRow\(LMK\)/);
  assert.match(read("scenetab.js"), /sceneTagLeaveOutRows\(box, sec, "mxt", redraw\)/);
  assert.match(read("editor.js"), /sceneTagSectionRows\(box, e,/);
  assert.match(read("scenes.js"), /if \(sc\.auto\) return autoScenePlay/);
  assert.ok(JSON.parse(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8")).files.includes("app/autoscenes.js"));
});
