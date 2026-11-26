// SPDX-License-Identifier: GPL-3.0-or-later
// Every type of entity has controls, built from what it reports (app/domains.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

function world(attrs = {}, calls = []) {
  const ctx = vm.createContext({
    dom: (id) => id.split(".")[0],
    A: () => attrs,
    V_: () => "on",
    svOk: () => true,
    call: (d, s, data) => calls.push([d, s, { ...data }]),
    _T: (k) => k,
    TEMPU: () => "°",
    cap: (v) => v,
  });
  vm.runInContext(read("app/domains.js"), ctx);
  return ctx;
}

const NEEDED = "humidifier water_heater alarm_control_panel valve lawn_mower siren update automation text input_text date time datetime notify weather event person device_tracker group remote".split(" ");

test("every one of the types is described, mapped to rows and offered in Add", () => {
  const w = world();
  const manage = read("app/manage.js");
  for (const d of NEEDED) {
    assert.ok(w.DOMAINS[d], d);
    assert.ok(new RegExp(`\\n  ${d}: "entity",`).test(manage), `${d} has a row kind`);
    assert.ok(manage.includes(`"${d}"`), `${d} can be added`);
  }
});

test("controls follow what the entity says it supports", () => {
  const buttons = (domain, features) =>
    JSON.parse(JSON.stringify(world({ supported_features: features })
      .DOMAINS[domain].controls(`${domain}.x`)
      .filter((c) => c.t === "buttons")
      .flatMap((c) => c.list.map((b) => b.label))));
  assert.deepEqual(buttons("lawn_mower", 1), ["start"]);
  assert.deepEqual(buttons("lawn_mower", 7), ["start", "pause", "dock"]);
  assert.deepEqual(buttons("valve", 3), ["open", "close"]);
  assert.deepEqual(buttons("alarm_control_panel", 2), ["disarm", "arm_away"]);
});

test("a control calls the entity's own action", () => {
  const calls = [];
  const w = world({ supported_features: 0, available_modes: ["a"] }, calls);
  w.DOMAINS.humidifier.controls("humidifier.x").find((c) => c.t === "slider").set(40);
  assert.deepEqual(calls, [["humidifier", "set_humidity", { entity_id: "humidifier.x", humidity: 40 }]]);
});

test("a thermostat with two targets gets a slider for each, and only the modes it reports are offered", () => {
  const climate = read("app/climate.js");
  assert.match(climate, /target_temp_low: A\(id\)\.target_temp_low, target_temp_high/);
  assert.match(climate, /if \(!\(A\(id\)\[x\[0\]\] \|\| \[\]\)\.length\) return;/);
});

test("colours are picked on the wheel, never from a fixed set, and any way of writing one is read", () => {
  for (const file of ["app/customize.js", "app/appearance.js", "app/remote.js"]) assert.match(read(file), /colorButton\(/, file);
  assert.doesNotMatch(read("app/customize.js") + read("app/appearance.js"), /swatches|accgrid|swatch\(/);
  const ctx = vm.createContext({ window: { CSS: true }, CSS: { supports: (p, v) => v === "teal" }, cssToRgb: () => [0, 128, 128] });
  vm.runInContext(read("app/colorpick.js"), ctx);
  assert.equal(ctx.colorParse("FF8800"), "#ff8800");
  assert.equal(ctx.colorParse("#abc"), "#aabbcc");
  assert.equal(ctx.colorParse("teal"), "#008080");
  assert.equal(ctx.colorParse("nonsense"), "");
});

test("a type comes from what the entity reports before any name", () => {
  const states = {
    "media_player.salon": { attributes: { device_class: "tv" } },
    "fan.hava": { attributes: {} },
    "sensor.toz": { attributes: { device_class: "pm25" } },
    "fan.tavan": { attributes: {} },
  };
  const ctx = vm.createContext({ H: () => ({ states, entities: { "fan.hava": { device_id: "d1" }, "sensor.toz": { device_id: "d1" }, "fan.tavan": { device_id: "d2" } } }) });
  const model = read("app/model.js");
  vm.runInContext(model.slice(model.indexOf("function guessDevType("), model.indexOf("function cleanAct(")), ctx);
  assert.equal(ctx.guessDevType({ kind: "media", id: "media_player.salon", icon: "media" }), "tv");
  assert.equal(ctx.guessDevType({ kind: "fan", id: "fan.hava", icon: "fan", name: "Salon" }), "purifier");
  assert.equal(ctx.guessDevType({ kind: "fan", id: "fan.tavan", icon: "fan", name: "Tavan" }), "fan");
});
