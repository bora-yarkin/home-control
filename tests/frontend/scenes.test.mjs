// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the scenes a room lists from Home Assistant (app/scenes.js, sceneIds). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function page(entities) {
  const states = Object.fromEntries(Object.keys(entities).map((id) => [id, { attributes: { friendly_name: id } }]));
  const sandbox = { H: () => ({ states, entities, devices: {} }), A: (id) => states[id].attributes };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("scenes.js", APP), "utf8"), sandbox);
  return sandbox;
}

test("a room lists the scenes of its area once: the copy Home Assistant hides is left out", () => {
  const { sceneIds } = page({
    "scene.read": { area_id: "bedroom" },
    "scene.read_hue": { area_id: "bedroom", hidden: true },
    "scene.relax": { area_id: "bedroom" },
    "scene.other_room": { area_id: "kitchen" },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sceneIds("bedroom"))), [["scene.read"], ["scene.relax"]]);
});
