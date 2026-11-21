// SPDX-License-Identifier: GPL-3.0-or-later
// The Scenes page of a lights master's light popup (app/scenetab.js): its own list of scenes from the sources the section chose, folders, order, and nothing of it is in the Effects page any more.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const fn = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  return src.slice(at, src.indexOf("\n}\n", at) + 3);
};
const tab = read("scenetab.js");
const SRC = ["mscSection", "mscItems", "mscKindLabel", "mscFoldersChange", "mscTop"].map((n) => fn(tab, n)).join("\n") + "\nvar MSC_DEFAULT_SRC = [\"hue\"];";

function world(section = {}, extra = {}) {
  const e = { id: "lights", k: "lights", master: 1, ...section };
  const stored = [
    { id: "c1", name: "Movie", room: "r1", acts: [] },
    { id: "l1", name: "Aurora", room: "r1", live: { palette: [] } },
    { id: "c2", name: "Elsewhere", room: "r2", acts: [] },
  ];
  const states = { "scene.bath_dim": { attributes: { friendly_name: "Bathroom Dim" } } };
  const sandbox = {
    LMASTER_SCOPE: { lights: "r1" },
    secById: (scope, sid) => (sid === "lights" ? e : sid === "sc" ? { id: "sc", k: "scenes", scn: ["c2"] } : null),
    STORE: { scenes: stored },
    sceneById: (id) => stored.find((s) => s.id === id) || null,
    sceneAllowed: () => true,
    lpFxOf: () => ({ scenes: ["scene.bath_dim"] }),
    A: (id) => (states[id] || {}).attributes || {},
    UIROOM: { r1: { name: "Bora's Bedroom", area: "bora" } },
    sceneShortName: (name) => name.replace(/^Bathroom /, ""),
    secScenes: (s) => s.scn.map((id) => stored.find((x) => x.id === id)),
    lightingScenesExtra: () => () => [{ id: "scene.bath_dim", kind: {} }],
    uiChanged() {},
    _T: (k) => k,
    ...extra,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { w: sandbox, e };
}
const keys = (list) => plain(list.map((x) => x.key));

test("the Scenes page is only for the light popup of a lights master section", () => {
  const { w } = world();
  assert.equal(w.mscSection({ key: "m:lights" }).scope, "r1");
  assert.equal(w.mscSection({ key: "m:edit" }), null, "the scene editor's popup has none");
  assert.equal(w.mscSection({ key: "light.lamp" }), null);
});

test("with nothing chosen the scenes are the Hue scenes of the lights' areas, and the ones made from its + come first", () => {
  const { w } = world({ scn: ["c1", "l1"] });
  const items = w.mscItems({ root: { key: "m:lights" } });
  assert.deepEqual(keys(items), ["c1", "l1", "scene.bath_dim"]);
  assert.deepEqual(plain(items.map((x) => x.kind)), ["classic", "live", "hue"], "each says what kind it is");
  assert.equal(items[2].name, "Dim", "the area's name is left out of a Hue scene's name");
});

test("the sources the section chose add their scenes: the page's classic and live scenes, a scenes section's", () => {
  const { w } = world({ msrc: ["page"] });
  assert.deepEqual(keys(w.mscItems({ root: { key: "m:lights" } })), ["c1", "l1"], "only the page's own scenes, no Hue scenes");
  const both = world({ msrc: ["sec:sc"] });
  assert.deepEqual(keys(both.w.mscItems({ root: { key: "m:lights" } })), ["c2", "scene.bath_dim"], "what that scenes section shows");
  const none = world({ msrc: ["sec:gone"] });
  assert.deepEqual(keys(none.w.mscItems({ root: { key: "m:lights" } })), [], "a scenes section that was deleted adds nothing, and the master keeps working");
});

test("removing a scenes section does not remove a scene from the master that was made from its own +", () => {
  const { w } = world({ scn: ["c1"], msrc: ["sec:gone"] });
  assert.deepEqual(keys(w.mscItems({ root: { key: "m:lights" } })), ["c1"]);
});

test("folders and the order: scenes in a folder are in its tile, the rest in the order given, new ones last", () => {
  const { w, e } = world({ scn: ["c1", "l1"], mf: [{ id: "f1", n: "Evening", s: ["l1"] }], mtop: ["scene.bath_dim", "c1"] });
  const entries = w.mscTop(w.mscItems({ root: { key: "m:lights" } }), e);
  assert.deepEqual(plain(entries.map((x) => x.key)), ["scene.bath_dim", "c1", "f:f1"]);
  assert.deepEqual(plain(entries[2].scenes.map((x) => x.key)), ["l1"]);
});

test("a folder that loses its last scene is gone, and a scene that no longer exists leaves a folder without a tile", () => {
  const { w, e } = world({ scn: ["c1"], msrc: [], mf: [{ id: "f1", n: "A", s: ["c1"] }, { id: "f2", n: "B", s: ["gone"] }] });
  const entries = w.mscTop(w.mscItems({ root: { key: "m:lights" } }), e);
  assert.deepEqual(plain(entries.map((x) => x.key)), ["f:f1"], "the folder of a scene that is gone has no tile");
  w.mscFoldersChange(e, (folders) => {
    folders[0].s = [];
  });
  assert.deepEqual(plain(e.mf.map((f) => f.id)), ["f2"]);
  w.mscFoldersChange(e, (folders) => {
    folders[0].s = [];
  });
  assert.equal(e.mf, undefined);
});

test("the section keeps its sources, folders and order through the layout clean-up, and drops what is not valid", () => {
  const model = read("model.js");
  const at = model.indexOf('if (k === "lights") {\n      /* The scenes page');
  assert.ok(at > 0);
  const body = model.slice(at, model.indexOf('if (k === "scenes") {', at));
  const run = (s) => {
    const o = {};
    vm.runInNewContext(`(function(s,o,k){${body}})(s,o,k)`, { s, o, k: "lights" });
    return plain(o);
  };
  assert.deepEqual(run({ msrc: ["hue", "page", "sec:a1", "sec:Bad Id", "hue"], mf: [{ id: "f1", n: "X", s: ["c1", "scene.a", "bad key!"] }, { id: "no id!", n: "Y", s: ["c1"] }, { id: "f2", n: "Z", s: [] }], mtop: ["c1", "f:f1", "x y"] }), {
    msrc: ["hue", "page", "sec:a1"],
    mf: [{ id: "f1", n: "X", s: ["c1", "scene.a"] }],
    mtop: ["c1", "f:f1"],
  });
});

test("the Effects page has no Scenes row any more, and the light popup has the Scenes tab after Effects only for a lights master", () => {
  const panel = read("lightpanel.js");
  const fx = panel.slice(panel.indexOf("function lpFxPane("), panel.indexOf("function lpSpeedWord("));
  assert.doesNotMatch(fx, /fx\.scenes/);
  assert.doesNotMatch(fx, /_T\("scenes"\)/);
  assert.match(panel, /if \(!S\.maker && mscSection\(root\)\) modes\.push\("scenes"\);/);
  assert.match(panel, /if \(m === "fx" \|\| m === "scenes"\) tabs\.appendChild\(mk\("div", "lp-sep"\)\);/);
});

test("the Scenes file is in the list of files, after the light panel", () => {
  const files = JSON.parse(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8")).files;
  assert.ok(files.indexOf("app/scenetab.js") === files.indexOf("app/lightpanel.js") + 1);
});
