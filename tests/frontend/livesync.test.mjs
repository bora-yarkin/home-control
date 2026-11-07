// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of how the dashboard shares live scenes and areas with Home Control's integration (app/livescenes.js): it writes what it saves,
// deletes what it deletes and creates what the integration lacks, and never deletes or overwrites anything else. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = "../../custom_components/home_control/frontend/app/";
// livescenes.js plays and shares scenes; livemaker.js says which area a scene plays in.
const SOURCE = ["livescenes.js", "livemaker.js"].map((f) => readFileSync(new URL(APP + f, import.meta.url), "utf8")).join("\n");

const LIGHTS = [
  { id: "light.left", x: -1, y: 0, z: 0 },
  { id: "light.right", x: 1, y: 0, z: 0 },
];
const AREA = { id: "room", name: "Room", room: "living", lights: LIGHTS, dummies: [] };
const SCENE = {
  id: "Evening Glow",
  name: "Evening glow",
  room: "living",
  icon: "palette",
  live: { area: "room", palette: [{ hs: [20, 90] }], speed: 4, range: 80, bri: 50, spread: "x" },
};

/* The page's globals that livescenes.js uses. `library` is what the integration holds; every service call it receives is recorded in `calls`. */
function load({ library = { scenes: [], areas: [] }, scenes = [SCENE], areas = [AREA], admin = true } = {}) {
  const calls = [];
  const sandbox = {
    _T: (key) => key,
    ISADMIN: admin,
    STORE: { scenes: scenes.map((s) => ({ ...s })), eareas: areas.map((a) => ({ ...a })) },
    H: () => ({ entities: {}, states: {} }),
    eaIsBar: () => false,
    eaZonePoints: () => [],
    callRaw: (domain, service, data) => calls.push([domain, service, data]),
    setTimeout: (fn) => fn(),
    clearTimeout() {},
    window: { HA: {} },
    HA: { serviceResponse: async () => library },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  vm.runInContext("engineSensor = function () { return 'sensor.live_scenes'; }", sandbox);
  return { sandbox, calls, run: (code) => vm.runInContext(code, sandbox) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("opening the dashboard creates what the integration lacks, areas first", async () => {
  const { sandbox, calls } = load();
  sandbox.liveSyncLibrary(true);
  await settle();
  assert.deepEqual(
    calls.map(([, service, data]) => [service, data.id]),
    [
      ["area_save", "room"],
      ["scene_save", "evening_glow"],
    ]
  );
  assert.equal(calls[1][2].brightness, 127); // 50 percent of 255, as the dashboard always rounded it
  assert.equal(calls[1][2].area, "room");
});

test("opening the dashboard never deletes or overwrites what the integration holds", async () => {
  const library = {
    scenes: [{ id: "evening_glow", name: "Edited by a service" }, { id: "made_by_a_service", name: "Only there" }],
    areas: [{ id: "room" }, { id: "other_room" }],
  };
  const { sandbox, calls } = load({ library });
  sandbox.liveSyncLibrary(true);
  await settle();
  assert.deepEqual(calls, []);
});

test("an administrator's save writes the area and then the scene, even if the integration has them", () => {
  const { sandbox, calls } = load({ library: { scenes: [{ id: "evening_glow" }], areas: [{ id: "room" }] } });
  sandbox.livePush(sandbox.STORE.scenes, sandbox.STORE.eareas);
  assert.deepEqual(
    calls.map(([, service, data]) => [service, data.id]),
    [
      ["area_save", "room"],
      ["scene_save", "evening_glow"],
    ]
  );
});

test("deleting in the dashboard deletes that scene or area in the integration, and nothing else", () => {
  const { sandbox, calls } = load();
  sandbox.liveForget("Evening Glow", null);
  sandbox.liveForget(null, "room");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["home_control", "scene_delete", { id: "evening_glow" }],
    ["home_control", "area_delete", { id: "room" }],
  ]);
});

test("a scene whose area is missing, and an area without lights, are not written", () => {
  const { sandbox, calls } = load({ areas: [{ ...AREA, lights: [] }] });
  sandbox.livePush(sandbox.STORE.scenes, sandbox.STORE.eareas);
  assert.deepEqual(calls, []);
});

test("a person who is not an administrator writes and deletes nothing", async () => {
  const { sandbox, calls } = load({ admin: false });
  sandbox.liveSyncLibrary(true);
  sandbox.livePush(sandbox.STORE.scenes, sandbox.STORE.eareas);
  sandbox.liveForget("Evening Glow", "room");
  await settle();
  assert.deepEqual(calls, []);
});

test("a failing read of the integration's library changes nothing", async () => {
  const { sandbox, calls } = load();
  sandbox.HA.serviceResponse = async () => {
    throw new Error("unavailable");
  };
  sandbox.liveSyncLibrary(true);
  await settle();
  assert.deepEqual(calls, []);
});

test("everything the dashboard writes goes to Home Control's own services", async () => {
  const { sandbox, calls } = load();
  sandbox.liveSyncLibrary(true);
  await settle();
  sandbox.liveForget("Evening Glow", "room");
  assert.deepEqual([...new Set(calls.map(([domain]) => domain))], ["home_control"]);
});

test("the controls of a scene are Home Control's services, whatever the lights are", () => {
  const { calls, run } = load();
  run("liveCall('freeze', { scene_id: 'x' }); liveCall('play', { scene_id: 'x' }); liveCall('update', { scene_id: 'x', speed: 3 }); liveCall('stop', { scene_id: 'x' })");
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls)).map(([domain, service]) => [domain, service]),
    [["home_control", "scene_freeze"], ["home_control", "scene_play"], ["home_control", "scene_update"], ["home_control", "scene_stop"]]
  );
});

test("something else about to set a light stops the live scenes playing on it, and no other", () => {
  const { calls, run } = load();
  run(
    "liveSessions = function () { return { mix: { lights: ['light.left'] }, other: { lights: ['light.far'] } }; }; lightIndividuals = function (l) { return l; }; dom = function (i) { return i.split('.')[0]; };"
  );
  run("liveStopOn(['light.left'])");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["home_control", "scene_stop", { scene_id: "mix" }]]);
});
