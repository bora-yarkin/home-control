// SPDX-License-Identifier: GPL-3.0-or-later
// Scenes a plugin owns that do not play by themselves (Hue's static scenes) are used like classic scenes, and are imported as classic
// scenes (scenes.js, livescenes.js); an area is deleted with the scenes that are on no page (areas.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function page(extra = {}) {
  const log = { popups: [], calls: [], toasts: [], opened: [], confirms: [], forgot: [], stops: [] };
  const sandbox = {
    _T: (k) => k,
    log,
    ISADMIN: true,
    SHEET: null,
    CURRENT: null,
    STORE: { scenes: [], eareas: [] },
    H: () => ({ entities: {}, states: { "light.a": {}, "light.b": {}, "light.c": {} } }),
    A: (id) => (sandbox.GROUPS[id] ? { entity_id: sandbox.GROUPS[id] } : { name: "Reading" }),
    GROUPS: {},
    ROOMLIGHTS: {},
    lightUnits: (ids) => ids,
    pill: (icon, name, o) => ({ icon, name, ...o }),
    showPopup: (key) => log.popups.push(key),
    call: (domain, service, data) => log.calls.push([domain, service, data]),
    toast: (t) => log.toasts.push(t),
    pluginSceneKind: () => null,
    allSectionLists: () => [],
    liveRun: () => false,
    liveCall: (...a) => log.stops.push(a),
    liveForget: (...a) => log.forgot.push(a),
    pruneSceneRefs() {},
    confirmDlg: (text, fn) => log.confirms.push({ text, fn }),
    liveXyRgb: () => [255, 0, 0],
    hsvOf: () => [0, 100],
    liveRoomFor: () => "bora",
    secOrder: () => [{ k: "scenes", id: "s1" }],
    scopeKey: (r) => r,
    staticOpen: (...a) => log.opened.push(a),
    EAD: { draft: { id: "imp-bora" } },
    uiChanged() {},
    refresh() {},
    edDel: (el, fn, label) => Object.assign(el, { del: fn, delLabel: label }),
    sep: () => ({}),
    TITLES: {},
    sceneAllowed: () => true,
    secById: () => ({ id: "s1", scn: [] }),
    PLUGIN_SCENE_IMPORTS: [],
    mk: () => ({ appendChild(c) { this.kids.push(c); }, kids: [] }),
    eaIdentifyOff() {},
    POPGUARD: null,
    STACK: [],
    popBack() {},
    closeSheet() {},
    ...extra,
  };
  sandbox.GROUPS = extra.GROUPS || {};
  const stubs = { ...sandbox };
  vm.createContext(sandbox);
  for (const file of ["scenes.js", "livescenes.js", "areas.js"]) vm.runInContext(read(file), sandbox);
  /* What the test stands in for wins over the file's own function of that name; the rest is the code under test. */
  for (const name of Object.keys(stubs)) if (!["sceneEntRow", "liveImportFrom", "classicImportFrom", "eaDelete", "eaRemove", "sceneShown", "liveImportSource", "sceneDeleteEverywhere", "scnPick", "classicSettingsByUnit", "classicSameSetting"].includes(name) || name in extra) sandbox[name] = stubs[name];
  sandbox.PLUGIN_SCENE_IMPORTS = extra.SOURCES || [];
  return sandbox;
}

const kind = (dynamic) => ({
  icon: "palette",
  popup: "hue-scene",
  dynamic: () => dynamic,
  active: () => false,
  toggle: (id) => kind.toggled.push(id),
});
kind.toggled = [];

test("a scene a plugin owns that plays by itself opens its popup, and its icon switches it", () => {
  kind.toggled = [];
  const k = kind(true);
  const p = page({ pluginSceneKind: () => k });
  const row = p.sceneEntRow("scene.arctic", "Arctic", null, null, { id: "bora" });
  row.tap();
  assert.deepEqual(plain(p.log.popups), ["hue-scene:scene.arctic~bora"]);
  row.iconTap();
  assert.deepEqual(kind.toggled, ["scene.arctic"]);
});

test("a static scene a plugin owns is switched on or off from anywhere on the row, with no popup, like a classic scene", () => {
  kind.toggled = [];
  const k = kind(false);
  const p = page({ pluginSceneKind: () => k });
  const row = p.sceneEntRow("scene.desk", "Desk", null, null, { id: "bora" });
  row.tap();
  assert.deepEqual(plain(p.log.popups), []);
  assert.deepEqual(kind.toggled, ["scene.desk"]);
  assert.equal(row.iconTap, null);
});

