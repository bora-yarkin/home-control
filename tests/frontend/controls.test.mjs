// SPDX-License-Identifier: GPL-3.0-or-later
// Compact controls (app/controls.js): a number with minus and plus sends one command for a run of taps and stays inside its range; an entity becomes the tile that fits it or a line of readings;
// a fold builds its content only when it is opened. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function page(states, attrs = {}) {
  const calls = [];
  const timers = [];
  const painters = [];
  /* An element that remembers its class list, listeners and children; querySelector gives the same stand-in for the same selector. */
  const el = (cls = "") => {
    const classes = new Set(String(cls).split(" ").filter(Boolean));
    const found = {};
    const self = {
      children: [],
      style: {},
      listeners: {},
      textContent: "",
      attrs: {},
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c), has: (c) => classes.has(c), contains: (c) => classes.has(c) },
      appendChild(x) { this.children.push(x); return x; },
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
      setAttribute(k, v) { this.attrs[k] = v; },
      querySelector(sel) { return (found[sel] ||= el(sel.replace(".", ""))); },
      click() { (this.listeners.click || []).forEach((fn) => fn()); },
    };
    return self;
  };
  const sandbox = {
    A: (id) => attrs[id] || {},
    V_: (id) => (states[id] ? states[id].state : ""),
    svOk: (id) => states[id] && !["unavailable", "unknown"].includes(states[id].state),
    dom: (id) => id.split(".")[0],
    mk: (tag, cls) => el(cls),
    svg: (n) => `<svg ${n}/>`,
    reg: (fn) => painters.push(fn),
    call: (d, s, data) => calls.push([d, s, JSON.parse(JSON.stringify(data))]),
    _T: (k) => k,
    selectEnt: (id, label) => Object.assign(el("sel selrow"), { select: id, label }),
    remoteUsable: () => true,
    remotePress: (b) => calls.push(["press", b.e]),
    toast: () => {},
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimeout: (n) => {
      if (timers[n - 1]) timers[n - 1].fn = null;
    },
    Number, Math, Object, Array, JSON,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("controls.js", APP), "utf8"), sandbox);
  return { sandbox, calls, repaint: () => painters.forEach((fn) => fn()), flush: () => timers.splice(0).forEach((t) => t.fn && t.fn()) };
}

test("a run of taps on a number is one command, in steps, inside its range", () => {
  const states = { "number.t": { state: "180" } };
  const { sandbox, calls, flush } = page(states, { "number.t": { min: 30, max: 250, step: 5, unit_of_measurement: "°C" } });
  const tile = sandbox.numberTile("number.t", "Temperature");
  const [minus, plus] = tile.children;
  assert.equal(tile.querySelector(".vl").textContent, "180 °C");
  plus.click();
  plus.click();
  plus.click();
  assert.equal(tile.querySelector(".vl").textContent, "195 °C", "the value follows the taps at once");
  assert.deepEqual(calls, [], "nothing is sent while the taps come");
  flush();
  assert.deepEqual(calls, [["number", "set_value", { entity_id: "number.t", value: 195 }]]);
  states["number.t"].state = "245";
  minus.click();
  for (let i = 0; i < 5; i++) plus.click();
  flush();
  assert.equal(calls[1][2].value, 250, "never above the maximum");
});

test("a number that cannot be read shows a dash, is dimmed and sends nothing", () => {
  const states = { "number.t": { state: "unavailable" } };
  const { sandbox, calls, flush } = page(states, { "number.t": { min: 0, max: 10, step: 1 } });
  const tile = sandbox.numberTile("number.t", "T");
  assert.equal(tile.querySelector(".vl").textContent, "–");
  assert.equal(tile.classList.has("inert"), true);
  tile.children[1].click();
  flush();
  assert.deepEqual(calls, []);
});

test("an input_number is set through its own service, and a tap uses the step the caller gives", () => {
  const states = { "input_number.x": { state: "10" } };
  const { sandbox, calls, flush } = page(states, { "input_number.x": { min: 0, max: 100, step: 1 } });
  const tile = sandbox.numberTile("input_number.x", "X", { uiStep: 5, fmt: (v) => v + "!" });
  tile.children[1].click();
  flush();
  assert.deepEqual(calls, [["input_number", "set_value", { entity_id: "input_number.x", value: 15 }]]);
  assert.equal(tile.querySelector(".vl").textContent, "15!");
});

test("an on/off tile turns what is on off and what is off on, and says so", () => {
  const states = { "switch.s": { state: "on" } };
  const { sandbox, calls, repaint } = page(states);
  const t = sandbox.toggleTile("switch.s", "Child lock");
  assert.equal(t.classList.has("on"), true);
  t.click();
  states["switch.s"].state = "off";
  repaint();
  assert.equal(t.classList.has("on"), false);
  t.click();
  assert.deepEqual(calls, [["switch", "turn_off", { entity_id: "switch.s" }], ["switch", "turn_on", { entity_id: "switch.s" }]]);
});

test("each entity becomes the tile that fits it, and what can only be read goes into one list", () => {
  const states = { "select.p": { state: "a" }, "number.n": { state: "1" }, "switch.w": { state: "on" }, "button.b": { state: "unknown" }, "sensor.s": { state: "5" }, "binary_sensor.d": { state: "off" } };
  const { sandbox } = page(states);
  const b = { children: [], appendChild(x) { this.children.push(x); return x; } };
  const ids = Object.keys(states);
  sandbox.entityGroups(b, ids, (id) => id.toUpperCase(), (id) => () => "v:" + id);
  assert.equal(b.children.length, 2, "a grid of tiles and a list");
  const [grid, list] = b.children;
  assert.equal(grid.children.length, 4, "a choice, a number, a switch and a button");
  assert.equal(list.children.length, 2, "two readings");
  assert.equal(list.children[1].querySelector(".v").textContent, "v:binary_sensor.d");
  const onlyReads = { children: [], appendChild(x) { this.children.push(x); return x; } };
  sandbox.entityGroups(onlyReads, ["sensor.s"], (id) => id, () => () => "x");
  assert.equal(onlyReads.children.length, 1);
});

test("a fold builds its content when it is first opened, keeps its state, and says how many are behind it", () => {
  const { sandbox } = page({});
  const b = { children: [], appendChild(x) { this.children.push(x); return x; } };
  let built = 0;
  sandbox.foldBlock(b, "k1", "Details", 3, () => built++);
  const [head, body] = b.children;
  assert.equal(head.querySelector(".nm").textContent, "Details · 3");
  assert.equal(built, 0);
  assert.equal(body.style.display, "none");
  head.click();
  assert.equal(built, 1);
  assert.equal(body.style.display, "");
  assert.equal(head.attrs["aria-expanded"], "true");
  head.click();
  head.click();
  assert.equal(built, 1, "built once");
  const again = { children: [], appendChild(x) { this.children.push(x); return x; } };
  sandbox.foldBlock(again, "k1", "Details", 3, () => built++);
  assert.equal(again.children[1].style.display, "", "open again as it was left");
  assert.equal(built, 2, "a new popup builds its own content");
});
