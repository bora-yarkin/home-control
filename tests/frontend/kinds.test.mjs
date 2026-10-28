// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the device setup (app/kinds.js): what belongs to a TV, a camera, a vacuum and an air conditioner, and what is not linked.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../custom_components/home_control/frontend/app/kinds.js", import.meta.url), "utf8");

/* A Home Assistant with the entities given as [entity_id, device_id, attributes, platform]. */
function load(entities, areas = {}) {
  const hass = { entities: {}, states: {} };
  for (const [id, device, attributes = {}, platform = "x"] of entities) {
    hass.entities[id] = { entity_id: id, device_id: device, platform };
    hass.states[id] = { state: "on", attributes };
  }
  const sandbox = {
    H: () => hass,
    A: (id) => (hass.states[id] || { attributes: {} }).attributes,
    dom: (id) => id.split(".")[0],
    areaIdOf: (id) => areas[id] || null,
    areaName: () => "",
    norm: (s) => String(s).toLowerCase(),
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return sandbox;
}

const device = (id, kind, icon, name = "Device") => ({ id, kind, icon, name });

test("a TV links the remote that is on the same device and nothing else of that type", () => {
  const w = load([
    ["media_player.tv", "d1", { supported_features: 2048 | 4 | 256 }],
    ["remote.tv", "d1"],
    ["remote.other", "d2"],
    ["select.tv_picture_mode", "d1"],
  ]);
  const d = device("media_player.tv", "media", "tv");
  assert.equal(w.devSetupKind(d), "tv");
  w.kAuto(d);
  assert.deepEqual([...d.links].sort(), ["remote.tv", "select.tv_picture_mode"]);
});

test("a TV is a full remote when it reports power, volume and sources, or has a remote entity, and a basic one otherwise", () => {
  const w = load([["media_player.full", "a", { supported_features: 128 | 256 | 4 | 2048 }], ["media_player.bare", "b", { supported_features: 1 }], ["remote.bare", "b"]]);
  assert.equal(w.kTier(device("media_player.full", "media", "tv")).tier, "full");
  const bare = device("media_player.bare", "media", "tv");
  assert.equal(w.kTier(bare).tier, "basic");
  bare.links = ["remote.bare"];
  assert.equal(w.kTier(bare).tier, "full");
  assert.ok(w.kTier(device("media_player.bare", "media", "tv")).missing.includes("volume"));
});

test("the core Samsung integration is told that Samsung TV Smart offers more, once Samsung TV Smart is set up it is not", () => {
  const core = load([["media_player.tv", "a", { supported_features: 0 }, "samsungtv"]]);
  assert.equal(core.kTier(device("media_player.tv", "media", "tv")).suggest, "samsungtv_smart");
  const both = load([["media_player.tv", "a", {}, "samsungtv"], ["media_player.tv2", "b", {}, "samsungtv_smart"]]);
  assert.equal(both.kTier(device("media_player.tv", "media", "tv")).suggest, null);
});

test("a camera links its pan, tilt and preset entities and its privacy switch but not settings that only look similar", () => {
  const w = load([
    ["camera.cam", "c"],
    ["button.cam_move_up", "c"],
    ["button.cam_move_left", "c"],
    ["select.cam_move_to_preset", "c"],
    ["switch.cam_privacy", "c"],
    ["switch.cam_lens_distortion_correction", "c"],
    ["switch.cam_trigger_alarm_on_motion_detection", "c"],
    ["binary_sensor.cam_motion", "c"],
  ]);
  const d = device("camera.cam", "camera", "camera");
  w.kAuto(d);
  assert.deepEqual([...d.links].sort(), ["binary_sensor.cam_motion", "button.cam_move_left", "button.cam_move_up", "select.cam_move_to_preset", "switch.cam_privacy"]);
});

test("a second camera entity on the device is the stream, and choosing another replaces it", () => {
  const w = load([["camera.main", "c"], ["camera.sub", "c"], ["camera.third", "c"]]);
  const d = device("camera.main", "camera", "camera");
  w.kAuto(d);
  assert.deepEqual([...d.links], ["camera.sub"]);
  const stream = w.DEVSETUP.camera.slots[0];
  w.kLink(d, stream, "camera.third");
  assert.deepEqual([...d.links], ["camera.third"]);
});

test("entities of a device with no device of its own are found by name and area", () => {
  const w = load([["media_player.living_tv", null, { friendly_name: "Living TV" }], ["remote.living_tv_remote", null, { friendly_name: "Living remote" }], ["remote.kitchen_remote", null, { friendly_name: "Kitchen remote" }]], {
    "media_player.living_tv": "living",
    "remote.living_tv_remote": "living",
    "remote.kitchen_remote": "kitchen",
  });
  assert.deepEqual([...w.kNear("media_player.living_tv")], ["remote.living_tv_remote"]);
});

test("an air conditioner, a vacuum and a purifier get their own setup, a smart speaker none", () => {
  const w = load([]);
  assert.equal(w.devSetupKind(device("climate.ac", "climate", "ac")), "ac");
  assert.equal(w.devSetupKind(device("vacuum.robot", "vacuum", "vacuum")), "vacuum");
  assert.equal(w.devSetupKind(device("fan.x", "fan", "fan", "Air purifier")), "purifier");
  assert.equal(w.devSetupKind(device("fan.y", "fan", "fan", "Ceiling fan")), null);
  assert.equal(w.devSetupKind(device("media_player.homepod", "media", "speaker")), null);
  assert.equal(w.devSetupKind(device("media_player.avr", "media", "music")), "receiver");
  assert.equal(w.devSetupKind(device("light.a", "light", "light")), null);
});

test("a vacuum links its rooms, care readings and options, and links never pass twelve or repeat", () => {
  const entities = [["vacuum.robot", "v"], ["button.robot_clean_kitchen", "v"], ["sensor.robot_filter_left", "v"], ["switch.robot_carpet_mode", "v"], ["number.robot_volume", "v"]];
  for (let i = 0; i < 20; i++) entities.push([`button.robot_clean_room_${i}`, "v"]);
  const w = load(entities);
  const d = device("vacuum.robot", "vacuum", "vacuum");
  w.kAuto(d);
  assert.ok(d.links.includes("sensor.robot_filter_left") && d.links.includes("switch.robot_carpet_mode") && d.links.includes("number.robot_volume"));
  assert.ok(d.links.length <= 12 && new Set(d.links).size === d.links.length);
  w.kUnlink(d, "sensor.robot_filter_left");
  assert.ok(!d.links.includes("sensor.robot_filter_left"));
});

test("finding automatically does not overwrite what is already chosen", () => {
  const w = load([["media_player.tv", "d"], ["remote.tv", "d"], ["remote.mine", "e"]]);
  const d = device("media_player.tv", "media", "tv");
  d.links = ["remote.mine"];
  w.kAuto(d);
  assert.deepEqual([...d.links], ["remote.mine"]);
});
