// SPDX-License-Identifier: GPL-3.0-or-later
// How the adapter (ha-adapter.js) loads and keeps the registries: everything asked for at once at the start, a changed entity put in by itself instead of
// loading the whole entity registry again, the full load after a lost connection, and the copy of the last visit kept on this device.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../custom_components/home_control/frontend/ha-adapter.js", import.meta.url), "utf8");

const plain = (value) => JSON.parse(JSON.stringify(value));
const entry = (entity_id, extra = {}) => ({ entity_id, platform: "demo", unique_id: entity_id, disabled_by: null, ...extra });
const BASE = {
  "config/entity_registry/list": () => [entry("light.a"), entry("light.b")],
  "config/device_registry/list": () => [{ id: "d1", name: "Device" }],
  "config/area_registry/list": () => [{ area_id: "room", name: "Room" }],
  "config/floor_registry/list": () => [],
  "home_control/plugins": () => ({ plugins: [] }),
  "config/entity_registry/get_entries": () => ({}),
};

/* The adapter on a pretend page. `answers` maps a command type to a function of the message; a function may return a promise or throw. `hold` keeps every answer
 back until `release()`, to see what was asked before anything came back. Timers run when the test says so. */
function page({ answers = {}, storage = {}, user = { id: "u1" }, hold = false, refuseStorage = false } = {}) {
  const handlers = {};
  const sent = [];
  const events = {};
  const timers = [];
  const waiting = [];
  const frames = [];
  const store = { ...storage };
  const sandbox = {
    window: { addEventListener() {} },
    document: { hidden: false, addEventListener() {} },
    requestAnimationFrame: (fn) => frames.push(fn),
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = null;
    },
    localStorage: {
      getItem: (k) => {
        if (refuseStorage) throw new Error("storage is blocked");
        return k in store ? store[k] : null;
      },
      setItem: (k, v) => {
        if (refuseStorage) throw new Error("storage is blocked");
        store[k] = String(v);
      },
    },
    console: { ...console, warn() {} },
    Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const table = { ...BASE, ...answers };
  const connection = {
    connected: true,
    sendMessagePromise: (msg) => {
      sent.push(msg);
      const run = () => {
        try {
          return Promise.resolve(table[msg.type](msg));
        } catch (e) {
          return Promise.reject(e);
        }
      };
      return hold ? new Promise((res, rej) => waiting.push(() => run().then(res, rej))) : run();
    },
    subscribeEvents: (fn, type) => {
      events[type] = fn;
    },
    addEventListener: (name, fn) => (handlers[name] ||= []).push(fn),
  };
  sandbox.window.HA.attach({ states: {}, services: {}, connection, user });
  const HA = sandbox.window.HA;
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  };
  return {
    HA,
    sent,
    store,
    connection,
    events,
    settle,
    fire: (type, data) => events[type]({ data }),
    ready: (name) => (handlers[name] || []).forEach((fn) => fn()),
    release: () => waiting.splice(0).forEach((fn) => fn()),
    /* Runs the waiting timers, the ones asked for with this delay or longer only when `ms` says so. */
    run: async (ms) => {
      for (const t of timers.splice(0)) if (t.fn && (ms === undefined || t.ms === ms)) t.fn();
      await settle();
    },
    types: () => sent.map((m) => m.type),
    ids: () => Object.keys(HA.hass().entities).sort(),
  };
}

const count = (p, type) => p.types().filter((t) => t === type).length;

test("the entity registry and the plus integrations are asked for together, not one after the other", async () => {
  const p = page({ hold: true });
  await p.settle();
  assert.ok(p.types().includes("config/entity_registry/list"));
  assert.ok(p.types().includes("home_control/plugins"), "asked before the entity registry has answered");
});

test("a created entity is fetched by itself: the whole registry is not loaded again", async () => {
  const p = page({ answers: { "config/entity_registry/get_entries": () => ({ "light.c": entry("light.c") }) } });
  await p.HA.ready();
  await p.settle();
  assert.deepEqual(p.ids(), ["light.a", "light.b"]);
  p.fire("entity_registry_updated", { action: "create", entity_id: "light.c" });
  await p.run(400);
  assert.deepEqual(p.ids(), ["light.a", "light.b", "light.c"]);
  assert.equal(count(p, "config/entity_registry/list"), 1);
  const ask = p.sent.find((m) => m.type === "config/entity_registry/get_entries");
  assert.deepEqual(plain(ask.entity_ids), ["light.c"]);
});

