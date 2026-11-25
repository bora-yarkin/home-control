// SPDX-License-Identifier: GPL-3.0-or-later
// The home screen widgets (decision D-25, app/homewidgets.js): what each keeps of its settings, and the rules of the registry. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function world() {
  const sandbox = {
    _T: (k) => k,
    window: {},
    document: { getElementById: () => null, querySelector: () => null },
    iconOk: (n) => typeof n === "string" && !!n,
    deviceGet: (k, d) => d,
    TITLES: { home: "Home" },
    uiChanged() {},
    H: () => ({ states: {}, areas: {} }),
    cleanCond: () => null,
    GL_IDS: [],
    GL_DOMS: [],
  };
  vm.createContext(sandbox);
  for (const f of ["model.js", "sections.js", "widgetkinds.js", "homewidgets.js"]) vm.runInContext(read(f), sandbox, { filename: f });
  const pins = read("pins.js");
  vm.runInContext(pins.slice(0, pins.indexOf("function pinKey")), sandbox, { filename: "pins.js" });
  return sandbox;
}

const clean = (w, type, wx) => plain(w.widgetDef(type).clean(wx));

test("a widget keeps the entity it is about only when it is the right kind of entity", () => {
  const w = world();
  for (const [type, ok, bad] of [
    ["clock", "weather.home", "light.lamp"],
    ["nowplaying", "media_player.tv", "light.lamp"],
    ["snapshot", "camera.door", "media_player.tv"],
    ["vacuum", "vacuum.robot", "camera.door"],
    ["ring", "sensor.power", "switch.plug"],
    ["sparkline", "sensor.temp", "light.lamp"],
    ["agenda", "calendar.family", "todo.shopping"],
    ["todo", "todo.shopping", "calendar.family"],
  ]) {
    assert.deepEqual(clean(w, type, { id: ok }), { id: ok }, type + " keeps " + ok);
    assert.deepEqual(clean(w, type, { id: bad }), {}, type + " drops " + bad);
    assert.deepEqual(clean(w, type, { id: "../../etc" }), {}, type + " drops what is not an entity id");
    assert.deepEqual(clean(w, type, { id: 7 }), {}, type + " drops what is not a string");
  }
});

test("the ring's maximum and the sparkline's range are bounded", () => {
  const w = world();
  assert.deepEqual(clean(w, "ring", { id: "sensor.p", max: 3000 }), { id: "sensor.p", max: 3000 });
  for (const bad of [0, -5, "x", 1e9, Infinity, null]) assert.equal("max" in clean(w, "ring", { id: "sensor.p", max: bad }), false, String(bad));
  assert.equal(clean(w, "sparkline", { id: "sensor.t", r: "7d" }).r, "7d");
  assert.equal("r" in clean(w, "sparkline", { id: "sensor.t", r: "30d" }), false, "a month of raw points is too much for a small curve");
});

test("a folder holds at most twelve devices and scenes, once each, of the kinds a tap can run or toggle", () => {
  const w = world();
  const many = Array.from({ length: 20 }, (_, i) => "light.l" + i);
  assert.equal(clean(w, "folder", { ids: many }).ids.length, 12);
  assert.deepEqual(clean(w, "folder", { ids: ["light.a", "light.a", "scene.x", "lock.front", "climate.ac", "script.go", "bad", 3] }).ids, ["light.a", "scene.x", "script.go"]);
  assert.deepEqual(clean(w, "folder", {}), { ids: [] });
});

test("a stack holds at most five widgets of its own kind of content, never a stack, an overview or a lights master", () => {
  const w = world();
  const item = (type, wx = {}) => ({ kind: "widget", id: "", w: type, name: type, icon: "info", wx });
  const out = clean(w, "stack", {
    items: [
      item("note", { txt: "a" }),
      item("stack", { items: [] }),
      item("alerts"),
      item("lmaster", { id: "x" }),
      item("nowplaying", { id: "media_player.tv" }),
      item("nowplaying", { id: "light.bad" }),
      item("chart"), item("agenda"), item("todo"),
    ],
  });
  assert.deepEqual(out.items.map((i) => i.w), ["note", "nowplaying", "nowplaying", "chart", "agenda"], "five at most, and the three that cannot be in a stack are left out");
  assert.deepEqual(out.items[2].wx, {}, "what a widget in a stack keeps is what it would keep alone");
  assert.equal(out.items.every((i) => /^[a-z][a-z0-9_]{1,14}$/.test(i.wid)), true, "each has an id");
});

test("every widget type has a name, an icon, a description and a default size among its sizes (the lights master is a row)", () => {
  const w = world();
  const names = Object.keys(w.WIDGETS);
  for (const k of ["note", "chart", "security", "cameras", "energy", "alerts", "rooms", "now", "status", "chips", "glance", "pinned", "link", "lmaster", "clock", "nowplaying", "snapshot", "vacuum", "ring", "sparkline", "agenda", "todo", "folder", "stack"])
    assert.ok(names.includes(k), k + " is registered");
  for (const k of names) {
    const f = w.WIDGETS[k];
    assert.ok(f.title && f.icon, k + " has a name and an icon");
    assert.equal(typeof f.clean, "function", k);
    assert.ok(typeof f.draw === "function" || typeof f.section === "function", k + " can be drawn");
    if (k === "lmaster") assert.equal(f.size, "row");
    else assert.ok(f.sizes.includes(f.size), k + "'s default size is one of its sizes");
    for (const z of f.sizes) assert.ok(w.WSIZES.includes(z), k + " size " + z);
  }
});

test("the new widgets are in the Add lists by being in the registry, and their files and styles are shipped", () => {
  const files = JSON.parse(read("../version.json")).files;
  assert.ok(files.includes("app/homewidgets.js") && files.indexOf("app/homewidgets.js") > files.indexOf("app/widgetkinds.js"));
  const css = readFileSync(new URL("../dashboard.css", APP), "utf8");
  for (const c of [".wc.np", ".wc.ringw", ".wc.fold", ".wc.stk", ".wc.agenda"]) assert.ok(css.includes(c), c);
  assert.match(read("popups.js"), /"wfolder": function \(id\)/);
  assert.match(readFileSync(new URL("../ha-adapter.js", APP), "utf8"), /calendar:\{events:/);
});
