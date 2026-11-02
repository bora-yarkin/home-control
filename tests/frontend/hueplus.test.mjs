// SPDX-License-Identifier: GPL-3.0-or-later
// With Hue Plus installed the panel shows nothing from the Hue integration that Hue Plus has an entity for, and Hue Plus's scenes are driven as Hue scenes.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

async function adapter(rows) {
  const sandbox = {
    window: {},
    requestAnimationFrame: (fn) => fn(),
    setTimeout,
    clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("ha-adapter.js"), sandbox);
  const connection = {
    sendMessagePromise: async (msg) => (msg.type === "config/entity_registry/list" ? rows : []),
    subscribeEvents: () => {},
    addEventListener: () => {},
  };
  const HA = sandbox.window.HA;
  HA.attach({ states: {}, services: {}, connection });
  await HA.ready();
  return HA;
}

const row = (entity_id, platform, unique_id = entity_id.replace(/_hue$/, ""), disabled_by = null) => ({ entity_id, platform, unique_id, disabled_by });

test("with Hue Plus installed, entities of the Hue integration are not in the panel's registry", async () => {
  const HA = await adapter([row("scene.read", "hue_plus"), row("scene.read_hue", "hue"), row("light.lamp", "hue_plus"), row("light.other", "matter")]);
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.lamp", "light.other", "scene.read"]);
  assert.deepEqual(plain(await HA.entityRegistry()).map((e) => e.entity_id).sort(), ["light.lamp", "light.other", "scene.read"]);
});

test("an entity of the Hue integration stays when Hue Plus has no entity for it, or its entity is disabled", async () => {
  const HA = await adapter([
    row("light.a", "hue_plus"),
    row("light.a_hue", "hue"),
    row("light.kept", "hue", "kept"), // Hue Plus has none for it (a module is off)
    row("sensor.b", "hue_plus", "b", "user"), // Hue Plus's is disabled
    row("sensor.b_hue", "hue", "b"),
    row("switch.a", "hue", "a"), // the same unique id in another domain is another entity
  ]);
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.a", "light.kept", "sensor.b_hue", "switch.a"]);
});

test("next to the Hue integration (nothing hidden or renamed) the panel still shows Hue Plus's entities only", async () => {
  const HA = await adapter([row("light.floor", "hue", "u1"), row("light.floor_plus", "hue_plus", "u1"), row("light.tv", "matter", "m1")]);
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.floor_plus", "light.tv"]);
});

test("without Hue Plus, the Hue integration's entities are shown as before", async () => {
  const HA = await adapter([row("scene.read", "hue"), row("light.other", "matter")]);
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.other", "scene.read"]);
});

function integrations() {
  const context = { window: { HA: {} } };
  vm.createContext(context);
  vm.runInContext(read("integrations.js"), context);
  return context.window.Integrations.scenes;
}

const state = (name) => ({ attributes: { name }, state: "scening" });

test("a Hue Plus scene is a Hue scene, started with Hue Plus's own service", () => {
  const scenes = integrations();
  const h = { entities: { "scene.a": { platform: "hue_plus" }, "scene.b": { platform: "hue" }, "scene.c": { platform: "matter" } } };
  assert.equal(scenes.isHue(h, "scene.a"), true);
  assert.equal(scenes.isHue(h, "scene.b"), true);
  assert.equal(scenes.isHue(h, "scene.c"), false);
  assert.deepEqual(plain(scenes.start(h, "scene.a", 50, 128)).slice(0, 2), ["hue_plus", "activate_scene"]);
  assert.deepEqual(plain(scenes.start(h, "scene.b", 50, 128)).slice(0, 2), ["hue", "activate_scene"]);
});

test("a Hue Plus scene is on when its room's scene select shows its name, and only a select of the same integration counts", () => {
  const scenes = integrations();
  const h = {
    entities: {
      "scene.read": { platform: "hue_plus", device_id: "room" },
      "select.room": { platform: "hue_plus", device_id: "room" },
      "select.hue_room": { platform: "hue", device_id: "room" },
    },
    states: {
      "scene.read": state("Read"),
      "select.room": { state: "Read", attributes: { options: ["Read", "Relax"] } },
      "select.hue_room": { state: "Read", attributes: { options: ["Read", "Relax"] } },
    },
  };
  assert.equal(scenes.active(h, "scene.read"), true);
  h.states["select.room"].state = "Relax";
  assert.equal(scenes.active(h, "scene.read"), false);
});
