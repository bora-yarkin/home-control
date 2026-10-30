// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the parts of a live scene beyond its palette (app/store.js cleaning, app/livescenes.js sending): the colour source,
// brightness effects, single lights' own settings and the devices a scene also switches. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");

function page() {
  const calls = [];
  const sandbox = {
    _T: (k) => k,
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    ISADMIN: true,
    STORE: { scenes: [], eareas: [] },
    H: () => ({ entities: {}, states: {} }),
    eaIsBar: () => false,
    eaZonePoints: () => [],
    callRaw: (domain, service, data) => calls.push([domain, service, data]),
    setTimeout: (fn) => fn(),
    clearTimeout() {},
    window: { HA: {} },
    HA: { serviceResponse: async () => ({ scenes: [], areas: [] }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(read("store.js"), sandbox);
  vm.runInContext(read("livescenes.js"), sandbox);
  vm.runInContext("engineSensor = function () { return 'sensor.live_scenes'; }; ISADMIN = true;", sandbox);
  const plain = (value) => JSON.parse(JSON.stringify(value));
  return { sandbox, calls, plain, clean: (live) => plain(sandbox.cleanLive(live)) };
}

const BASE = { area: "room", palette: [{ hs: [10, 90] }], speed: 4, range: 80, bri: 50, spread: "x" };

test("a live scene made before these parts existed loads as a plain palette scene", () => {
  const { clean } = page();
  const live = clean(BASE);
  assert.equal(live.src, "palette");
  assert.deepEqual([live.fx, live.looks, live.also], [[], {}, []]);
});

test("the colour source is palette or rainbow, and anything else becomes palette", () => {
  const { clean } = page();
  assert.equal(clean({ ...BASE, src: "rainbow" }).src, "rainbow");
  for (const bad of ["disco", 3, null, ["rainbow"]]) assert.equal(clean({ ...BASE, src: bad }).src, "palette");
});

test("brightness effects: known types only, at most four, speed and strength kept in range", () => {
  const { clean } = page();
  const fx = clean({
    ...BASE,
    fx: [{ type: "pulse", speed: 99, strength: -5 }, { type: "disco" }, null, { type: "flicker" }, { type: "sparkle" }, { type: "lightning" }, { type: "pulse" }],
  }).fx;
  assert.deepEqual(fx, [
    { type: "pulse", speed: 12, strength: 1 },
    { type: "flicker", speed: 6, strength: 60 },
    { type: "sparkle", speed: 6, strength: 60 },
    { type: "lightning", speed: 6, strength: 60 },
  ]);
});

test("single lights: only lights, only known fields, empty looks dropped, at most 32", () => {
  const { clean } = page();
  const many = {};
  for (let i = 0; i < 40; i++) many["light.l" + i] = { bri: 20 };
  assert.equal(Object.keys(clean({ ...BASE, looks: many }).looks).length, 32);
  const looks = clean({
    ...BASE,
    looks: {
      "light.a": { palette: [{ hs: [200, 100] }, { hs: [400, 100] }, null], bri: 500, fx: [], native: "underwater", junk: 1 },
      "light.b": { native: "disco" },
      "light.c": {},
      "switch.d": { bri: 5 },
      "light.e": "x",
    },
  }).looks;
  assert.deepEqual(looks, { "light.a": { palette: [{ hs: [200, 100] }], bri: 100, fx: [], native: "underwater" } });
});

test("devices a scene also switches: on or off, a fixed list of domains, no duplicates, at most twelve", () => {
  const { clean } = page();
  const ok = ["light", "switch", "fan", "media_player", "climate", "humidifier", "input_boolean", "cover"].map((d) => ({ id: d + ".x", on: false }));
  assert.equal(clean({ ...BASE, also: ok }).also.length, 8);
  const also = clean({
    ...BASE,
    also: [{ id: "lock.door", on: false }, { id: "script.go" }, { id: "alarm_control_panel.a" }, { id: "automation.b" }, { id: "Light.X" }, { id: "light.t", on: true }, { id: "light.t", on: false }, { id: "media_player.tv" }],
  }).also;
  assert.deepEqual(also, [{ id: "light.t", on: true }, { id: "media_player.tv", on: true }]);
  const lots = Array.from({ length: 20 }, (_, i) => ({ id: "light.l" + i }));
  assert.equal(clean({ ...BASE, also: lots }).also.length, 12);
});

test("what is sent to Hue Plus carries the source, effects, looks (brightness in 1 to 255) and actions (on or off)", () => {
  const { sandbox, plain } = page();
  const sc = {
    id: "s",
    live: {
      ...BASE,
      src: "rainbow",
      fx: [{ type: "pulse", speed: 3, strength: 40 }],
      looks: { "light.a": { bri: 50, native: "underwater", palette: [{ hs: [1, 2] }], fx: [] }, "light.b": {} },
      also: [{ id: "media_player.tv", on: false }, { id: "switch.plug", on: true }],
    },
  };
  assert.deepEqual(plain(sandbox.liveParts(sc)), {
    colour_source: "rainbow",
    effects: [{ type: "pulse", speed: 3, strength: 40 }],
    looks: { "light.a": { palette: [{ hs: [1, 2] }], brightness: 127, effects: [], native: "underwater" } },
    actions: [{ entity_id: "media_player.tv", do: "off" }, { entity_id: "switch.plug", do: "on" }],
  });
});

test("saving a scene writes the parts to Hue Plus as well", () => {
  const { sandbox, calls, plain } = page();
  sandbox.STORE.eareas = [{ id: "room", name: "Room", room: "living", lights: [{ id: "light.a", x: 0, y: 0, z: 0 }], dummies: [] }];
  const sc = { id: "s", name: "S", room: "living", live: { ...BASE, src: "rainbow", fx: [{ type: "flicker", speed: 5, strength: 30 }], also: [{ id: "fan.f", on: false }] } };
  sandbox.hpPush([sc], []);
  const saved = plain(calls.find(([, service]) => service === "scene_save")[2]);
  assert.equal(saved.colour_source, "rainbow");
  assert.deepEqual(saved.effects, [{ type: "flicker", speed: 5, strength: 30 }]);
  assert.deepEqual(saved.actions, [{ entity_id: "fan.f", do: "off" }]);
});
