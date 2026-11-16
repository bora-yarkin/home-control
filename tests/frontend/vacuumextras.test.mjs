// SPDX-License-Identifier: GPL-3.0-or-later
// A vacuum's popup without a map integration (app/vacuum.js, app/profiles.js): the map is the picture of a camera or an image entity, the buttons say what the vacuum can do now,
// suction is offered when the vacuum lists it, and what is bound under modes or care values is not shown a second time in the header. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const read = (name) => readFileSync(new URL(name, APP), "utf8");

/* The two files' functions on a pretend page; elements are plain objects that remember their class list and clicks. */
function page(states, attrs = {}, uidev = {}) {
  const calls = [];
  const painters = [];
  const el = (cls) => {
    const classes = new Set(String(cls || "").split(" ").filter(Boolean));
    return { children: [], classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) }, appendChild(x) { this.children.push(x); return x; } };
  };
  const sandbox = {
    H: () => ({ states }),
    V_: (id) => (states[id] ? states[id].state : ""),
    A: (id) => attrs[id] || {},
    svOk: (id) => states[id] && !["unavailable", "unknown"].includes(states[id].state),
    dom: (id) => id.split(".")[0],
    UIDEV: uidev,
    _T: (k) => k,
    call: (d, s, data) => calls.push([d, s, data]),
    reg: (fn) => painters.push(fn),
    mk: (tag, cls) => el(cls),
    rbtn: (icon, fn, label) => Object.assign(el("rbtn"), { label, click: fn }),
    pill: (icon, name, o) => Object.assign(el("pill"), { name, o }),
    selectTile: (label, opts, cur, pick) => ({ label, opts, cur, pick }),
    glance: (items, cols) => ({ items, cols }),
    devInfo: () => ({ read: ["sensor.filter", "sensor.brush", "sensor.area"] }),
    advName: (e) => e,
    entVal: (e) => e,
    imgOk: (u) => typeof u === "string" && /^(https:\/\/|\/local\/)/.test(u),
    Array, Object, Number, RegExp,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("vacuum.js").replace(/^var RBV[^\n]*$/m, ""), sandbox);
  vm.runInContext(read("profiles.js"), sandbox);
  return { sandbox, calls, repaint: () => painters.forEach((fn) => fn()) };
}

test("a map is the picture of a camera or an image entity, or a picture the dashboard takes elsewhere, and nothing else", () => {
  const { sandbox } = page({});
  const ok = sandbox.mapPicOk;
  assert.equal(ok("/api/camera_proxy/camera.hallway_map?token=abc123.DEF-4"), true);
  assert.equal(ok("/api/image_proxy/image.floor?token=abc"), true);
  assert.equal(ok("/api/image_proxy/image.floor"), true);
  assert.equal(ok("/local/maps/floor.png"), true);
  assert.equal(ok("https://example.org/map.png"), true);
  for (const bad of ["http://example.org/map.png", "//example.org/map.png", "/api/other/x", "/api/camera_proxy/../states", "/api/camera_proxy/camera.x?token=a b", "javascript:alert(1)", "/api/camera_proxy/camera.x?token=a&x=1", "", null, undefined, "/api/camera_proxy/" + "a".repeat(300)])
    assert.equal(ok(bad), false, String(bad));
});

test("the buttons say what the vacuum can do now: pause only while it cleans, start unless it does, dock unless it is docked or on its way", () => {
  const states = { "vacuum.v": { state: "docked" } };
  const { sandbox, repaint, calls } = page(states, { "vacuum.v": { fan_speed_list: ["quiet", "turbo"], fan_speed: "quiet" } });
  const b = { children: [], appendChild(x) { this.children.push(x); return x; } };
  sandbox.vacGeneric(b, "vacuum.v");
  const row = b.children[1];
  const [start, pause, dock] = row.children;
  const na = () => [start, pause, dock].map((x) => x.classList.has("na"));
  assert.deepEqual(na(), [false, true, true], "docked");
  states["vacuum.v"].state = "cleaning";
  repaint();
  assert.deepEqual(na(), [true, false, false], "cleaning");
  states["vacuum.v"].state = "returning";
  repaint();
  assert.deepEqual(na(), [false, true, true], "returning");
  states["vacuum.v"].state = "paused";
  repaint();
  assert.deepEqual(na(), [false, true, false], "paused");
  states["vacuum.v"].state = "unavailable";
  repaint();
  assert.deepEqual(na(), [true, true, true], "unavailable");
  calls.length = 0;
  for (const x of [start, pause, dock]) x.click();
  assert.deepEqual(calls, [], "a button that cannot be used sends nothing");
  states["vacuum.v"].state = "cleaning";
  repaint();
  start.click();
  pause.click();
  assert.deepEqual(plain(calls.map((c) => c[1])), ["pause"], "only pause works while cleaning");
});

