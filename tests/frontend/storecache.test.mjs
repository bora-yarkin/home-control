// SPDX-License-Identifier: GPL-3.0-or-later
// The saved dashboard (app/store.js): the page is first drawn from the copy of the last visit, nothing is saved on top of that older copy, and a save lost to a
// dropped connection is made again when the connection is back. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const CACHE = "home_control_layout_v1";

const layout = (name, extra = {}) => ({ v: 1, qaSeeded: true, ui: { page: name }, scenes: [], ...extra });

/* store.js on a pretend page. `server` is what Home Assistant has saved; `answer()` lets its answer through (it is held back until then). */
function page({ cached = null, server = layout("server"), admin = true, user = { id: "u1" }, saveFails = null, registries = true } = {}) {
  const toasts = [];
  const writes = [];
  const subscribers = [];
  const connectionHandlers = [];
  const timers = [];
  const device = {};
  if (cached) device[CACHE] = cached;
  let answerGet;
  const gate = new Promise((resolve) => (answerGet = resolve));
  const sandbox = {
    _T: (k) => k,
    toast: (m) => toasts.push(m),
    H: () => ({ user: { ...user, is_admin: admin }, entities: {}, states: {} }),
    HA: {
      registriesLoaded: () => registries,
      isTransportError: (e) => !(e && typeof e.code === "string"),
      data: {
        get: () => gate.then(() => server),
        set: (scope, key, value) => {
          writes.push(plain(value));
          return saveFails ? Promise.reject(saveFails()) : Promise.resolve();
        },
        subscribe: (scope, key, fn) => (subscribers.push(fn), Promise.resolve(() => {})),
      },
      onConnection: (lost, back) => connectionHandlers.push({ lost, back }),
    },
    deviceGet: (k, fallback) => (k in device ? device[k] : fallback),
    deviceSet: (k, v) => {
      device[k] = plain(v);
    },
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimeout() {},
    setInterval() {},
    Date,
    UI: { page: "start", layout: { v: 4, home: [], rooms: {} } },
    CURRENT: null,
    BOOTED: false,
    EDIT: false,
    EDSKIP: false,
    EDHIST: [],
    LOGNEXT: false,
    LOGSKIP: false,
    SEEDACC: 1,
    refresh() {},
    livePatch() {},
    seedAccess() {},
    seedQA: () => [],
    bkAdd() {},
    logChange() {},
    cleanUI: (ui) => ({ page: "default", layout: { v: 4, home: [], rooms: {} }, ...(ui && typeof ui === "object" ? ui : {}) }),
    cleanAccess: () => ({}),
    cleanNotify: () => null,
    cleanCfg: () => ({}),
    cleanIcons: () => ({}),
    cleanPins: () => [],
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    ownerRoom: () => "",
    dom: (id) => id.split(".")[0],
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("store.js"), sandbox);
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  };
  return {
    sandbox,
    toasts,
    writes,
    device,
    timers,
    settle,
    start: () => sandbox.initStore(),
    answer: async () => {
      answerGet();
      await settle();
    },
    publish: (v) => subscribers.forEach((fn) => fn(v)),
    reconnected: () => connectionHandlers.forEach((h) => h.back()),
    get STORE() {
      return plain(vm.runInContext("STORE", sandbox));
    },
    get state() {
      return plain(vm.runInContext("({ net: STORE_NET, held: STORE_HELD, unsaved: STORE_UNSAVED, ready: STORE_READY })", sandbox));
    },
  };
}

const cachedLayout = (extra = {}) => ({ user: "u1", store: layout("cached", extra) });

test("with a copy of the last visit the page is drawn from it before Home Assistant has answered", async () => {
  const p = page({ cached: cachedLayout({ scenes: [] }) });
  const first = p.start();
  await p.settle();
  assert.equal(p.state.ready, true, "the saved dashboard counts as in");
  await first;
  assert.equal(p.STORE.ui.page, "cached");
  assert.equal(p.state.net, false, "but it is not the real one yet");
});

test("Home Assistant's answer then replaces the copy", async () => {
  const p = page({ cached: cachedLayout() });
  p.start();
  await p.settle();
  await p.answer();
  assert.equal(p.STORE.ui.page, "server");
  assert.equal(p.state.net, true);
});

