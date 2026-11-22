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
const SRC = ["mscSection", "mscItems", "mscKindLabel", "mscFoldersChange", "mscTop"].map((n) => fn(tab, n)).join("\n") + "\nvar MSC_DEFAULT_SRC = [\"plugin\"];";

function world(section = {}, extra = {}) {
  const e = { id: "lights", k: "devs", master: 1, ...section };
  const stored = [
    { id: "c1", name: "Movie", room: "r1", acts: [] },
    { id: "l1", name: "Aurora", room: "r1", live: { palette: [] } },
    { id: "c2", name: "Elsewhere", room: "r2", acts: [] },
  ];
  const states = { "scene.bath_dim": { attributes: { friendly_name: "Bathroom Dim" } } };
  const sandbox = {
    secById: (scope, sid) => (scope === "r1" && sid === "lights" ? e : sid === "sc" ? { id: "sc", k: "scenes", scn: ["c2"] } : null),
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
  assert.equal(w.mscSection({ key: "m:r1~lights" }).scope, "r1");
  assert.equal(w.mscSection({ key: "m:edit" }), null, "the scene editor's popup has none");
  assert.equal(w.mscSection({ key: "m:r2~lights" }), null, "another page's section of the same id is another section");
  assert.equal(w.mscSection({ key: "light.lamp" }), null);
});

test("with nothing chosen the scenes are the Hue scenes of the lights' areas, and the ones made from its + come first", () => {
  const { w } = world({ scn: ["c1", "l1"] });
  const items = w.mscItems({ root: { key: "m:r1~lights" } });
  assert.deepEqual(keys(items), ["c1", "l1", "scene.bath_dim"]);
  assert.deepEqual(plain(items.map((x) => x.kind)), ["classic", "live", "plugin"], "each says what kind it is");
  assert.equal(items[2].name, "Dim", "the area's name is left out of a Hue scene's name");
});

test("the sources the section chose add their scenes: the page's classic and live scenes, a scenes section's", () => {
  const { w } = world({ msrc: ["page"] });
  assert.deepEqual(keys(w.mscItems({ root: { key: "m:r1~lights" } })), ["c1", "l1"], "only the page's own scenes, no Hue scenes");
  const both = world({ msrc: ["sec:sc"] });
  assert.deepEqual(keys(both.w.mscItems({ root: { key: "m:r1~lights" } })), ["c2", "scene.bath_dim"], "what that scenes section shows");
  const none = world({ msrc: ["sec:gone"] });
  assert.deepEqual(keys(none.w.mscItems({ root: { key: "m:r1~lights" } })), [], "a scenes section that was deleted adds nothing, and the master keeps working");
});

test("removing a scenes section does not remove a scene from the master that was made from its own +", () => {
  const { w } = world({ scn: ["c1"], msrc: ["sec:gone"] });
  assert.deepEqual(keys(w.mscItems({ root: { key: "m:r1~lights" } })), ["c1"]);
});

test("folders and the order: scenes in a folder are in its tile, the rest in the order given, new ones last", () => {
  const { w, e } = world({ scn: ["c1", "l1"], mf: [{ id: "f1", n: "Evening", s: ["l1"] }], mtop: ["scene.bath_dim", "c1"] });
  const entries = w.mscTop(w.mscItems({ root: { key: "m:r1~lights" } }), e);
  assert.deepEqual(plain(entries.map((x) => x.key)), ["scene.bath_dim", "c1", "f:f1"]);
  assert.deepEqual(plain(entries[2].scenes.map((x) => x.key)), ["l1"]);
});