test("suction is a choice among the vacuum's own fan speeds and sends the one chosen; a vacuum that lists none shows no choice", () => {
  const states = { "vacuum.v": { state: "docked" } };
  const { sandbox, calls } = page(states, { "vacuum.v": { fan_speed_list: ["quiet", "turbo"], fan_speed: "quiet" } });
  const b = { children: [], appendChild(x) { this.children.push(x); return x; } };
  sandbox.vacGeneric(b, "vacuum.v");
  const tile = b.children[2].children[0];
  assert.equal(tile.label, "vac_fan_speed");
  assert.deepEqual(Array.from(tile.opts()), ["quiet", "turbo"]);
  assert.equal(tile.cur(), "quiet");
  tile.pick("turbo");
  assert.deepEqual(plain(calls), [["vacuum", "set_fan_speed", { entity_id: "vacuum.v", fan_speed: "turbo" }]]);
  const none = page(states, { "vacuum.v": {} });
  const c = { children: [], appendChild(x) { this.children.push(x); return x; } };
  none.sandbox.vacGeneric(c, "vacuum.v");
  assert.equal(c.children.length, 2, "status and the buttons only");
});

test("a reading bound under care values or modes is not also a chip in the header", () => {
  const states = { "vacuum.v": { state: "docked" } };
  const uidev = { "vacuum.v": { vx: { care: ["sensor.filter"], modes: ["sensor.brush"] } } };
  const { sandbox } = page(states, { "vacuum.v": { battery_level: 80 } }, uidev);
  const b = { children: [], appendChild(x) { this.children.push(x); return x; } };
  sandbox.vacSummary(b, "vacuum.v");
  assert.deepEqual(plain(b.children[0].items.map((i) => i[0])), ["battery", "sensor.area"]);
});

/* model.js alone, with the registries a map decision reads. */
function models(states, entities, uidev = {}) {
  const sandbox = { H: () => ({ states, entities }), Object, Array, ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, iconOk: () => true };
  vm.createContext(sandbox);
  vm.runInContext(read("model.js"), sandbox);
  sandbox.UIDEV = uidev;
  vm.runInContext("UIDEV = globalThis.UIDEV", sandbox);
  return sandbox;
}

test("a camera on the same device as a vacuum is that vacuum's map and not a camera of the house; so is one that was bound as its map", () => {
  const states = { "vacuum.hall": {}, "camera.hall_map": {}, "camera.door": {}, "camera.other_map": {}, "vacuum.bath": {} };
  const entities = {
    "vacuum.hall": { device_id: "d1" },
    "camera.hall_map": { device_id: "d1" },
    "camera.door": { device_id: "d2" },
    "camera.other_map": { device_id: "d3" },
    "vacuum.bath": { device_id: "d4" },
  };
  const m = models(states, entities, { "vacuum.bath": { vx: { map: "camera.other_map" } } });
  assert.equal(m.vacuumMapOf("vacuum.hall"), "camera.hall_map");
  assert.equal(m.vacuumMapOf("vacuum.bath"), "camera.other_map", "a map the person chose wins");
  assert.equal(m.isVacuumMap("camera.hall_map"), true);
  assert.equal(m.isVacuumMap("camera.other_map"), true);
  assert.equal(m.isVacuumMap("camera.door"), false, "a camera on its own device stays a camera");
  assert.equal(m.isVacuumMap("vacuum.hall"), false);
  const none = models({ "vacuum.x": {} }, {});
  assert.equal(none.vacuumMapOf("vacuum.x"), null, "a vacuum with no registry entry has no map");
});

test("the first layout of a home leaves a vacuum's map camera out of the rooms and keeps the vacuum and a real camera", () => {
  const states = {
    "vacuum.hall": { attributes: {} },
    "camera.hall_map": { attributes: {} },
    "camera.door": { attributes: {} },
    "light.l": { attributes: {} },
  };
  const entities = {
    "vacuum.hall": { device_id: "d1", area_id: "a" },
    "camera.hall_map": { device_id: "d1", area_id: "a" },
    "camera.door": { device_id: "d2", area_id: "a" },
    "light.l": { device_id: "d3", area_id: "a" },
  };
  const sandbox = {
    H: () => ({ states, entities, areas: { a: { area_id: "a", name: "Hall" } }, devices: {} }),
    Object, Array, ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, iconOk: () => true,
    zoneLightIds: () => ({}),
    areaIdOf: (id) => entities[id].area_id,
    DOMKIND: { light: "light", vacuum: "vacuum", camera: "camera" },
    dom: (id) => id.split(".")[0],
    A: () => ({}),
    defIcon: () => "x",
    TEMPU: () => "°C",
    _T: (k) => k,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("model.js"), sandbox);
  vm.runInContext("UIDEV = {}", sandbox);
  const seeded = plain(sandbox.seedUI());
  assert.deepEqual(seeded.devs.r_a.map((d) => d.id).sort(), ["camera.door", "light.l", "vacuum.hall"]);
});
