// SPDX-License-Identifier: GPL-3.0-or-later
// Corners, size and spacing are percentages of the default (app/model.js, app/customize.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (name) => readFileSync(new URL(`../../custom_components/home_control/frontend/app/${name}`, import.meta.url), "utf8");
const fn = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  return src.slice(a, src.indexOf("\n}\n", a) + 3);
};

function cleanLook(look) {
  const ctx = vm.createContext({});
  vm.runInContext(fn(read("model.js"), "cleanLook"), ctx);
  return JSON.parse(JSON.stringify(ctx.cleanLook(look)));
}

function css(look) {
  const style = {};
  const ctx = vm.createContext({ UI: { look }, document: { getElementById: () => style } });
  const src = read("customize.js");
  vm.runInContext(src.slice(src.indexOf("/* Corner radii in pixels"), src.indexOf("/* ---- settings ---- */")), ctx);
  ctx.lookApply();
  return style.textContent;
}

test("the words saved before keep their look, and values stay in range", () => {
  assert.deepEqual(cleanLook({ radius: "round", density: "compact" }), { radius: 200, density: 60, size: 80 });
  assert.deepEqual(cleanLook({ radius: "sharp", density: "roomy" }), { radius: 25, density: 140, size: 117 });
  assert.deepEqual(cleanLook({ radius: 100, density: 100, size: 100 }), {});
  assert.deepEqual(cleanLook({ radius: 900, density: -5, size: 1 }), { radius: 200, density: 0, size: 80 });
  assert.deepEqual(cleanLook({ radius: "huge", density: NaN }), {});
});

test("the default adds no style, and size and spacing do not change each other", () => {
  assert.equal(css({}), "");
  assert.equal(css({ radius: 200 }), ":root{--r-s:22px;--r-m:30px;--r-l:34px;--r-xl:40px;--r-row:28px}");
  assert.equal(css({ radius: 0 }), ":root{--r-s:0px;--r-m:0px;--r-l:0px;--r-xl:0px;--r-row:0px}");
  assert.equal(css({ density: 60 }), ":root{--sp:6px;--sp-s:4.8px;--sp-l:7.2px}");
  const big = css({ size: 140 });
  assert.match(big, /\.pill\{min-height:81\.2px\}/);
  assert.doesNotMatch(big, /--sp/);
  assert.doesNotMatch(big, /\.sel(?![.\w])/, "the dock's chosen item is not a row");
});
