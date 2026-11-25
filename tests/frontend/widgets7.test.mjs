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
  };
  vm.createContext(sandbox);
  for (const f of ["model.js", "sections.js", "widgetkinds.js"]) vm.runInContext(read(f), sandbox, { filename: f });
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