test("a burst of events is one request that names every entity once", async () => {
  const p = page({ answers: { "config/entity_registry/get_entries": (m) => Object.fromEntries(m.entity_ids.map((id) => [id, entry(id)])) } });
  await p.HA.ready();
  await p.settle();
  p.fire("entity_registry_updated", { action: "update", entity_id: "light.a" });
  p.fire("entity_registry_updated", { action: "update", entity_id: "light.a" });
  p.fire("entity_registry_updated", { action: "create", entity_id: "light.z" });
  await p.run(400);
  assert.equal(count(p, "config/entity_registry/get_entries"), 1);
  assert.deepEqual(plain(p.sent.find((m) => m.type === "config/entity_registry/get_entries").entity_ids).sort(), ["light.a", "light.z"]);
});

test("an entity the answer no longer has was removed, and one that became disabled leaves the registry", async () => {
  const p = page({
    answers: { "config/entity_registry/get_entries": () => ({ "light.a": null, "light.b": entry("light.b", { disabled_by: "user" }) }) },
  });
  await p.HA.ready();
  await p.settle();
  p.fire("entity_registry_updated", { action: "remove", entity_id: "light.a" });
  p.fire("entity_registry_updated", { action: "update", entity_id: "light.b" });
  await p.run(400);
  assert.deepEqual(p.ids(), []);
});

test("a renamed entity: the new id comes in and the old one goes", async () => {
  const p = page({ answers: { "config/entity_registry/get_entries": () => ({ "light.a_new": entry("light.a_new", { unique_id: "light.a" }), "light.a": null }) } });
  await p.HA.ready();
  await p.settle();
  p.fire("entity_registry_updated", { action: "update", entity_id: "light.a_new", old_entity_id: "light.a" });
  await p.run(400);
  assert.deepEqual(p.ids(), ["light.a_new", "light.b"]);
  assert.deepEqual(plain(p.sent.find((m) => m.type === "config/entity_registry/get_entries").entity_ids).sort(), ["light.a", "light.a_new"]);
});

test("what a plus integration replaces is worked out again when one of its entities comes or goes", async () => {
  const plugins = { plugins: [{ id: "plus", name: "Plus", replaces: ["demo"] }] };
  let plusExists = false;
  const p = page({
    answers: {
      "home_control/plugins": () => plugins,
      "config/entity_registry/get_entries": () => ({ "light.a_plus": plusExists ? entry("light.a_plus", { platform: "plus", unique_id: "light.a" }) : null }),
    },
  });
  await p.HA.ready();
  await p.settle();
  assert.ok(p.ids().includes("light.a"));
  plusExists = true;
  p.fire("entity_registry_updated", { action: "create", entity_id: "light.a_plus" });
  await p.run(400);
  assert.ok(!p.ids().includes("light.a"), "the replaced entity is left out once its replacement exists");
  assert.ok(p.ids().includes("light.a_plus"));
  plusExists = false;
  p.fire("entity_registry_updated", { action: "remove", entity_id: "light.a_plus" });
  await p.run(400);
  assert.ok(p.ids().includes("light.a"), "and is back when the replacement goes");
});

test("an event that names no entity, a failed answer and a large burst are each answered with a full load", async () => {
  const noName = page();
  await noName.HA.ready();
  await noName.settle();
  noName.fire("entity_registry_updated", {});
  await noName.run(400);
  assert.equal(count(noName, "config/entity_registry/list"), 2);
  assert.equal(count(noName, "config/entity_registry/get_entries"), 0);

  const failed = page({
    answers: {
      "config/entity_registry/get_entries": () => {
        throw new Error("unknown_command");
      },
    },
  });
  await failed.HA.ready();
  await failed.settle();
  failed.fire("entity_registry_updated", { action: "create", entity_id: "light.c" });
  await failed.run(400);
  assert.equal(count(failed, "config/entity_registry/list"), 2);

  const burst = page();
  await burst.HA.ready();
  await burst.settle();
  for (let i = 0; i < 201; i++) burst.fire("entity_registry_updated", { action: "create", entity_id: "light.n" + i });
  await burst.run(400);
  assert.equal(count(burst, "config/entity_registry/get_entries"), 0);
  assert.equal(count(burst, "config/entity_registry/list"), 2);
});