test("a classic scene is made from what a static scene sets each light to, not from how the lights are now", async () => {
  const lights = [
    { entity_id: "light.a", on: true, brightness: 102, xy: [0.5, 0.4] },
    { entity_id: "light.b", on: false },
    { entity_id: "light.c", on: true, brightness: 255, k: 2500 },
    { entity_id: "light.gone", on: true, brightness: 255 },
  ];
  const source = { id: "hue-classic", classic: true, available: () => true, read: async () => ({ name: "Desk", lights }) };
  const p = page({ SOURCES: [source] });
  p.liveImportFrom("hue-classic", "scene.desk", null, null);
  await new Promise((r) => setImmediate(r));
  assert.equal(p.log.opened.length, 1);
  const [room, existing, target, start] = plain(p.log.opened[0]);
  assert.equal(room, "bora");
  assert.equal(existing, null);
  assert.deepEqual(target, { scope: "bora", sid: "s1" });
  assert.equal(start.name, "Desk");
  assert.deepEqual(start.acts, [
    { id: "light.a", on: true, bri: 40, col: { h: 0, s: 100 } },
    { id: "light.b", on: false },
    { id: "light.c", on: true, bri: 100, col: { k: 2500 } },
  ]);
});

test("lights of a group the room shows that the scene sets the same are one light of the scene; lights it sets differently stay separate", async () => {
  const warm = { on: true, brightness: 255, k: 2404 };
  const lights = [
    { entity_id: "light.ceiling_l", on: false },
    { entity_id: "light.ceiling_r", on: false },
    { entity_id: "light.floor_l", ...warm },
    { entity_id: "light.floor_r", ...warm },
    { entity_id: "light.play_l", ...warm },
    { entity_id: "light.play_r", ...warm, brightness: 100 },
    { entity_id: "light.desk", on: true, brightness: 255, k: 2710 },
  ];
  const states = Object.fromEntries([...lights.map((l) => l.entity_id), "light.ceilings", "light.floors", "light.play"].map((id) => [id, {}]));
  const source = { id: "hue-classic", classic: true, available: () => true, read: async () => ({ name: "Desk", lights }) };
  const p = page({
    SOURCES: [source],
    H: () => ({ entities: {}, states }),
    ROOMLIGHTS: { bora: ["light.ceilings", "light.floors", "light.play", "light.desk"] },
    GROUPS: {
      "light.ceilings": ["light.ceiling_l", "light.ceiling_r"],
      "light.floors": ["light.floor_l", "light.floor_r"],
      "light.play": ["light.play_l", "light.play_r"],
    },
  });
  p.liveImportFrom("hue-classic", "scene.desk", "bora", null);
  await new Promise((r) => setImmediate(r));
  const acts = plain(p.log.opened[0][3].acts);
  assert.deepEqual(
    acts.map((a) => a.id),
    ["light.ceilings", "light.floors", "light.play_l", "light.play_r", "light.desk"],
    "the ceiling lights and the floor lamps are one each; the Play lights differ, so each is its own"
  );
  assert.equal(acts[0].on, false);
  assert.deepEqual(acts[1].col, { k: 2404 });
});

test("a static scene that cannot be read says so and opens nothing", async () => {
  const source = { id: "hue-classic", classic: true, failed: "nope", available: () => true, read: async () => ({ name: "x", lights: [] }) };
  const p = page({ SOURCES: [source] });
  p.liveImportFrom("hue-classic", "scene.desk", null, null);
  await new Promise((r) => setImmediate(r));
  assert.equal(p.log.opened.length, 0);
  assert.deepEqual(plain(p.log.toasts), ["nope"]);
});

const live = (id, name, areas) => ({ id, name, live: { area: "lx-" + id, areas } });

test("an area is not deleted while a scene on a page uses it, and every such scene is named", () => {
  const p = page({ allSectionLists: () => [[{ scn: ["s1", "s2"] }]] });
  p.STORE.scenes = [live("s1", "One", ["imp-bora"]), live("s2", "Two", ["imp-bora"]), live("s3", "Three", ["other"])];
  p.eaDelete();
  assert.deepEqual(plain(p.log.toasts), ["scenes_use_this_areaOne, Two"]);
  assert.equal(p.log.confirms.length, 0);
  assert.equal(p.STORE.scenes.length, 3);
});

