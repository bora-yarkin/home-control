// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the small helpers every part of the dashboard shares (app/core.js): this device's storage, keeping a drag with its
// element, and running live updates so that one failure neither stops the rest nor floods the console. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const core = readFileSync(
  new URL("../../custom_components/home_control/frontend/app/core.js", import.meta.url),
  "utf8"
);
// Only the helpers: from the storage helpers up to the first live-update list that follows them.
const helpers = core.slice(core.indexOf("/* This device's own storage."), core.indexOf("var LIVE = [],"));

function page(storage) {
  const errors = [];
  const sandbox = {
    localStorage: storage,
    console: { error: (...args) => errors.push(args) },
  };
  vm.createContext(sandbox);
  vm.runInContext(helpers, sandbox);
  return { sandbox, errors };
}

const memory = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
};

const refusing = {
  getItem() {
    throw new Error("storage is blocked");
  },
  setItem() {
    throw new Error("storage is blocked");
  },
};

test("storage returns what was written and the fallback for nothing, nothing usable, or a refusing browser", () => {
  const { sandbox } = page(memory({ broken: "{not json", empty: "null" }));
  sandbox.deviceSet("k", { a: [1, 2] });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.deviceGet("k", {}))), { a: [1, 2] });
  assert.equal(sandbox.deviceGet("missing", "fallback"), "fallback");
  assert.equal(sandbox.deviceGet("broken", "fallback"), "fallback");
  assert.equal(sandbox.deviceGet("empty", "fallback"), "fallback");
  const blocked = page(refusing).sandbox;
  assert.equal(blocked.deviceGet("k", 7), 7);
  assert.doesNotThrow(() => blocked.deviceSet("k", 1));
});

test("the display size a device saved before these helpers existed is still read", () => {
  // It was stored as the text 1 or 0, which is also valid JSON.
  assert.equal(page(memory({ db_large: "1" })).sandbox.deviceGet("db_large", 0), 1);
  const { sandbox } = page(memory());
  sandbox.deviceSet("db_large", 1);
  assert.equal(sandbox.localStorage.getItem("db_large"), "1");
});

test("one failing live update does not stop the ones after it, and is reported once", () => {
  const { sandbox, errors } = page(memory());
  const ran = [];
  const failing = () => {
    throw new Error("a section broke");
  };
  const list = [() => ran.push("a"), failing, () => ran.push("c")];
  sandbox.runUpdates(list, "live update");
  sandbox.runUpdates(list, "live update");
  assert.deepEqual(ran, ["a", "c", "a", "c"]);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /live update failed/);
  sandbox.runUpdates([() => { throw new Error("another one"); }], "live update");
  assert.equal(errors.length, 2);
});

test("keeping a drag with its element ignores a missing pointer and a pointer the browser refuses", () => {
  const { sandbox } = page(memory());
  const taken = [];
  const element = { setPointerCapture: (id) => taken.push(id) };
  sandbox.capturePointer(element, { pointerId: 3 });
  sandbox.capturePointer(element, { pointerId: 0 });
  sandbox.capturePointer(element, {});
  sandbox.capturePointer(element, undefined);
  assert.deepEqual(taken, [3, 0]);
  const refusingElement = {
    setPointerCapture() {
      throw new Error("NotFoundError");
    },
  };
  assert.doesNotThrow(() => sandbox.capturePointer(refusingElement, { pointerId: 9 }));
});
