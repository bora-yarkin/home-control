// SPDX-License-Identifier: GPL-3.0-or-later
// A connection that comes back clears the page's "offline" state at once (ha-adapter.js with the offline logic of app/core.js). Home Assistant keeps a copy of
// the connection's state (`hass.connected`) that it updates a moment after the connection says "ready"; reading that copy at the moment of "ready" showed the page
// "offline" for three more seconds, with its banner. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");
const core = read("app/core.js");
/* From the offline state to the end of connCheck: what decides whether the page is offline. */
const offline = core.slice(core.indexOf("var OFFLINE = false,"), core.indexOf("function entIds(data)"));

function page() {
  const elements = {};
  const timers = [];
  const listeners = {};
  const toasts = [];
  let now = 0;
  const body = { classList: { toggle() {} }, appendChild: (el) => (elements[el.id] = el) };
  const sandbox = {
    window: { addEventListener() {} },
    document: {
      hidden: false,
      addEventListener() {},
      body,
      getElementById: (id) => elements[id] || null,
    },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms) => (timers.push({ fn, ms, at: now + ms }), timers.length),
    clearTimeout() {},
    console,
    Date: { now: () => now },
    mk: () => {
      const el = { setAttribute() {}, remove: () => delete elements[el.id] };
      return el;
    },
    toast: (m) => toasts.push(m),
    _T: (k) => k,
    refresh: () => sandbox.connCheck(),
    vlightDispatch: (s, d) => d,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("ha-adapter.js"), sandbox);
  sandbox.HA = sandbox.window.HA;
  sandbox.H = () => sandbox.HA.hass();
  vm.runInContext(offline, sandbox);

  /* Home Assistant's `hass`: `connected` is its copy, brought up to date only when the test says so. */
  const connection = {
    connected: true,
    sendMessagePromise: async () => [],
    subscribeEvents() {},
    addEventListener: (name, fn) => (listeners[name] ||= []).push(fn),
  };
  const hass = { states: {}, services: {}, connection, connected: true };
  sandbox.HA.attach(hass);
  sandbox.offlineInit();
  return {
    sandbox,
    elements,
    hass,
    connection,
    fire: (name) => (listeners[name] || []).forEach((fn) => fn()),
    advance: (ms) => {
      now += ms;
      for (const t of timers.splice(0)) if (t.at <= now) t.fn();
    },
    drop() {
      connection.connected = false;
      this.fire("disconnected");
      hass.connected = false;
    },
  };
}

test("the page is offline while the connection is down, and a banner comes after 1.5 seconds", () => {
  const p = page();
  p.drop();
  assert.equal(p.sandbox.OFFLINE, true);
  assert.equal(p.elements.offline, undefined, "not at once: a connection that is back at once is not worth a warning");
  p.advance(1500);
  assert.ok(p.elements.offline, "the banner");
});

test("the connection says ready while Home Assistant's copy still says down: the page is online at once and stays so", () => {
  const p = page();
  p.drop();
  p.connection.connected = true;
  p.fire("ready"); /* the copy (hass.connected) is still false here: Home Assistant updates it after this */
  assert.equal(p.sandbox.OFFLINE, false);
  p.sandbox.refresh(); /* the page draws again, as it does on every change */
  p.sandbox.connCheck();
  assert.equal(p.sandbox.OFFLINE, false, "reading the connection again does not put it back offline");
});

test("a connection back before the banner's delay shows no banner at all", () => {
  const p = page();
  p.drop();
  p.advance(900);
  p.connection.connected = true;
  p.fire("ready");
  p.advance(1500);
  assert.equal(p.elements.offline, undefined);
  assert.equal(p.sandbox.OFFLINE, false);
});

test("a connection back after the banner took it down again and says so", () => {
  const p = page();
  p.drop();
  p.advance(1500);
  assert.ok(p.elements.offline);
  p.connection.connected = true;
  p.fire("ready");
  assert.equal(p.elements.offline, undefined);
  assert.equal(p.sandbox.OFFLINE, false);
});

test("a connection that really is still down is not taken for up", () => {
  const p = page();
  p.drop();
  p.fire("ready"); /* a stray event with the connection itself still down */
  p.sandbox.connCheck();
  assert.equal(p.sandbox.OFFLINE, true);
});