test("after the connection came back every registry is loaded in full, because events were missed", async () => {
  const p = page();
  await p.HA.ready();
  await p.settle();
  const before = p.sent.length;
  p.ready("ready");
  await p.settle();
  const again = p.types().slice(before);
  for (const type of ["config/entity_registry/list", "config/device_registry/list", "config/area_registry/list", "config/floor_registry/list"]) {
    assert.ok(again.includes(type), type);
  }
});

test("the registries of the last visit are drawn from at once; Home Assistant's answer then replaces them", async () => {
  const first = page({ answers: { "config/entity_registry/get_entries": () => ({ "light.c": entry("light.c") }) } });
  await first.HA.ready();
  await first.settle();
  assert.equal(first.HA.registriesLoaded(), true);
  const stored = JSON.parse(first.store.home_control_registry_v1);
  assert.equal(stored.user, "u1");
  assert.deepEqual(Object.keys(stored.entities).sort(), ["light.a", "light.b"], "kept as soon as the first complete load is in");

  first.fire("entity_registry_updated", { action: "create", entity_id: "light.c" });
  await first.run(400);
  assert.deepEqual(Object.keys(JSON.parse(first.store.home_control_registry_v1).entities).sort(), ["light.a", "light.b"], "a later change waits a few seconds");
  await first.run(3000);
  assert.deepEqual(Object.keys(JSON.parse(first.store.home_control_registry_v1).entities).sort(), ["light.a", "light.b", "light.c"]);

  const second = page({
    hold: true,
    storage: { home_control_registry_v1: first.store.home_control_registry_v1 },
    answers: { "config/entity_registry/list": () => [entry("light.a"), entry("light.fresh")] },
  });
  await second.HA.ready();
  assert.deepEqual(second.ids(), ["light.a", "light.b", "light.c"], "the last visit's registry, in hand before Home Assistant has answered anything");
  assert.equal(second.HA.registriesLoaded(), false, "the first layout is still not built from the old copy");
  assert.equal(second.HA.hass().devices.d1.name, "Device");
  second.release();
  await second.settle();
  assert.equal(second.HA.registriesLoaded(), true);
  assert.deepEqual(second.ids(), ["light.a", "light.fresh"]);
});

test("a copy of another person, of an old version or too old, or one that cannot be read, is not used", async () => {
  const first = page();
  await first.HA.ready();
  await first.settle();
  const good = JSON.parse(first.store.home_control_registry_v1);
  const attempt = async (storage, user = { id: "u1" }) => {
    const p = page({ hold: true, storage: { home_control_registry_v1: storage }, user });
    const done = await Promise.race([p.HA.ready().then(() => "ready"), new Promise((r) => setImmediate(() => r("waiting")))]);
    return done;
  };
  assert.equal(await attempt(JSON.stringify(good)), "ready");
  assert.equal(await attempt(JSON.stringify(good), { id: "someone-else" }), "waiting");
  assert.equal(await attempt(JSON.stringify({ ...good, v: 2 })), "waiting");
  assert.equal(await attempt(JSON.stringify({ ...good, at: Date.now() - 31 * 24 * 3600 * 1000 })), "waiting");
  assert.equal(await attempt("not json"), "waiting");
  assert.equal(await attempt(JSON.stringify({ ...good, entities: [] })), "waiting");
  assert.equal(await attempt(JSON.stringify({ ...good, entities: { "light.x": null } })), "waiting", "an entry that breaks the registry is not used");
  assert.equal(await attempt(JSON.stringify(good), null), "waiting", "no signed-in user, no copy");
});

test("a browser that refuses storage does not stop the registries", async () => {
  const p = page({ refuseStorage: true });
  await p.HA.ready();
  await p.settle();
  await p.run(3000); /* the later write is refused as well */
  assert.deepEqual(p.ids(), ["light.a", "light.b"]);
  assert.equal(p.HA.registriesLoaded(), true);
});

test("a lost connection is told from Home Assistant refusing a command", () => {
  const { HA } = page();
  assert.equal(HA.isTransportError({ code: 3 }), true, "the library's connection-lost code");
  assert.equal(HA.isTransportError(new TypeError("closed")), true);
  assert.equal(HA.isTransportError(undefined), true);
  assert.equal(HA.isTransportError({ code: "unauthorized", message: "no" }), false);
  assert.equal(HA.isTransportError({ code: "unknown_error" }), false);
});
