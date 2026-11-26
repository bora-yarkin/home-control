// SPDX-License-Identifier: GPL-3.0-or-later
// Status tiles in two independent places (decision D-27): the header's own list per page, and a plain Status Section whose tiles are devices. The layout 8 conversion keeps what a dashboard showed. Run: node --test tests/frontend
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
    imgOk: () => false,
    deviceGet: (k, d) => d,
    TITLES: { home: "Home" },
    uiChanged() {},
    H: () => ({ states: {}, areas: {} }),
    cleanCond: () => null,
    GL_IDS: [],
    GL_DOMS: [],
  };
  vm.createContext(sandbox);
  for (const f of ["model.js", "sections.js", "widgetkinds.js"]) vm.runInContext(read(f), sandbox, { filename: f });
  sandbox.cleanCond = () => null;
  return sandbox;
}

const tiles = [
  { l: "Temperature", id: "sensor.bora_temp", u: "°C", dp: 1 },
  { l: "Mode", id: "sensor.bora_mode", text: 1 },
];
const dashboard = (statusSection, hdrStatus) => ({
  rooms: [{ id: "bora", name: "Bora", short: "Bora", icon: "home", area: "" }],
  layout: { v: 6, home: [{ id: "clim", k: "chips" }, { id: "rooms", k: "rooms" }], rooms: { bora: [statusSection, { id: "main", k: "devs", devs: [] }] }, cols: {} },
  stat: { bora: tiles },
  chips: [{ l: "Bora", t: "sensor.bora_temp", h: "sensor.bora_hum" }],
  meta: { hdrStatus },
});

test("with the status row off, the tiles move into the Status Section as tiles of devices and the header has none", () => {
  const out = plain(world().cleanUI(dashboard({ id: "st", k: "status" }, false)));
  const sec = out.layout.rooms.bora[0];
  assert.equal(sec.k, "devs", "a plain Section");
  assert.equal(sec.t, "status");
  assert.deepEqual(sec.devs.map((d) => [d.id, d.name, d.kind, d.sz]), [["sensor.bora_temp", "Temperature", "sensor", "s"], ["sensor.bora_mode", "Mode", "sensor", "s"]]);
  assert.deepEqual(out.stat.bora ?? [], [], "the header's list is empty: the tiles are not shown twice");
  assert.equal("hdrStatus" in out.meta, false);
  assert.equal(out.layout.home.find((s) => s.id === "clim").hide, false, "the Home page's climate tiles stay where they were");
});

test("with the status row on, the tiles stay in the header, the Status Section is empty, and the Home page's climate tiles become the header's tiles of Home with the section hidden", () => {
  const out = plain(world().cleanUI(dashboard({ id: "st", k: "status", t: "Readings" }, true)));
  const sec = out.layout.rooms.bora[0];
  assert.equal(sec.t, "Readings", "a name the person gave is kept");
  assert.deepEqual(sec.devs, [], "nothing in the section: the header showed them");
  assert.deepEqual(out.stat.bora.map((t) => [t.l, t.id, t.text || 0]), [["Temperature", "sensor.bora_temp", 0], ["Mode", "sensor.bora_mode", 1]]);
  assert.deepEqual(out.stat.home.map((t) => [t.l, t.id, t.h]), [["Bora", "sensor.bora_temp", "sensor.bora_hum"]], "a climate tile is a header tile of two readings");
  assert.equal(out.layout.home.find((s) => s.id === "clim").hide, true, "the header showed them in its place, so the section is hidden until it is wanted");
});

test("a dashboard already on layout 7, with the status tiles as a widget, is converted the same way", () => {
  const widget = { kind: "widget", id: "", w: "status", wid: "wst", name: "Status tiles", icon: "thermo", wx: {} };
  const off = plain(world().cleanUI(dashboard({ id: "st", k: "devs", devs: [widget] }, false)));
  assert.deepEqual(off.layout.rooms.bora[0].devs.map((d) => d.kind), ["sensor", "sensor"]);
  const on = plain(world().cleanUI(dashboard({ id: "st", k: "devs", devs: [widget] }, true)));
  assert.deepEqual(on.layout.rooms.bora[0].devs, []);
  assert.equal(on.stat.bora.length, 2);
});

test("converting twice changes nothing, and tiles added afterwards in either place are kept apart", () => {
  const w = world();
  const once = plain(w.cleanUI(dashboard({ id: "st", k: "status" }, false)));
  const twice = plain(w.cleanUI(JSON.parse(JSON.stringify(once))));
  assert.deepEqual(twice.layout, once.layout);
  assert.deepEqual(twice.stat, once.stat);
  const both = plain(w.cleanUI({ ...JSON.parse(JSON.stringify(once)), stat: { bora: [tiles[0]] } }));
  assert.equal(both.layout.rooms.bora[0].devs.length, 2, "the Section keeps its tiles");
  assert.equal(both.stat.bora.length, 1, "and the header its own: one setting no longer decides between them");
});

test("a new room has an empty Status Section (a plain Section), and the guided setup puts the temperature and humidity of a room in its header", () => {
  const w = world();
  const room = plain(w.seedSections("room:r1"));
  assert.deepEqual(room.map((s) => [s.id, s.k]), [["status", "devs"], ["main", "devs"]]);
  assert.match(read("widgetkinds.js"), /overview\("chips"/);
  assert.doesNotMatch(read("widgetkinds.js"), /overview\("status"/, "there is no Status widget: it is a Section");
  /* the guided setup puts the chosen temperature and humidity in the room's header (app/setup.js, tests/frontend/setup.test.mjs) */
  assert.match(read("setup.js"), /ui\.stat\[rid\] = temp/);
});

test("the header's settings list the tiles of the page chosen there, to add, edit and reorder", () => {
  const header = read("header.js");
  assert.match(header, /function hdrStatusBlock\(box, redraw\)/);
  assert.match(header, /showPopup\("manage-stat-tile:" \+ pg \+ ":" \+ i, true\)/);
  assert.match(header, /addStatTile\(pg\)/);
  assert.match(header, /hdrStatusBlock\(box, function \(\) \{/);
});

test("a tile of two readings shows both, and a missing one is dropped quietly", () => {
  const status = read("status.js");
  const ctx = vm.createContext({
    svOk: () => true,
    cap: (x) => x,
    V_: () => "x",
    sv: (id, unit) => ({ "sensor.t": "21.4°", "sensor.h": "48%", "sensor.off": "Offline", "sensor.none": "–" }[id] || "?"),
  });
  vm.runInContext(status.slice(status.indexOf("function statValue("), status.indexOf("/* The status tiles of a page that the header shows")), ctx);
  assert.equal(ctx.statValue({ id: "sensor.t", u: "°" }), "21.4°");
  assert.equal(ctx.statValue({ id: "sensor.t", h: "sensor.h" }), "21.4° · 48%");
  assert.equal(ctx.statValue({ id: "sensor.off", h: "sensor.off" }), "Offline");
  assert.equal(ctx.statValue({ id: "sensor.none", h: "sensor.none" }), "–");
});
