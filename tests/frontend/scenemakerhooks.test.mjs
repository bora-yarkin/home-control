// SPDX-License-Identifier: GPL-3.0-or-later
// What a plus integration adds to making a scene: a way in the new-scene popup (app/scenenew.js) and the lights editor it opens (app/lighteditor.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");

test("a way of making a scene a plugin offers is a row of the new-scene popup, shown only where it is available, and starts with the page and the section", () => {
  const rows = [];
  const started = [];
  const sandbox = {
    PLUGIN_SCENE_MAKERS: [
      { id: "a", title: "ta", sub: "sa", icon: "hue", available: (scope) => scope === "room1", start: (scope, target) => started.push([scope, target]) },
      { id: "b", title: "tb", sub: "sb", start() {} },
    ],
    _T: (k) => `T:${k}`,
    pill: (icon, name, o) => ({ icon, name, sub: o.sub(), tap: o.tap }),
  };
  vm.createContext(sandbox);
  vm.runInContext(read("scenenew.js").slice(read("scenenew.js").indexOf("/* What a plugin offers next to those"), read("scenenew.js").indexOf("/* A classic scene made from the lights")), sandbox);
  const b = { appendChild: (r) => rows.push(r) };
  sandbox.sceneMakerRows(b, "room1", { scope: "room1", sid: "s1" });
  assert.deepEqual(rows.map((r) => [r.name, r.sub, r.icon]), [["T:ta", "T:sa", "hue"], ["T:tb", "T:sb", "scene"]]);
  rows[0].tap();
  assert.deepEqual(started, [["room1", { scope: "room1", sid: "s1" }]]);
  rows.length = 0;
  sandbox.sceneMakerRows(b, "room2", { scope: "room2", sid: "s2" });
  assert.deepEqual(rows.map((r) => r.name), ["T:tb"], "a way that is not available for the page is not offered");
});

function editor(lights, saved, attrs = () => ({})) {
  const sandbox = {
    setTimeout,
    Date,
    A: attrs,
    V_: () => (attrs.watch ? "on" : "off"),
    lightIndividuals: (ids) => ids,
    lightUnits: (ids) => ids,
    lightAct: (id) => ({ id, on: false }),
    LMASTER: {},
    LMASTER_NAME: {},
    LMASTER_ALL: {},
    LWHEEL: {},
    lightsMasterPopup() {},
    callRaw() {},
    POPGUARD: null,
    guardUnsaved(o) {
      sandbox.guard = o;
    },
    showPopup(key, push, after) {
      sandbox.shown = [key, push, typeof after];
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(read("lighteditor.js"), sandbox);
  sandbox.openLightsEditor({ name: "Scene", lights, onSave: saved });
  sandbox.open = () => {
    sandbox.def = sandbox.lightsEditDef();
    sandbox.def.build({});
    return sandbox;
  };
  return sandbox;
}

const until = (test) => new Promise((resolve) => (function tick() { test() ? resolve() : setTimeout(tick, 50); })());

test("the lights editor opens the group's popup with every light switchable, and its checkmark saves what each light shows and leaves", async () => {
  const saved = [];
  const sb = editor(["light.a", "light.b"], (acts) => (saved.push(acts), true));
  await until(() => sb.shown);
  sb.open();
  assert.deepEqual(sb.shown, ["lights-edit", true, "boolean"]);
  assert.deepEqual([...sb.LMASTER.edit], ["light.a", "light.b"]);
  assert.equal(sb.LMASTER_ALL.edit, true, "a light that is off can be switched on from it");
  let left = 0;
  const ok = await sb.guard.save(() => left++);
  assert.equal(ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), [[{ id: "light.a", on: false }, { id: "light.b", on: false }]]);
  assert.equal(left, 1);
});

test("a save that did not happen keeps the popup open", async () => {
  const sb = editor(["light.a"], () => Promise.resolve(false));
  await until(() => sb.shown);
  sb.open();
  let left = 0;
  assert.equal(await sb.guard.save(() => left++), false);
  assert.equal(left, 0);
});

test("the lights editor opens only once the lights have stopped changing, so the popup groups them as they are now", async () => {
  const began = Date.now();
  const changing = () => ({ color_mode: "color_temp", color_temp_kelvin: Date.now() - began < 1000 ? Math.floor((Date.now() - began) / 100) : 2700 });
  changing.watch = true;
  const sb = editor(["light.a"], () => true, changing);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(sb.shown, undefined, "the lights are still changing");
  await until(() => sb.shown);
  assert.ok(Date.now() - began >= 1500, "it waited for the lights to settle");
  assert.deepEqual(sb.shown, ["lights-edit", true, "boolean"]);
});
