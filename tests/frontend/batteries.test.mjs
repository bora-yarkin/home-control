// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the tracked batteries (app/batteries.js): a battery is a device, named "Area · Device", with a percentage and a status;
// new devices join the list, ones taken off stay off, and a device deleted and added again replaces its old self.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../custom_components/home_control/frontend/app/batteries.js", import.meta.url), "utf8");

const SINCE = 1000;
const dev = (n) => String(n).padStart(32, "0").replace(/0/g, "a").slice(0, 31) + String(n % 10);
const [D1, D2, D3] = [dev(1), dev(2), dev(3)];

/* `entities`: [entity id, device id, state, extra]. Every entity is a battery sensor unless `extra.cls` says otherwise. */
function run({ entities = [], devices = {}, areas = {}, bats = [], batsOff = [], isAdmin = true, since = SINCE, low = 20, real = true }) {
  const states = {};
  const registry = {};
  const reg = [];
  for (const [id, device, state, extra = {}] of entities) {
    states[id] = extra.noState ? undefined : { state, attributes: { device_class: extra.cls ?? "battery" } };
    if (extra.noState) delete states[id];
    registry[id] = { device_id: device, hidden: !!extra.hidden };
    reg.push({ entity_id: id, device_id: device, created_at: extra.created ?? SINCE + 5, disabled_by: extra.disabled, hidden_by: extra.hiddenBy });
  }
  let changes = 0;
  let reconciles = 0;
  const sandbox = {
    _T: (key) => key,
    H: () => ({ states, entities: registry, devices, areas }),
    A: (id) => (states[id] || {}).attributes || {},
    V_: (id) => (states[id] || {}).state ?? "",
    dom: (id) => id.split(".")[0],
    ISADMIN: isAdmin,
    STORE_READY: true,
    dataIsReal: () => real,
    REG: reg,
    UI: { bats: [...bats], batsOff, newSince: since },
    BATLIST: [],
    batLow: () => low,
    modeOf: () => ({ mode: "show" }),
    uiChanged: () => changes++,
    notifyReconcileSoon: () => reconciles++,
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, changes: () => changes, reconciles: () => reconciles, bats: () => [...sandbox.UI.bats] };
}

const remote = [
  ["sensor.desk_remote_battery", D1, "80"],
  ["binary_sensor.desk_remote_battery_low", D1, "off"],
];
const devices = { [D1]: { name: "BILRESA remote", name_by_user: "Desk Remote", area_id: "study" }, [D2]: { name: "Window sensor", area_id: null } };
const areas = { study: { name: "Study" } };

test("a device is named Area · Device, by the name the owner gave it, and by its own name without an area", () => {
  const { sandbox } = run({ devices, areas });
  assert.equal(sandbox.batName(D1), "Study · Desk Remote");
  assert.equal(sandbox.batName(D2), "Window sensor");
  assert.equal(sandbox.batName(D3), D3, "a device Home Assistant does not know is shown by its id, not hidden");
});

test("a device with a percentage and a low flag is one battery, and says its percentage and a status", () => {
  const { sandbox } = run({ entities: remote, devices, areas });
  const index = sandbox.batIndex();
  assert.deepEqual(Object.keys(index), [D1]);
  const info = sandbox.batInfo(D1);
  assert.deepEqual([info.name, info.pct, info.low], ["Study · Desk Remote", 80, false]);
  assert.equal(sandbox.batStatusText(info.low), "battery_ok");
});

test("low is a percentage under the limit or the flag being on; a device that says nothing has no status", () => {
  const under = run({ entities: [["sensor.a_battery", D1, "12"]], devices, areas }).sandbox.batInfo(D1);
  assert.deepEqual([under.pct, under.low], [12, true]);
  const edge = run({ entities: [["sensor.a_battery", D1, "20"]], devices, areas }).sandbox.batInfo(D1);
  assert.equal(edge.low, false, "the limit itself is not under it");
  const flag = run({ entities: [["binary_sensor.a_battery_low", D2, "on"]], devices, areas }).sandbox.batInfo(D2);
  assert.deepEqual([flag.pct, flag.low], [null, true]);
  const both = run({ entities: [["sensor.a_battery", D1, "90"], ["binary_sensor.a_battery_low", D1, "on"]], devices, areas }).sandbox.batInfo(D1);
  assert.equal(both.low, true, "a flag that says low wins over a percentage that looks fine");
  const silent = run({ entities: [["sensor.a_battery", D1, "unavailable"]], devices, areas }).sandbox.batInfo(D1);
  assert.deepEqual([silent.pct, silent.low], [null, null]);
  assert.equal(run({ devices, areas }).sandbox.batStatusText(null), "–");
});

