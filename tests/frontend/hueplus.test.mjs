// SPDX-License-Identifier: GPL-3.0-or-later
// A plus integration that declares it replaces another integration's entities (Hue Plus replaces Hue's): the panel shows nothing of the replaced integration that it has an entity for.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

async function adapter(rows, plugins = [{ id: "hue_plus", name: "Hue Plus", menu: "/hue_plus_static/menu.js", version: "1", replaces: ["hue"] }]) {
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
    sendMessagePromise: async (msg) => (msg.type === "config/entity_registry/list" ? rows : msg.type === "home_control/plugins" ? { plugins } : []),
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

test("what is replaced is what a plus integration declares, not a brand the panel knows", async () => {
  const rows = [row("light.a", "other_plus", "u1"), row("light.a_orig", "orig", "u1"), row("light.a_hue", "hue", "u1")];
  const HA = await adapter(rows, [{ id: "other_plus", name: "Other Plus", menu: "", version: "", replaces: ["orig"] }]);
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.a", "light.a_hue"]);
});

test("when Home Control cannot say what is replaced, nothing is hidden", async () => {
  const sandbox = { window: {}, requestAnimationFrame: (fn) => fn(), setTimeout, clearTimeout, console };
  vm.createContext(sandbox);
  vm.runInContext(read("ha-adapter.js"), sandbox);
  const rows = [row("light.a", "hue_plus", "u1"), row("light.a_hue", "hue", "u1")];
  const connection = {
    sendMessagePromise: async (msg) => {
      if (msg.type === "home_control/plugins") throw new Error("unknown command");
      return msg.type === "config/entity_registry/list" ? rows : [];
    },
    subscribeEvents: () => {},
    addEventListener: () => {},
  };
  const HA = sandbox.window.HA;
  HA.attach({ states: {}, services: {}, connection });
  await HA.ready();
  assert.deepEqual(Object.keys(plain(HA.hass().entities)).sort(), ["light.a", "light.a_hue"]);
});
