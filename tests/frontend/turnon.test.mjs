// SPDX-License-Identifier: GPL-3.0-or-later
// What a light does when it is turned on from the app: last used, or a saved state made in the light popup (Custom), kept with the dashboard and shown in words.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function lights(ui, attrs = {}) {
  const calls = [];
  const timers = [];
  const log = { editors: [], restored: [], changed: 0, toasts: [] };
  const src = read("lights.js");
  const code = src.slice(src.indexOf("function lightDefault"), src.indexOf("/* Turns lights on as they were"));
  const sandbox = vm.createContext({
    UI: ui,
    A: (id) => attrs[id] || {},
    lightCaps: () => ({ white: true }),
    applyPresetData: (d, col) => (col.k ? (d.color_temp_kelvin = col.k) : (d.hs_color = [col.h, col.s])),
    call: (domain, service, data) => calls.push([domain, service, plain(data)]),
    _T: (k) => k,
    toast: (m) => log.toasts.push(m),
    uiChanged: () => log.changed++,
    lightSnapshot: (ids) => ({ snap: ids }),
    lightRestore: (s) => log.restored.push(s),
    openLightEditor: (o) => log.editors.push(o),
    setTimeout: (fn) => (timers.push(fn), timers.length),
    Object, Math,
  });
  vm.runInContext(code, sandbox);
  return { sandbox, calls, log, run: () => timers.splice(0).forEach((f) => f()) };
}

test("a saved state is what the light gets when it is turned on from the app: brightness, colour temperature or colour, effect", () => {
  const warm = lights({ on: { "light.a": { c: { bri: 40, col: { k: 2700 }, fx: "candle" } } } });
  assert.deepEqual(plain(warm.sandbox.lightDefault("light.a")), { brightness_pct: 40, color_temp_kelvin: 2700, effect: "candle" });
  const colour = lights({ on: { "light.a": { c: { bri: 80, col: { h: 200, s: 70 } } } } });
  assert.deepEqual(plain(colour.sandbox.lightDefault("light.a")), { brightness_pct: 80, hs_color: [200, 70] });
  assert.equal(lights({ on: {} }).sandbox.lightDefault("light.a"), null, "nothing saved: the light comes back as it was");
  const old = lights({ on: { "light.a": { b: 50, k: 3000 } } });
  assert.deepEqual(plain(old.sandbox.lightDefault("light.a")), { brightness_pct: 50, color_temp_kelvin: 3000 }, "what was saved before still works");
});

test("the saved state is told in words", () => {
  const t = (on) => lights({ on }).sandbox.lightDefaultText("light.a");
  assert.equal(t({ "light.a": { c: { bri: 60, col: { k: 2700 } } } }), "60 % · 2700 K");
  assert.equal(t({ "light.a": { c: { bri: 40, col: { h: 1, s: 2 } } } }), "40 % · colour");
  assert.equal(t({ "light.a": { c: { fx: "Candle" } } }), "Candle");
  assert.equal(t({ "light.a": { b: 30, k: 4000 } }), "30 % · 4000 K");
  assert.equal(t({}), "last_used");
});

test("Custom opens the light popup, saves what it shows with the checkmark, and puts the light back as it was", () => {
  const ui = { on: {} };
  const l = lights(ui);
  let done = 0;
  l.sandbox.lightOnCustom({ id: "light.a", name: "A", icon: "light" }, () => done++);
  assert.equal(l.log.editors.length, 1, "nothing saved yet: the popup opens at once, with the light as it is");
  assert.deepEqual(l.calls, []);
  const editor = l.log.editors[0];
  editor.onTick([{ id: "light.a", on: true, bri: 55, col: { k: 3000 } }]);
  assert.deepEqual(plain(ui.on["light.a"]), { c: { bri: 55, col: { k: 3000 } } });
  assert.equal(l.log.changed, 1);
  editor.after();
  assert.deepEqual(plain(l.log.restored), [{ snap: ["light.a"] }], "the light is back as it was before");
  assert.equal(done, 1);
});

test("Custom again shows the saved state: the light is set to it first, then the popup opens; a light that is off cannot be saved", () => {
  const ui = { on: { "light.a": { c: { bri: 30, col: { k: 2400 } } } } };
  const l = lights(ui);
  l.sandbox.lightOnCustom({ id: "light.a", name: "A", icon: "light" });
  assert.deepEqual(plain(l.calls), [["light", "turn_on", { entity_id: "light.a", brightness_pct: 30, color_temp_kelvin: 2400 }]]);
  assert.equal(l.log.editors.length, 0, "not before the light has taken it");
  l.run();
  assert.equal(l.log.editors.length, 1);
  l.log.editors[0].onTick([{ id: "light.a", on: false }]);
  assert.deepEqual(plain(ui.on["light.a"]), { c: { bri: 30, col: { k: 2400 } } }, "an off light does not overwrite the saved state");
  assert.ok(l.log.toasts.includes("turn_the_light_on_to_save_its_state"));
});

test("the layout keeps a saved state only when it is a valid one", () => {
  const src = read("model.js");
  const snippet = src.slice(src.indexOf('/* Per-light "turn on" defaults'), src.indexOf("  if (u.caps && typeof u.caps"));
  const ctx = vm.createContext({ Object });
  vm.runInContext("function cleanOn(u) { var o = { on: {} };\n" + snippet + "\n return o.on; }", ctx);
  const clean = (c) => plain(ctx.cleanOn({ on: { "light.a": c } }));
  assert.deepEqual(clean({ c: { bri: 40.4, col: { k: 2700 }, fx: "x" } }), { "light.a": { c: { bri: 40, col: { k: 2700 }, fx: "x" } } });
  assert.deepEqual(clean({ c: { col: { h: 200, s: 70 } } }), { "light.a": { c: { col: { h: 200, s: 70 } } } });
  assert.deepEqual(clean({ c: { bri: 400, col: { h: 999, s: 70 }, fx: "x".repeat(70) } }), {}, "out of range values are dropped");
  assert.deepEqual(clean({ c: "junk" }), {});
  assert.deepEqual(clean({ b: 50, k: 3000 }), { "light.a": { b: 50, k: 3000 } }, "the older kind is kept");
});
