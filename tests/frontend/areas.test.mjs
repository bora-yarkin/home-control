// SPDX-License-Identifier: GPL-3.0-or-later
// Which lights can be placed in an area: with Hue Plus next to the Hue integration, only Hue lights. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function page(hueOnly) {
  const platforms = { "light.hue_a": "hue_plus", "light.hue_b": "hue_plus", "light.matter": "matter" };
  const sandbox = {
    HPLIB: { hueOnly },
    H: () => ({ entities: Object.fromEntries(Object.entries(platforms).map(([id, platform]) => [id, { platform }])) }),
    roomDevs: () => Object.keys(platforms).map((id) => ({ id, name: id, icon: "light", type: "light" })),
    zoneMembers: () => [],
    lightIndividuals: (ids) => ids,
    entName: (id) => id,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("areas.js", APP), "utf8"), sandbox);
  return sandbox;
}

test("next to the Hue integration only Hue lights can be placed in an area", () => {
  assert.deepEqual(plain(page(true).eaRoomLights("room")).map((l) => l.id), ["light.hue_a", "light.hue_b"]);
});

test("without that, every light of the room can be placed, as before", () => {
  assert.deepEqual(plain(page(false).eaRoomLights("room")).map((l) => l.id), ["light.hue_a", "light.hue_b", "light.matter"]);
});
