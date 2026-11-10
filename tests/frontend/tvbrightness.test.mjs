// SPDX-License-Identifier: GPL-3.0-or-later
// The brightness button of a Samsung TV's remote: it sets the TV's Backlight number (the screen brightness; its Brightness number is the black level), never the lights of its room. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../custom_components/home_control/frontend/app/media.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("function tvBrightness("), source.indexOf("function samsungRemote("));

function remote(numbers, states) {
  const calls = [];
  let control = null;
  const sandbox = {
    Math,
    parseFloat,
    isFinite,
    mk: () => ({ appendChild: (c) => (control = c) }),
    dom: (id) => id.split(".")[0],
    sibBy: (media, test) => {
      const found = numbers.filter(test)[0];
      return found ? found.entity_id : null;
    },
    A: (id) => (states[id] || {}).attributes || {},
    V_: (id) => (states[id] || {}).state,
    briControl: (o) => o,
    call: (...a) => calls.push(["call", ...a]),
    callLive: (...a) => calls.push(["live", ...a]),
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const cell = sandbox.tvBrightness("media_player.living_tv");
  return { calls, control: () => control, cell };
}

const TV = [{ entity_id: "number.living_tv_brightness", name: "Brightness" }, { entity_id: "number.living_tv_backlight", name: "Backlight" }];
const state = (value) => ({
  "number.living_tv_backlight": { state: value, attributes: { min: 0, max: 50 } },
  "number.living_tv_brightness": { state: "10", attributes: { min: 0, max: 100 } },
});

test("the slider shows the TV's Backlight on the TV's own scale and sets that number, not any light", () => {
  const { calls, control } = remote(TV, state("25"));
  const c = control();
  assert.equal(c.pct(), 50, "25 of 0-50 is half way");
  assert.equal(c.fmt(100), 50, "the full slider is the TV's maximum");
  c.live(60);
  c.commit(80);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["live", "tv:media_player.living_tv", "number", "set_value", { entity_id: "number.living_tv_backlight", value: 30 }],
    ["call", "number", "set_value", { entity_id: "number.living_tv_backlight", value: 40 }],
  ]);
  assert.ok(!calls.some((c) => c[1] === "light" || c[2] === "light"), "no light is touched");
});

test("a TV that is off (its number unavailable) is left alone", () => {
  const { calls, control } = remote(TV, state("unavailable"));
  const c = control();
  assert.equal(c.lit(), false);
  assert.equal(c.pct(), 0);
  c.live(60);
  c.commit(60);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), []);
});

test("a TV with no Backlight number gets an empty cell (its Brightness number is not the screen brightness)", () => {
  const { control } = remote([{ entity_id: "number.living_tv_brightness", name: "Brightness" }], state("25"));
  assert.equal(control(), null);
});
