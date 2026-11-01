// SPDX-License-Identifier: GPL-3.0-or-later
// With Hue Plus installed the panel shows nothing from the Hue integration, and Hue Plus's scenes are driven as Hue scenes.
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

const row = (entity_id, platform) => ({ entity_id, platform });

test("with Hue Plus installed, entities of the Hue integration are not in the panel's registry", async () => {
  const HA = await adapter([row("scene.read", "hue_plus"), row("scene.read_hue", "hue"), row("light.lamp", "hue_plus"), row("light.other", "matter")]);
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.lamp", "light.other", "scene.read"]);
  assert.deepEqual(plain(await HA.entityRegistry()).map((e) => e.entity_id).sort(), ["light.lamp", "light.other", "scene.read"]);
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
