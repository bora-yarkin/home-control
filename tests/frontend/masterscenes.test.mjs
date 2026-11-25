// SPDX-License-Identifier: GPL-3.0-or-later
// Found while building a real dashboard on 0.25.0: every lights master has its Scenes tab, stored scenes are never cut short, and an effect offers a variant only where one can be played.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const piece = (file, from, to) => {
  const s = read(file);
  const a = s.indexOf(from);
  assert.ok(a >= 0, from);
  const b = s.indexOf(to, a);
  assert.ok(b >= 0, to);
  return s.slice(a, b);
};

test("a master that is not a Section's own, with lights chosen by hand, has its Scenes tab like any other", () => {
  const ctx = vm.createContext({});
  /* the view masterView gives a manual master: its widget's settings, with no `k` */
  vm.runInContext(piece("widgetkinds.js", "function masterView(host, d)", "/* The master of a page by its id"), ctx);
  const view = ctx.masterView({ devs: [] }, { wid: "w1", wx: { id: "w1", master: 1, mm: 1, scn: ["s1"], msrc: [] } });
  assert.equal(view.k, undefined);
  ctx.masterById = (scope, id) => (scope === "living" && id === "w1" ? view : null);
  vm.runInContext(piece("scenetab.js", "function mscSection(root)", "/* Where the scenes of a section come from"), ctx);
  const found = ctx.mscSection({ key: "m:living~w1" });
  assert.ok(found, "no Scenes tab without this");
  assert.equal(found.scope, "living");
  assert.equal(found.e, view);
  assert.equal(ctx.mscSection({ key: "living~gone" }), null);
  assert.equal(ctx.mscSection({ key: "light.group" }), null);
  assert.match(read("lightpanel.js"), /var syncId = !S\.maker && mscSection\(root\) \? masterSyncOf\(mscSection\(root\)\.e\) : null;/, "and the Sync tab follows from the same");
});

function store() {
  const said = [];
  const ctx = vm.createContext({ toast: (t) => said.push(t), _T: (k) => k, STORE: { scenes: [] } });
  vm.runInContext(piece("store.js", "/* The most scenes that can be made", "function cleanStore(v) {"), ctx);
  return { ctx, said };
}

test("every stored scene is loaded, however many there are", () => {
  const src = piece("store.js", "function cleanStore(v) {", "  if (v && Array.isArray(v.eareas))");
  assert.doesNotMatch(src, /v\.scenes\.slice/);
  const body = src.slice(src.indexOf("  /* Every scene that is stored is loaded"));
  const o = { scenes: [] };
  const v = { scenes: Array.from({ length: 261 }, (_, i) => ({ id: "s" + i })) };
  vm.runInContext(body, vm.createContext({ v, o, cleanScene: (s) => s, Array }));
  assert.equal(o.scenes.length, 261, "more than 60, and more than the limit on new ones: none is lost at the next save");
});

test("the 201st scene is refused with a message, and a scene already there can still be saved", () => {
  const { ctx, said } = store();
  assert.equal(ctx.SCENE_MAX, 200);
  ctx.STORE.scenes = Array.from({ length: 199 }, (_, i) => ({ id: "s" + i }));
  assert.equal(ctx.sceneFits("new"), true);
  ctx.STORE.scenes.push({ id: "s199" });
  assert.equal(ctx.sceneFits("new"), false);
  assert.deepEqual(said, ["scenes_full"]);
  assert.equal(ctx.sceneFits("s3"), true);
  for (const f of ["livemaker.js", "autoscenes.js", "staticmaker.js"]) assert.match(read(f), /if \(!sceneFits\(sc\.id\)\) return false;\s*STORE\.scenes = /, f);
});

test("a master and a section keep as many scenes as can be made", () => {
  const model = read("model.js");
  assert.doesNotMatch(piece("model.js", "function cleanMaster(", "\n  return o;\n}"), /o\.scn = [\s\S]*?\.slice\(0, 40\)/);
  assert.match(model, /\(Array\.isArray\(s\.devs\) \? s\.devs : \[\]\)\.slice\(0, 200\)/, "scenes can be devices of a section");
  assert.match(read("scenes.js"), /a\.length >= SCENE_MAX/);
});

test("an effect offers its Create tile only where colour and speed are actually sent", () => {
  const cat = {
    candle: { src: { set_effect: "set_effect", platforms: ["hue"] } },
    fromfile: { src: {} },
  };
  const states = { "light.hue": { effect_list: ["candle", "fromfile", "unknown"] }, "light.govee": { effect_list: ["candle", "fromfile"] } };
  const ctx = vm.createContext({
    lpFxCat: (n) => cat[n] || null,
    lightIndividuals: (l) => l,
    lpFxLight: (x) => x,
    A: (id) => states[id] || {},
    fxMatches: (src, e) => e === "light.hue",
    Array,
  });
  vm.runInContext(piece("lightpanel.js", "function lpFxCanVary(S, effect)", "/* Starts a variant"), ctx);
  const on = (...ids) => ({ target: () => ({ cmd: ids }) });
  assert.equal(ctx.lpFxCanVary(on("light.hue"), "candle"), true);
  assert.equal(ctx.lpFxCanVary(on("light.govee", "light.hue"), "candle"), true);
  assert.equal(ctx.lpFxCanVary(on("light.govee"), "candle"), false, "its colour is never sent to this light");
  assert.equal(ctx.lpFxCanVary(on("light.hue"), "fromfile"), false, "a file's effects have nothing to send them with");
  assert.equal(ctx.lpFxCanVary(on("light.hue"), "unknown"), false);
  assert.match(read("lightpanel.js"), /a\.el\.style\.display = lpFxCanVary\(S, a\.effect\) \? "" : "none";/);
});
