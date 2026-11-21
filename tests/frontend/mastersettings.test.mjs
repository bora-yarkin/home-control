// SPDX-License-Identifier: GPL-3.0-or-later
// A lights master's own settings (app/mastersettings.js): which lights it controls (automatic or chosen), what its power button does, and the sync tab.
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
const src = read("mastersettings.js");
const SRC = ["masterSec", "masterLightIds", "masterMeta", "masterSyncDevices", "masterSyncOf", "masterPower"].map((n) => fn(src, n)).join("\n");

function world(sec, extra = {}) {
  const calls = [];
  const states = { "light.a": {}, "light.b": {}, "light.c": {}, "switch.sync": {}, "switch.other": {} };
  const sandbox = {
    calls,
    H: () => ({ states }),
    modeOf: (id) => ({ mode: id === "light.c" ? "hide" : "" }),
    secById: (scope, sid) => (scope === "r1" && sid === "lights" ? sec : null),
    pluginDeviceKind: (id) => (id === "switch.sync" ? { sync: true } : id === "switch.other" ? { sync: false } : null),
    LMASTER: { "r1~lights": ["light.a", "light.b"] },
    countOn: () => 0,
    lightUnits: (ids) => ids,
    lightsMasterToggle: (ids) => calls.push(["toggle", plain(ids)]),
    mscItems: () => [{ key: "scene.read", kind: "hue" }],
    mscPlay: (S, it) => calls.push(["scene", it.key, plain(S.root.cmd)]),
    ...extra,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}

test("automatic: every light of the section, the ones hidden in it too, but not what this person may not see", () => {
  const w = world({});
  const sec = { devs: [{ id: "light.a", kind: "light" }, { id: "light.b", kind: "light", hide: 1 }, { id: "light.c", kind: "light" }, { id: "switch.x", kind: "switch" }, { name: "x", kind: "special" }] };
  assert.deepEqual(plain(w.masterLightIds(sec)), ["light.a", "light.b"]);
});

test("manual: the lights chosen for it, whatever section they are in, and only the ones that exist", () => {
  const w = world({});
  const sec = { mm: 1, ml: [{ id: "light.b" }, { id: "light.gone" }, { id: "light.a", n: "Desk", i: "lamp" }], devs: [{ id: "light.c", kind: "light" }] };
  assert.deepEqual(plain(w.masterLightIds(sec)), ["light.b", "light.a"]);
  assert.deepEqual(plain(w.masterMeta(sec)), { "light.a": { n: "Desk", i: "lamp" } }, "only the names and icons that were chosen");
  assert.deepEqual(plain(w.masterMeta({ devs: [] })), {}, "automatic has none");
});

test("the sync tab is there only when it is on and a plugin has a sync; with several, the chosen one", () => {
  const w = world({});
  assert.equal(w.masterSyncOf({}), null, "off");
  assert.equal(w.masterSyncOf({ msync: 1 }), "switch.sync", "the first one by default");
  assert.equal(w.masterSyncOf({ msync: 1, msyncid: "switch.other" }), "switch.sync", "a device that is not a sync is not chosen");
  assert.deepEqual(plain(w.masterSyncDevices()), ["switch.sync"]);
  const none = world({}, { pluginDeviceKind: () => null });
  assert.equal(none.masterSyncOf({ msync: 1 }), null, "no plugin, no tab");
});

test("the power button switches the lights, or runs its scene when they are off and switches them off when they are on", () => {
  const lights = world({ id: "lights", mpw: "scene", mps: "scene.read" });
  lights.masterPower("r1~lights");
  assert.deepEqual(plain(lights.calls), [["scene", "scene.read", ["light.a", "light.b"]]], "off: the scene");
  const on = world({ id: "lights", mpw: "scene", mps: "scene.read" }, { countOn: () => 2 });
  on.masterPower("r1~lights");
  assert.deepEqual(plain(on.calls), [["toggle", ["light.a", "light.b"]]], "on: off");
  const plainMode = world({ id: "lights" });
  plainMode.masterPower("r1~lights");
  assert.deepEqual(plain(plainMode.calls), [["toggle", ["light.a", "light.b"]]]);
  const missing = world({ id: "lights", mpw: "scene", mps: "scene.gone" });
  missing.masterPower("r1~lights");
  assert.deepEqual(plain(missing.calls), [["toggle", ["light.a", "light.b"]]], "a scene that is gone leaves the button switching the lights");
});

test("the section keeps its mode, chosen lights, power button and sync through the layout clean-up", () => {
  const model = read("model.js");
  const at = model.indexOf('if (k === "lights" && s.master) {\n      /* Manual');
  assert.ok(at > 0);
  const body = model.slice(at, model.indexOf("if (k === \"lights\" && s.master && Array.isArray(s.mo))", at));
  const run = (s) => {
    const o = {};
    vm.runInNewContext(`(function(s,o,k){${body}})(s,o,k)`, { s, o, k: "lights", iconOk: (i) => /^[a-z]+$/.test(i || ""), ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
    return plain(o);
  };
  assert.deepEqual(
    run({ master: 1, mm: 1, ml: [{ id: "light.a", n: " Desk ", i: "lamp" }, { id: "light.a" }, { id: "switch.x" }, { id: "light.b", i: "BAD ICON" }], mpw: "scene", mps: "scene.read", msync: 1, msyncid: "switch.sync" }),
    { mm: 1, ml: [{ id: "light.a", n: "Desk", i: "lamp" }, { id: "light.b" }], mpw: "scene", mps: "scene.read", msync: 1, msyncid: "switch.sync" }
  );
  assert.deepEqual(run({ master: 1, mpw: "other", mps: "scene.read", ml: [{ id: "light.a" }] }), {}, "automatic keeps no list, and an unknown power mode is the default");
});

test("the light panel has the sync as a page of its own, and the header has the settings and power buttons", () => {
  const panel = read("lightpanel.js");
  assert.match(panel, /if \(syncId\) modes\.push\("sync"\);/);
  assert.match(panel, /popupDef\(kind\.pop \+ ":" \+ id\)\.build\(inner\)/);
  const popups = read("popups.js");
  assert.match(popups, /if \(def\.settings && ISADMIN\)/);
  assert.match(popups, /titleSlide: true/);
  const files = JSON.parse(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8")).files;
  assert.ok(files.indexOf("app/mastersettings.js") > files.indexOf("app/scenetab.js"));
});
