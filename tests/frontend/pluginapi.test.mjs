// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin API (app/pluginapi.js): what docs/plugin-api.md documents is what window.HomeControl has, every function is looked up when it is called, and registering
// puts pages, settings categories, area hooks and texts where the dashboard reads them. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const DOCS = readFileSync(new URL("../../docs/plugin-api.md", import.meta.url), "utf8");

function page(extra = {}) {
  const log = [];
  const sandbox = {
    window: {},
    EN: { existing: "kept" },
    CATS: [["appearance"], ["data"]],
    STG_INDEX: [],
    _T: (k) => `T:${k}`,
    EAD: null,
    ISADMIN: true,
    SHEET: "sheet-1",
    POPGUARD: null,
    ...extra,
  };
  sandbox.window = sandbox; // a browser's window is its global scope
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("pluginapi.js", APP), "utf8"), sandbox);
  return { sandbox, log, HC: sandbox.window.HomeControl };
}

const documented = ["version", "hass", "attrs", "state", "isOn", "registry", "isAdmin", "call", "callRaw", "toggle", "toast", "refresh", "el", "icon", "row", "count", "confirm", "open", "back", "closeLayer", "guard", "popGuard", "sheet", "t", "addStrings", "registerPage", "registerSettings", "registerAreaHooks"];
const documentedAreas = ["open", "openExternal", "editor", "rebuild", "roomLights", "clamp", "identifyOff"];

test("the API has what the documentation lists, and nothing it does not", () => {
  const { HC } = page();
  assert.deepEqual(Object.keys(HC).filter((k) => k !== "areas").sort(), [...documented].sort());
  assert.deepEqual(Object.keys(HC.areas).sort(), [...documentedAreas].sort());
  for (const name of [...documented, ...documentedAreas.map((n) => `areas.${n}`)]) assert.ok(DOCS.includes(name.replace("areas.", "")), `${name} is not in docs/plugin-api.md`);
  assert.equal(HC.version, 1);
});

test("a function is looked up when it is called, so the order the files load in does not matter", () => {
  const { sandbox, HC } = page();
  assert.doesNotThrow(() => HC.toast); // reading it before the dashboard defines `toast` is fine
  const calls = [];
  sandbox.toast = (text) => calls.push(text);
  HC.toast("later");
  assert.deepEqual(calls, ["later"]);
});

test("what the dashboard keeps in variables is read when it is asked, and the guard can be set", () => {
  const { sandbox, HC } = page();
  assert.equal(HC.isAdmin, true);
  sandbox.ISADMIN = false;
  assert.equal(HC.isAdmin, false);
  assert.equal(HC.sheet, "sheet-1");
  HC.popGuard = { x: 1 };
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.POPGUARD)), { x: 1 });
});

test("registering a page, a settings category, an area plugin and texts puts them where the dashboard reads them", () => {
  const { sandbox, HC } = page();
  const build = () => {};
  HC.registerPage("gv-home", "gv_title", "lights", build);
  assert.equal(sandbox.PLUGIN_PAGES["gv-home"][0], "gv_title");
  assert.equal(sandbox.PLUGIN_PAGES["gv-home"][2], build);
  HC.registerSettings({ id: "govee", title: "gv_title", icon: "lights", page: "gv-home", keywords: "govee strips" });
  assert.deepEqual(plain(sandbox.CATS.map((c) => c[0])), ["appearance", "govee", "data"], "before Backup and about, which stays last");
  assert.deepEqual(plain(sandbox.CATS[1].slice(0, 4)), ["govee", "T:gv_title", "gv-home", "lights"]);
  assert.equal(sandbox.STG_INDEX[0][1], "govee strips");
  HC.registerAreaHooks("govee_plus", { lights: () => [] });
  assert.deepEqual(plain(Object.keys(sandbox.PLUGIN_AREA)), ["govee_plus"]);
  HC.addStrings({ gv_title: "Govee Plus", existing: "replaced?" });
  assert.equal(sandbox.EN.gv_title, "Govee Plus");
  assert.equal(sandbox.EN.existing, "kept", "a text that exists is not replaced");
});

test("an area a plugin owns is edited with its hooks, and the hooks of every plugin are asked for the rest", () => {
  const { sandbox, HC } = page({ showPopup: () => {} });
  const seen = [];
  HC.registerAreaHooks("a", { importRow: (box, room) => seen.push(["a", box, room]), save: () => "saved by a" });
  HC.registerAreaHooks("b", { importRow: (box, room) => seen.push(["b", box, room]) });
  sandbox.pluginAreaEach("importRow", "BOX", "living");
  assert.deepEqual(plain(seen), [["a", "BOX", "living"], ["b", "BOX", "living"]]);
  HC.areas.openExternal("a", { id: "x", lights: [] }, { id: "x", note: "n" });
  assert.equal(sandbox.EAD.external.plugin, "a");
  assert.equal(sandbox.EAD.external.note, "n");
  assert.equal(sandbox.pluginAreaOwner().save(), "saved by a");
  sandbox.EAD = null;
  assert.deepEqual(plain(sandbox.pluginAreaOwner()), {}, "no area, no owner");
});

test("a plugin's script is loaded once, for administrators, and only from its own static folder", async () => {
  const added = [];
  const { sandbox } = page({
    HA: { plugins: () => Promise.resolve([{ id: "hue_plus", menu: "/hue_plus_static/menu.js", version: "1.2" }, { id: "evil", menu: "https://evil.example/x.js" }, { id: "up", menu: "/up_static/../x.js" }, { id: "hue_plus", menu: "/hue_plus_static/menu.js" }]) },
    document: { createElement: () => ({}), head: { appendChild: (s) => added.push(s.src) } },
  });
  sandbox.pluginsLoad();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(added, ["/hue_plus_static/menu.js?v=1.2"]);
  sandbox.ISADMIN = false;
  sandbox.PLUGINS_LOADED = {};
  sandbox.pluginsLoad();
  await new Promise((r) => setImmediate(r));
  assert.equal(added.length, 1, "nothing is loaded for someone who is not an administrator");
});
