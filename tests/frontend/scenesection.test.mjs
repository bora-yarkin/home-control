// SPDX-License-Identifier: GPL-3.0-or-later
// A scenes section has its own source of scenes (the page's area or another area), its own scenes chosen for it and its own hidden scenes: hiding a scene in one section leaves the others alone (scenes.js, model.js, addpopup.js).
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
// The text of one top-level function (or of the run from one to just before another).
const fn = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  return src.slice(at, src.indexOf("\n}\n", at) + 3);
};

const scenes = read("scenes.js");
const SCENE_SRC = ["sceneIds", "sceneSectionRoom", "sceneEntHiddenList", "sceneEntHidden", "sceneEntSetHidden", "lightingScenesExtra"].map((n) => fn(scenes, n)).join("\n");

function world(extra = {}) {
  const entities = {};
  const states = {};
  const scene = (id, name, area) => {
    states[id] = { attributes: { friendly_name: name } };
    entities[id] = { area_id: area };
  };
  scene("scene.bora_read", "Bora's Bedroom Read", "bora");
  scene("scene.bora_relax", "Bora's Bedroom Relax", "bora");
  scene("scene.bath_bright", "Bathroom Bright", "bath");
  scene("scene.bath_dim", "Bathroom Dim", "bath");
  const sandbox = {
    H: () => ({ states, entities, devices: {} }),
    A: (id) => (states[id] || {}).attributes || {},
    ISADMIN: true,
    editing: () => false,
    modeOf: () => ({ mode: "" }),
    // Every scene here belongs to a plugin (Hue's), so it can be hidden.
    pluginSceneKind: () => ({ icon: "hue", remove: null }),
    sceneEntRow: (id, name, icon, sub, room) => ({ id, name, room }),
    edMark: (row) => row,
    edDel: (row, fn) => Object.assign(row, { del: fn }),
    sceneKindPopupKey: (kind, id, room) => `hue:${id}~${room.id}`,
    showPopup() {},
    confirmDlg() {},
    rerender() {},
    uiChanged() {},
    UIROOM: { bora: { id: "bora", name: "Bora's Bedroom", area: "bora" } },
    _T: (k) => k,
    ...extra,
  };
  vm.createContext(sandbox);
  vm.runInContext(SCENE_SRC, sandbox);
  return sandbox;
}

const names = (rows) => plain(rows.map((r) => r.id));

test("a scenes section shows the scenes of the page's area, and of the area it names instead", () => {
  const w = world();
  const extra = w.lightingScenesExtra("bora");
  assert.deepEqual(names(extra({ id: "s1" })), ["scene.bora_read", "scene.bora_relax"]);
  assert.deepEqual(names(extra({ id: "s2", sarea: "bath" })), ["scene.bath_bright", "scene.bath_dim"]);
});

test("scenes chosen for a section are shown after its area's, once, and only while they exist", () => {
  const w = world();
  const extra = w.lightingScenesExtra("bora");
  const rows = extra({ id: "s1", sents: ["scene.bath_dim", "scene.bora_read", "scene.gone"] });
  assert.deepEqual(names(rows), ["scene.bora_read", "scene.bora_relax", "scene.bath_dim"]);
  assert.equal(typeof rows[2].row.del, "function", "a chosen scene can be taken out of the section");
  assert.equal(rows[0].row.del, undefined, "a scene of the area has no such button");
});

test("taking a chosen scene out of its section only changes the section's list", () => {
  const w = world();
  const sec = { id: "s1", sents: ["scene.bath_dim", "scene.bath_bright"] };
  const rows = w.lightingScenesExtra("bora")(sec);
  rows.find((r) => r.id === "scene.bath_dim").row.del();
  assert.deepEqual(plain(sec.sents), ["scene.bath_bright"]);
});

