// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the tracked battery sensors (app/manage.js, batsAutoAdd): new ones join the list, ones taken off stay off.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../custom_components/home_control/frontend/app/manage.js", import.meta.url), "utf8");
/* Only the function under test: the rest of manage.js needs the whole page. */
const FUNCTION = SOURCE.slice(SOURCE.indexOf("function batsAutoAdd()"), SOURCE.indexOf("function roomForEntity("));

const SINCE = 1000;
const battery = (id, created, extra = {}) => ({ entity_id: id, created_at: created, ...extra });

function run({ registry, bats = [], batsOff = [], states, isAdmin = true, since = SINCE }) {
  let changes = 0;
  const attributes = (id) => (states[id] || {}).attributes || {};
  const sandbox = {
    H: () => ({ states }),
    ISADMIN: isAdmin,
    STORE_READY: true,
    REG: registry,
    UI: { bats, batsOff, newSince: since },
    A: attributes,
    dom: (id) => id.split(".")[0],
    uiChanged: () => changes++,
  };
  vm.createContext(sandbox);
  vm.runInContext(FUNCTION, sandbox);
  sandbox.batsAutoAdd();
  return { ids: sandbox.UI.bats.map((x) => x[1]), names: sandbox.UI.bats.map((x) => x[0]), changes };
}

const states = (ids) => Object.fromEntries(ids.map((id) => [id, { state: "50", attributes: { device_class: "battery", friendly_name: `${id.split(".")[1]} Battery` } }]));

test("a battery sensor added after the dashboard was set up joins the list, named without the word battery", () => {
  const r = run({ registry: [battery("sensor.new_remote_battery", SINCE + 5)], states: states(["sensor.new_remote_battery"]) });
  assert.deepEqual(r.ids, ["sensor.new_remote_battery"]);
  assert.equal(r.names[0], "new_remote_battery");
  assert.equal(r.changes, 1);
});

test("a sensor taken off the list stays off, and one from before the set-up is not added", () => {
  const ids = ["sensor.removed_battery", "sensor.old_battery"];
  const r = run({
    registry: [battery(ids[0], SINCE + 5), battery(ids[1], SINCE - 5)],
    batsOff: [ids[0]],
    states: states(ids),
  });
  assert.deepEqual(r.ids, []);
  assert.equal(r.changes, 0);
});

test("a sensor that is already tracked, disabled, hidden, not a battery or without a state is not added", () => {
  const ids = ["sensor.tracked", "sensor.disabled", "sensor.hidden", "sensor.temp", "sensor.stateless"];
  const s = states(ids);
  s["sensor.temp"].attributes.device_class = "temperature";
  delete s["sensor.stateless"];
  const r = run({
    registry: [
      battery(ids[0], SINCE + 5),
      battery(ids[1], SINCE + 5, { disabled_by: "user" }),
      battery(ids[2], SINCE + 5, { hidden_by: "user" }),
      battery(ids[3], SINCE + 5),
      battery(ids[4], SINCE + 5),
    ],
    bats: [["Tracked", ids[0]]],
    states: s,
  });
  assert.deepEqual(r.ids, [ids[0]]);
  assert.equal(r.changes, 0);
});

test("only an administrator whose dashboard has a set-up point adds sensors, and the list stops at thirty", () => {
  const options = { registry: [battery("sensor.a_battery", SINCE + 5)], states: states(["sensor.a_battery"]) };
  assert.deepEqual(run({ ...options, isAdmin: false }).ids, []);
  assert.deepEqual(run({ ...options, since: 0 }).ids, []);
  const full = Array.from({ length: 30 }, (_, i) => [`B${i}`, `sensor.b${i}`]);
  assert.equal(run({ ...options, bats: full }).ids.length, 30);
});
