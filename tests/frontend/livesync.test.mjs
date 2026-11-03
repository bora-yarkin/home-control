// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of how the dashboard shares live scenes and areas with Hue Plus (app/livescenes.js): it writes what it saves, deletes what it
// deletes and creates what Hue Plus lacks, and never deletes or overwrites anything else. Run: node --test tests/frontend
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

/* The page's globals that livescenes.js uses. `library` is what Hue Plus holds; every service call it receives is recorded in `calls`. */
function load({ library = { scenes: [], areas: [] }, scenes = [SCENE], areas = [AREA], admin = true, engines = ["hue_plus"], platforms = {} } = {}) {
  const calls = [];
  const sandbox = {
    _T: (key) => key,
    ISADMIN: admin,
    STORE: { scenes: scenes.map((s) => ({ ...s })), eareas: areas.map((a) => ({ ...a })) },
    H: () => ({ entities: Object.fromEntries(Object.entries(platforms).map(([id, platform]) => [id, { platform }])), states: {} }),
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
  vm.runInContext(
    `hpSensor = function () { return ${JSON.stringify(engines.includes("hue_plus") ? "sensor.live_scenes" : null)}; };
     seSensor = function () { return ${JSON.stringify(engines.includes("scene_engine") ? "sensor.scene_engine" : null)}; };
     engineSensor = function () { return hpSensor() || seSensor(); }`,
    sandbox
  );
  return { sandbox, calls, run: (code) => vm.runInContext(code, sandbox) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("opening the dashboard creates what Hue Plus lacks, areas first", async () => {
  const { sandbox, calls } = load();
  sandbox.hpSyncLibrary(true);
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

test("opening the dashboard never deletes or overwrites what Hue Plus holds", async () => {
  const library = {
    scenes: [{ id: "evening_glow", name: "Edited in Hue Plus" }, { id: "made_in_hue_plus", name: "Only there" }],
    areas: [{ id: "room" }, { id: "other_room" }],
  };
  const { sandbox, calls } = load({ library });
  sandbox.hpSyncLibrary(true);
  await settle();
  assert.deepEqual(calls, []);
});

test("an administrator's save writes the area and then the scene, even if Hue Plus has them", () => {
  const { sandbox, calls } = load({ library: { scenes: [{ id: "evening_glow" }], areas: [{ id: "room" }] } });
  sandbox.hpPush(sandbox.STORE.scenes, sandbox.STORE.eareas);
  assert.deepEqual(
    calls.map(([, service, data]) => [service, data.id]),
    [
      ["area_save", "room"],
      ["scene_save", "evening_glow"],
    ]
  );
});

test("deleting in the dashboard deletes that scene or area in Hue Plus, and nothing else", () => {
  const { sandbox, calls } = load();
  sandbox.hpForget("Evening Glow", null);
  sandbox.hpForget(null, "room");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["hue_plus", "scene_delete", { id: "evening_glow" }],
    ["hue_plus", "area_delete", { id: "room" }],
  ]);
});

test("a scene whose area is missing, and an area without lights, are not written", () => {
  const { sandbox, calls } = load({ areas: [{ ...AREA, lights: [] }] });
  sandbox.hpPush(sandbox.STORE.scenes, sandbox.STORE.eareas);
  assert.deepEqual(calls, []);
});

test("a person who is not an administrator writes and deletes nothing", async () => {
  const { sandbox, calls } = load({ admin: false });
  sandbox.hpSyncLibrary(true);
  sandbox.hpPush(sandbox.STORE.scenes, sandbox.STORE.eareas);
  sandbox.hpForget("Evening Glow", "room");
  await settle();
  assert.deepEqual(calls, []);
});

test("a failing read of Hue Plus's library changes nothing", async () => {
  const { sandbox, calls } = load();
  sandbox.HA.serviceResponse = async () => {
    throw new Error("unavailable");
  };
  sandbox.hpSyncLibrary(true);
  await settle();
  assert.deepEqual(calls, []);
});

test("with both installed, a scene whose lights are all Hue's stays in Hue Plus and one with another brand's light goes to Scene engine", async () => {
  const platforms = { "light.left": "hue_plus", "light.right": "matter" };
  const mixed = load({ engines: ["hue_plus", "scene_engine"], platforms });
  assert.equal(mixed.run("liveOwner(STORE.scenes[0])"), "scene_engine");
  mixed.sandbox.hpSyncLibrary(true);
  await settle();
  assert.deepEqual(mixed.calls.map(([domain, service]) => [domain, service]), [["scene_engine", "save_area"], ["scene_engine", "save_scene"]]);
  const hueOnly = load({ engines: ["hue_plus", "scene_engine"], platforms: { "light.left": "hue_plus", "light.right": "hue" } });
  assert.equal(hueOnly.run("liveOwner(STORE.scenes[0])"), "hue_plus");
  const alone = load({ engines: ["scene_engine"], platforms });
  assert.equal(alone.run("liveOwner(STORE.scenes[0])"), "scene_engine");
  const hueAlone = load({ engines: ["hue_plus"], platforms });
  assert.equal(hueAlone.run("liveOwner(STORE.scenes[0])"), "hue_plus");
});

test("the controls of a scene go to the integration that plays it, with that integration's own service names", () => {
  const { sandbox, calls, run } = load({ engines: ["hue_plus", "scene_engine"], platforms: { "light.left": "hue_plus", "light.right": "matter" } });
  run("liveCall(liveOwner(STORE.scenes[0]), 'freeze', { scene_id: 'x' }); liveCall('hue_plus', 'freeze', { scene_id: 'y' })");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["scene_engine", "freeze", { scene_id: "x" }], ["hue_plus", "scene_freeze", { scene_id: "y" }]]);
});

test("stopping the Hue half of a mixed scene stops the whole scene through Scene engine", () => {
  const { calls, run, sandbox } = load({ engines: ["hue_plus", "scene_engine"], platforms: { "light.left": "hue_plus" } });
  run("liveSessions = function () { return { 'se-mix': { lights: ['light.left'] } }; }; lightIndividuals = function (l) { return l; }; dom = function (i) { return i.split('.')[0]; };");
  run("liveStopOn(['light.left'])");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["scene_engine", "stop", { scene_id: "mix" }]]);
});