test("an entity that is not a battery, hidden, or without a device is not a device's battery", () => {
  const { sandbox } = run({
    entities: [["sensor.temp", D1, "21", { cls: "temperature" }], ["sensor.hidden_battery", D2, "50", { hidden: true }], ["sensor.loose_battery", null, "50"]],
    devices,
    areas,
  });
  assert.deepEqual(Object.keys(sandbox.batIndex()), []);
});

test("a battery device added after the dashboard was set up joins the list once, and the notification is brought to it", () => {
  const r = run({ entities: remote, devices, areas });
  r.sandbox.batsAutoAdd();
  assert.deepEqual(r.bats(), [D1], "its percentage sensor and its flag are one device, so one entry");
  assert.equal(r.changes(), 1);
  assert.equal(r.reconciles(), 1);
  r.sandbox.batsAutoAdd();
  assert.equal(r.changes(), 1, "nothing changed the second time");
});

test("a device taken off the list stays off, and one from before the set-up is not added", () => {
  const entities = [["sensor.removed_battery", D1, "50"], ["sensor.old_battery", D2, "50", { created: SINCE - 5 }]];
  const r = run({ entities, devices, areas, batsOff: [D1] });
  r.sandbox.batsAutoAdd();
  assert.deepEqual(r.bats(), []);
  assert.equal(r.changes(), 0);
});

test("an entity that is disabled, hidden, not a battery, without a state or without a device adds nothing", () => {
  const r = run({
    entities: [
      ["sensor.disabled_battery", D1, "50", { disabled: "user" }],
      ["sensor.hidden_battery", D1, "50", { hiddenBy: "user" }],
      ["sensor.temp", D2, "21", { cls: "temperature" }],
      ["sensor.stateless_battery", D3, "50", { noState: true }],
      ["sensor.loose_battery", null, "50"],
    ],
    devices: { ...devices, [D3]: { name: "Third" } },
    areas,
  });
  r.sandbox.batsAutoAdd();
  assert.deepEqual(r.bats(), []);
  assert.equal(r.changes(), 0);
});

test("only an administrator whose dashboard has a set-up point adds devices, and the list stops at thirty", () => {
  const options = { entities: remote, devices, areas };
  const guest = run({ ...options, isAdmin: false });
  guest.sandbox.batsAutoAdd();
  assert.deepEqual(guest.bats(), []);
  const fresh = run({ ...options, since: 0 });
  fresh.sandbox.batsAutoAdd();
  assert.deepEqual(fresh.bats(), []);
  const full = Array.from({ length: 30 }, (_, i) => dev(100 + i));
  const r = run({ ...options, bats: full, devices: { ...devices, ...Object.fromEntries(full.map((d) => [d, { name: d }])) } });
  r.sandbox.batsAutoAdd();
  assert.equal(r.bats().length, 30);
});

test("a remote deleted and added again is a new device: it joins the list and the old one leaves it", () => {
  const added = [["sensor.new_remote_battery", D3, "100"]];
  const now = { entities: added, devices: { [D3]: { name: "Desk Remote", area_id: "study" } }, areas, bats: [D1] };
  const r = run(now);
  r.sandbox.batsAutoAdd();
  assert.deepEqual(r.bats(), [D3]);
  assert.equal(r.reconciles(), 1);
});

test("a device Home Assistant no longer has is taken off the list, but nothing is removed before it has told which devices it has", () => {
  const known = run({ devices, areas, bats: [D1, D3] });
  assert.equal(known.sandbox.batsPrune(), true);
  assert.deepEqual(known.bats(), [D1]);
  const loading = run({ devices: {}, areas, bats: [D1, D3] });
  assert.equal(loading.sandbox.batsPrune(), false);
  assert.deepEqual(loading.bats(), [D1, D3]);
});

test("nothing joins or leaves the list while the dashboard or the registries are only the copies of the last visit", () => {
  const r = run({
    entities: [["sensor.new_battery", D2, "80"]],
    devices: { [D2]: { name: "New remote" } },
    bats: [D1],
    real: false,
  });
  r.sandbox.batsAutoAdd();
  assert.deepEqual(r.bats(), [D1], "the new device is not added and the old one (not in this copy of the registry) is not taken off");
  assert.equal(r.changes(), 0);
  assert.equal(r.reconciles(), 0);
});
