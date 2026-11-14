// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the notification automations (app/notifications.js): they follow the dashboard's devices instead of staying as last saved.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = "../../custom_components/home_control/frontend/app/";
const SOURCE = readFileSync(new URL(APP + "notifications.js", import.meta.url), "utf8");
const BATTERIES = readFileSync(new URL(APP + "batteries.js", import.meta.url), "utf8");

/* The page's globals that notifications.js uses. `devices` are the dashboard's devices, `live` the automations in Home Assistant. */
function load({ devices, bats = [], rules, live = {}, getError = {}, rings = [], states = {}, entities = {}, home = {} }) {
  const saved = [];
  const sandbox = {
    _T: (key) => key,
    ISADMIN: true,
    STORE_READY: true,
    OFFLINE: false,
    H: () => ({ services: { notify: { mobile_app_phone: {} } }, states, entities, devices: home.devices || {}, areas: home.areas || {} }),
    A: (id) => (states[id] || {}).attributes || {},
    V_: (id) => (states[id] || {}).state ?? "",
    modeOf: () => ({ mode: "show" }),
    batLow: () => 20,
    BATLIST: bats,
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    dom: (id) => id.split(".")[0],
    UI: { bats },
    STORE: { notify: { rules } },
    devsOf: (kind) => devices.filter((d) => !kind || d.kind === kind),
    storeChanged() {},
    ixIsRing: (entity) => rings.includes(entity),
    setTimeout,
    clearTimeout,
    window: {
      HA: {
        panelPath: () => "/dashboard",
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
  vm.runInContext(BATTERIES, sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { sandbox, saved };
}

const on = (extra) => ({ on: true, targets: ["mobile_app_phone"], remotes: true, remMins: 30, ...extra });
const rules = (extra = {}) => ({
  batt: { on: false, targets: [], thr: 20, devs: [], scope: "default" },
  offline: { on: false, targets: [], mins: 5, ents: [], scope: "default", remotes: true, remMins: 30 },
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

/* Two devices: a remote with a percentage and a low flag (both are battery sensors of one device), and a sensor with only a low flag. */
const D1 = "a".repeat(32);
const D2 = "b".repeat(32);
const D3 = "c".repeat(32);
const home = {
  devices: { [D1]: { name: "BILRESA remote", name_by_user: "Desk Remote", area_id: "study" }, [D2]: { name: "Window sensor", area_id: null }, [D3]: { name: "Door sensor", area_id: "hall" } },
  areas: { study: { name: "Study" }, hall: { name: "Hall" } },
};
const battery = (id, device, state, extra = {}) => ({
  entity: { device_id: device, ...extra.entity },
  state: { state, attributes: { device_class: "battery", friendly_name: id, ...extra.attributes } },
});
function registry(list) {
  const entities = {};
  const states = {};
  for (const [id, device, state, extra] of list) {
    const b = battery(id, device, state, extra);
    entities[id] = b.entity;
    states[id] = b.state;
  }
  return { entities, states };
}
const remote = registry([
  ["sensor.desk_remote_battery", D1, "80"],
  ["binary_sensor.desk_remote_battery_low", D1, "off"],
  ["binary_sensor.window_battery_low", D2, "off"],
]);

test("a tracked device that is new is put into the low battery automation", async () => {
  const before = { ...remote, home, bats: [D1], devices: [], rules: rules({ batt: on() }) };
  const live = { dashboard_n_batt: built(before, "batt") };
  const { sandbox, saved } = load({ ...before, bats: [D1, D2], live });
  sandbox.notifyReconcile();
  await settle();
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0][1].triggers.map((t) => [t.trigger, [...t.entity_id]]))), [
    ["numeric_state", ["sensor.desk_remote_battery"]],
    ["state", ["binary_sensor.window_battery_low"]],
  ]);
});

test("a device with a percentage is watched by it and not also by its low flag; one with only a flag by the flag", () => {
  const p = built({ ...remote, home, bats: [D1, D2], devices: [], rules: rules({ batt: on({ thr: 20 }) }) }, "batt");
  assert.deepEqual(p.triggers, [
    { trigger: "numeric_state", entity_id: ["sensor.desk_remote_battery"], below: 20 },
    { trigger: "state", entity_id: ["binary_sensor.window_battery_low"], to: "on" },
  ]);
  assert.match(p.actions[0].data.message, /area_name\(e\)/);
  assert.match(p.actions[0].data.message, /binary_sensor/);
  const onlyFlag = built({ ...remote, home, bats: [D2], devices: [], rules: rules({ batt: on() }) }, "batt");
  assert.deepEqual(onlyFlag.triggers.map((t) => t.trigger), ["state"]);
});

test("a chosen set of batteries is what the automation watches, and a device that is gone is left out", () => {
  const chosen = rules({ batt: on({ scope: "custom", devs: [D2, "d".repeat(32)] }) });
  const p = built({ ...remote, home, bats: [D1, D2], devices: [], rules: chosen }, "batt");
  assert.deepEqual(p.triggers, [{ trigger: "state", entity_id: ["binary_sensor.window_battery_low"], to: "on" }]);
});

test("a rule saved before batteries were devices becomes the default one: its sensor choice is not carried over", () => {
  const { sandbox } = load({ devices: [], rules: rules() });
  const old = JSON.parse(JSON.stringify(sandbox.cleanNotify({ rules: { batt: { on: true, targets: ["mobile_app_phone"], scope: "custom", ents: ["sensor.old_battery"] } } })));
  assert.equal(old.rules.batt.scope, "default");
  assert.deepEqual(old.rules.batt.devs, []);
  assert.equal(old.rules.batt.ents, undefined);
  const chosen = JSON.parse(JSON.stringify(sandbox.cleanNotify({ rules: { batt: { scope: "custom", devs: [D1, "not a device", D1] } } })));
  assert.deepEqual([chosen.rules.batt.scope, chosen.rules.batt.devs], ["custom", [D1]]);
});

const sensors = (...ids) => ({
  entities: Object.fromEntries(ids.map((id) => [id, { platform: "fast_matter_switch", device_id: D1 }])),
  states: Object.fromEntries(ids.map((id) => [id, { state: "on", attributes: { device_class: "connectivity" } }])),
});

test("the remotes are watched on their own time: off for as long as the remote setting says, apart from the other devices", () => {
  const r = sensors("binary_sensor.desk_remote_reachable", "binary_sensor.door_remote_reachable");
  const p = built({ ...r, home, devices: [camera("camera.door")], rules: rules({ offline: on({ mins: 10, remMins: 120 }) }) }, "offline");
  assert.deepEqual(p.triggers, [
    { trigger: "state", entity_id: ["camera.door"], to: "unavailable", for: { minutes: 10 } },
    { trigger: "state", entity_id: ["binary_sensor.desk_remote_reachable", "binary_sensor.door_remote_reachable"], to: "off", for: { minutes: 120 } },
  ]);
  assert.match(p.actions[0].data.message, /is offline/);
  assert.match(p.actions[0].data.message, /device_attr\(e, 'name_by_user'\)/);
});

test("with the remotes switched off, or none found, the automation has no remote trigger; only remotes can still make one", () => {
  const r = sensors("binary_sensor.desk_remote_reachable");
  const off = built({ ...r, home, devices: [camera("camera.door")], rules: rules({ offline: on({ remotes: false }) }) }, "offline");
  assert.deepEqual(off.triggers.map((t) => t.to), ["unavailable"]);
  const none = built({ home, devices: [camera("camera.door")], rules: rules({ offline: on() }) }, "offline");
  assert.deepEqual(none.triggers.map((t) => t.to), ["unavailable"]);
  const onlyRemotes = built({ ...r, home, devices: [], rules: rules({ offline: on() }) }, "offline");
  assert.deepEqual(onlyRemotes.triggers.map((t) => t.to), ["off"]);
});

test("a remote that appears after the rule was saved is put into the automation, and the remote time is kept from the saved rule", async () => {
  const before = { ...sensors("binary_sensor.old_remote_reachable"), home, devices: [], rules: rules({ offline: on({ remMins: 60 }) }) };
  const live = { dashboard_n_offline: built(before, "offline") };
  const now = { ...sensors("binary_sensor.old_remote_reachable", "binary_sensor.new_remote_reachable"), home, devices: [], rules: before.rules, live };
  const { sandbox, saved } = load(now);
  sandbox.notifyReconcile();
  await settle();
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0][1].triggers[0].entity_id)), ["binary_sensor.new_remote_reachable", "binary_sensor.old_remote_reachable"]);
  assert.equal(saved[0][1].triggers[0].for.minutes, 60);
  const { sandbox: fresh } = load({ devices: [], rules: rules() });
  const clean = JSON.parse(JSON.stringify(fresh.cleanNotify({ rules: { offline: { remMins: 7, remotes: false } } })));
  assert.deepEqual([clean.rules.offline.remMins, clean.rules.offline.remotes], [30, false]);
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

test("the notification of a door call opens the dashboard when it is tapped; other alerts open nothing in particular", () => {
  const watch = { id: "wdoor", name: "Door", e: "sensor.call_status", to: "ringing", on: true, targets: ["mobile_app_phone"] };
  const door = load({ devices: [], rules: rules(), rings: ["sensor.call_status"] }).sandbox.watchPayload(watch);
  assert.deepEqual(JSON.parse(JSON.stringify(door.actions[0].data.data)), { url: "/dashboard", clickAction: "/dashboard" });
  const other = load({ devices: [], rules: rules() }).sandbox.watchPayload({ ...watch, e: "sensor.washer" });
  assert.equal(other.actions[0].data.data, undefined);
});
