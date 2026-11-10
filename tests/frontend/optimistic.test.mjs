// SPDX-License-Identifier: GPL-3.0-or-later
// A command is drawn at once and dropped as soon as Home Assistant says anything else (app/core.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const core = readFileSync(new URL("../../custom_components/home_control/frontend/app/core.js", import.meta.url), "utf8");
const optimistic = core.slice(core.indexOf("var OPT = {},"), core.indexOf("var CMDERR"));
const entIds = core.slice(core.indexOf("function entIds(data)"), core.indexOf("function call(d, s, data)"));

function page(states) {
  const painted = [];
  const sandbox = {
    S: (id) => states[id],
    A: (id) => (states[id] && states[id].attributes) || {},
    requestAnimationFrame: (fn) => (painted.push(fn), painted.length),
    refresh: () => painted.push("refresh"),
    Date: { now: () => sandbox.now },
    now: 1000,
  };
  vm.createContext(sandbox);
  vm.runInContext(entIds + optimistic, sandbox);
  return { sandbox, painted };
}
const light = (state, attributes = {}) => ({ state, attributes });

test("ten lights turned off together all read off at once, before any of them reports", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `light.l${i}`);
  const { sandbox } = page(Object.fromEntries(ids.map((id) => [id, light("on", { brightness: 200 })])));
  sandbox.optStart("light", "turn_off", { entity_id: ids });
  assert.deepEqual(ids.map((id) => sandbox.V_(id)), ids.map(() => "off"));
});

test("it is dropped when Home Assistant reports the target, and the real state shows again", () => {
  const states = { "light.a": light("on") };
  const { sandbox } = page(states);
  sandbox.optStart("light", "turn_off", { entity_id: "light.a" });
  states["light.a"] = light("off");
  assert.equal(sandbox.V_("light.a"), "off");
  states["light.a"] = light("on");
  assert.equal(sandbox.V_("light.a"), "on", "later changes are never held back");
});

test("it is dropped when Home Assistant reports some other change, or when the time is up (a command that fails)", () => {
  const states = { "light.a": light("on"), "light.b": light("on") };
  const { sandbox } = page(states);
  sandbox.optStart("light", "turn_off", { entity_id: ["light.a", "light.b"] });
  states["light.a"] = light("unavailable");
  assert.equal(sandbox.V_("light.a"), "unavailable");
  assert.equal(sandbox.V_("light.b"), "off");
  sandbox.now += 4001;
  assert.equal(sandbox.V_("light.b"), "on", "after the time is up the light shows what it really is");
});

test("a failed command can be taken back at once", () => {
  const { sandbox } = page({ "light.a": light("on") });
  sandbox.optStart("light", "turn_off", { entity_id: "light.a" });
  sandbox.optDrop({ entity_id: "light.a" });
  assert.equal(sandbox.V_("light.a"), "on");
});

test("toggle shows the opposite; a light already in the asked state, an unavailable one and other domains are left alone", () => {
  const { sandbox } = page({
    "light.a": light("off"),
    "light.b": light("on"),
    "light.c": light("unavailable"),
    "climate.d": light("off"),
  });
  sandbox.optStart("light", "toggle", { entity_id: "light.a" });
  sandbox.optStart("light", "turn_on", { entity_id: "light.b" });
  sandbox.optStart("light", "turn_on", { entity_id: "light.c" });
  sandbox.optStart("climate", "turn_on", { entity_id: "climate.d" });
  sandbox.optStart("light", "set_effect", { entity_id: "light.b" });
  assert.equal(sandbox.V_("light.a"), "on");
  assert.equal(sandbox.V_("light.b"), "on");
  assert.equal(sandbox.V_("light.c"), "unavailable");
  assert.equal(sandbox.V_("climate.d"), "off");
  assert.equal(JSON.stringify(Object.keys(sandbox.OPT)), '["light.a"]');
});

test("a light switched on a moment ago has the brightness asked for until it reports its own, otherwise full", () => {
  const { sandbox } = page({ "light.a": light("off"), "light.b": light("off"), "light.c": light("on", { brightness: 90 }) });
  sandbox.optStart("light", "turn_on", { entity_id: "light.a", brightness_pct: 40 });
  sandbox.optStart("light", "turn_on", { entity_id: "light.b" });
  assert.equal(sandbox.briNow("light.a"), 102);
  assert.equal(sandbox.briNow("light.b"), 255);
  assert.equal(sandbox.briNow("light.c"), 90, "a light that reports one keeps it");
});

test("the page is drawn again in the next frame, once for any number of commands", () => {
  const { sandbox, painted } = page({ "light.a": light("on"), "light.b": light("on") });
  sandbox.optStart("light", "turn_off", { entity_id: "light.a" });
  sandbox.optStart("light", "turn_off", { entity_id: "light.b" });
  assert.equal(painted.length, 1);
  painted[0]();
  assert.equal(painted[1], "refresh");
});
