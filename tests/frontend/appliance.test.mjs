// SPDX-License-Identifier: GPL-3.0-or-later
// Appliances: what the layout keeps, when Start is allowed and how the time left reads. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function model() {
  const context = vm.createContext({ Object, Array, ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, iconOk: () => true });
  vm.runInContext(readFileSync(new URL("model.js", APP), "utf8"), context);
  return context;
}

function page(states, attrs = {}) {
  const context = vm.createContext({
    H: () => ({ states }),
    V_: (id) => (states[id] ? states[id].state : ""),
    A: (id) => attrs[id] || {},
    svOk: (id) => states[id] && !["unavailable", "unknown"].includes(states[id].state),
    entVal: (id) => String(states[id] ? states[id].state : ""),
    _T: (k) => k,
    Date,
    allSectionLists: () => [],
    UI: { devs: {} },
  });
  vm.runInContext(readFileSync(new URL("appliance.js", APP), "utf8"), context);
  return context;
}

test("an appliance keeps only known slots filled with entities that fit, and at most 12 labelled extra rows", () => {
  const a = plain(
    model().cleanAppliance({
      type: "washer",
      slots: { program: "select.p", temperature: "sensor.nope", start: "button.go", door: "binary_sensor.d", bogus: "select.x", stop: "not an id" },
      extra: [{ e: "number.spin", l: "Spin" }, { e: "light.lamp" }, { e: "switch.i_dos", l: "x".repeat(60) }],
    })
  );
  assert.equal(a.type, "washer");
  assert.deepEqual(a.slots, { program: "select.p", start: "button.go", door: "binary_sensor.d" });
  assert.deepEqual(a.extra.map((x) => x.e), ["number.spin", "switch.i_dos"]);
  assert.equal(a.extra[1].l.length, 30);
  assert.deepEqual(plain(model().cleanAppliance(null)), { type: "other", slots: {}, extra: [] });
});

test("Start is allowed only when it can be reached and a bound remote-start permission says on", () => {
  const states = { "button.go": { state: "unknown" }, "binary_sensor.perm": { state: "on" } };
  states["button.go"].state = "2026-01-01T00:00:00";
  const p = page(states);
  assert.equal(p.apStartGate({ slots: { start: "button.go" } }).ok, true);
  assert.equal(p.apStartGate({ slots: { start: "button.go", permission: "binary_sensor.perm" } }).ok, true);
  states["binary_sensor.perm"].state = "off";
  const off = p.apStartGate({ slots: { start: "button.go", permission: "binary_sensor.perm" } });
  assert.equal(off.ok, false);
  assert.match(off.why, /ap_remote_start_is_off/);
  states["binary_sensor.perm"].state = "unavailable";
  assert.equal(p.apStartGate({ slots: { start: "button.go", permission: "binary_sensor.perm" } }).ok, false);
  states["button.go"].state = "unavailable";
  assert.equal(p.apStartGate({ slots: { start: "button.go" } }).ok, false);
  assert.equal(p.apStartGate({ slots: {} }).ok, false);
});

test("the time left reads from a timestamp or a duration, and says nothing it does not know", () => {
  const soon = new Date(Date.now() + 72 * 60 * 1000).toISOString();
  const states = { "sensor.end": { state: soon }, "sensor.secs": { state: "5400" }, "sensor.gone": { state: "unavailable" }, "sensor.past": { state: new Date(Date.now() - 1000).toISOString() }, "sensor.plain": { state: "12" } };
  const p = page(states, { "sensor.end": { device_class: "timestamp" }, "sensor.secs": { device_class: "duration", unit_of_measurement: "s" }, "sensor.past": { device_class: "timestamp" } });
  assert.match(p.apLeft("sensor.end"), /^1 h (11|12) min$/);
  assert.equal(p.apLeft("sensor.secs"), "1 h 30 min");
  assert.equal(p.apLeft("sensor.gone"), "–");
  assert.equal(p.apLeft("sensor.past"), "ap_now");
  assert.equal(p.apLeft("sensor.plain"), "12");
});
