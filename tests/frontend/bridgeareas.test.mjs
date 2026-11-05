// SPDX-License-Identifier: GPL-3.0-or-later
// An entertainment area of the bridge in the dashboard's placement editor: a light stands where the Hue app shows it, comes back to the bridge where it was, and a light the editor cannot show is kept.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));

/* Lights of a real bridge's area (names and ids invented), as `get_resources` lists them: the bridge counts y from the left corner of the room to the back corner. */
const AREA = {
  id: "area-1",
  name: "Bedroom",
  lights: [
    { light_id: "h-floor-l", x: -1, y: 1, z: -0.18445, balance: 1 }, // the back corner of the room, near the floor
    { light_id: "h-bed", x: -0.61361, y: -1, z: 0.40584, balance: 2 }, // along the left-back wall
    { light_id: "h-ceil", x: 0.13413, y: -0.02331, z: 1, balance: 1 },
    { light_id: "h-unknown", x: 0.5, y: 0.5, z: 0 }, // a light Home Assistant has no entity for
  ],
};
const ENTITY = { "light.floor_l": "h-floor-l", "light.bed": "h-bed", "light.ceil": "h-ceil" };

function load() {
  const context = vm.createContext({
    Object,
    Math,
    Array,
    A: (id) => ({ hue_light_id: ENTITY[id] }),
    H: () => ({}),
    Integrations: { hueplus: { lights: () => Object.keys(ENTITY), has: () => true, bridge: () => ({}) } },
    eaClamp: (v) => Math.max(-1, Math.min(1, v)),
  });
  vm.runInContext(readFileSync(new URL("hueplus.js", APP), "utf8"), context);
  return context;
}

test("the editor's y is the bridge's turned over, and x and the height are the same", () => {
  const { hpFlip } = load();
  assert.equal(hpFlip(1), -1);
  assert.equal(hpFlip(-0.5), 0.5);
  assert.ok(Object.is(hpFlip(0), 0)); // never -0
});

test("a light of a bridge area is drawn where the Hue app shows it", () => {
  const draft = plain(load().hpBridgeDraft(AREA));
  const by = Object.fromEntries(draft.lights.map((l) => [l.id, l]));
  // The Hue app shows this light at the back corner of its room; the editor's back corner is (x -1, y -1).
  assert.deepEqual([by["light.floor_l"].x, by["light.floor_l"].y], [-1, -1]);
  // Along the left-back wall is the editor's y = 1.
  assert.equal(by["light.bed"].y, 1);
  assert.equal(by["light.ceil"].x, 0.13413);
  assert.equal(by["light.ceil"].z, 1);
});

test("a light the editor cannot show is kept and sent back as it was, and the others come back where they were", () => {
  const ctx = load();
  const draft = ctx.hpBridgeDraft(AREA);
  assert.deepEqual(plain(draft.kept), [{ light: "h-unknown", x: 0.5, y: 0.5, z: 0, balance: undefined }].map((l) => JSON.parse(JSON.stringify(l))));
  // What goes back to the bridge for the editor's lights is what was read, with the balance it had.
  const back = plain(draft.lights).map((l) => ({ light: ENTITY[l.id], x: l.x, y: ctx.hpFlip(l.y), z: l.z, balance: l.balance }));
  for (const l of back) {
    const was = AREA.lights.find((x) => x.light_id === l.light);
    assert.deepEqual([l.x, l.y, l.z, l.balance], [was.x, was.y, was.z, was.balance]);
  }
});

test("importing an area into the dashboard and sending it back are the same turn", () => {
  const ctx = load();
  const imported = plain(ctx.hpAreaLightsOf({ lights: AREA.lights }, null));
  const floor = imported.find((l) => l.id === "light.floor_l");
  assert.deepEqual([floor.x, floor.y], [-1, -1]);
});
