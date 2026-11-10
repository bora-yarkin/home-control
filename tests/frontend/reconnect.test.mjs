// SPDX-License-Identifier: GPL-3.0-or-later
// A page that comes back (a phone waking up) checks the connection and does not wait for the browser to give up on a dead one
// (ha-adapter.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../custom_components/home_control/frontend/ha-adapter.js", import.meta.url), "utf8");

/* The adapter on a pretend page. `pingAnswers` decides what a ping does: "ok", "refused" or "silence" (the connection is dead). */
function page({ pingAnswers = "ok", connected = true } = {}) {
  const handlers = {};
  const frames = [];
  const timers = [];
  const doc = { hidden: false, addEventListener: (name, fn) => (handlers[name] ||= []).push(fn) };
  const sandbox = {
    window: { addEventListener: (name, fn) => (handlers[name] ||= []).push(fn) },
    document: doc,
    requestAnimationFrame: (fn) => frames.push(fn),
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = null;
    },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const connection = {
    connected,
    reconnects: [],
    pings: 0,
    sendMessagePromise: async () => [],
    subscribeEvents: () => {},
    addEventListener: () => {},
    ping() {
      this.pings++;
      return pingAnswers === "ok" ? Promise.resolve() : pingAnswers === "refused" ? Promise.reject(new Error("lost")) : new Promise(() => {});
    },
    reconnect(force) {
      this.reconnects.push(force);
    },
  };
  sandbox.window.HA.attach({ states: {}, services: {}, connection });
  const drawn = { count: 0 };
  sandbox.window.HA.onUpdate(() => drawn.count++);
  const draw = () => frames.splice(0).forEach((fn) => fn());
  draw();
  const fire = (name) => (handlers[name] || []).forEach((fn) => fn());
  const wakeTimer = () => timers.filter((t) => t.fn && t.ms === 2000)[0];
  return { connection, fire, drawn, draw, wakeTimer, doc };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("coming back to a connection that answers leaves it alone and draws the page again", async () => {
  const { connection, fire, drawn, draw, wakeTimer } = page();
  const before = drawn.count;
  fire("visibilitychange");
  await settle();
  draw();
  assert.equal(connection.pings, 1);
  assert.deepEqual(connection.reconnects, []);
  assert.ok(drawn.count > before, "the page is drawn again");
  assert.equal(wakeTimer(), undefined, "the wait for an answer is over");
});

test("a connection that does not answer within two seconds is closed and made again at once", async () => {
  const { connection, fire, wakeTimer } = page({ pingAnswers: "silence" });
  fire("focus");
  await settle();
  assert.deepEqual(connection.reconnects, [], "not before the two seconds are up");
  wakeTimer().fn();
  assert.deepEqual(connection.reconnects, [true]);
});

test("a refused ping is the library's own news of a lost connection: it is not reconnected a second time", async () => {
  const { connection, fire } = page({ pingAnswers: "refused" });
  fire("online");
  await settle();
  assert.deepEqual(connection.reconnects, []);
});

test("several wake-up events at once ask one ping; a hidden page or a connection already down asks none", async () => {
  const a = page({ pingAnswers: "silence" });
  a.fire("visibilitychange");
  a.fire("focus");
  a.fire("pageshow");
  assert.equal(a.connection.pings, 1);

  const hidden = page();
  hidden.doc.hidden = true;
  hidden.fire("visibilitychange");
  assert.equal(hidden.connection.pings, 0);

  const down = page({ connected: false });
  down.fire("focus");
  assert.equal(down.connection.pings, 0, "Home Assistant is remaking it already");
});
