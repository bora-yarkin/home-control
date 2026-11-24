// SPDX-License-Identifier: GPL-3.0-or-later
// The sky behind the header: what the weather says and how high the sun is decide the scene it paints; no weather, my choice off, or a room picture leave it out. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const header = readFileSync(new URL("header.js", APP), "utf8");
const sky = readFileSync(new URL("sky.js", APP), "utf8");
const code = header.slice(header.indexOf("/* The weather entity's condition as the sky"), header.indexOf("function hdrLive()"));

function paint({ weather, sun, prefs = {}, picture = false, hour = 12 }) {
  const shown = [];
  const layer = { classList: { add() {}, remove() {} } };
  const states = { "weather.home": weather && { state: weather }, "sun.sun": sun && { state: sun.state, attributes: { elevation: sun.elevation } } };
  const sandbox = {
    PREFS: prefs,
    Math,
    Date: class extends Date {
      getHours() {
        return hour;
      }
      getMinutes() {
        return 0;
      }
    },
    document: { querySelector: () => ({ querySelector: () => layer, insertBefore() {} }), body: { classList: { contains: () => picture } } },
    mk: () => layer,
    firstWeather: () => "weather.home",
    S: (id) => states[id],
    V_: (id) => (states[id] || {}).state,
    A: (id) => (states[id] || {}).attributes || {},
    skyShow: (_layer, scene) => shown.push(JSON.parse(JSON.stringify(scene))),
    skyStop: () => shown.push("stopped"),
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  sandbox.hdrSky();
  return shown;
}

test("the scene is the weather's kind, how strong it is, and the sun's own elevation", () => {
  assert.deepEqual(paint({ weather: "sunny", sun: { elevation: 40 } }), [{ kind: "clear", heavy: false, fast: false, elev: 40 }]);
  assert.deepEqual(paint({ weather: "pouring", sun: { elevation: 5 } }), [{ kind: "rain", heavy: true, fast: false, elev: 5 }]);
  assert.deepEqual(paint({ weather: "lightning-rainy", sun: { elevation: 30 } })[0].kind, "storm");
  assert.equal(paint({ weather: "windy", sun: { elevation: 30 } })[0].fast, true);
});

test("a clear night is night whatever the sun says; without a sun entity the clock gives the height", () => {
  assert.ok(paint({ weather: "clear-night", sun: { elevation: 40 } })[0].elev <= -10);
  assert.ok(paint({ weather: "cloudy", hour: 12 })[0].elev > 40);
  assert.ok(paint({ weather: "cloudy", hour: 0 })[0].elev < -40);
});

test("no sky when the weather is unknown, when I turned it off, or when the room has a picture", () => {
  assert.deepEqual(paint({ weather: "unheard-of" }), ["stopped"]);
  assert.deepEqual(paint({ weather: "sunny", prefs: { sky: false } }), ["stopped"]);
  assert.deepEqual(paint({ weather: "sunny", picture: true }), ["stopped"]);
});

function skyFns() {
  const sandbox = { Math, document: {}, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(sky, sandbox);
  return sandbox;
}

test("what falls, how much cloud and whether it flashes follow the kind of weather", () => {
  const { skyParams } = skyFns();
  assert.equal(skyParams("clear", false, false).cover, 0);
  assert.ok(skyParams("partly").cover > 0.3 && skyParams("partly").cover < 0.6);
  assert.ok(skyParams("rain", true).rain > skyParams("rain", false).rain);
  assert.equal(skyParams("storm").flash, true);
  assert.equal(skyParams("rain").flash, false);
  assert.ok(skyParams("snow").snow > 0 && skyParams("snow").rain === 0);
  assert.equal(skyParams("fog").haze, 1);
  assert.ok(skyParams("clear", false, true).wind > skyParams("clear").wind);
});

test("the sky is darker at night than by day, and greyer under cloud than clear", () => {
  const { skyColours, skyParams } = skyFns();
  const clear = skyParams("clear");
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(skyColours(-30, clear)[1]) < lum(skyColours(45, clear)[1]));
  const day = skyColours(45, clear)[0];
  const overcast = skyColours(45, skyParams("cloudy"))[0];
  assert.ok(Math.abs(overcast[0] - overcast[2]) < Math.abs(day[0] - day[2]), "less blue");
});
