// SPDX-License-Identifier: GPL-3.0-or-later
// The robot vacuum appliance (decision D-33): what Start sends, what is kept, and a battery taken from its sensor. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { _T as EN_T } from "./en.mjs";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const slice = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to));

function world(calls = []) {
  const ctx = vm.createContext({
    H: () => ({
      entities: { "vacuum.robo": { device_id: "dev1" } },
      callService: (d, s, data) => {
        calls.push(plain([d, s, data]));
        return Promise.resolve();
      },
    }),
    apHas: (id) => id === "select.suction",
    V_: () => "auto",
    A: () => ({ options: ["auto", "boost"] }),
    dom: (id) => id.split(".")[0],
  });
  const src = read("appliancevac.js");
  ctx.setTimeout = (f) => setTimeout(f, 0);
  vm.runInContext(slice(src, "function vacapConf(", "/* One setting as the Xiaomi card"), ctx);
  return ctx;
}

const ap = {
  type: "vacuum",
  vac: {
    rooms: [{ k: "10", l: "Hall" }, { k: "11", l: "Bed" }],
    sets: [{ k: "vacuum_power", l: "Suction", o: ["quiet", "boost"] }, { k: "wash_repetitions", l: "Passes", o: ["1", "2"] }],
    run: [
      { action: "x.set_modes", data: { device_id: "$vacuum_device", room_modes: "$room_settings" } },
      { action: "x.clean", data: { device_id: "$vacuum_device", zones: "$rooms" } },
    ],
  },
};

test("Start fills the chosen rooms and settings in: a room's own choice over the one for all rooms, digits as numbers", async () => {
  const calls = [];
  const w = world(calls);
  await w.vacapStart(ap, "vacuum.robo", ["10", "11"], { vacuum_power: "quiet" }, (r) => (r === "11" ? { vacuum_power: "boost", wash_repetitions: "2" } : {}));
  assert.deepEqual(calls, [
    ["x", "set_modes", { device_id: "dev1", room_modes: { 10: { vacuum_power: "quiet" }, 11: { vacuum_power: "boost", wash_repetitions: 2 } } }],
    ["x", "clean", { device_id: "dev1", zones: ["10", "11"] }],
  ]);
});

test("with no room chosen all are sent, and an action that has nothing to say is skipped", async () => {
  const calls = [];
  await world(calls).vacapStart(ap, "vacuum.robo", [], {}, () => ({}));
  assert.deepEqual(calls, [["x", "clean", { device_id: "dev1", zones: ["10", "11"] }]]);
});

test("with no action Start starts the vacuum, and a setting bound to a select sets it first", async () => {
  const calls = [];
  await world(calls).vacapStart({ vac: { rooms: [], sets: [{ k: "s", e: "select.suction" }], run: [] } }, "vacuum.robo", [], { s: "boost" }, () => ({}));
  assert.deepEqual(calls, [
    ["select", "select_option", { entity_id: "select.suction", option: "boost" }],
    ["vacuum", "start", { entity_id: "vacuum.robo" }],
  ]);
});

test("the configuration is cleaned: bad keys, duplicates and bad actions are dropped", () => {
  const ctx = vm.createContext({});
  vm.runInContext(slice(read("model.js"), "function cleanVac(", "/* The map of a vacuum belongs"), ctx);
  const out = plain(
    ctx.cleanVac({
      rooms: [{ k: "10", l: "Hall" }, { k: "10" }, { k: "a b" }],
      sets: [{ k: "mode", l: "Mode", o: ["a", "<x>"], e: "light.x" }, { k: "bad key" }],
      run: [{ action: "x.y", data: { a: "$rooms" } }, { action: "nodot", data: {} }, { action: "x.y", data: [1] }],
    }),
  );
  assert.deepEqual(out, { rooms: [{ k: "10", l: "Hall" }], sets: [{ k: "mode", l: "Mode", o: ["a"] }], run: [{ action: "x.y", data: { a: "$rooms" } }] });
});

