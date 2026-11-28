// SPDX-License-Identifier: GPL-3.0-or-later
// Corners and spacing are percentages of the default (app/model.js, app/customize.js). Run: node --test tests/frontend
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
  assert.deepEqual(cleanLook({ radius: "round", density: "compact" }), { radius: 200, density: 50 });
  assert.deepEqual(cleanLook({ radius: "sharp", density: "roomy" }), { radius: 25, density: 150 });
  assert.deepEqual(cleanLook({ radius: 100, density: 100 }), {});
  assert.deepEqual(cleanLook({ radius: 900, density: 1 }), { radius: 200, density: 50 });
  assert.deepEqual(cleanLook({ radius: "huge", density: NaN }), {});
});

test("the default adds no style; round, compact and roomy are the pixels they were", () => {
  assert.equal(css({}), "");
  assert.equal(css({ radius: 200 }), ":root{--r-s:22px;--r-m:30px;--r-l:34px;--r-xl:40px;--r-row:28px}");
  assert.equal(css({ density: 50 }), ":root{--sp:6px;--sp-s:5px;--sp-l:8px}.pill{min-height:46px}");
  assert.equal(css({ density: 150 }), ":root{--sp:14px;--sp-s:11px;--sp-l:18px}.pill{min-height:68px}");
  assert.equal(css({ radius: 0 }), ":root{--r-s:0px;--r-m:0px;--r-l:0px;--r-xl:0px;--r-row:0px}");
});
