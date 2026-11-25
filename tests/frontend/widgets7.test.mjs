// SPDX-License-Identifier: GPL-3.0-or-later
// Layout 7 (decision D-25): the sections that were not plain Sections become plain Sections with widgets and sized devices. Run: node --test tests/frontend
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
    GL_IDS: ["lights", "acs", "fans", "batteries", "media", "robot"],
    GL_DOMS: ["light", "switch", "sensor"],
  };
  vm.createContext(sandbox);
  for (const f of ["model.js", "sections.js", "widgetkinds.js"]) vm.runInContext(read(f), sandbox, { filename: f });
  const pins = read("pins.js");
  vm.runInContext(pins.slice(0, pins.indexOf("function pinKey")), sandbox, { filename: "pins.js" });
  sandbox.cleanCond = () => null;
  return sandbox;
}

const dev = (id, kind, extra = {}) => ({ id, name: id, icon: "plug", kind, ...extra });

test("a note section is a plain Section with a note widget, keeping its name and icon", () => {
  const out = plain(world().cleanLayout([{ id: "n1", k: "note", t: "Reminder", i: "info", txt: "Bins on Tuesday" }]));
  assert.equal(out[0].k, "devs");
  assert.equal(out[0].t, "Reminder");
  assert.equal(out[0].txt, undefined, "the text moved onto the widget");
  assert.deepEqual(out[0].devs.map((d) => [d.kind, d.w, d.wx.txt]), [["widget", "note", "Bins on Tuesday"]]);
});

test("a readings section keeps its sensors, each now a tile, and its hidden ones stay hidden", () => {
  const out = plain(world().cleanLayout([{ id: "r1", k: "read", devs: [dev("sensor.a", "sensor"), dev("sensor.b", "sensor", { hide: 1 })] }]));
  assert.equal(out[0].k, "devs");
  assert.equal(out[0].t, "readings");
  assert.deepEqual(out[0].devs.map((d) => [d.id, d.sz, !!d.hide]), [["sensor.a", "s", false], ["sensor.b", "s", true]]);
});

test("a chart section is a chart widget with its sensors (at most four, once each) and its range", () => {
  const sensors = ["a", "b", "c", "d", "e"].map((x) => dev("sensor." + x, "sensor"));
  const out = plain(world().cleanLayout([{ id: "c1", k: "chart", r: "7d", devs: [...sensors, dev("sensor.a", "sensor")] }]));
  const [w] = out[0].devs;
  assert.equal(w.kind, "widget");
  assert.equal(w.w, "chart");
  assert.deepEqual(w.wx.ds.map((s) => s.id), ["sensor.a", "sensor.b", "sensor.c", "sensor.d"]);
  assert.equal(w.wx.r, "7d");
  assert.equal(out[0].r, undefined);
});

test("a camera section's cameras are shown live (size l), and the layout is marked version 7", () => {
  const w = world();
  const out = plain(w.cleanLayout([{ id: "k1", k: "camera", devs: [dev("camera.door", "camera")] }]));
  assert.equal(out[0].devs[0].sz, "l");
  assert.equal(plain(w.cleanUI({ rooms: [], layout: { v: 6, home: [], rooms: {} } })).layout.v, 7);
});

test("security, cameras and energy sections are plain Sections with their widget, and the price and currency of energy move onto it", () => {
  const out = plain(world().cleanLayout([
    { id: "s1", k: "security" },
    { id: "s2", k: "cameras", t: "All cameras" },
    { id: "s3", k: "energy", price: 0.25, cur: "€" },
  ]));
  assert.deepEqual(out.map((s) => [s.k, s.devs[0].w]), [["devs", "security"], ["devs", "cameras"], ["devs", "energy"]]);
  assert.equal(out[1].t, "All cameras", "a name the person gave is kept");
  assert.deepEqual(out[2].devs[0].wx, { price: 0.25, cur: "€" });
  assert.equal(out[2].price, undefined);
  const bad = plain(world().cleanLayout([{ id: "s3", k: "energy", price: -4, cur: "toolong" }]));
  assert.deepEqual(bad[0].devs[0].wx, {}, "a price that is not a positive number, and a long currency, are dropped");
});

