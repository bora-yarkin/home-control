// SPDX-License-Identifier: GPL-3.0-or-later
// The words of a robot vacuum appliance's Start actions (app/appliancevac.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const src = readFileSync(new URL("../../custom_components/home_control/frontend/app/appliancevac.js", import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(src.slice(src.indexOf("/* A value as the action wants it"), src.indexOf("/* What the actions are filled with")), ctx);
vm.runInContext(src.slice(src.indexOf("/* A room's value of a setting"), src.indexOf("function vacapPrefKey(")), ctx);
const fill = (data, words) => JSON.parse(JSON.stringify(ctx.vacapFill(data, words) ?? null));

const words = { $rooms: ["3", "4"], $vacuum: "vacuum.robot", $vacuum_device: "dev1", "$set.mode": "Sweep", $room_settings: {} };

test("a string that is only a word becomes its value, as before", () => {
  assert.deepEqual(fill({ entity_id: "$vacuum", rooms: "$rooms", d: "$vacuum_device", m: "$set.mode" }, words), { entity_id: "vacuum.robot", rooms: ["3", "4"], d: "dev1", m: "Sweep" });
});

test("a word inside a text is written into it, a list of room numbers as JSON numbers", () => {
  assert.deepEqual(fill({ entity_id: "$vacuum", params: ['{"room":$rooms}'] }, words), { entity_id: "vacuum.robot", params: ['{"room":[3,4]}'] });
  assert.deepEqual(fill({ note: "run $vacuum in $set.mode" }, words), { note: "run vacuum.robot in Sweep" });
});

test("a word with nothing behind it skips the action, alone or inside a text, and other dollar signs stay", () => {
  assert.equal(ctx.vacapFill({ p: ['{"s":$room_settings}'] }, words), undefined);
  assert.equal(ctx.vacapFill({ p: "$nothing" }, words), undefined);
  assert.deepEqual(fill({ price: "costs $5" }, words), { price: "costs $5" });
});

test("a room has its own settings only when Start sends them", () => {
  assert.equal(ctx.vacapSendsRoomSettings({ run: [{ data: { p: "$rooms" } }] }), false);
  assert.equal(ctx.vacapSendsRoomSettings({ run: [{ data: { s: "$room_settings" } }] }), true);
  assert.equal(ctx.vacapPerRoom({ sets: [{}], run: [{ data: { s: "$room_settings" } }] }), true);
  assert.equal(ctx.vacapPerRoom({ nopr: 1, sets: [{}], run: [{ data: { s: "$room_settings" } }] }), false, "turned off");
  assert.match(src, /ISADMIN && vacapPerRoom\(conf\)/);
});

test("an action once per room gets that room's words, with a setting's value as the number the vacuum knows it by", () => {
  const set = { k: "suction", c: { Silent: 1, Strong: 3 }, d: "Strong" };
  assert.equal(ctx.vacapRoomValue(set, { suction: "Silent" }, { suction: "Strong" }), 1, "the room's own first");
  assert.equal(ctx.vacapRoomValue(set, {}, {}), 3, "else the default");
  assert.equal(ctx.vacapRoomValue({ k: "times", d: "1" }, {}, {}), 1, "digits are a number");
  const w = { $room: 3, $room_name: 'Sal"on', "$room.suction": 2 };
  assert.deepEqual(fill({ params: ['{"id":$room,"name":"$room_name","fan":$room.suction}'] }, w), { params: ['{"id":3,"name":"Sal\\"on","fan":2}'] });
  assert.match(src, /var times = r\.each/);
});