test("a map's touch area can pick a room, and calls nothing", () => {
  const ctx = vm.createContext({ ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
  vm.runInContext(slice(read("model.js"), "function cleanRmAct(", "  if (!a || typeof a !== \"object\" || typeof a.e") + "return null;}", ctx);
  assert.deepEqual(plain(ctx.cleanRmAct({ t: "room", r: "10", x: 1 })), { t: "room", r: "10" });
  assert.equal(ctx.cleanRmAct({ t: "room", r: "a b" }), null);
  assert.match(read("remote.js"), /if \(a\.t === "room"\) return null;/);
});

test("a vacuum's battery comes from its battery sensor when the vacuum reports none", () => {
  const src = read("devices.js");
  const states = { "sensor.robo_battery": { s: "84", a: { device_class: "battery" } }, "vacuum.robo": { a: {} } };
  const ctx = vm.createContext({
    A: (id) => states[id]?.a ?? {},
    V_: (id) => states[id]?.s ?? "",
    dom: (id) => id.split(".")[0],
    sibsOf: () => [{ entity_id: "sensor.robo_battery" }],
  });
  const at = src.indexOf("function vacBattery(");
  vm.runInContext(src.slice(at, src.indexOf("\n}", at) + 2), ctx);
  assert.equal(ctx.vacBattery("vacuum.robo"), 84);
  assert.match(read("vacuum.js"), /var l = vacBattery\(id\);/);
});

test("the vacuum appliance names no brand", () => {
  assert.doesNotMatch(read("appliancevac.js"), /dyson|roborock|dreame|xiaomi_|hass_dyson/i);
});

test("a room's own settings of a vacuum appliance are kept with the dashboard, next to the Xiaomi's numbered rooms", () => {
  const src = read("store.js");
  assert.match(src, /\[a-z0-9_\]\{1,40\}:\[A-Za-z0-9_-\]\{1,24\}/);
  assert.match(read("vacuumcore.js"), /\(k === "times" && v === 1\)/, "a text choice of 1 is a choice, not the Xiaomi's single pass");
});

test("a robot vacuum appliance's row is coloured as a vacuum's row is", () => {
  assert.match(read("appliance.js"), /kind: ap\.type === "vacuum" \? "clean" : "appliance"/);
  assert.match(read("scenes.js"), /if \(d\.kind === "vacuum"\) \{[\s\S]{0,120}kind: "clean"/, "the colour a vacuum's row has");
});

test("a zone slot that a zones source replaces names the source instead of saying it is not set", () => {
  const ctx = vm.createContext({ _T: (k, v) => k + "|" + ((v && v.x) || ""), apBoundText: (id) => id });
  vm.runInContext(slice(read("appliance.js"), "function apZoneSource(", "/* What a slot is called on this appliance"), ctx);
  const zoned = { slots: { no_go: "sensor.z" }, vac: { zones: { action: "x.zones" } } };
  assert.equal(ctx.apSlotText(zoned, "no_go"), "vacap_zones_from_source|x.zones");
  assert.equal(ctx.apSlotText(zoned, "walls"), "vacap_zones_from_source|x.zones");
  assert.equal(ctx.apSlotText(zoned, "dock"), "ap_not_set|");
  assert.equal(ctx.apSlotText({ slots: { walls: "sensor.w" }, vac: {} }, "walls"), "sensor.w");
  assert.equal(ctx.apSlotText({ slots: {} }, "no_go"), "ap_not_set|");
});

test("Stop and dock presses the button or runs the script chosen for it", () => {
  const ctx = vm.createContext({ apHas: (id) => id !== "button.gone", dom: (id) => id.split(".")[0], REMOTE_ACT: { button: ["button", "press"], input_button: ["input_button", "press"], script: ["script", "turn_on"] } });
  const src = read("appliancevac.js");
  vm.runInContext(slice(src, "function vacapDockCall(", "/* A short wait between one command"), ctx);
  assert.deepEqual(plain(ctx.vacapDockCall({ slots: { dock: "button.go_home" } })), ["button", "press", { entity_id: "button.go_home" }]);
  assert.deepEqual(plain(ctx.vacapDockCall({ slots: { dock: "script.dock" } })), ["script", "turn_on", { entity_id: "script.dock" }]);
  assert.equal(ctx.vacapDockCall({ slots: { dock: "button.gone" } }), null);
  assert.equal(ctx.vacapDockCall({ slots: {} }), null);
  assert.match(src, /var dock = vacapDockCall\(ap\);\s*if \(dock\) \{\s*call\(dock\[0\], dock\[1\], dock\[2\]\);/);
});

test("the appliance knows no brand: names and icons of choices come from its set-up", () => {
  const src = read("appliancevac.js");
  assert.doesNotMatch(src, /RBLAB|RBICON|Integrations\.|xiaomi_miot|siid|sweep_mop/i);
  const ctx = vm.createContext({ VACAP_ICON: {}, cap: (s) => s });
  vm.runInContext(slice(src, "function vacapWord(", "/* A setting's choices"), ctx);
  const set = { n: { "Full Speed": "Turbo" }, i: { "Full Speed": "bright" } };
  assert.equal(ctx.vacapWord("Full Speed", set), "Turbo");
  assert.equal(ctx.vacapWord("deep_clean", {}), "deep clean");
  assert.equal(ctx.vacapIcon("Full Speed", set), "bright");
  assert.equal(ctx.vacapIcon("Silent", {}), "moon");
  assert.equal(ctx.vacapIcon("mop_only", {}), "drop");
});

test("the appliance is built on code that knows no integration, and not on the old card", () => {
  const core = read("vacuumcore.js"),
    mine = read("appliancevac.js") + read("vacsetup.js") + core;
  assert.doesNotMatch(mine, /Integrations\./);
  const old = read("vacuum.js");
  const names = [...old.matchAll(/^(?:async )?function (\w+)|^var (\w+)/gm)].map((m) => m[1] || m[2]);
  const used = names.filter((n) => new RegExp(`(?<![\\w$.])${n}(?![\\w$])`).test(mine.replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.deepEqual(used, [], "nothing of app/vacuum.js is needed");
});

test("a run stays held while the robot is slow to say so, and ends when it is over", () => {
  const ctx = vm.createContext({ Date });
  const src = read("appliancevac.js");
  vm.runInContext(slice(src, "var VACAP_WORKING", "/* The appliance's page: map"), ctx);
  const ago = (s) => Date.now() - s * 1000;
  const run = (age, extra = {}) => ({ held: ago(age), ...extra });
  assert.equal(ctx.vacapHeld(run(10), "docked", "charged"), true, "just started");
  assert.equal(ctx.vacapHeld(run(60, { seen: true }), "docked", "charged"), false, "it ran and is charged");
  assert.equal(ctx.vacapHeld(run(60), "docked", "sweeping"), false, "the vacuum itself says docked");
  assert.equal(ctx.vacapHeld(run(120), "docked", "charged"), true, "a status that never showed the run is not believed");
  assert.equal(ctx.vacapHeld(run(1900), "docked", "charged"), false, "for half an hour");
  assert.equal(ctx.vacapHeld(run(60), "docked"), false, "no status entity");
  const state = {};
  assert.equal(ctx.vacapShown(state, "docked", true), "cleaning");
  state.opt = "paused";
  assert.equal(ctx.vacapShown(state, "docked", true), "paused");
  assert.equal(ctx.vacapShown(state, "returning", true), "returning", "a new state wins over what was pressed");
});

test("Fill from the vacuum takes the water select as water, not as the mode", () => {
  const states = {};
  for (const id of ["vacuum.rosie", "select.rosie_water_mode", "select.rosie_suction_mode", "select.rosie_cleaning_mode"]) states[id] = {};
  const entities = Object.fromEntries(Object.keys(states).map((id) => [id, { device_id: "d" }]));
  const ctx = vm.createContext({ H: () => ({ states, entities }), dom: (id) => id.split(".")[0], A: () => ({}), _T: (k) => k });
  const src = read("appliancevac.js");
  vm.runInContext(slice(src, "function vacapConf(ap)", "/* What a choice is called") + src.slice(src.indexOf("function vacapFillFrom"), src.indexOf("\n}\n", src.indexOf("function vacapFillFrom")) + 3), ctx);
  const d = { ap: { slots: { vacuum: "vacuum.rosie" } } };
  ctx.vacapFillFrom(d);
  assert.deepEqual(
    plain(d.ap.vac.sets.map((s) => [s.k, s.e])),
    [["mode", "select.rosie_cleaning_mode"], ["suction", "select.rosie_suction_mode"], ["water", "select.rosie_water_mode"]]
  );
});

test("a choice may be any word the vacuum uses, in any language", () => {
  const src = read("model.js");
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(src.indexOf("function cleanVac"), src.indexOf("\n}\n", src.indexOf("function cleanVac")) + 3), ctx);
  const set = { k: "power", o: ["Güçlü+", "Quiet (1)", "<b>"], d: "Güçlü+", c: { "Güçlü+": 3 }, n: { "Güçlü+": "Max" }, i: { "Quiet (1)": "moon" } };
  const out = plain(ctx.cleanVac({ sets: [set] }).sets[0]);
  assert.deepEqual(out.o, ["Güçlü+", "Quiet (1)"]);
  assert.deepEqual([out.d, out.c, out.n, out.i], ["Güçlü+", { "Güçlü+": 3 }, { "Güçlü+": "Max" }, { "Quiet (1)": "moon" }]);
});
