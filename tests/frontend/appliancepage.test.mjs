// SPDX-License-Identifier: GPL-3.0-or-later
// The appliance popup per type (app/appliance.js): an oven gets a dial for its temperature, a washer, dryer or dishwasher a ring of the cycle, any other appliance chips and a bar;
// what the dial and the ring say follows what the appliance reports. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));

/* appliance.js on a pretend page; apDial, glance and the rows are replaced by recorders so the popup's makeup can be read. */
function popup(type, slots, states, attrs = {}, extra = []) {
  const log = { dials: [], chips: [], rows: [], bars: 0, actions: 0, tiles: [], folds: [], order: [], chipEls: [] };
  const el = () => ({ children: [], style: {}, classList: { toggle() {}, add() {} }, appendChild(x) { this.children.push(x); return x; }, setAttribute() {} });
  const d = { kind: "appliance", aid: "a1", name: "X", ap: { type, slots, extra } };
  const sandbox = {
    H: () => ({ states }),
    V_: (id) => (states[id] ? states[id].state : ""),
    A: (id) => attrs[id] || {},
    svOk: (id) => states[id] && !["unavailable", "unknown"].includes(states[id].state),
    entVal: (id) => String(states[id] ? states[id].state : ""),
    dom: (id) => id.split(".")[0],
    _T: (k) => k,
    Date,
    ISADMIN: false,
    allSectionLists: () => [],
    UI: { devs: { r: [d] } },
    mk: el,
    reg() {},
    call() {},
    toast() {},
    remoteUsable: () => true,
    remotePress() {},
    apDial: (o) => (log.order.push("dial"), log.dials.push(o), el()),
    glance: (items) => {
      const e = el();
      log.order.push("chips");
      log.chips.push(items);
      log.chipEls.push(e);
      return e;
    },
    rbtn: () => (log.order.push("action"), log.actions++, el()),
    settingTile: (id, label) => (log.tiles.push(label), el()),
    numberTile: (id, label, o) => (log.tiles.push(label), Object.assign(el(), { o })),
    foldBlock: (b, key, title, count) => log.folds.push([title, count]),
    entityGroups() {},
    pill: (icon, name) => (log.rows.push(name), el()),
    datetimeRow: () => el(),
    devRowRaw: (x) => (log.rows.push(x.name), el()),
    sliderRow: (o) => (log.rows.push(o.name), el()),
    DOMKIND: {},
    Object, Array, Number, Math,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("appliance.js", APP), "utf8"), sandbox);
  // the progress bar of the other type builds elements of its own
  sandbox.apProgressBar = () => (log.bars++, el());
  const b = el();
  sandbox.apPage(b, "a1");
  return { log, b };
}

const future = () => new Date(Date.now() + 40 * 60000).toISOString();

test("an oven with a temperature to set gets a dial that sets it, its state and time left on the dial, a door chip only while the door is open, and no slider for the temperature", () => {
  const states = {
    "number.t": { state: "180" },
    "sensor.now": { state: "22" },
    "sensor.state": { state: "ready" },
    "sensor.left": { state: "unknown" },
    "binary_sensor.door": { state: "off" },
    "button.go": { state: "unknown" },
  };
  const attrs = { "number.t": { min: 30, max: 250, step: 5, unit_of_measurement: "°C" }, "sensor.left": { device_class: "timestamp" }, "binary_sensor.door": { device_class: "door" } };
  const { log } = popup("oven", { temperature: "number.t", current: "sensor.now", state: "sensor.state", remaining: "sensor.left", door: "binary_sensor.door", start: "button.go" }, states, attrs);
  assert.equal(log.dials.length, 1);
  const dial = log.dials[0];
  assert.deepEqual(plain({ min: dial.set.min, max: dial.set.max, step: dial.set.step }), { min: 30, max: 250, step: 5 });
  assert.equal(dial.big(), "180°C");
  assert.equal(dial.small(), "ap_now_at" + "22");
  assert.equal(dial.note(), "ready");
  assert.equal(dial.mark(), 22);
  assert.equal(dial.set.get(), 180);
  assert.deepEqual(plain(log.chips.map((c) => c.map((x) => x[0]))), [["ap_door"]], "the door is the only chip");
  assert.equal(log.chipEls[0].style.display, "none", "a shut door says nothing");
  assert.equal(dial.note(), "ready", "idle: the state");
  states["binary_sensor.door"].state = "on";
  const open = popup("oven", { temperature: "number.t", state: "sensor.state", door: "binary_sensor.door" }, states, attrs);
  assert.equal(open.log.chipEls[0].style.display, "", "an open door shows");
  states["sensor.left"].state = new Date(Date.now() + 45 * 60000).toISOString();
  states["sensor.state"].state = "run";
  const run = popup("oven", { temperature: "number.t", state: "sensor.state", remaining: "sensor.left" }, states, attrs);
  assert.match(run.log.dials[0].note(), /^(44|45) min · run$/, "running: time left, then the state");
  assert.ok(!log.rows.includes("ap_temperature"), "the dial is the temperature control");
  assert.equal(log.actions, 1);
});

test("an oven whose temperature is unreadable shows a dash on a dial that cannot be turned", () => {
  const { log } = popup("oven", { temperature: "number.t" }, { "number.t": { state: "unavailable" } });
  const dial = log.dials[0];
  assert.equal(dial.big(), "–");
  assert.equal(dial.set.get(), null);
});