test("the appliance draws the vacuum card's map, from the entities chosen for it, with no integration of its own", () => {
  const vac = readFileSync(new URL("../../custom_components/home_control/frontend/app/vacuum.js", import.meta.url), "utf8");
  const view = vac.slice(vac.indexOf("function vacMapView("), vac.indexOf("/* Every cleaning run of the last 30 days"));
  assert.doesNotMatch(view, /Integrations/, "the shared map asks no integration");
  assert.match(src, /vacMapView\(b, \{\s*id: vacuum,\s*me: mapEnt,\s*ps: ap\.slots\.position/);
  assert.doesNotMatch(src, /Integrations/);
  const css = readFileSync(new URL("../../custom_components/home_control/frontend/dashboard.css", import.meta.url), "utf8");
  assert.match(css, /\.rb-map\.pane\{max-height:min\(52vh,460px\);overflow:auto/, "the map scrolls");
});

test("a setting's choices keep the order given for them", () => {
  const c = vm.createContext({ apHas: () => true, A: () => ({ options: ["Sweep", "Mop", "Sweep Mop"] }) });
  vm.runInContext(src.slice(src.indexOf("function vacapOptions(set)"), src.indexOf("/* A short wait")), c);
  assert.deepEqual(Array.from(c.vacapOptions({ e: "select.x", o: ["Sweep Mop", "Sweep", "Gone"] })), ["Sweep Mop", "Sweep"]);
  assert.deepEqual(Array.from(c.vacapOptions({ e: "select.x", o: [] })), ["Sweep", "Mop", "Sweep Mop"]);
});

const APPDIR = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const app = (f) => readFileSync(new URL(f, APPDIR), "utf8");

test("the rooms listed are used, else the map's own, by number", () => {
  const c = vm.createContext({ vacapConf: (ap) => ap.vac, apHas: () => true, A: () => ({ rooms: { 5: { number: 5, name: "Kitchen" }, 3: { number: 3, name: "Living" }, x: { name: "bad key!" , number: "a b"} } }) });
  vm.runInContext(src.slice(src.indexOf("function vacapRooms(ap)"), src.indexOf("/* The vacuum appliances of the home")), c);
  const ap = { slots: { map: "image.m" }, vac: { rooms: [] } };
  assert.deepEqual(JSON.parse(JSON.stringify(c.vacapRooms(ap))), [{ k: "3", l: "Living" }, { k: "5", l: "Kitchen" }]);
  ap.vac.rooms = [{ k: "9", l: "Mine" }];
  assert.deepEqual(JSON.parse(JSON.stringify(c.vacapRooms(ap))), [{ k: "9", l: "Mine" }]);
});

test("a home's vacuums are those on a page and those of its vacuum appliances, once each", () => {
  const c = vm.createContext({
    devsOf: (k) => (k === "vacuum" ? [{ id: "vacuum.a", name: "A", room: "r" }] : [{ aid: "x", name: "A again", ap: { type: "vacuum", slots: { vacuum: "vacuum.a" } } }, { aid: "y", name: "B", room: "r2", ap: { type: "vacuum", slots: { vacuum: "vacuum.b" } } }, { aid: "z", ap: { type: "oven", slots: {} } }]),
    devPop: (d) => "vac:" + d.id,
  });
  vm.runInContext(src.slice(src.indexOf("/* The vacuum appliances of the home"), src.indexOf("/* The select entities an appliance's settings drive")), c);
  assert.deepEqual(c.vacuumList().map((v) => [v.id, v.pop]), [["vacuum.a", "vac:vacuum.a"], ["vacuum.b", "appliance:y"]]);
});

test("whatever looks after vacuums looks after appliance ones too, and the appliance does what the vacuum card does", () => {
  assert.match(app("status.js"), /vacuumList\(\)\.forEach/);
  assert.match(app("notifications.js"), /vacuumList\(\)\.map/);
  assert.match(app("sections.js"), /var vacs = vacuumList\(\);/);
  assert.match(app("popups.js"), /gv0\.d\.kind === "appliance"\) vacapPage/);
  assert.match(app("homewidgets.js"), /vacuumList\(\)\.filter/);
  assert.match(app("homekit.js"), /d\.kind === "appliance" && d\.ap && d\.ap\.type === "vacuum" && dm === "vacuum"/);
  assert.match(app("appliance.js"), /vacapToggle\(d\)/);
  assert.match(app("manage.js"), /advOf = d\.id \|\|/);
  for (const need of [/the_robot_is_already_cleaning/, /vacapHeld\(state, s\)/, /ap\.slots\.dock/, /showPopup\("adv:" \+ vacuum, true\)/, /set_fan_speed/, /vacapFillFrom\(d\)/, /vacWatch\(b, vacuum\)/]) assert.match(src, need);
});
