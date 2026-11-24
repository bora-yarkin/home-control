// SPDX-License-Identifier: GPL-3.0-or-later
// The Siri and HomeKit page (decision D-23): which scenes it lists, what the two switches do, and in what order. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../custom_components/home_control/frontend/app/sharing.js", import.meta.url), "utf8");
const logic = source.slice(0, source.indexOf("/* A switch with its name"));

function world({ states = {}, scenes = [], bridge = { entry_id: "hk", title: "Bridge", editable: true, exposed: {} }, published = {}, area = { id: "room" } } = {}) {
  const log = [];
  const toasts = [];
  const sandbox = {
    Promise,
    Object,
    String,
    SHARE: undefined,
    H: () => ({ states }),
    STORE: { scenes },
    dom: (id) => id.split(".")[0],
    A: (id) => (states[id] || {}).attributes || {},
    pluginSceneKind: (id) => (id.startsWith("scene.hue_") ? { icon: "palette" } : null),
    pluginDeviceKind: (id) => (id === "switch.sync" ? { sync: true, icon: "sparkle" } : id === "switch.other" ? { icon: "plug" } : null),
    hkDevices: () => [],
    liveIcon: () => "sparkle",
    liveId: (id) => String(id),
    liveSceneArea: () => area,
    liveAreaPayload: () => ({ id: "room" }),
    liveScenePayload: (sc) => ({ id: sc.id }),
    LIVESVC: { area: "area_save", scene: "scene_save" },
    callRaw: (domain, service, data) => {
      log.push(["service", service, data.id]);
      return Promise.resolve();
    },
    toast: (t) => toasts.push(t),
    _T: (k) => k,
    HA: {
      sharing: {
        published: () => Promise.resolve({ scenes: published }),
        tvHome: () => Promise.resolve({ calls: {} }),
        publish: (id, on) => {
          log.push(["publish", id, on]);
          return Promise.resolve({ entity_id: on ? "scene." + id : null });
        },
        homekit: (ids) => Promise.resolve({ bridges: bridge ? [{ ...bridge, exposed: Object.fromEntries(ids.map((i) => [i, !!bridge.exposed[i]])) }] : [] }),
        expose: (entry, id, on) => {
          log.push(["expose", id, on]);
          return Promise.resolve({ changed: true });
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(logic, sandbox);
  return { w: sandbox, log, toasts };
}

const state = (id, attributes = {}) => [id, { state: "off", attributes }];

test("the page lists live scenes, Hue scenes, other scenes and the switches a plus integration calls a sync, and nothing else", () => {
  const states = Object.fromEntries([
    state("scene.hue_bedroom_soho", { friendly_name: "Soho" }),
    state("scene.evening", { friendly_name: "Evening" }),
    state("scene.evening_glow", { friendly_name: "Evening glow", live: true, scene_id: "glow" }),
    state("switch.sync", { friendly_name: "Spotify sync" }),
    state("switch.other", { friendly_name: "Plain switch" }),
    state("light.lamp"),
  ]);
  const { w } = world({ states, scenes: [{ id: "glow", name: "Glow", live: {} }, { id: "static", name: "Static" }] });
  const items = vm.runInContext("shareItems()", w).map((i) => [i.group, i.name]);
  assert.deepEqual(JSON.parse(JSON.stringify(items.sort())), [["classic", "Evening"], ["hue", "Soho"], ["live", "Glow"], ["sync", "Spotify sync"]]);
});

test("a scene that is its own entity is shared as it is; a live scene has an entity only once it is published", () => {
  const { w } = world({ published: { glow: "scene.glow" } });
  vm.runInContext("SHARE = { bridge: { exposed: { 'scene.glow': true } }, published: { glow: 'scene.glow' } }", w);
  assert.equal(vm.runInContext("shareEntity({ entity: 'scene.evening' })", w), "scene.evening");
  assert.equal(vm.runInContext("shareEntity({ live: 'glow' })", w), "scene.glow");
  assert.equal(vm.runInContext("shareEntity({ live: 'other' })", w), "");
  assert.equal(vm.runInContext("shareStatus({ live: 'glow' })", w), "homekit · shortcuts");
  assert.equal(vm.runInContext("shareStatus({ live: 'other' })", w), "not_shared_yet");
  assert.equal(vm.runInContext("shareStatus({ entity: 'scene.evening' })", w), "shortcuts");
});

test("loading takes the first HomeKit Bridge that can be changed, and notes the exposure of every shared entity", async () => {
  const states = Object.fromEntries([state("scene.evening"), state("scene.night")]);
  const { w } = world({ states, published: { glow: "scene.glow" }, bridge: { entry_id: "hk", title: "Bridge", editable: true, exposed: { "scene.night": true, "scene.glow": true } } });
  vm.runInContext("SHARE = { bridge: null, bridges: 0, published: {}, tv: {}, ready: false, failed: false }", w);
  await new Promise((done) => vm.runInContext("shareLoad", w)(done));
  const share = vm.runInContext("SHARE", w);
  assert.equal(share.ready, true);
  assert.equal(share.bridge.entry_id, "hk");
  assert.deepEqual(JSON.parse(JSON.stringify(share.published)), { glow: "scene.glow" });
  assert.equal(share.bridge.exposed["scene.night"], true);
  assert.equal(share.bridge.exposed["scene.evening"], false);
});

test("a bridge set up in configuration.yaml, or no bridge, leaves HomeKit with nothing to change", async () => {
  for (const bridge of [null, { entry_id: "y", title: "Yaml", editable: false, exposed: {} }]) {
    const { w } = world({ bridge });
    vm.runInContext("SHARE = { bridge: null, bridges: 0, published: {}, tv: {}, ready: false, failed: false }", w);
    await new Promise((done) => vm.runInContext("shareLoad", w)(done));
    assert.equal(vm.runInContext("SHARE.bridge", w), null);
    assert.equal(vm.runInContext("SHARE.bridges", w), bridge ? 1 : 0);
  }
});

test("HomeKit for a scene that is an entity puts it on the list; with no bridge it says so and changes nothing", async () => {
  const { w, log, toasts } = world();
  vm.runInContext("SHARE = { bridge: { entry_id: 'hk', exposed: {} }, published: {} }", w);
  await new Promise((done) => vm.runInContext("shareSetHomekit", w)({ entity: "scene.evening" }, true, done));
  assert.deepEqual(JSON.parse(JSON.stringify(log)), [["expose", "scene.evening", true]]);
  assert.equal(vm.runInContext("SHARE.bridge.exposed['scene.evening']", w), true);
  vm.runInContext("SHARE.bridge = null", w);
  vm.runInContext("shareSetHomekit", w)({ entity: "scene.evening" }, true, () => assert.fail("nothing to do"));
  assert.deepEqual(JSON.parse(JSON.stringify(toasts)), ["share_no_bridge_short"]);
  assert.equal(log.length, 1);
});

test("HomeKit for a live scene first saves it in the integration, publishes it, and then puts its entity on the list", async () => {
  const { w, log } = world();
  vm.runInContext("SHARE = { bridge: { entry_id: 'hk', exposed: {} }, published: {} }", w);
  const live = { live: "glow", sc: { id: "glow" } };
  await new Promise((done) => vm.runInContext("shareSetHomekit", w)(live, true, done));
  assert.deepEqual(JSON.parse(JSON.stringify(log)), [["service", "area_save", "room"], ["service", "scene_save", "glow"], ["publish", "glow", true], ["expose", "scene.glow", true]]);
  assert.equal(vm.runInContext("SHARE.published.glow", w), "scene.glow");
});

test("a live scene with no area cannot be shared, and the person is told", async () => {
  const { w, log, toasts } = world({ area: null });
  vm.runInContext("SHARE = { bridge: { entry_id: 'hk', exposed: {} }, published: {} }", w);
  vm.runInContext("shareSetHomekit", w)({ live: "glow", sc: { id: "glow" } }, true, () => assert.fail("nothing was shared"));
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(JSON.parse(JSON.stringify(log)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(toasts)), ["this_scene_has_no_area"]);
});

test("switching HomeKit off for a live scene that was never published does nothing; unpublishing takes it off the list as well", async () => {
  const { w, log } = world();
  vm.runInContext("SHARE = { bridge: { entry_id: 'hk', exposed: {} }, published: {} }", w);
  await new Promise((done) => {
    vm.runInContext("shareSetHomekit", w)({ live: "glow", sc: { id: "glow" } }, false, done);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(log)), []);
  vm.runInContext("SHARE = { bridge: { entry_id: 'hk', exposed: { 'scene.glow': true } }, published: { glow: 'scene.glow' } }", w);
  await new Promise((done) => vm.runInContext("shareSetPublished", w)({ live: "glow" }, false, done));
  assert.deepEqual(JSON.parse(JSON.stringify(log)), [["publish", "glow", false]]);
  assert.equal(vm.runInContext("SHARE.published.glow", w), undefined);
  assert.equal(vm.runInContext("'scene.glow' in SHARE.bridge.exposed", w), false);
});

test("the page is wired in: a settings category, its popups, administrators only, and its calls to the integration", () => {
  const frontend = (file) => readFileSync(new URL("../../custom_components/home_control/frontend/" + file, import.meta.url), "utf8");
  assert.match(frontend("app/settings.js"), /\["share", _T\("siri_and_homekit"\), "stg-share"/);
  assert.match(frontend("app/popups.js"), /"stg-share": function[\s\S]*build: sharePage/);
  assert.match(frontend("app/popups.js"), /"share-how": function/);
  assert.match(frontend("app/access.js"), /stg-\|share-how\|/);
  assert.match(frontend("version.json"), /app\/sharing\.js/);
  const adapter = frontend("ha-adapter.js");
  for (const type of ["published", "publish", "homekit", "homekit_expose"]) assert.match(adapter, new RegExp(`type:"home_control/${type}"`));
});
