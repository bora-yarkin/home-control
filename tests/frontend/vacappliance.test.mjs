// SPDX-License-Identifier: GPL-3.0-or-later
// The robot vacuum appliance (decision D-33): what Start sends, what is kept, and a battery taken from its sensor. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const slice = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to));

function world(calls = []) {
  const ctx = vm.createContext({
    H: () => ({
      entities: { "vacuum.robo": { device_id: "dev1" } },
      callService: (d, s, data) => {
        calls.push(plain([d, s, data]));
        return Promise.resolve();
      },
    }),
    apHas: (id) => id === "select.suction",
    V_: () => "auto",
    A: () => ({ options: ["auto", "boost"] }),
    dom: (id) => id.split(".")[0],
  });
  const src = read("appliancevac.js");
  ctx.setTimeout = (f) => setTimeout(f, 0);
  vm.runInContext(slice(src, "function vacapConf(", "/* One setting as the Xiaomi card"), ctx);
  return ctx;
}

const ap = {
  type: "vacuum",
  vac: {
    rooms: [{ k: "10", l: "Hall" }, { k: "11", l: "Bed" }],
    sets: [{ k: "vacuum_power", l: "Suction", o: ["quiet", "boost"] }, { k: "wash_repetitions", l: "Passes", o: ["1", "2"] }],
    run: [
      { action: "x.set_modes", data: { device_id: "$vacuum_device", room_modes: "$room_settings" } },
      { action: "x.clean", data: { device_id: "$vacuum_device", zones: "$rooms" } },
    ],
  },
};

test("Start fills the chosen rooms and settings in: a room's own choice over the one for all rooms, digits as numbers", async () => {
  const calls = [];
  const w = world(calls);
  await w.vacapStart(ap, "vacuum.robo", ["10", "11"], { vacuum_power: "quiet" }, (r) => (r === "11" ? { vacuum_power: "boost", wash_repetitions: "2" } : {}));
  assert.deepEqual(calls, [
    ["x", "set_modes", { device_id: "dev1", room_modes: { 10: { vacuum_power: "quiet" }, 11: { vacuum_power: "boost", wash_repetitions: 2 } } }],
    ["x", "clean", { device_id: "dev1", zones: ["10", "11"] }],
  ]);
});

test("with no room chosen all are sent, and an action that has nothing to say is skipped", async () => {
  const calls = [];
  await world(calls).vacapStart(ap, "vacuum.robo", [], {}, () => ({}));
  assert.deepEqual(calls, [["x", "clean", { device_id: "dev1", zones: ["10", "11"] }]]);
});

test("with no action Start starts the vacuum, and a setting bound to a select sets it first", async () => {
  const calls = [];
  await world(calls).vacapStart({ vac: { rooms: [], sets: [{ k: "s", e: "select.suction" }], run: [] } }, "vacuum.robo", [], { s: "boost" }, () => ({}));
  assert.deepEqual(calls, [
    ["select", "select_option", { entity_id: "select.suction", option: "boost" }],
    ["vacuum", "start", { entity_id: "vacuum.robo" }],
  ]);
});

test("the configuration is cleaned: bad keys, duplicates and bad actions are dropped", () => {
  const ctx = vm.createContext({});
  vm.runInContext(slice(read("model.js"), "function cleanVac(", "/* The map of a vacuum belongs"), ctx);
  const out = plain(
    ctx.cleanVac({
      rooms: [{ k: "10", l: "Hall" }, { k: "10" }, { k: "a b" }],
      sets: [{ k: "mode", l: "Mode", o: ["a", "<x>"], e: "light.x" }, { k: "bad key" }],
      run: [{ action: "x.y", data: { a: "$rooms" } }, { action: "nodot", data: {} }, { action: "x.y", data: [1] }],
    }),
  );
  assert.deepEqual(out, { rooms: [{ k: "10", l: "Hall" }], sets: [{ k: "mode", l: "Mode", o: ["a"] }], run: [{ action: "x.y", data: { a: "$rooms" } }] });
});

test("a map's touch area can pick a room, and calls nothing", () => {
  const ctx = vm.createContext({ ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
  vm.runInContext(slice(read("model.js"), "function cleanRmAct(", "  if (!a || typeof a !== \"object\" || typeof a.e") + "return null;}", ctx);
  assert.deepEqual(plain(ctx.cleanRmAct({ t: "room", r: "10", x: 1 })), { t: "room", r: "10" });
  assert.equal(ctx.cleanRmAct({ t: "room", r: "a b" }), null);
  assert.match(read("remote.js"), /if \(a\.t === "room"\) return null;/);
});

test("a vacuum's battery comes from its battery sensor when the vacuum reports none", () => {
  const src = read("devices.js");
  const states = { "sensor.robo_battery": { s: "84", a: { device_class: "battery" } }, "vacuum.robo": { a: {} } };
  const ctx = vm.createContext({
    A: (id) => states[id]?.a ?? {},
    V_: (id) => states[id]?.s ?? "",
    dom: (id) => id.split(".")[0],
    sibsOf: () => [{ entity_id: "sensor.robo_battery" }],
  });
  const at = src.indexOf("function vacBattery(");
  vm.runInContext(src.slice(at, src.indexOf("\n}", at) + 2), ctx);
  assert.equal(ctx.vacBattery("vacuum.robo"), 84);
  assert.match(read("vacuum.js"), /var l = vacBattery\(id\);/);
});

test("the vacuum appliance names no brand", () => {
  assert.doesNotMatch(read("appliancevac.js"), /dyson|roborock|dreame|xiaomi_|hass_dyson/i);
});

test("a room's own settings of a vacuum appliance are kept with the dashboard, next to the Xiaomi's numbered rooms", () => {
  const src = read("store.js");
  assert.match(src, /\[a-z0-9_\]\{1,40\}:\[A-Za-z0-9_-\]\{1,24\}/);
  assert.match(read("vacuum.js"), /\(k === "times" && v === 1\)/, "a text choice of 1 is a choice, not the Xiaomi's single pass");
});

test("a robot vacuum appliance's row is coloured as a vacuum's row is", () => {
  assert.match(read("appliance.js"), /kind: ap\.type === "vacuum" \? "clean" : "appliance"/);
  assert.match(read("scenes.js"), /if \(d\.kind === "vacuum"\) \{[\s\S]{0,120}kind: "clean"/, "the colour a vacuum's row has");
});

test("a zone slot that a zones source replaces names the source instead of saying it is not set", () => {
  const ctx = vm.createContext({ _T: (k) => k + "|", apBoundText: (id) => id });
  vm.runInContext(slice(read("appliance.js"), "function apZoneSource(", "/* What a slot is called on this appliance"), ctx);
  const zoned = { slots: { no_go: "sensor.z" }, vac: { zones: { action: "x.zones" } } };
  assert.equal(ctx.apSlotText(zoned, "no_go"), "vacap_zones_from_source|x.zones");
  assert.equal(ctx.apSlotText(zoned, "walls"), "vacap_zones_from_source|x.zones");
  assert.equal(ctx.apSlotText(zoned, "dock"), "ap_not_set|");
  assert.equal(ctx.apSlotText({ slots: { walls: "sensor.w" }, vac: {} }, "walls"), "sensor.w");
  assert.equal(ctx.apSlotText({ slots: {} }, "no_go"), "ap_not_set|");
});
