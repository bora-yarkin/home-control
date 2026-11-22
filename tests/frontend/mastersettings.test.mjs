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
  const states = { "light.a": {}, "light.b": {}, "light.c": {}, "light.g": {}, "light.h": {}, "switch.sync": {}, "switch.other": {} };
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

test("the lights row follows the circle (a group is one tile until it is separated) when the master has that on, and has every light otherwise", () => {
  const panel = read("lightpanel.js");
  assert.match(panel, /S\.groupTiles = !!o\.groups;/);
  assert.match(panel, /lpState\(root, colorOk && whiteOk, !!o\.groups\)/);
  assert.match(panel, /var list = S\.maker \? lpVisible\(S\)\.slice\(\) : S\.hier \? lpTrayUnits\(S\) : lpLeaves\(S\.root\);/);
  assert.match(panel, /if \(S\.hier\) lpHierInit\(S, root\);\s*else lpAutoSplit\(S, root\);/, "a group is not opened by itself, however its lights look");
  assert.match(read("lights.js"), /groups: !!\(masterSec\(sid\) \|\| \{\}\)\.mgl,/);
  assert.match(src, /flagPill\("lights", _T\("master_groups_as_one"\), sec, "mgl"/);
});

test("manual: the lights chosen for it, whatever section they are in, and only the ones that exist", () => {
  const w = world({});
  const sec = { mm: 1, ml: [{ id: "light.b", name: "B", icon: "light", kind: "light" }, { id: "light.gone", name: "G", icon: "light", kind: "light" }, { id: "light.a", name: "Desk", icon: "lamp", kind: "light" }], devs: [{ id: "light.c", kind: "light" }] };
  assert.deepEqual(plain(w.masterLightIds(sec)), ["light.b", "light.a"]);
  assert.deepEqual(plain(w.masterMeta(sec)), { "light.b": { n: "B", i: "light" }, "light.gone": { n: "G", i: "light" }, "light.a": { n: "Desk", i: "lamp" } }, "the name and icon of each light, as its device popup keeps them");
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
    // cleanDev is the dashboard's own check of a device (model.js); here it only has to refuse what has no name or is not a light.
    const cleanDev = (d) => (d && typeof d.name === "string" && d.name && /^[a-z_]+\.[a-z0-9_]+$/.test(d.id) ? { id: d.id, name: d.name, icon: /^[a-z]+$/.test(d.icon || "") ? d.icon : "plug", kind: d.kind } : null);
    vm.runInNewContext(`(function(s,o,k){${body}})(s,o,k)`, { s, o, k: "lights", cleanDev, ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
    return plain(o);
  };
  assert.deepEqual(
    run({ master: 1, mm: 1, ml: [{ id: "light.a", name: "Desk", icon: "lamp", kind: "light" }, { id: "light.a", name: "Again", kind: "light" }, { id: "switch.x", name: "Plug", kind: "switch" }, { id: "light.b", n: "Bed", i: "bed" }, { id: "light.c" }], mpw: "scene", mps: "scene.read", msync: 1, msyncid: "switch.sync", mhl: 1, mhs: 1, mgl: 1, mtab: "scenes" }),
    { mm: 1, ml: [{ id: "light.a", name: "Desk", icon: "lamp", kind: "light" }, { id: "light.b", name: "Bed", icon: "bed", kind: "light" }, { id: "light.c", name: "c", icon: "light", kind: "light" }], mgl: 1, mtab: "scenes", mhl: 1, mhs: 1, mpw: "scene", mps: "scene.read", msync: 1, msyncid: "switch.sync" }
  );
  assert.deepEqual(run({ master: 1, mpw: "other", mps: "scene.read", ml: [{ id: "light.a" }] }), {}, "automatic keeps no list, and an unknown power mode is the default");
});

test("a section can leave out the master's lights or its sync, only in the section, and a light of a manual master is edited in the device popup", () => {
  const sections = read("sections.js");
  assert.match(sections, /!ed && k === "lights" && d\.id && masterLeavesOut\(s, d\)/, "everything is shown while the page is edited");
  assert.match(sections, /if \(!rows\.length && !ed && !\(s\.master && mids\.length > 1\) && !extras\.length\) return null;/, "a master that has hidden every row of its section is still the section");
  assert.match(read("manage.js"), /rid\.split\("~"\)\[3\] === "ml"/);
  assert.match(src, /devEditor\("~" \+ scope \+ "~" \+ sec\.id \+ "~ml", own\[n\.key\]\)/);
  assert.doesNotMatch(src, /masterLightPage/);
});

test("a lights master can open on a tab of its own, only when that tab is there and the panel is not coming back to a page", () => {
  const panel = read("lightpanel.js");
  assert.match(panel, /var ref0 = S\.restore \? null : mscSection\(root\),\s*want = ref0 \? ref0\.e\.mtab : "";\s*if \(want && modes\.indexOf\(want\) >= 0\) S\.mode = want;/);
  assert.match(src, /_T\("master_open_tab"\)/);
  const model = read("model.js");
  assert.match(model, /\["color", "white", "fx", "scenes", "sync"\]\.indexOf\(s\.mtab\) >= 0/);
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
