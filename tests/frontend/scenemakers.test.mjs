// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the scene makers: the lights that exist only in the dashboard (vlights.js), what a live scene keeps of the areas it plays in
// (store.js, livemaker.js), a classic scene that starts a live scene (store.js, conditions.js) and the light popup replacing a light's
// acts (staticmaker.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function page(extra = {}) {
  const sandbox = {
    _T: (k) => k,
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    ISADMIN: true,
    STORE: { scenes: [], eareas: [] },
    H: () => ({ entities: {}, states: {} }),
    eaIsBar: () => false,
    eaZonePoints: () => [],
    callRaw() {},
    setTimeout: (fn) => fn(),
    clearTimeout() {},
    window: { HA: {} },
    HA: {},
    VLIGHT: {},
    dom: (id) => id.split(".")[0],
    lightMembers: () => [],
    ...extra,
  };
  vm.createContext(sandbox);
  for (const file of ["store.js", "livescenes.js", "livemaker.js", "vlights.js", "staticmaker.js", "scenenew.js", "scenes.js", "conditions.js", "lighteditor.js"]) vm.runInContext(read(file), sandbox);
  /* What a test replaces wins over the file's own function of that name. */
  Object.assign(sandbox, extra);
  return sandbox;
}

test("colours of a palette come back as they went in, a colour changed in the maker as the new colour", () => {
  const p = page();
  const palette = [{ hs: [10, 90], b: 60 }, { k: 2700 }, { xy: [0.3, 0.3] }];
  p.vcolLoad(palette);
  assert.deepEqual(plain(p.vcolPalette()), palette);
  p.vlightDispatch("turn_on", { entity_id: "light.lm_c1", hs_color: [200, 50], brightness_pct: 100 });
  p.vlightDispatch("turn_on", { entity_id: "light.lm_c3", hs_color: [100, 40] });
  assert.deepEqual(plain(p.vcolPalette()), [{ hs: [200, 50] }, { k: 2700 }, { hs: [100, 40] }]);
});

test("a command for dashboard lights is taken by them and only the rest goes to Home Assistant", () => {
  const p = page();
  p.vcolLoad([{ hs: [0, 100] }, { hs: [240, 100] }]);
  assert.equal(p.vlightDispatch("turn_on", { entity_id: ["light.lm_c1", "light.lm_c2"], brightness_pct: 50 }), null);
  const rest = plain(p.vlightDispatch("turn_on", { entity_id: ["light.lm_c1", "light.real"], hs_color: [30, 30] }));
  assert.deepEqual(rest.entity_id, ["light.real"]);
  assert.deepEqual(plain(p.vlightDispatch("turn_on", { entity_id: "light.real" })), { entity_id: "light.real" });
  // a colour cannot be switched off, and one command to the group changes every colour
  p.vlightDispatch("turn_off", { entity_id: "light.lm_c1" });
  assert.equal(p.VLIGHT["light.lm_c1"].state, "on");
  p.vlightDispatch("turn_on", { entity_id: "light.lm_colors", hs_color: [60, 60] });
  assert.deepEqual(plain(p.vcolPalette().map((c) => c.hs)), [[60, 60], [60, 60]]);
});

test("a scene has at most ten colours to add, and removing one keeps the others in order", () => {
  const p = page();
  p.vcolLoad([{ hs: [0, 100] }, { hs: [120, 100] }, { hs: [240, 100] }]);
  while (p.vcolAdd()) {}
  assert.equal(p.vcolIds().length, 10);
  assert.equal(p.vcolAdd(), null);
  p.vcolLoad([{ hs: [0, 100] }, { hs: [120, 100] }, { hs: [240, 100] }]);
  assert.equal(p.vcolRemove("light.lm_c2"), true);
  assert.deepEqual(plain(p.vcolPalette()), [{ hs: [0, 100] }, { hs: [240, 100] }]);
  assert.deepEqual(plain(p.vcolIds()), ["light.lm_c1", "light.lm_c2"]);
  assert.equal(p.vcolRemove("light.lm_c1") && p.vcolRemove("light.lm_c1"), false); // the last colour stays
});