test("scenes that are on no page do not stop the area: they are named and deleted with it once confirmed", () => {
  const p = page({ allSectionLists: () => [[{ scn: ["s3"] }]] });
  p.STORE.eareas = [{ id: "imp-bora" }, { id: "other" }];
  p.STORE.scenes = [live("s1", "Ghost", ["imp-bora"]), live("s3", "Kept", ["other"])];
  p.eaDelete();
  assert.equal(p.log.confirms.length, 1);
  assert.match(p.log.confirms[0].text, /Ghost/);
  assert.equal(p.STORE.scenes.length, 2, "nothing is deleted before the answer");
  p.log.confirms[0].fn();
  assert.deepEqual(plain(p.STORE.scenes.map((s) => s.id)), ["s3"]);
  assert.deepEqual(plain(p.STORE.eareas.map((a) => a.id)), ["other"]);
  assert.deepEqual(plain(p.log.forgot), [["s1", "lx-s1"], [null, "imp-bora"]]);
});

test("an area no scene uses is deleted at once", () => {
  const p = page();
  p.STORE.eareas = [{ id: "imp-bora" }];
  p.eaDelete();
  assert.deepEqual(plain(p.STORE.eareas), []);
  assert.equal(p.log.confirms.length, 0);
});

test("the trash of a scene deletes it from every page and the saved scenes, once confirmed, and forgets a live scene with its area", () => {
  const p = page({ allSectionLists: () => [[{ scn: ["s1"] }]], liveRun: () => true });
  p.STORE.scenes = [live("s1", "One", ["imp-bora"]), { id: "s2", name: "Classic" }];
  p.sceneDeleteEverywhere(p.STORE.scenes[0]);
  assert.equal(p.STORE.scenes.length, 2, "nothing is deleted before the answer");
  assert.match(p.log.confirms[0].text, /One/);
  p.log.confirms[0].fn();
  assert.deepEqual(plain(p.STORE.scenes.map((x) => x.id)), ["s2"]);
  assert.deepEqual(plain(p.log.stops), [["stop", { scene_id: "s1" }]]);
  assert.deepEqual(plain(p.log.forgot), [["s1", "lx-s1"]]);
  assert.deepEqual(plain(p.log.toasts), ["scene_deleted"]);
});

test("the list of existing scenes is drawn again without a scene deleted from it, and nothing is reopened elsewhere", () => {
  const open = (SHEET, CURRENT) => {
    const p = page({ SHEET, CURRENT });
    p.STORE.scenes = [{ id: "s2", name: "Classic" }];
    p.sceneDeleteEverywhere(p.STORE.scenes[0]);
    p.log.confirms[0].fn();
    return p.log.popups;
  };
  assert.deepEqual(plain(open({}, "pick-scene:room:sec")), ["pick-scene:room:sec"]);
  assert.deepEqual(plain(open({}, "stg-wall")), []);
  assert.deepEqual(plain(open(null, null)), []);
});

test("a classic scene is deleted without the integration being asked about it", () => {
  const p = page();
  p.STORE.scenes = [{ id: "s2", name: "Classic" }];
  p.sceneDeleteEverywhere(p.STORE.scenes[0]);
  p.log.confirms[0].fn();
  assert.deepEqual(p.STORE.scenes, []);
  assert.deepEqual(plain(p.log.forgot), []);
});

test("in the list of existing scenes a scene that is on no page has a trash that deletes it, and one that is on a page does not", () => {
  const box = { kids: [], appendChild(c) { this.kids.push(c); } };
  const p = page({
    allSectionLists: () => [[{ scn: ["s1"] }]],
    mk: () => box,
    secById: () => ({ id: "sec", scn: ["s1"] }),
  });
  p.STORE.scenes = [{ id: "s1", name: "Shown" }, { id: "s2", name: "Hidden" }];
  p.scnPick({ appendChild() {} }, "room:sec");
  const by = Object.fromEntries(box.kids.filter((k) => k && k.name).map((r) => [r.name, r]));
  assert.equal(by.Shown.del, undefined);
  assert.equal(typeof by.Hidden.del, "function");
  by.Hidden.del();
  assert.match(p.log.confirms[0].text, /Hidden/);
});
