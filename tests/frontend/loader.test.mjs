// SPDX-License-Identifier: GPL-3.0-or-later
// A start that loses a request on a weak connection heals itself: dashboard-panel.js asks for version.json again, and dashboard-app.js reloads the page, a
// little later each time and three times at most, when a file of the application does not load. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { _T } from "./en.mjs";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/* dashboard-app.js on a pretend page whose files are `files`; `fail` names the ones that do not load. */
function appPage({ files = ["app/a.js", "app/b.js"], tried, sessionRefuses = false } = {}) {
  const store = tried === undefined ? {} : { dashboard_load_retries: String(tried) };
  const timers = [];
  const reloads = [];
  const scripts = [];
  const body = { children: [], textContent: "", appendChild(el) { this.children.push(el); } };
  const sandbox = {
    window: { APP_FILES: files },
    document: {
      currentScript: { src: "https://x/home_control_static/dashboard-app.js?v=7" },
      createElement: () => ({}),
      getElementById: (id) => (id === "body" ? body : null),
      body: { appendChild: (el) => scripts.push(el) },
    },
    sessionStorage: sessionRefuses
      ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } }
      : {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => {
            store[k] = String(v);
          },
          removeItem: (k) => delete store[k],
        },
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    location: { href: "https://x/", reload: () => reloads.push(1) },
    console: { ...console, error() {} },
    URL,
  };
  sandbox.window.APP_FILES = files;
  sandbox._T = _T;
  vm.createContext(sandbox);
  vm.runInContext(read("dashboard-app.js"), sandbox);
  return {
    sandbox,
    store,
    timers,
    reloads,
    scripts,
    body,
    fail: (i) => scripts[i].onerror(),
    runTimers: () => timers.splice(0).forEach((t) => t.fn()),
  };
}

test("a file that does not load reloads the page after a second, and says so", () => {
  const p = appPage();
  p.fail(0);
  assert.deepEqual(p.timers.map((t) => t.ms), [1000]);
  assert.equal(p.store.dashboard_load_retries, "1");
  assert.match(p.body.children[0].textContent, /Trying again/);
  p.runTimers();
  assert.equal(p.reloads.length, 1);
});

test("several files lost in the same start are one reload", () => {
  const p = appPage();
  p.fail(0);
  p.fail(1);
  assert.equal(p.timers.length, 1);
  assert.equal(p.store.dashboard_load_retries, "1");
});

test("each further try waits longer: one second, three, then eight", () => {
  const waits = [];
  for (const tried of [0, 1, 2]) {
    const p = appPage({ tried });
    p.fail(0);
    waits.push(p.timers[0].ms);
  }
  assert.deepEqual(waits, [1000, 3000, 8000]);
});

test("after three tries the page stops, names the missing files and offers a button that starts the count again", () => {
  const p = appPage({ tried: 3 });
  p.fail(0);
  assert.equal(p.timers.length, 0, "no reload");
  assert.match(p.body.children[0].textContent, /could not load: app\/a\.js\./);
  const button = p.body.children[1];
  assert.equal(button.textContent, "Try again");
  button.onclick();
  assert.equal(p.reloads.length, 1);
  assert.equal("dashboard_load_retries" in p.store, false);
});

test("without session storage there is no count to keep, so the page does not reload by itself", () => {
  const p = appPage({ sessionRefuses: true });
  p.fail(0);
  assert.equal(p.timers.length, 0);
  assert.equal(p.body.children[1].textContent, "Try again");
});

test("a page that is drawn clears the count", () => {
  const p = appPage({ tried: 2 });
  vm.runInContext("clearLoadRetries()", p.sandbox);
  assert.equal("dashboard_load_retries" in p.store, false);
});

/* dashboard-panel.js is a module: its globals are put in place before it is imported. */
async function panelPage({ fetchResults }) {
  const delays = [];
  const fetched = [];
  const results = [...fetchResults];
  const saved = {};
  const put = (name, value) => {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  let PanelClass;
  const body = { textContent: "", children: [], appendChild(el) { this.children.push(el); } };
  put("HTMLElement", class {});
  put("customElements", { define: (name, cls) => (PanelClass = cls) });
  put("document", {
    createElement: () => ({ style: {} }),
    getElementById: (id) => (id === "body" ? body : null),
    head: { appendChild() {} },
    documentElement: {},
  });
  put("window", {});
  put("location", { reload() {} });
  put("setTimeout", (fn, ms) => {
    delays.push(ms);
    return setImmediate(fn);
  });
  put("fetch", async (url) => {
    fetched.push(String(url));
    const next = results.shift();
    if (next instanceof Error) throw next;
    return { ok: true, json: async () => next };
  });
  await import(new URL("dashboard-panel.js?case=" + Math.random(), FRONTEND).href);
  const panel = new PanelClass();
  panel._hass = {};
  return {
    panel,
    delays,
    fetched,
    body,
    restore: () => {
      for (const [name, d] of Object.entries(saved)) d ? Object.defineProperty(globalThis, name, d) : delete globalThis[name];
    },
  };
}

test("a version.json that is lost twice is asked for again after half a second and a second and a half", async () => {
  const p = await panelPage({ fetchResults: [new Error("offline"), new Error("offline"), { version: 5, files: [] }] });
  try {
    p.panel._start();
    await settle();
    assert.equal(p.fetched.length, 3);
    assert.ok(p.fetched.every((u) => u.includes("version.json")));
    assert.deepEqual(p.delays.slice(0, 2), [500, 1500]);
    assert.equal(p.body.textContent, "", "no failure shown");
  } finally {
    p.restore();
  }
});

test("a version.json that cannot be had after four asks is reported with a button", async () => {
  const p = await panelPage({ fetchResults: Array.from({ length: 4 }, () => new Error("offline")) });
  try {
    await p.panel._start();
    assert.equal(p.fetched.length, 4);
    assert.deepEqual(p.delays, [500, 1500, 4000]);
    assert.match(p.body.textContent, /Dashboard could not start: offline/);
    assert.equal(p.body.children[0].textContent, "Try again");
  } finally {
    p.restore();
  }
});
