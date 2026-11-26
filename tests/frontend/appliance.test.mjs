// SPDX-License-Identifier: GPL-3.0-or-later
// Appliances: what the layout keeps, when Start is allowed and how the time left reads. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { _T as EN_T } from "./en.mjs";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function model() {
  const context = vm.createContext({ Object, Array, ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, iconOk: () => true });
  vm.runInContext(readFileSync(new URL("model.js", APP), "utf8"), context);
  return context;
}

function page(states, attrs = {}, calls = [], format = null) {
  const context = vm.createContext({
    H: () => ({ states, ...(format ? { formatEntityState: format } : {}) }),
    V_: (id) => (states[id] ? states[id].state : ""),
    A: (id) => attrs[id] || {},
    svOk: (id) => states[id] && !["unavailable", "unknown"].includes(states[id].state),
    entVal: (id) => String(states[id] ? states[id].state : ""),
    _T: (k, v) => (v ? EN_T(k, v) : k),
    Date,
    allSectionLists: () => [],
    UI: { devs: {} },
    dom: (id) => id.split(".")[0],
    toast: (m) => calls.push(["toast", m]),
    call: (d, sv, data) => calls.push([d, sv, data.entity_id]),
    /* a button is pressed unless it is unavailable (app/remote.js says why); a script, a scene and an input button likewise */
    remoteUsable: (e) => !!states[e] && states[e].state !== "unavailable" && (states[e].state !== "unknown" || ["button", "input_button", "scene", "script"].includes(e.split(".")[0])),
    remotePress: (b) => calls.push(["press", b.e]),
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

test("Start is allowed when its entity can be reached and a bound remote-start permission says on; a button that was never pressed is reached", () => {
  const states = { "button.go": { state: "unknown" }, "binary_sensor.perm": { state: "on" } };
  const p = page(states);
  assert.equal(p.apStartGate({ slots: { start: "button.go" } }).ok, true, "a button says unknown until it is first pressed");
  assert.equal(p.apStartGate({ slots: { start: "button.go", permission: "binary_sensor.perm" } }).ok, true);
  states["binary_sensor.perm"].state = "off";
  const off = p.apStartGate({ slots: { start: "button.go", permission: "binary_sensor.perm" } });
  assert.equal(off.ok, false);
  assert.match(off.why, /ap_remote_start_is_off/, "the reason is the permission, not the button");
  states["binary_sensor.perm"].state = "unavailable";
  assert.match(p.apStartGate({ slots: { start: "button.go", permission: "binary_sensor.perm" } }).why, /ap_remote_start_cannot_be_read/);
  states["binary_sensor.perm"].state = "on";
  states["button.go"].state = "unavailable";
  assert.match(p.apStartGate({ slots: { start: "button.go" } }).why, /ap_start_is_not_available_now/);
  assert.equal(p.apStartGate({ slots: {} }).ok, false);
  states["switch.go"] = { state: "unknown" };
  assert.equal(p.apStartGate({ slots: { start: "switch.go" } }).ok, false, "a switch that does not know its state is not reached");
});

test("a program is under way when time is left or progress is between 0 and 100, whatever the appliance calls its state", () => {
  const future = new Date(Date.now() + 600000).toISOString();
  const states = {
    "sensor.left": { state: future },
    "sensor.state": { state: "preheating" },
    "sensor.progress": { state: "40" },
  };
  const attrs = { "sensor.left": { device_class: "timestamp" } };
  const p = page(states, attrs);
  const ap = (slots) => ({ slots });
  assert.equal(p.apActive(ap({ remaining: "sensor.left", state: "sensor.state" })), true);
  states["sensor.state"].state = "done";
  assert.equal(p.apActive(ap({ remaining: "sensor.left", state: "sensor.state" })), true, "the word 'done' is not read");
  states["sensor.left"].state = "unknown";
  assert.equal(p.apActive(ap({ remaining: "sensor.left", state: "sensor.state" })), false, "no program: time left is unknown");
  states["sensor.left"].state = new Date(Date.now() - 5000).toISOString();
  assert.equal(p.apActive(ap({ remaining: "sensor.left" })), false, "time ran out");
  states["sensor.left"].state = "unavailable";
  assert.equal(p.apActive(ap({ remaining: "sensor.left", progress: "sensor.progress" })), true, "time left unreadable: progress says");
  states["sensor.progress"].state = "100";
  assert.equal(p.apActive(ap({ progress: "sensor.progress" })), false);
  assert.equal(p.apActive(ap({ state: "sensor.state" })), null, "nothing to tell it by");
});

test("a state is written by Home Assistant when it can, else readable: a door is open or closed, an enum has no underscores", () => {
  const states = { "binary_sensor.door": { state: "off" }, "sensor.mode": { state: "delayed_start" }, "binary_sensor.plain": { state: "on" } };
  const attrs = { "binary_sensor.door": { device_class: "door" } };
  const p = page(states, attrs);
  assert.equal(p.apStateText("binary_sensor.door"), "ap_closed");
  states["binary_sensor.door"].state = "on";
  assert.equal(p.apStateText("binary_sensor.door"), "ap_open");
  assert.equal(p.apStateText("sensor.mode"), "delayed start");
  assert.equal(p.apStateText("binary_sensor.plain"), "on", "a binary sensor of no known class reads as the dashboard writes it");
  const said = page(states, attrs, [], () => "Geschlossen");
  assert.equal(said.apStateText("binary_sensor.door"), "Geschlossen", "Home Assistant's own words win");
  states["sensor.mode"].state = "unavailable";
  assert.equal(p.apStateText("sensor.mode"), "ap_not_available");
});

test("the list row shows the time left only while a program is under way, otherwise the state", () => {
  const future = new Date(Date.now() + 1800000).toISOString();
  const states = { "sensor.left": { state: future }, "sensor.state": { state: "Rinsing" } };
  const p = page(states, { "sensor.left": { device_class: "timestamp" } });
  const asRow = (slots) => (vm.runInContext("pill = function (i, n, o) { return o; }", p), p.apRow({ icon: "plug", name: "x", aid: "a", ap: { slots, extra: [] } }).val());
  assert.match(asRow({ state: "sensor.state", remaining: "sensor.left" }), /^(29|30) min$/, "Rinsing is not a word to match: time is left");
  states["sensor.left"].state = "unknown";
  assert.equal(asRow({ state: "sensor.state", remaining: "sensor.left" }), "Rinsing");
});

test("Start and Stop on a switch turn it on and off instead of toggling; a button is pressed; an unavailable one says so", () => {
  const calls = [];
  const states = { "switch.start": { state: "off" }, "button.go": { state: "unknown" }, "script.dead": { state: "unavailable" } };
  const p = page(states, {}, calls);
  p.apAct("switch.start", "start");
  p.apAct("switch.start", "stop");
  p.apAct("button.go", "start");
  p.apAct("script.dead", "start");
  assert.deepEqual(calls, [["switch", "turn_on", "switch.start"], ["switch", "turn_off", "switch.start"], ["press", "button.go"], ["toast", "rm_not_available_right_now"]]);
});

test("a duration reads in hours and minutes from the entity's own unit", () => {
  const p = page({});
  assert.equal(p.apDurationText(1800, "s"), "30 min");
  assert.equal(p.apDurationText(90, "min"), "1 h 30 min");
  assert.equal(p.apDurationText(2, "h"), "2 h");
  assert.equal(p.apDurationText(0, "s"), "0 min");
  assert.equal(p.apSpan(3599), "1 h");
});

test("an appliance keeps its current-temperature slot, and two made in the same millisecond have different keys", () => {
  const a = plain(model().cleanAppliance({ type: "oven", slots: { current: "sensor.t", temperature: "number.t" } }));
  assert.deepEqual(a.slots, { current: "sensor.t", temperature: "number.t" });
  const src = readFileSync(new URL("widgets.js", APP), "utf8");
  const code = src.slice(src.indexOf("function newKey"), src.indexOf("function imgOk"));
  const ctx = vm.createContext({ Date: { now: () => 1700000000000 }, Math });
  vm.runInContext(code, ctx);
  const keys = new Set(Array.from({ length: 200 }, () => ctx.newKey("ap")));
  assert.equal(keys.size, 200);
  assert.ok([...keys].every((k) => /^[a-z0-9_-]{1,24}$/.test(k)));
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

test("an appliance keeps up to 40 rows with a group heading and a show-on-the-page mark, the new types, the level slot, names given to slots, and an optional grid of buttons", () => {
  const m = model();
  const rows = Array.from({ length: 50 }, (_, i) => ({ e: "switch.s" + i, l: "Row " + i, g: i === 0 ? "  Screen  " : i === 1 ? "x".repeat(40) : "", o: i === 2 ? 1 : 0 }));
  const a = plain(m.cleanAppliance({ type: "projector", slots: { level: "select.picture", program: "select.source", temperature: "light.no" }, extra: rows, names: { program: "Source", level: "x".repeat(40), bogus: "no", state: "  " } }));
  assert.equal(a.type, "projector");
  assert.deepEqual(a.slots, { program: "select.source", level: "select.picture" });
  assert.equal(a.extra.length, 40);
  assert.equal(a.extra[0].g, "Screen");
  assert.equal(a.extra[1].g.length, 24);
  assert.deepEqual([a.extra[2].o, "o" in a.extra[3], "g" in a.extra[3]], [1, false, false]);
  assert.deepEqual(a.names, { program: "Source", level: "x".repeat(24) });
  for (const t of ["coffee", "fridge", "other"]) assert.equal(m.cleanAppliance({ type: t }).type, t);
  assert.equal(m.cleanAppliance({ type: "toaster" }).type, "other");
});

test("an appliance device keeps the grid of buttons made for it, and drops an empty one", () => {
  const m = model();
  const dev = (rm) => m.cleanDev({ id: "", aid: "ap1", name: "Projector", icon: "media", kind: "appliance", ap: { type: "projector", slots: {}, extra: [] }, ...(rm ? { rm } : {}) });
  const kept = plain(dev({ cols: 6, btns: [{ a: { t: "key", e: "remote.ir", c: "UP" }, s: 2, h: 3 }] }));
  assert.equal(kept.rm.btns.length, 1);
  assert.equal(kept.rm.btns[0].a.c, "UP");
  assert.equal("rm" in plain(dev({ cols: 4, btns: [] })), false);
  assert.equal("rm" in plain(dev()), false);
});