test("the overview sections are plain Sections with their widget, and what they kept moves onto it", () => {
  const out = plain(world().cleanLayout([
    { id: "a1", k: "alerts" },
    { id: "g1", k: "glance", gl: { o: ["media", "lights"], h: ["robot", "bogus"], c: [], lm: ["home~mx"] } },
    { id: "p1", k: "pinned", lay: "grid3", pins: [{ id: "light.a", name: "A", icon: "lights", room: "" }] },
    { id: "l1", k: "link", ref: "home:g1" },
    { id: "r1", k: "rooms", t: "Where" },
    { id: "n1", k: "now" },
    { id: "s1", k: "status" },
    { id: "c1", k: "chips" },
  ]));
  assert.deepEqual(out.map((s) => s.devs[0].w), ["alerts", "glance", "pinned", "link", "rooms", "now", "status", "chips"]);
  assert.deepEqual(out[1].devs[0].wx.gl, { o: ["media", "lights"], h: ["robot"], c: [], lm: ["home~mx"] }, "an unknown tile is dropped");
  assert.equal(out[2].devs[0].wx.lay, "grid3");
  assert.equal(out[2].devs[0].wx.pins[0].id, "light.a");
  assert.equal(out[2].lay, undefined);
  assert.equal(out[3].devs[0].wx.ref, "home:g1");
  assert.equal(out[4].t, "Where");
  const bad = plain(world().cleanLayout([{ id: "l2", k: "link", ref: "../../etc" }]));
  assert.deepEqual(bad[0].devs[0].wx, {}, "a reference that is not page:section is dropped");
});

test("an overview widget is the whole of its Section when it is alone (drawn as it always was), and a Section of several things draws it as a sub-section", () => {
  const w = world();
  assert.equal(w.widgetAlone({ devs: [{ kind: "widget", w: "rooms" }] }).w, "rooms");
  assert.equal(w.widgetAlone({ devs: [{ kind: "widget", w: "rooms" }, { kind: "light" }] }), null);
  assert.equal(w.widgetAlone({ devs: [{ kind: "widget", w: "note" }] }), null, "a note has no section of its own");
  assert.equal(w.secIsWide({ devs: [{ kind: "widget", w: "alerts" }] }), true);
  assert.equal(w.secIsWide({ devs: [{ kind: "widget", w: "rooms" }] }), false, "Rooms was never full width");
});

test("what is not valid is dropped, not kept half made: an unknown widget type, a size the type does not have, a widget with an entity", () => {
  const out = plain(
    world().cleanLayout([
      {
        id: "s1",
        k: "devs",
        devs: [
          { kind: "widget", id: "", w: "nonsense", name: "X", icon: "info", wx: {} },
          { kind: "widget", id: "light.a", w: "note", name: "X", icon: "info", wx: {} },
          { kind: "widget", id: "", w: "note", name: "Note", icon: "info", wx: { txt: "ok" }, sz: "xs" },
          { kind: "widget", id: "", w: "note", name: "Note 2", icon: "info", wx: { txt: "ok" }, sz: "l" },
          dev("light.b", "light", { sz: "s" }),
        ],
      },
    ]),
  );
  assert.deepEqual(out[0].devs.map((d) => [d.name, d.sz]), [["Note", undefined], ["Note 2", "l"], ["light.b", undefined]]);
});

test("a widget's size is the one saved when its type has it, else its own; a device is a row unless its kind can take another size", () => {
  const w = world();
  assert.equal(w.sizeOf({ kind: "widget", w: "chart" }), "m");
  assert.equal(w.sizeOf({ kind: "widget", w: "chart", sz: "l" }), "l");
  assert.equal(w.sizeOf({ kind: "widget", w: "chart", sz: "xs" }), "m");
  assert.equal(w.sizeOf({ kind: "sensor", sz: "xs" }), "xs");
  assert.equal(w.sizeOf({ kind: "light", sz: "s" }), "row");
  assert.equal(w.secIsWide({ devs: [{ kind: "widget", w: "note", sz: "s" }] }), false);
  assert.equal(w.secIsWide({ devs: [{ kind: "widget", w: "chart" }] }), true);
});

test("the Add lists offer every widget type, and a widget's settings and drawing are the type's own", () => {
  assert.match(read("addpopup.js"), /Object\.keys\(WIDGETS\)/);
  assert.match(read("manage.js"), /widgetSettings\(c\)/);
  assert.match(read("scenes.js"), /d\.kind === "widget"\) return widgetRow/);
  assert.match(read("../version.json"), /app\/widgetkinds\.js/);
});