test("hiding a scene in one section leaves the same scene in the page's other sections", () => {
  const w = world();
  const a = { id: "s1" },
    b = { id: "s2" };
  const extra = w.lightingScenesExtra("bora");
  const ctxA = w.sceneSectionRoom(w.UIROOM.bora, a);
  w.sceneEntSetHidden(ctxA, "scene.bora_read", true);
  assert.deepEqual(names(extra(a)), ["scene.bora_relax"]);
  assert.deepEqual(names(extra(b)), ["scene.bora_read", "scene.bora_relax"], "the other section still shows it");
  assert.equal(w.UIROOM.bora.hscn, undefined, "the room's own list is not changed");
  w.sceneEntSetHidden(ctxA, "scene.bora_read", false);
  assert.deepEqual(names(extra(a)), ["scene.bora_read", "scene.bora_relax"]);
});

test("a section that has hidden nothing yet uses the room's list, and a section with its own list ignores it", () => {
  const w = world();
  w.UIROOM.bora.hscn = ["scene.bora_relax"];
  const extra = w.lightingScenesExtra("bora");
  assert.deepEqual(names(extra({ id: "s1" })), ["scene.bora_read"], "the list a room had before sections kept their own");
  assert.deepEqual(names(extra({ id: "s2", hscn: [] })), ["scene.bora_read", "scene.bora_relax"], "an empty list of its own shows everything");
});

test("a scene opened from a section's row is opened with that section, so hiding it from there is the section's", () => {
  const w = world();
  const rows = w.lightingScenesExtra("bora")({ id: "s1", sarea: "bath" });
  assert.equal(rows[0].row.room.id, "bora.s1");
  assert.equal(rows[0].row.room.area, "bath");
  assert.equal(rows[0].row.room.name, "Bora's Bedroom", "the page's name is still the page's");
});

test("a room with no area and no chosen scenes shows none, not the scenes that have no area", () => {
  const w = world({ UIROOM: { bora: { id: "bora", name: "Bora's Bedroom", area: "" } } });
  assert.deepEqual(names(w.lightingScenesExtra("bora")({ id: "s1" })), []);
});

test("the section's source, chosen scenes and hidden scenes are kept by the layout clean-up, and a bad value is dropped", () => {
  const model = read("model.js");
  const at = model.indexOf('if (k === "scenes") {');
  assert.ok(at > 0);
  const body = model.slice(at, model.indexOf("if (ty.own) {", at));
  const run = (s) => {
    const o = {};
    vm.runInNewContext(`(function(s,o,k){${body}})(s,o,k)`, { s, o, k: "scenes" });
    return plain(o);
  };
  assert.deepEqual(run({ sarea: "bath", sents: ["scene.a", "scene.a", "light.x"], hscn: [] }), { sarea: "bath", sents: ["scene.a"], hscn: [] });
  assert.deepEqual(run({ sarea: "Bad Area!", sents: [], hscn: "x" }), {});
});

test("a scene picked for a scenes section is one of its scenes, not a device in it", () => {
  const src = read("addpopup.js");
  const sec = { id: "s1", k: "scenes" };
  const sandbox = { sectionOfList: () => sec, dom: (id) => id.split(".")[0] };
  vm.createContext(sandbox);
  vm.runInContext(fn(src, "addCandidate"), sandbox);
  const out = sandbox.addCandidate("~bora~s1", { id: "scene.bath_dim", name: "Dim" });
  assert.deepEqual(plain(sec.sents), ["scene.bath_dim"]);
  assert.equal(out.d, null);
  sandbox.addCandidate("~bora~s1", { id: "scene.bath_dim", name: "Dim" });
  assert.deepEqual(plain(sec.sents), ["scene.bath_dim"], "once");
});

test("the add popup has a Scenes type of its own, and Controls no longer holds them", () => {
  const manage = read("manage.js");
  const doms = manage.slice(manage.indexOf("var ADDDOMS = ["), manage.indexOf("var DOMKIND"));
  assert.match(doms, /\[_T\("scenes"\), \["scene"\]\]/);
  const controls = doms.slice(doms.indexOf("_T(\"controls\")"), doms.indexOf("_T(\"scenes\")"));
  assert.doesNotMatch(controls, /"scene"/);
  assert.match(read("editor.js"), /ADDPRE_IX = \{[^}]*scenes: 9/);
  assert.match(read("sections.js"), /own: 1,\s*noun: _T\("device_2"\),\s*add: "scenes"/);
});
