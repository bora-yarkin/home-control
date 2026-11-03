// SPDX-License-Identifier: GPL-3.0-or-later
// Everything off in a room: which devices, and the script Home Assistant keeps for it. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function page(devs, extra = {}) {
  const context = vm.createContext({
    roomDevs: () => devs,
    lightUnits: (ids) => ids.filter((id) => !id.endsWith("_member")),
    UI: { offx: extra.offx || {} },
    TITLES: { r_bed: "Bed room" },
    _T: (k) => k,
  });
  vm.runInContext(readFileSync(new URL("roomoff.js", APP), "utf8"), context);
  return context;
}

const dev = (id) => ({ id, type: id.split(".")[0] });

test("every kind of device on the room's pages is switched off, lights first, a group and its lights once", () => {
  const p = page([dev("switch.plug"), dev("media_player.tv"), dev("light.a"), dev("light.a_member"), dev("climate.ac"), dev("fan.fan"), dev("light.b"), dev("light.a")]);
  assert.deepEqual(plain(p.roomOffActs("r_bed")), [
    { action: "light.turn_off", target: { entity_id: ["light.a", "light.b"] } },
    { action: "media_player.turn_off", target: { entity_id: ["media_player.tv"] } },
    { action: "climate.turn_off", target: { entity_id: ["climate.ac"] } },
    { action: "fan.turn_off", target: { entity_id: ["fan.fan"] } },
    { action: "switch.turn_off", target: { entity_id: ["switch.plug"] } },
  ]);
});

test("a device that cannot be switched off (a vacuum, a sensor, a camera) is never in it", () => {
  const p = page([dev("vacuum.robot"), dev("sensor.t"), dev("camera.c"), dev("lock.l"), dev("light.a")]);
  assert.deepEqual(plain(p.roomOffActs("r_bed")).map((a) => a.action), ["light.turn_off"]);
});

test("the script carries the dashboard's mark, a name from the room, and lets one failing device not stop the rest", () => {
  const p = page([dev("light.a"), dev("media_player.tv")]);
  const script = plain(p.roomOffScript("r_bed"));
  assert.equal(script.alias, "Bed room · everything_off");
  assert.ok(script.description.startsWith("home_control_room_off"));
  assert.deepEqual(script.sequence.map((s) => s.continue_on_error), [true, true]);
  assert.equal(script.mode, "single");
});

test("a room with nothing to switch off has no script, and a room's script id is a valid object id", () => {
  assert.equal(page([dev("sensor.t")]).roomOffScript("r_bed"), null);
  const p = page([]);
  assert.equal(p.roomOffScriptId("r_bed-2"), "home_control_r_bed_2_off");
  assert.match(p.roomOffScriptId("r_bed-2"), /^[a-z0-9_]+$/);
});

test("a device an administrator left alone is in neither the actions nor the script, but is still listed to be switched back", () => {
  const devs = [dev("light.a"), dev("fan.purifier"), dev("climate.ac")];
  const p = page(devs, { offx: { r_bed: ["fan.purifier"] } });
  assert.deepEqual(plain(p.roomOffDevices("r_bed")).map((d) => d.id), ["light.a", "climate.ac", "fan.purifier"]);
  assert.deepEqual(plain(p.roomOffActs("r_bed")).map((a) => a.action), ["light.turn_off", "climate.turn_off"]);
  assert.deepEqual(plain(p.roomOffScript("r_bed")).sequence.map((s) => s.action), ["light.turn_off", "climate.turn_off"]);
  const onlyOne = page([dev("fan.purifier")], { offx: { r_bed: ["fan.purifier"] } });
  assert.equal(onlyOne.roomOffScript("r_bed"), null, "when everything is left alone there is no script");
});
