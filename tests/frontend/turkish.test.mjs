// SPDX-License-Identifier: GPL-3.0-or-later
// The Turkish pack (app/lang/tr.js) is complete: every text of app/strings.js, with the same {places} and the same joining spaces. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const context = vm.createContext({});
vm.runInContext(read("app/strings.js"), context);
for (const file of readdirSync(new URL("app/lang/", root))) vm.runInContext(read("app/lang/" + file), context);
const { EN, LANGS } = context;
const places = (text) => [...text.matchAll(/\{[a-z_]+\}/g)].map((m) => m[0]).sort();
const edges = (text) => [/^ /.test(text), / $/.test(text)];

test("every listed language has its pack and every key, places and spacing", () => {
  const listed = Object.keys(JSON.parse(read("version.json")).languages);
  for (const code of listed) {
    const pack = LANGS[code];
    assert.ok(pack, code);
    assert.deepEqual(Object.keys(EN).filter((k) => !(k in pack)), [], `${code}: missing`);
    assert.deepEqual(Object.keys(pack).filter((k) => !(k in EN)), [], `${code}: unknown`);
    for (const key of Object.keys(EN)) {
      assert.deepEqual(places(pack[key]), places(EN[key]), `${code}: ${key}`);
      assert.deepEqual(edges(pack[key]), edges(EN[key]), `${code}: ${key} spacing`);
    }
  }
});

test("a raw state is worded in the chosen language, a device's own name is left alone", () => {
  context.langUse("tr-TR");
  assert.equal(context._T("val_docked"), "İstasyonda");
  const core = read("app/core.js");
  vm.runInContext(core.slice(core.indexOf("function valueWord("), core.indexOf("function isOn(")), context);
  assert.equal(context.cap("heat cool"), "Isıtma/soğutma");
  assert.equal(context.cap("Salon Lambası"), "Salon Lambası");
  context.langUse("en");
  assert.equal(context.cap("docked"), "Docked");
});

test("Home Assistant's own screens of the integration are translated too, key for key", () => {
  const keys = (v, at = "") => (v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => keys(x, at + "." + k)) : [at]);
  const load = (name) => JSON.parse(read("../translations/" + name));
  assert.deepEqual(keys(load("tr.json")), keys(load("en.json")));
});