test("a washer gets a ring: the time left in the middle while it runs, its state when it does not, how far around it from the progress", () => {
  const states = { "sensor.state": { state: "run" }, "sensor.left": { state: future() }, "sensor.pct": { state: "40" }, "select.prog": { state: "Cotton" }, "binary_sensor.door": { state: "off" } };
  const attrs = { "sensor.left": { device_class: "timestamp" }, "sensor.pct": { unit_of_measurement: "%" }, "binary_sensor.door": { device_class: "door" } };
  const { log } = popup("washer", { state: "sensor.state", remaining: "sensor.left", progress: "sensor.pct", program: "select.prog", door: "binary_sensor.door" }, states, attrs);
  const ring = log.dials[0];
  assert.equal(ring.set, undefined);
  assert.match(ring.big(), /^(39|40) min$/);
  assert.equal(ring.small, undefined, "the program has its own row under the ring");
  assert.equal(ring.note(), "run", "the state goes under the time while it runs");
  assert.equal(ring.ring(), 0.4);
  assert.deepEqual(plain(log.chips[0].map((c) => c[0])), ["ap_door"], "the ring has the state and the time");
  states["sensor.left"].state = "unknown";
  states["sensor.state"].state = "finished";
  assert.equal(ring.big(), "finished");
  assert.equal(ring.note(), "");
});

test("a ring has no arc when the progress is not a percentage or cannot be read", () => {
  const states = { "sensor.pct": { state: "35" }, "sensor.state": { state: "x" } };
  const odd = popup("dryer", { progress: "sensor.pct", state: "sensor.state" }, states, { "sensor.pct": { unit_of_measurement: "kWh" } });
  assert.equal(odd.log.dials[0].ring(), null);
  states["sensor.pct"].state = "unavailable";
  const gone = popup("dryer", { progress: "sensor.pct", state: "sensor.state" }, states, {});
  assert.equal(gone.log.dials[0].ring(), null);
});

test("another appliance has chips and a progress bar and no dial", () => {
  const states = { "sensor.state": { state: "on" }, "sensor.pct": { state: "10" } };
  const { log } = popup("other", { state: "sensor.state", progress: "sensor.pct" }, states);
  assert.equal(log.dials.length, 0);
  assert.equal(log.bars, 1);
  assert.deepEqual(plain(log.chips[0].map((c) => c[0])), ["ap_state"]);
});

test("remote start is a chip when there is no Start to carry it, and speaks through the reason under Start when there is", () => {
  const states = { "binary_sensor.perm": { state: "off" }, "button.go": { state: "unknown" }, "sensor.state": { state: "x" } };
  const without = popup("washer", { permission: "binary_sensor.perm", state: "sensor.state" }, states);
  assert.deepEqual(plain(without.log.chips[0].map((c) => c[0])), ["ap_remote_start"]);
  assert.equal(without.log.chips[0][0][1](), "ap_not_allowed");
  const withStart = popup("washer", { permission: "binary_sensor.perm", start: "button.go", state: "sensor.state" }, states);
  assert.equal(withStart.log.chips.length, 0);
});

test("the popup is ordered as it is read: what it is doing, the action, what can be set, then everything else behind one fold with its count", () => {
  const states = { "number.t": { state: "180" }, "select.p": { state: "Hot air" }, "number.d": { state: "1800" }, "button.go": { state: "unknown" }, "sensor.a": { state: "1" }, "sensor.b": { state: "2" }, "switch.c": { state: "on" } };
  const attrs = { "number.t": { min: 30, max: 250, step: 5 }, "number.d": { unit_of_measurement: "s", step: 60 } };
  const slots = { temperature: "number.t", program: "select.p", duration: "number.d", start: "button.go" };
  const extra = [{ e: "sensor.a", l: "" }, { e: "sensor.b", l: "B" }, { e: "switch.c", l: "" }, { e: "sensor.gone", l: "" }];
  const { log } = popup("oven", slots, states, attrs, extra);
  assert.deepEqual(plain(log.order), ["dial", "action"], "the dial and the action come first");
  assert.deepEqual(plain(log.tiles), ["ap_program", "ap_duration"], "the temperature is on the dial; the rest of the settings are tiles");
  assert.deepEqual(plain(log.folds), [["ap_details", 3]], "three of the four extra entities exist");
  const none = popup("oven", slots, states, attrs, []);
  assert.deepEqual(none.log.folds, [], "no extra rows, no fold");
});

test("a duration is set five minutes at a time and written in hours and minutes", () => {
  const states = { "number.d": { state: "1800" } };
  const { log, b } = popup("washer", { duration: "number.d" }, states, { "number.d": { unit_of_measurement: "s", step: 60 } });
  const tile = b.children.map((c) => c.children).flat().concat(b.children).find((c) => c && c.o);
  assert.ok(tile, "a number tile was made");
  assert.equal(tile.o.uiStep, 300);
  assert.equal(tile.o.fmt(1800), "30 min");
  assert.deepEqual(plain(log.tiles), ["ap_duration"]);
});

test("an appliance is set up from the page editor only: no popup of one has a set-up button", () => {
  const appliance = readFileSync(new URL("../../custom_components/home_control/frontend/app/appliance.js", import.meta.url), "utf8");
  assert.doesNotMatch(appliance, /pill\("tune", _T\("ap_set_up"\)/);
  assert.doesNotMatch(appliance, /showPopup\("ap-edit:/);
  const manage = readFileSync(new URL("../../custom_components/home_control/frontend/app/manage.js", import.meta.url), "utf8");
  assert.match(manage, /_T\("set_up_this_device"\)[\s\S]{0,220}showPopup\("ap-edit:" \+ d\.aid, true\)/, "the device's settings in the page editor keep it");
});
