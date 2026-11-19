// SPDX-License-Identifier: GPL-3.0-or-later
// The lights master and the light panel's row of lights: every light is a tile of its own, in alphabetical or the owner's order, and a light without an icon takes its group's.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (v) => JSON.parse(JSON.stringify(v));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

/* The room: a group "Iris" (icon set by the owner) of two lights without icons of their own, a group "Floor lamps" of two lights, a lamp with its own icon, and a strip made of zones. */
const states = {
  "light.iris": { attributes: { friendly_name: "Iris", entity_id: ["light.iris_a", "light.iris_b"] } },
  "light.iris_a": { attributes: { friendly_name: "Iris top" } },
  "light.iris_b": { attributes: { friendly_name: "Iris bottom" } },
  "light.floor": { attributes: { friendly_name: "Floor lamps", entity_id: ["light.floor_r", "light.floor_l"] } },
  "light.floor_l": { attributes: { friendly_name: "Floor Light L" } },
  "light.floor_r": { attributes: { friendly_name: "Floor Light R" } },
  "light.desk": { attributes: { friendly_name: "Desk light" } },
  "light.strip": { attributes: { friendly_name: "Light Strip", zone_colors: [[0, 0], [1, 1]], entity_id: ["light.strip", "light.strip_zone_1", "light.strip_zone_2"] } },
  "light.strip_zone_1": { attributes: { friendly_name: "Strip zone 1" } },
  "light.strip_zone_2": { attributes: { friendly_name: "Strip zone 2" } },
};

function load() {
  const context = vm.createContext({
    Object, Array, JSON, Math, Date, Promise, setTimeout, clearTimeout,
    A: (id) => (states[id] || { attributes: {} }).attributes,
    LNAME: { "light.iris": ["Iris", "target"], "light.floor": ["Floor lamps", "lamp"], "light.desk": ["Desk light", "desk"], "light.strip": ["Light Strip", "strip"], "light.iris_a": ["Iris top", "light"] },
    LMASTER_NAME: {},
    LMASTER_ORDER: {},
    deviceGet: (k, d) => d,
    deviceSet: () => {},
    _T: (k) => k,
    zoneMembers: (id) => (states[id].attributes.zone_colors ? states[id].attributes.entity_id.filter((x) => x !== id) : []),
    lightMembers: (id) => {
      const m = states[id].attributes.entity_id;
      return Array.isArray(m) ? m.filter((x) => x !== id) : [];
    },
    lightUnits: (ids) => {
      const inner = new Set(ids.flatMap((id) => (states[id].attributes.entity_id || []).filter((x) => x !== id)));
      return ids.filter((id) => !inner.has(id));
    },
  });
  vm.runInContext(readFileSync(new URL("lightpanel.js", APP), "utf8"), context);
  return context;
}

const ALL = ["light.iris", "light.iris_a", "light.iris_b", "light.floor", "light.floor_l", "light.floor_r", "light.desk", "light.strip"];

test("a light without an icon of its own takes the icon of its group; one with an icon keeps it", () => {
  const c = load();
  const iris = c.lpNodeOf("light.iris", null);
  assert.deepEqual(plain(iris.kids.map((k) => k.icon)), ["target", "target"]); // the plain bulb every light starts with does not count as an icon
  const floor = c.lpNodeOf("light.floor", null);
  assert.deepEqual(plain(floor.kids.map((k) => k.icon)), ["lamp", "lamp"]);
});

test("the row lists every light of a master by name: groups are their lights, a strip of zones is one tile", () => {
  const c = load();
  const master = c.lpMasterNode("s1", ALL);
  const names = c.lpSortLights(c.lpLeaves(master), master.order).map((n) => n.name);
  assert.deepEqual(plain(names), ["Desk light", "Floor Light L", "Floor Light R", "Iris bottom", "Iris top", "Light Strip"]);
});

test("names with numbers are in natural order and case does not matter", () => {
  const c = load();
  const list = ["Lamp 10", "lamp 2", "Lamp 1"].map((name) => ({ key: name, name }));
  assert.deepEqual(plain(c.lpSortLights(list, null).map((n) => n.name)), ["Lamp 1", "lamp 2", "Lamp 10"]);
});

test("an order set by the owner wins; a light not in it goes last, by name", () => {
  const c = load();
  const list = ["a", "b", "c", "d"].map((key) => ({ key, name: key.toUpperCase() }));
  assert.deepEqual(plain(c.lpSortLights(list, ["c", "a"]).map((n) => n.key)), ["c", "a", "b", "d"]);
  assert.deepEqual(plain(c.lpSortLights(list, []).map((n) => n.key)), ["a", "b", "c", "d"]); // empty is alphabetical
});

test("the master takes the order of its section", () => {
  const c = load();
  c.LMASTER_ORDER.s1 = ["light.strip", "light.desk"];
  const master = c.lpMasterNode("s1", ALL);
  const keys = c.lpSortLights(c.lpLeaves(master), master.order).map((n) => n.key);
  assert.deepEqual(plain(keys.slice(0, 2)), ["light.strip", "light.desk"]);
});
