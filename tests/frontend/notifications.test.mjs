// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the notification automations (app/notifications.js): they follow the dashboard's devices instead of staying as last saved.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../custom_components/home_control/frontend/app/notifications.js", import.meta.url), "utf8");

/* The page's globals that notifications.js uses. `devices` are the dashboard's devices, `live` the automations in Home Assistant. */
function load({ devices, bats = [], rules, live = {}, getError = {} }) {
  const saved = [];
  const sandbox = {
    _T: (key) => key,
    ISADMIN: true,
    STORE_READY: true,
    OFFLINE: false,
    H: () => ({ services: { notify: { mobile_app_phone: {} } } }),
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    dom: (id) => id.split(".")[0],
    UI: { bats },
    STORE: { notify: { rules } },
    devsOf: (kind) => devices.filter((d) => !kind || d.kind === kind),
    storeChanged() {},
    setTimeout,
    clearTimeout,
    window: {
      HA: {
        automations: {
          get: async (id) => {
            if (getError[id]) throw getError[id];
            if (!(id in live)) throw { status_code: 404 };
            return live[id];
          },
          save: async (id, config) => {
            saved.push([id, config]);
          },
          remove: async () => {},
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, saved };
}

const on = (extra) => ({ on: true, targets: ["mobile_app_phone"], ...extra });
const rules = (extra = {}) => ({
  batt: { on: false, targets: [], thr: 20, ents: [], scope: "default" },
  offline: { on: false, targets: [], mins: 5, ents: [], scope: "default" },
  vacuum: { on: false, targets: [] },
  ...extra,
});
const camera = (id) => ({ id, kind: "camera" });
const light = (id) => ({ id, kind: "light" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/* What the automation held when it was last made, for the same rule on the given devices. */
function built(options, key) {
  const { sandbox } = load(options);
  return JSON.parse(JSON.stringify(sandbox.notifyPayload(key)));
}

test("a device added to the dashboard after the rule was saved is put into the automation", async () => {
  const before = { devices: [camera("camera.door")], rules: rules({ offline: on({ scope: "default" }) }) };
  const live = { dashboard_n_offline: built(before, "offline") };
  const now = { ...before, devices: [camera("camera.door"), camera("camera.garage")], live };
  const { sandbox, saved } = load(now);
  sandbox.notifyReconcile();
  await settle();
  assert.equal(saved.length, 1);
  assert.deepEqual([...saved[0][1].triggers[0].entity_id].sort(), ["camera.door", "camera.garage"]);
});

test("an automation that already watches the right entities is not written again, whatever their order", async () => {
  const options = { devices: [camera("camera.a"), camera("camera.b")], rules: rules({ offline: on() }) };
  const stored = built(options, "offline");
  stored.triggers[0].entity_id.reverse();
  const { sandbox, saved } = load({ ...options, live: { dashboard_n_offline: stored } });
  sandbox.notifyReconcile();
  await settle();
  assert.deepEqual(saved, []);
});

test("a tracked battery sensor that is new is put into the low battery automation", async () => {
  const before = { devices: [], bats: [["Door", "sensor.door_battery"]], rules: rules({ batt: on() }) };
  const live = { dashboard_n_batt: built(before, "batt") };
  const { sandbox, saved } = load({ ...before, bats: [...before.bats, ["Window", "sensor.window_battery"]], live });
  sandbox.notifyReconcile();
  await settle();
  assert.equal(saved.length, 1);
  assert.deepEqual([...saved[0][1].triggers[0].entity_id].sort(), ["sensor.door_battery", "sensor.window_battery"]);
});

test("a chosen list stays what was chosen when other devices appear", async () => {
  const options = { devices: [camera("camera.a")], rules: rules({ offline: on({ scope: "custom", ents: ["light.kept"] }) }) };
  const { sandbox, saved } = load({ ...options, devices: [camera("camera.a"), camera("camera.new")], live: { dashboard_n_offline: built(options, "offline") } });
  sandbox.notifyReconcile();
  await settle();
  assert.deepEqual(saved, []);
});

test("an automation that is missing is made again, but a failed read changes nothing", async () => {
  const options = { devices: [light("light.a")], rules: rules({ offline: on({ scope: "all" }) }) };
  const missing = load(options);
  missing.sandbox.notifyReconcile();
  await settle();
  assert.equal(missing.saved.length, 1);
  const unreachable = load({ ...options, getError: { dashboard_n_offline: { status_code: 500 } } });
  unreachable.sandbox.notifyReconcile();
  await settle();
  assert.deepEqual(unreachable.saved, []);
});

test("a rule that is switched off, a non-admin and an offline page write nothing", async () => {
  const off = load({ devices: [camera("camera.a")], rules: rules({ offline: { ...on(), on: false } }) });
  off.sandbox.notifyReconcile();
  const guest = load({ devices: [camera("camera.a")], rules: rules({ offline: on() }) });
  guest.sandbox.ISADMIN = false;
  guest.sandbox.notifyReconcile();
  const away = load({ devices: [camera("camera.a")], rules: rules({ offline: on() }) });
  away.sandbox.OFFLINE = true;
  away.sandbox.notifyReconcile();
  await settle();
  assert.deepEqual([off.saved, guest.saved, away.saved], [[], [], []]);
});

test("a battery that only says low (a binary sensor) triggers when it turns on, a percentage below the limit", () => {
  const options = { devices: [], bats: [["Door", "sensor.door_battery"], ["Window", "binary_sensor.window_battery_low"]], rules: rules({ batt: on({ thr: 20, ents: [], scope: "default" }) }) };
  const p = built(options, "batt");
  assert.deepEqual(p.triggers, [
    { trigger: "numeric_state", entity_id: ["sensor.door_battery"], below: 20 },
    { trigger: "state", entity_id: ["binary_sensor.window_battery_low"], to: "on" },
  ]);
  assert.match(p.actions[0].data.message, /binary_sensor/);
  const onlyFlags = built({ ...options, bats: [options.bats[1]] }, "batt");
  assert.deepEqual(onlyFlags.triggers.map((t) => t.trigger), ["state"]);
});

test("an alert for any entity is kept when it names an entity, a state and recipients, and builds a state trigger and one message per recipient", () => {
  const { sandbox } = load({ devices: [], rules: rules() });
  const n = JSON.parse(
    JSON.stringify(
      sandbox.cleanNotify({
        rules: {},
        watch: [
          { id: "wabc", name: "Washer", e: "sensor.washer_state", to: "finished", on: true, targets: ["mobile_app_phone", "bad target!"] },
          { id: "wabc", e: "sensor.dup" },
          { id: "BAD", e: "sensor.x" },
          { id: "wxyz", e: "not an entity", to: "x".repeat(60), targets: [] },
        ],
      })
    )
  );
  assert.deepEqual(n.watch.map((w) => w.id), ["wabc", "wxyz"]);
  assert.deepEqual(n.watch[0].targets, ["mobile_app_phone"]);
  assert.equal(n.watch[1].e, "");
  assert.equal(n.watch[1].to.length, 40);
  const p = JSON.parse(JSON.stringify(sandbox.watchPayload(n.watch[0])));
  assert.equal(p.id, "dashboard_n_wabc");
  assert.deepEqual(p.triggers, [{ trigger: "state", entity_id: "sensor.washer_state", to: "finished" }]);
  assert.deepEqual(p.actions.map((a) => a.action), ["notify.mobile_app_phone"]);
  assert.equal(sandbox.watchPayload({ ...n.watch[0], to: "" }), null, "no state, no automation");
  assert.equal(sandbox.watchPayload({ ...n.watch[0], targets: [] }), null, "no recipient, no automation");
});
