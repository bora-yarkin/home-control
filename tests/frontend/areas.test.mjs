// SPDX-License-Identifier: GPL-3.0-or-later
// Which lights can be placed in an area: Home Control plays live scenes for any light, so any light. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function page() {
  const platforms = { "light.hue_a": "hue_plus", "light.hue_b": "hue_plus", "light.hue_core": "hue", "light.matter": "matter" };
  const sandbox = {
    roomDevs: () => Object.keys(platforms).map((id) => ({ id, name: id, icon: "light", type: "light" })),
    zoneMembers: () => [],
    lightIndividuals: (ids) => ids,
    entName: (id) => id,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("areas.js", APP), "utf8"), sandbox);
  return sandbox;
}

test("every light of the room can be placed in an area, whatever its make", () => {
  assert.deepEqual(plain(page().eaRoomLights("room")).map((l) => l.id), ["light.hue_a", "light.hue_b", "light.hue_core", "light.matter"]);
});

function other(extra = {}) {
  const platforms = { "light.tray": "hue_plus", "light.elsewhere": "hue_plus", "light.matter_elsewhere": "matter", "light.group": "hue_plus", "switch.hue_sync": "hue_plus" };
  const members = { "light.group": ["light.tray", "light.in_group"] };
  const toasts = [];
  const sandbox = {
    H: () => ({ entities: Object.fromEntries(Object.entries(platforms).map(([id, platform]) => [id, { platform }])) }),
    candidates: (doms, room, q) => {
      assert.deepEqual(plain(doms), ["light"]);
      return Object.keys(platforms).filter((id) => id.includes(q)).map((id) => ({ id, name: id, area: "" }));
    },
    lightIndividuals: (ids) => ids.flatMap((id) => members[id] || [id]),
    zoneMembers: () => [],
    entName: (id) => id,
    eaStartHeight: () => 0,
    toast: (m) => toasts.push(m),
    _T: (k) => k,
    toasts,
    ...extra,
  };
  platforms["light.in_group"] = "hue_plus";
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("areas.js", APP), "utf8"), sandbox);
  sandbox.EAD = { room: "living", draft: { lights: [] }, v: { byId: { "light.tray": { id: "light.tray" } } } };
  return sandbox;
}

test("any light of Home Assistant that is not in the tray yet can be added, from any room", () => {
  assert.deepEqual(plain(other().eaOtherLights("")).map((c) => c.id), ["light.elsewhere", "light.matter_elsewhere", "light.group", "light.in_group"]);
});

test("a group is offered while one of its members is missing from the tray, and not once all are in", () => {
  const page = other();
  page.EAD.v.byId["light.in_group"] = { id: "light.in_group" };
  assert.deepEqual(plain(page.eaOtherLights("")).map((c) => c.id), ["light.elsewhere", "light.matter_elsewhere"]);
});

test("the search narrows the lights that can be added", () => {
  assert.deepEqual(plain(other().eaOtherLights("where")).map((c) => c.id), ["light.elsewhere", "light.matter_elsewhere"]);
});

test("the sync switches that the device picker lists as lights are not offered", () => {
  assert.ok(!plain(other().eaOtherLights("")).some((c) => c.id.startsWith("switch.")));
});

test("a light of another make is offered too", () => {
  assert.ok(plain(other().eaOtherLights("")).some((c) => c.id === "light.matter_elsewhere"));
});

test("a light added to the area takes the next spot, a bar also gets a direction", () => {
  const page = other();
  assert.equal(page.eaAddLight({ id: "light.elsewhere", icon: "light" }), true);
  assert.equal(page.eaAddLight({ id: "light.strip", icon: "light", bar: true }), true);
  const [first, second] = plain(page.EAD.draft.lights);
  assert.deepEqual([first.id, first.a], ["light.elsewhere", undefined]);
  assert.deepEqual([second.id, second.a, second.p, second.len], ["light.strip", 0, 0, 0.6]);
  assert.notDeepEqual([first.x, first.y], [second.x, second.y]);
});

test("an area holds up to 32 lights and says so", () => {
  const page = other();
  page.EAD.draft.lights = Array.from({ length: 32 }, (_, i) => ({ id: `light.l${i}` }));
  assert.equal(page.eaAddLight({ id: "light.one_more", icon: "light" }), false);
  assert.equal(page.EAD.draft.lights.length, 32);
  assert.deepEqual(plain(page.toasts), ["up_to_32_lights_in_an_area"]);
});

test("the editor offers the page, and the page is registered", () => {
  assert.match(readFileSync(new URL("areas.js", APP), "utf8"), /showPopup\("area-lights", true\)/);
  assert.match(readFileSync(new URL("popups.js", APP), "utf8"), /k === "area-lights"[\s\S]{0,120}build: eaMorePage/);
});

test("a bar's orientation choices set its direction and tilt, and read back as chosen", () => {
  const p = page();
  for (const up of [false, true])
    for (const across of [false, true])
      for (const right of [false, true]) {
        const bar = { a: 33, p: 12 };
        p.eaOrientSet(bar, { up, across, right });
        assert.deepEqual(plain(p.eaOrientOf(bar)), { up, across, right });
      }
  const flat = { a: 0, p: 0 };
  p.eaOrientSet(flat, { up: true, across: true, right: false });
  assert.deepEqual(plain(flat), { a: 90, p: 90 });
});