test("nothing is saved on top of the copy while the real dashboard has not been read; it is saved after, on top of the real one", async () => {
  const p = page({ cached: cachedLayout() });
  p.start();
  await p.settle();
  vm.runInContext("storeSave()", p.sandbox);
  assert.deepEqual(p.writes, [], "held: it would overwrite what another device saved since");
  assert.equal(p.state.held, true);
  await p.answer();
  assert.equal(p.writes.length, 1);
  assert.equal(p.writes[0].ui.page, "server", "what was written is built on the real dashboard");
  assert.equal(p.state.held, false);
});

test("a save made once the real dashboard is in goes out at once", async () => {
  const p = page();
  p.start();
  await p.answer();
  const before = p.writes.length;
  vm.runInContext("storeSave()", p.sandbox);
  assert.equal(p.writes.length, before + 1);
});

test("the real dashboard is kept as the copy for the next visit, under this person's id", async () => {
  const p = page();
  p.start();
  await p.answer();
  assert.equal(p.device[CACHE].user, "u1");
  assert.equal(p.device[CACHE].store.ui.page, "server");
});

test("a copy of another person, or one that is not a dashboard, is not used", async () => {
  for (const cached of [{ user: "u2", store: layout("other") }, { user: "u1", store: { v: 2 } }, { user: "u1", store: "x" }, { store: layout("x") }, "junk"]) {
    const p = page({ cached });
    p.start();
    await p.settle();
    assert.equal(p.state.ready, false, JSON.stringify(cached));
  }
  const noUser = page({ cached: cachedLayout(), user: {} });
  noUser.start();
  await noUser.settle();
  assert.equal(noUser.state.ready, false);
});

test("until the real dashboard is in it is asked for again, though the copy lets the page draw", async () => {
  const p = page({ cached: cachedLayout(), server: null });
  p.sandbox.HA.data.get = () => Promise.reject(new Error("lost"));
  p.start();
  await p.settle();
  assert.ok(p.timers.some((t) => t.ms === 2000), "asked again in two seconds");
});

test("a save that failed because the connection was down is made again when it is back", async () => {
  let fail = true;
  const p = page({ saveFails: () => (fail ? { code: 3 } : null) });
  p.sandbox.HA.data.set = (scope, key, value) => {
    p.writes.push(plain(value));
    return fail ? Promise.reject({ code: 3 }) : Promise.resolve();
  };
  p.start();
  await p.answer();
  p.writes.length = 0;
  vm.runInContext("storeSave()", p.sandbox);
  await p.settle();
  assert.equal(p.writes.length, 1);
  assert.equal(p.state.unsaved, true);
  assert.ok(p.toasts.includes("not_saved_no_connection"), "the person is told why, and that it is not lost");
  assert.ok(!p.toasts.includes("couldn_t_save_only_admins_can_change"));
  fail = false;
  p.reconnected();
  await p.settle();
  assert.equal(p.writes.length, 2, "saved again");
  assert.equal(p.state.unsaved, false);
  p.reconnected();
  await p.settle();
  assert.equal(p.writes.length, 2, "and only once");
});

test("a save Home Assistant refused is not tried again, and says it was refused", async () => {
  const p = page();
  p.sandbox.HA.data.set = () => Promise.reject({ code: "unauthorized", message: "Unauthorized" });
  p.start();
  await p.answer();
  vm.runInContext("storeSave()", p.sandbox);
  await p.settle();
  assert.ok(p.toasts.includes("couldn_t_save_only_admins_can_change"));
  assert.equal(p.state.unsaved, false);
});

test("what changes Home Assistant by itself works only from the real dashboard and the real registries, not from the copies", async () => {
  const real = (p) => vm.runInContext("dataIsReal()", p.sandbox);
  const copies = page({ cached: cachedLayout(), registries: false });
  copies.start();
  await copies.settle();
  assert.equal(real(copies), false, "the dashboard is the copy and the registries are not in");
  await copies.answer();
  assert.equal(real(copies), false, "the dashboard is real, the registries are not");

  const both = page({ cached: cachedLayout() });
  both.start();
  await both.settle();
  assert.equal(real(both), false, "the registries are real, the dashboard is still the copy");
  await both.answer();
  assert.equal(real(both), true);
});
