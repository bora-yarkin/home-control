// SPDX-License-Identifier: GPL-3.0-or-later
// A light made of colour zones: its zone lights are not put on a page by themselves. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function zoneLightIds(states, entities) {
  const context = vm.createContext({ Object, Array });
  vm.runInContext(readFileSync(new URL("model.js", APP), "utf8"), context);
  return plain(context.zoneLightIds(states, entities));
}

test("the zone lights of a gradient light are told apart, and nothing else is", () => {
  const states = {
    "light.tube": { attributes: { zone_colors: [[0, 0], [1, 1]], entity_id: ["light.tube", "light.tube_zone_1", "light.tube_zone_2"] } },
    "light.tube_zone_1": { attributes: {} },
    "light.tube_zone_2": { attributes: {} },
    "light.room": { attributes: { entity_id: ["light.a", "light.b"] } }, // a group, not zones
    "light.a": { attributes: {} },
    "sensor.x": { attributes: { zone_colors: [], entity_id: ["light.a"] } },
  };
  assert.deepEqual(zoneLightIds(states), { "light.tube_zone_1": 1, "light.tube_zone_2": 1 });
});

test("a new dashboard puts the main light of a gradient tube on its page and not its zones", () => {
  const states = {
    "light.tube": { attributes: { friendly_name: "Tube", zone_colors: [[0, 0]], entity_id: ["light.tube", "light.tube_zone_1"] } },
    "light.tube_zone_1": { attributes: { friendly_name: "Tube zone 1" } },
    "light.lamp": { attributes: { friendly_name: "Lamp" } },
  };
  const entities = Object.fromEntries(Object.keys(states).map((id) => [id, { area_id: "room" }]));
  const context = vm.createContext({
    Object,
    Array,
    H: () => ({ states, entities, areas: { room: { area_id: "room", name: "Room" } } }),
    A: (id) => states[id].attributes,
    dom: (id) => id.split(".")[0],
    DOMKIND: { light: "light" },
    defIcon: () => "light",
    areaIdOf: (id) => entities[id].area_id,
    TEMPU: () => "C",
    _T: (k) => k,
  });
  vm.runInContext(readFileSync(new URL("model.js", APP), "utf8"), context);
  const seeded = plain(context.seedUI());
  assert.deepEqual(seeded.devs.r_room.map((d) => d.id), ["light.tube", "light.lamp"]);
});

test("every zone of a strip is found, also the ones its main light does not list: by the unique id they share with it", () => {
  /* A strip of five zones whose main light lists three of them (as Hue Plus reports it). */
  const states = {
    "light.strip": { attributes: { zone_colors: [[0, 0], [0, 0], [0, 0]], entity_id: ["light.strip_zone_1", "light.strip_zone_2", "light.strip_zone_3"] } },
    ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`light.strip_zone_${n}`, { attributes: {} }])),
    "light.lamp": { attributes: {} },
  };
  const entities = {
    "light.strip": { unique_id: "abc-123" },
    ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`light.strip_zone_${n}`, { unique_id: `abc-123_zone_${n}` }])),
    "light.lamp": { unique_id: "lamp-1" },
    "light.orphan_zone_1": { unique_id: "nobody_zone_1" },
    "sensor.strip_zone_9": { unique_id: "abc-123_zone_9" },
  };
  const found = Object.keys(zoneLightIds(states, entities)).sort();
  assert.deepEqual(found, [1, 2, 3, 4, 5].map((n) => `light.strip_zone_${n}`), "all five, and not the lamp, a zone-like light with no main light, or a sensor");
  assert.deepEqual(Object.keys(zoneLightIds(states)).sort(), [1, 2, 3].map((n) => `light.strip_zone_${n}`), "without the registry only what the main light lists is known");
});