test("a folder that loses its last scene is gone, and a scene that no longer exists leaves a folder without a tile", () => {
  const { w, e } = world({ scn: ["c1"], msrc: [], mf: [{ id: "f1", n: "A", s: ["c1"] }, { id: "f2", n: "B", s: ["gone"] }] });
  const entries = w.mscTop(w.mscItems({ root: { key: "m:r1~lights" } }), e);
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
  const at = model.indexOf('if (k === "devs") {\n      /* The scenes page');
  assert.ok(at > 0);
  const body = model.slice(at, model.indexOf('if (k === "scenes") {', at));
  const run = (s) => {
    const o = {};
    vm.runInNewContext(`(function(s,o,k){${body}})(s,o,k)`, { s, o, k: "devs" });
    return plain(o);
  };
  assert.deepEqual(run({ msrc: ["hue", "page", "sec:a1", "sec:Bad Id", "hue"], mf: [{ id: "f1", n: "X", s: ["c1", "scene.a", "bad key!"] }, { id: "no id!", n: "Y", s: ["c1"] }, { id: "f2", n: "Z", s: [] }], mtop: ["c1", "f:f1", "x y"] }), {
    msrc: ["plugin", "page", "sec:a1"],
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
  assert.match(panel, /if \(m === "fx" \|\| m === "scenes" \|\| m === "sync"\) tabs\.appendChild\(mk\("div", "lp-sep"\)\);/);
});

test("the Scenes file is in the list of files, after the light panel", () => {
  const files = JSON.parse(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8")).files;
  assert.ok(files.indexOf("app/scenetab.js") === files.indexOf("app/lightpanel.js") + 1);
});

test("a still scene has no stop on its picture, and tapping it again while it is on switches the lights off", () => {
  const tab = read("scenetab.js");
  assert.match(tab, /if \(mscDynamic\(it\)\) sw\.appendChild\(mk\("div", "lp-fxstop", "<i><\/i>"\)\);/);
  const play = tab.slice(tab.indexOf("function mscPlay("), tab.indexOf("\n}\n", tab.indexOf("function mscPlay(")) + 3);
  const calls = [];
  const run = (it, active) => {
    const sandbox = {
      liveToggle: () => calls.push("live"),
      mscDynamic: (x) => x.kind === "live" || x.dyn,
      mscActive: () => active,
      call: (d, s, data) => calls.push([d, s, plain(data)]),
      runScene: () => calls.push("run"),
      liveStopOn: () => {},
      pluginSceneKind: () => ({ dynamic: () => true, active: () => active, toggle: () => calls.push("toggle"), start: () => calls.push("start") }),
    };
    vm.createContext(sandbox);
    vm.runInContext(play, sandbox);
    calls.length = 0;
    sandbox.mscPlay({ root: { cmd: ["light.a", "light.b"] } }, it);
    return plain(calls);
  };
  assert.deepEqual(run({ kind: "classic", sc: {} }, true), [["light", "turn_off", { entity_id: ["light.a", "light.b"] }]], "a classic scene that is on: off");
  assert.deepEqual(run({ kind: "classic", sc: {} }, false), ["run"], "not on: it runs");
  assert.deepEqual(run({ kind: "plugin", id: "scene.x", dyn: false }, true), [["light", "turn_off", { entity_id: ["light.a", "light.b"] }]], "a still Hue scene that is on: off");
  assert.deepEqual(run({ kind: "plugin", id: "scene.x", dyn: true }, true), ["toggle"], "a moving one stops");
});

test("the pen and dots of the scene that plays stay put when the rows are made again, and a folder that opens slides the page only as far as it needs", () => {
  const tab = read("scenetab.js");
  const apply = tab.slice(tab.indexOf("function apply(list, animate, skip)"), tab.indexOf("wrap.apply = apply;"));
  assert.doesNotMatch(apply, /side\.el\.remove\(\);\s*side = null;\s*\}\s*var all/, "they are not taken away before the rows are made");
  assert.match(apply, /side\.t\.parentNode\.insertBefore\(side\.el, side\.t\.nextSibling\)/, "they are put back after their tile, with the class that has them out");
  assert.match(tab, /to = Math\.min\(want, top - 10\)/, "never above the folder's own top");
  assert.match(tab, /if \(to > box\.scrollTop \+ 1\) mscSlideScroll\(box, to, 340\)/, "a folder that fits moves nothing");
  assert.match(tab, /cards\[id\]\.classList\.add\("open"\);\s*mscRevealCard\(box, cards\[id\]\);/);
  // the helper works out where to slide to from the heights
  const sandbox = { performance: { now: () => 0 }, requestAnimationFrame() {} };
  vm.createContext(sandbox);
  vm.runInContext(tab.slice(tab.indexOf("function mscSlideScroll("), tab.indexOf("/* The Scenes page. */")), sandbox);
  const box = (scrollTop, clientHeight, boxTop = 100) => ({ scrollTop, clientHeight, getBoundingClientRect: () => ({ top: boxTop }) });
  const card = (cardTop, inner) => ({ firstElementChild: { scrollHeight: inner }, getBoundingClientRect: () => ({ top: cardTop }) });
  let b = box(0, 400);
  vm.runInContext("1", sandbox);
  sandbox.mscRevealCard(b, card(150, 120)); // top 50 + 132 + 8 = 190 < 400: it fits
  assert.equal(b.scrollTop, 0, "a short folder that fits: no scroll");
  b = box(0, 400);
  sandbox.mscRevealCard(b, card(400, 500)); // top 300, height 512: want 420, but not above top - 10 = 290
  assert.equal(b.scrollTop, 0, "the scroll is started with an animation, not set in one step");
});
