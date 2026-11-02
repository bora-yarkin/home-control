// SPDX-License-Identifier: GPL-3.0-or-later
// Tests of the saved colours and white temperatures (app/saved.js, app/store.js): they belong to a room, hold one colour or one
// temperature each, and what was saved for single lights moves to the room of its light. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function page(extra = {}) {
  const toasts = [];
  const sandbox = {
    _T: (k) => k,
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    ISADMIN: true,
    STORE: { presets: {}, saved: {}, scenes: [], eareas: [] },
    H: () => ({ entities: {}, states: {} }),
    VIEW: "home",
    UIROOM: {},
    TITLES: {},
    toast: (m) => toasts.push(m),
    storeChanged() {},
    ownerRoom: () => "",
    dom: (id) => id.split(".")[0],
    cleanUI: () => ({}),
    cleanAccess: () => ({}),
    cleanNotify: () => null,
    cleanCfg: () => ({}),
    cleanIcons: () => ({}),
    cleanPins: () => [],
    ...extra,
  };
  sandbox.toasts = toasts;
  vm.createContext(sandbox);
  for (const file of ["store.js", "scenes.js", "saved.js"]) vm.runInContext(read(file), sandbox);
  Object.assign(sandbox, extra);
  return sandbox;
}

test("saved colours are cleaned: one colour or one temperature each, no zones, rooms with valid names", () => {
  const p = page();
  const o = plain(
    p.cleanStore({
      saved: {
        living: [{ h: 10, s: 90 }, { k: 2700 }, { h: 10, s: 90 }, { z: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }] }, { k: 5 }, "x"],
        "bad room": [{ k: 3000 }],
        empty: [{ k: 1 }],
      },
    })
  );
  assert.deepEqual(Object.keys(o.saved), ["living"]);
  assert.deepEqual(o.saved.living, [{ h: 10, s: 90 }, { k: 2700 }]);
  assert.equal("lpal" in o, false); // palettes are scenes now
});

test("saving a colour or temperature is for the room, once", () => {
  const p = page();
  assert.equal(p.savedAdd("living", { h: 30, s: 100 }), true);
  assert.equal(p.savedAdd("living", { h: 30, s: 100 }), false);
  assert.equal(p.toasts.at(-1), "already_saved");
  assert.equal(p.savedAdd("kitchen", { h: 30, s: 100 }), true); // another room has its own
  assert.deepEqual(plain(p.savedOf("living")), [{ h: 30, s: 100 }]);
  p.savedRemove("living", { h: 30, s: 100 });
  assert.deepEqual(plain(p.savedOf("living")), []);
  assert.equal(p.savedOf("nowhere").length, 0);
});

test("what was saved for single lights moves to the room of each light, and zone colours are dropped", () => {
  const room = { "light.a": "living", "light.b": "living", "light.c": "" };
  const p = page({ ownerRoom: (id) => room[id] });
  p.STORE.presets = {
    "light.a": [{ h: 10, s: 90 }, { k: 2700 }, { z: [{ x: 1, y: 1 }] }],
    "light.b": [{ k: 2700 }, { h: 200, s: 50 }],
    "light.c": [{ k: 3000 }],
  };
  assert.deepEqual(plain(p.savedOf("living")), [{ h: 10, s: 90 }, { k: 2700 }, { h: 200, s: 50 }]);
  assert.deepEqual(plain(p.savedOf("home")), [{ k: 3000 }]);
  assert.deepEqual(plain(p.STORE.presets), {});
});

test("saving takes the colour of the first light that is on, and says so when none is", () => {
  const states = { "light.a": { s: "off" }, "light.b": { s: "on", hs: [120, 80] }, "light.c": { s: "on", hs: [10, 10] } };
  const p = page({
    lightIndividuals: (ids) => ids,
    isOn: (id) => states[id].s === "on",
    curPreset: (id) => ({ h: states[id].hs[0], s: states[id].hs[1] }),
  });
  assert.deepEqual(plain(p.savedCapture({ cmd: ["light.a", "light.b", "light.c"] })), { h: 120, s: 80 });
  assert.equal(p.savedCapture({ cmd: ["light.a"] }), null);
  assert.equal(p.toasts.at(-1), "turn_the_light_on_to_save_its_colour");
  // a light made of zones is saved as the colour of its first zone
  p.curPreset = () => ({ z: [{ h: 40, s: 60 }, { h: 200, s: 90 }] });
  assert.deepEqual(plain(p.savedCapture({ cmd: ["light.b"] })), { h: 40, s: 60 });
});

test("the room of a popup is the room of its first light that has one", () => {
  const p = page({ ownerRoom: (id) => ({ "light.b": "bed" })[id] || "" });
  assert.equal(p.savedRoomOf(["light.a", "light.b"]), "bed");
  assert.equal(p.savedRoomOf(["light.a"]), "home");
  p.VIEW = "kitchen";
  p.UIROOM = { kitchen: {} };
  assert.equal(p.savedRoomOf(["light.a"]), "kitchen");
});