const live = (extra) => ({ area: "x", palette: [{ hs: [1, 1] }], ...extra });

test("a live scene keeps the areas it plays in, at most six, and the lights it leaves off", () => {
  const p = page();
  const l = p.cleanLive(
    live({
      areas: ["a", "b", "a", "c", "d", "e", "f", "g", "bad id"],
      off: ["light.one", "light.one", "switch.no", "light.two"],
    })
  );
  assert.deepEqual(plain(l.areas), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(plain(l.off), ["light.one", "light.two"]);
  const legacy = p.cleanLive(live({}));
  assert.equal("areas" in legacy, false);
  assert.equal("off" in legacy, false);
});

test("a scene plays in the lights of its areas without the ones it leaves off, under its own area", () => {
  const p = page();
  const a = { id: "a", name: "A", room: "r", lights: [{ id: "light.one", x: 0, y: 0, z: 0 }, { id: "light.two", x: 1, y: 0, z: 0 }] };
  const b = { id: "b", name: "B", room: "r", lights: [{ id: "light.two", x: 0, y: 1, z: 0 }, { id: "light.three", x: 0, y: 0, z: 1 }] };
  p.STORE.eareas = [a, b];
  const sc = { live: { area: "lx-s1", areas: ["a", "b"], off: ["light.one"] } };
  const area = plain(p.liveSceneArea(sc));
  assert.equal(area.id, "lx-s1");
  assert.equal(area.name, "A + B");
  assert.deepEqual(area.lights.map((l) => l.id), ["light.two", "light.three"]);
  assert.equal(p.liveSceneArea({ live: { area: "a" } }).id, "a"); // a scene made before the maker plays in its stored area
  assert.equal(p.liveSceneArea({ live: { area: "gone" } }), null);
});

test("a classic scene can start a live scene, and says nothing about devices it does not hold", () => {
  const p = page();
  const sc = p.cleanScene({
    id: "s",
    name: "Movie",
    room: "r",
    acts: [{ live: "evening" }, { live: "bad id" }, { id: "media_player.tv", on: false }, { live: 5 }],
  });
  assert.deepEqual(plain(sc.acts), [{ live: "evening" }, { id: "media_player.tv", on: false }]);
});

test("the light popup replaces the acts of a light and of the lights it is made of, where they were", () => {
  const members = { "light.group": ["light.left", "light.right"] };
  const p = page({ lightMembers: (id) => members[id] || [] });
  p.SCD = { draft: { acts: [{ id: "switch.tv", on: true }, { id: "light.group", on: true }, { id: "light.other", on: true }] } };
  vm.runInContext("staticSetLightActs('light.group', [{ id: 'light.left', on: true, bri: 40 }, { id: 'light.right', on: false }])", p);
  assert.deepEqual(
    plain(p.SCD.draft.acts).map((a) => a.id),
    ["switch.tv", "light.left", "light.right", "light.other"]
  );
  vm.runInContext("staticSetLightActs('light.new', [{ id: 'light.new', on: true }])", p);
  assert.equal(plain(p.SCD.draft.acts).pop().id, "light.new");
});

test("a save that did not happen keeps the editor guarded", () => {
  const asked = [];
  const p = page({
    POPGUARD: null,
    askSheet: (text, choices) => asked.push(choices),
  });
  let saved = false;
  vm.runInContext("guardUnsaved", p);
  p.guardUnsaved({ dirty: () => true, save: () => saved });
  const guard = p.POPGUARD;
  assert.equal(guard(() => {}), true);
  asked[0][0].fn(); // Save, which fails
  assert.equal(p.POPGUARD, guard);
  p.guardUnsaved({ dirty: () => false, save: () => true });
  assert.equal(p.POPGUARD(() => {}), false);
});

test("opening a scene in the maker puts its lights as the scene has them, so saving keeps their brightness and effect", () => {
  const calls = [];
  const p = page({ callRaw: (d, s, data) => calls.push([s, plain(data)]) });
  p.vcolLoad([{ hs: [0, 100] }]);
  vm.runInContext("LMK = { joins: [], lights: ['light.a', 'light.b', 'light.c'] };", p);
  p.liveMakerShowScene({
    live: { off: ["light.c"], looks: { "light.a": { bri: 40, native: "candle" }, "light.b": { palette: [{ hs: [1, 1] }] } } },
  });
  assert.deepEqual(calls, [
    ["turn_on", { entity_id: "light.a", brightness_pct: 40, effect: "candle" }],
    ["turn_on", { entity_id: "light.b" }],
    ["turn_off", { entity_id: "light.c" }],
  ]);
});

test("the Hue scenes of a section follow the order it was given, and new ones come after, by name", () => {
  const p = page();
  const items = ["a", "b", "c", "d"].map((id) => ({ id: "scene." + id }));
  const order = (hord) => plain(p.hueSceneOrder({ hord }, items)).map((x) => x.id);
  assert.deepEqual(order(undefined), ["scene.a", "scene.b", "scene.c", "scene.d"]);
  assert.deepEqual(order(["scene.c", "scene.a"]), ["scene.c", "scene.a", "scene.b", "scene.d"]);
  assert.deepEqual(order(["scene.gone", "scene.d"]), ["scene.d", "scene.a", "scene.b", "scene.c"]);
});

test("a light in a classic scene keeps a running effect, and the scene runs it", () => {
  const p = page();
  const sc = p.cleanScene({
    id: "s",
    name: "Calm",
    room: "r",
    acts: [
      { id: "light.a", on: true, bri: 40, fx: "candle" },
      { id: "light.b", on: true, fx: "off" },
      { id: "light.c", on: true, fx: "bad;name" },
    ],
  });
  assert.deepEqual(plain(sc.acts), [{ id: "light.a", on: true, bri: 40, fx: "candle" }, { id: "light.b", on: true }, { id: "light.c", on: true }]);
  Object.assign(p, { ORDER: ["r"], UIROOM: { r: {} }, ROOMLIGHTS: {}, A: () => ({}), roomDevs: () => [] });
  const run = plain(p.compileScene(sc)).filter((a) => a.action === "light.turn_on");
  assert.deepEqual(run[0].data, { brightness_pct: 40, effect: "candle" });
});

test("a scene made from the lights as they are keeps the lights that are on and turns the others off", () => {
  const made = [];
  const states = { "light.a": "on", "light.b": "off", "light.c": "on" };
  const p = page({
    roomDevs: () => ["light.a", "light.b", "light.c"].map((id) => ({ id, type: "light" })),
    V_: (id) => states[id],
    lightUnits: (ids) => ids,
    lightAct: (id) => ({ id, on: true }),
    staticOpen: (...args) => made.push(plain(args)),
    toast() {},
  });
  p.sceneFromLights("r", { scope: "r", sid: "sec" });
  assert.deepEqual(made[0], ["r", null, { scope: "r", sid: "sec" }, { others: "lights", acts: [{ id: "light.a", on: true }, { id: "light.c", on: true }] }]);
  made.length = 0;
  states["light.a"] = states["light.c"] = "off";
  p.sceneFromLights("r", null);
  assert.equal(made.length, 0); // nothing on, nothing to save
});

test("each kind of scene has its own icon: a live scene the sparkle unless one was chosen, a Hue scene the lights", () => {
  const p = page();
  assert.equal(p.liveIcon({ icon: "palette" }), "sparkle"); // what live scenes were given before the sparkle
  assert.equal(p.liveIcon({}), "sparkle");
  assert.equal(p.liveIcon({ icon: "moon" }), "moon");
  assert.equal(p.SCENE_ICON_HUE, "lights");
  assert.notEqual(p.SCENE_ICON_HUE, p.SCENE_ICON_LIVE);
});
