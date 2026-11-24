// SPDX-License-Identifier: GPL-3.0-or-later
// The sky behind the header: what the weather says and where the sun is decide its class; no weather, my choice off, or a room picture leave it out. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../custom_components/home_control/frontend/app/header.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("/* The weather entity's condition as the sky"), source.indexOf("function hdrLive()"));

function header({ weather, sun, prefs = {}, picture = false, hour = 12 }) {
  const classes = new Set();
  const sky = { className: "", classList: { remove: (c) => classes.delete(c) }, querySelector: () => ({ getContext: () => ({ clearRect() {} }) }) };
  const hd = { querySelector: () => (sky.made ? sky : null), insertBefore: (el) => (el.made = true), firstChild: null };
  const states = { "weather.home": weather && { state: weather }, "sun.sun": sun && { state: sun.state, attributes: { elevation: sun.elevation } } };
  const sandbox = {
    PREFS: prefs,
    window: {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    Date: class extends Date {
      getHours() {
        return hour;
      }
    },
    document: { querySelector: () => hd, body: { classList: { contains: () => picture } } },
    mk: () => Object.assign(sky, { made: false }),
    firstWeather: () => "weather.home",
    S: (id) => states[id],
    V_: (id) => (states[id] || {}).state,
    A: (id) => (states[id] || {}).attributes || {},
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  sandbox.hdrSky();
  return sky.className;
}

test("the sky follows the weather and the sun", () => {
  assert.equal(header({ weather: "sunny", sun: { state: "above_horizon", elevation: 40 } }), "hsky on w-clear t-day");
  assert.equal(header({ weather: "sunny", sun: { state: "above_horizon", elevation: 4 } }), "hsky on w-clear t-low");
  assert.equal(header({ weather: "sunny", sun: { state: "below_horizon", elevation: -20 } }), "hsky on w-clear t-night");
  assert.equal(header({ weather: "clear-night", sun: { state: "above_horizon", elevation: 40 } }), "hsky on w-clear t-night");
  assert.equal(header({ weather: "pouring", sun: { state: "above_horizon", elevation: 40 } }), "hsky on w-rain heavy t-day");
  assert.equal(header({ weather: "lightning-rainy", sun: { state: "above_horizon", elevation: 40 } }), "hsky on w-storm heavy t-day");
});

test("without a sun entity the clock decides day or night", () => {
  assert.equal(header({ weather: "cloudy", hour: 13 }), "hsky on w-cloudy t-day");
  assert.equal(header({ weather: "cloudy", hour: 23 }), "hsky on w-cloudy t-night");
});

test("no sky when the weather is unknown, when I turned it off, or when the room has a picture", () => {
  assert.equal(header({ weather: "unheard-of" }), "");
  assert.equal(header({ weather: "sunny", prefs: { sky: false } }), "");
  assert.equal(header({ weather: "sunny", picture: true }), "");
});
