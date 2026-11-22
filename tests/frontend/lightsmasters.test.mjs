// SPDX-License-Identifier: GPL-3.0-or-later
// More than one lights master in a section, moving and copying one to another section, and the At a glance lights popup that lists the lights of the masters (app/lightsmasters.js).
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function world(layout, extra = {}) {
  const changed = [];
  const sandbox = {
    _T: (k) => k,
    window: {},
    document: { getElementById: () => null, querySelector: () => null },
    iconOk: () => true,
    deviceGet: (k, d) => d,
    TITLES: { home: "Home", bora: "Bora's Bedroom", bath: "Bathroom" },
    changed,
    uiChanged: () => changed.push(1),
    roomHidden: () => false,
    H: () => ({ states: {}, areas: { bedroom: { name: "Bedroom" }, bathroom: { name: "Bathroom" }, hall: { name: "Hall" } } }),
    lightUnits: (ids) => ids,
    lightIndividuals: (ids) => ids,
    areaIdOf: (id) => ({ "light.bath_1": "bathroom", "light.bath_2": "bathroom", "light.hall_1": "hall", "light.bed_1": "bedroom" }[id] || null),
    gxOff: () => false,
    ROOMLIGHTS: {},
    ...extra,
  };
  vm.createContext(sandbox);
  for (const f of ["model.js", "sections.js", "glance.js", "mastersettings.js", "lightsmasters.js"]) vm.runInContext(read(f), sandbox, { filename: f });
  /* what the files set up is replaced by the pretend dashboard */
  sandbox.UI = { rooms: [{ id: "bora", name: "Bora's Bedroom", area: "bedroom" }, { id: "bath", name: "Bathroom", area: "bathroom", hide: false }], layout: layout, meta: {} };
  sandbox.cleanCond = () => null;
  sandbox.TITLES = { home: "Home", bora: "Bora's Bedroom", bath: "Bathroom" };
  sandbox.ROOMLIGHTS = extra.ROOMLIGHTS || {};
  sandbox.masterLightIds = (sec) => (sec.mm ? (sec.ml || []).map((m) => m.id) : (sec.devs || []).filter((d) => d.id && d.kind === "light").map((d) => d.id));
  return sandbox;
}

const light = (id, name = id) => ({ id, name, icon: "light", kind: "light" });
const layout = () => ({
  home: [],
  rooms: {
    bora: [{ id: "lights", k: "lights", hide: false, devs: [light("light.bed_1"), light("light.bed_2")], master: 1 }],
    bath: [{ id: "lights", k: "lights", hide: false, devs: [] }],
  },
});

test("a lights section holds more masters, each always manual, with ids that no section or master of the page has, and the settings of a master only", () => {
  const w = world(layout());
  const out = plain(
    w.cleanLayout([
      {
        id: "lights",
        k: "lights",
        devs: [light("light.bed_1")],
        master: 1,
        masters: [
          { id: "bath", mn: "Bathroom", ml: [light("light.bath_1"), light("light.bath_2")], mgr: "ha", mhl: 1, t: "x", devs: [light("light.zzz")], masters: [{ id: "deep" }] },
          { id: "lights", ml: [] },
          { id: "9bad", ml: [] },
          { id: "bath", ml: [] },
          { id: "other", mm: 0, ml: [light("light.hall_1")], mpw: "scene", mps: "scene.read" },
        ],
      },
      { id: "second", k: "lights", devs: [] },
    ])
  );
  assert.equal(out.length, 2, "the section and its neighbour");
  const held = out[0].masters;
  assert.deepEqual(held.map((m) => m.id), ["bath", "other"], "a clash with a section, a bad id and a repeated id are dropped");
  assert.equal(held[0].mm, 1);
  assert.equal(held[0].mgr, "ha");
  assert.equal(held[0].mn, "Bathroom");
  assert.deepEqual(held[0].ml.map((m) => m.id), ["light.bath_1", "light.bath_2"]);
  for (const x of ["devs", "t", "k", "masters", "hide"]) assert.equal(x in held[0], false, x + " is not a master's");
  assert.equal(held[1].mm, 1, "chosen lights, whatever it said");
  assert.equal(held[1].mpw, "scene");
  assert.equal(out[0].master, 1, "the section's own master is as it was");
});

test("a master that a section holds is found by its id like a section, and its host is the section", () => {
  const l = layout();
  l.rooms.bora[0].masters = [{ id: "bath", master: 1, mm: 1, ml: [light("light.bath_1")] }];
  const w = world(l);
  assert.equal(w.secById("bora", "bath").id, "bath");
  assert.equal(w.secById("bora", "lights").id, "lights");
  assert.equal(w.masterHost("bora", "bath").id, "lights");
  assert.equal(w.masterHost("bora", "lights"), null, "the section's own master has no host");
  assert.equal(w.secById("bath", "bath"), null, "on its own page only");
  assert.equal(w.masterNewId("bora").length >= 3, true);
  assert.notEqual(w.masterNewId("bora"), "bath");
});

test("moving the automatic master of a section saves its lights as chosen ones, takes the master out of the section and leaves the lights of the section and of the target alone", () => {
  const l = layout();
  const own = l.rooms.bora[0];
  Object.assign(own, { mn: "Bed", mall: 1, scn: ["sc1"], msrc: ["hue", "sec:other", "sec:gone"], mhl: 1, mtab: "color", mps: "scene.read", mpw: "scene" });
  l.rooms.bath[0].devs = [light("light.bath_1")];
  l.rooms.bora.push({ id: "other", k: "scenes", devs: [] });
  const w = world(l);
  const target = { scope: "bath", sec: l.rooms.bath[0] };
  const moved = plain(w.masterTransfer("bora", "lights", target, false));
  assert.equal(moved.mm, 1);
  assert.deepEqual(moved.ml.map((m) => m.id), ["light.bed_1", "light.bed_2"], "the lights it had, as chosen lights with their names");
  assert.equal(moved.mn, "Bed");
  assert.equal(moved.mtab, "color");
  assert.equal("mhl" in moved, false, "what hides the section's own lights is about the section");
  assert.deepEqual(moved.scn, ["sc1"], "the scenes are listed by id");
  assert.deepEqual(moved.msrc, ["hue"], "a section of the old page is not on the new page");
  assert.deepEqual(plain(l.rooms.bath[0].masters.map((m) => m.id)), [moved.id]);
  assert.deepEqual(plain(l.rooms.bath[0].devs), [light("light.bath_1")], "the target's own lights are untouched");
  assert.equal(own.master, undefined, "no master any more");
  assert.equal(own.mn, undefined);
  assert.equal(own.scn, undefined);
  assert.equal(own.devs.length, 2, "the section keeps its lights");
  assert.equal(w.changed.length > 0, true);
});

test("copying leaves the master where it is, and a held master can be moved to another section of the same page or copied into its own", () => {
  const l = layout();
  l.rooms.bora[0].masters = [{ id: "bath", master: 1, mm: 1, mn: "Bath", ml: [light("light.bath_1"), light("light.bath_2")], msrc: ["sec:lights"] }];
  l.rooms.bora.push({ id: "second", k: "lights", devs: [light("light.hall_1")] });
  const w = world(l);
  const copy = plain(w.masterTransfer("bora", "bath", { scope: "bora", sec: l.rooms.bora[1] }, true));
  assert.equal(l.rooms.bora[0].masters.length, 1, "the original stays");
  assert.equal(l.rooms.bora[1].masters.length, 1);
  assert.notEqual(copy.id, "bath", "a copy has an id of its own");
  assert.deepEqual(copy.msrc, ["sec:lights"], "on the same page the sections are still there");
  copy.ml.length = 0;
  assert.equal(l.rooms.bora[0].masters[0].ml.length, 2, "a copy shares nothing with the original");
  w.masterTransfer("bora", "bath", { scope: "bora", sec: l.rooms.bora[1] }, false);
  assert.equal(l.rooms.bora[0].masters, undefined, "moved out: the section holds none");
  assert.equal(l.rooms.bora[1].masters.length, 2);
});

function glanceWorld({ lm = [], masters = [], rooms = {} } = {}) {
  const l = layout();
  l.rooms.bora[0].masters = masters;
  const w = world(l, { ROOMLIGHTS: rooms });
  w.glanceCfg = () => ({ lm, f: false });
  return w;
}

test("the At a glance lights popup lists the lights of the rooms and of the masters, each once, under the room of the page the master is on", () => {
  const bathroom = { id: "bath", master: 1, mm: 1, mn: "Bath", ml: [light("light.bath_1"), light("light.bath_2")] };
  const w = glanceWorld({ masters: [bathroom], rooms: { bora: ["light.bed_1", "light.bed_2", "light.bath_1"], bath: [] } });
  const groups = plain(w.glLightGroups());
  assert.deepEqual(groups.map((g) => g.name), ["Bora's Bedroom"], "a room with no light of its own has no heading");
  assert.deepEqual(groups[0].lights, ["light.bed_1", "light.bed_2", "light.bath_1", "light.bath_2"], "a light that two things have is listed once");
});

test("the room of a master can be the Home Assistant room of its lights: the dashboard room that has that area, or the area itself", () => {
  const bathroom = { id: "bath", master: 1, mm: 1, mn: "Bath", mgr: "ha", ml: [light("light.bath_1"), light("light.bath_2"), light("light.hall_1")] };
  let w = glanceWorld({ masters: [bathroom], rooms: { bora: ["light.bed_1", "light.bed_2"] } });
  let groups = plain(w.glLightGroups());
  assert.deepEqual(groups.map((g) => [g.name, g.lights]), [["Bora's Bedroom", ["light.bed_1", "light.bed_2"]], ["Bathroom", ["light.bath_1", "light.bath_2", "light.hall_1"]]], "the area most of its lights are in, which a dashboard room has");
  bathroom.ml = [light("light.hall_1"), light("light.hall_1")];
  w = glanceWorld({ masters: [bathroom], rooms: { bora: ["light.bed_1", "light.bed_2"] } });
  groups = plain(w.glLightGroups());
  assert.deepEqual(groups.map((g) => g.name), ["Bora's Bedroom", "Hall"], "an area no dashboard room has is a heading of its own");
});

test("a master that is shown is one row and its lights are not listed again; the lights of the others are listed one by one", () => {
  const a = { id: "bath", master: 1, mm: 1, ml: [light("light.bath_1"), light("light.bath_2")] };
  const b = { id: "hall", master: 1, mm: 1, ml: [light("light.hall_1"), light("light.bed_1")] };
  const w = glanceWorld({ lm: ["bora~bath"], masters: [a, b], rooms: { bora: ["light.bed_1", "light.bed_2", "light.bath_1"] } });
  const groups = plain(w.glLightGroups());
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].masters.map((m) => m.key), ["bora~bath"]);
  assert.deepEqual(groups[0].lights, ["light.bed_1", "light.bed_2", "light.hall_1"], "the lights of the master that is shown are in its row, the others are listed");
  const none = plain(glanceWorld({ lm: [], masters: [a], rooms: {} }).glLightGroups());
  assert.deepEqual(none[0].masters, [], "nothing is shown as a row until it is chosen");
});

test("every light of a lights master counts as a light of the house, so the tile and the alerts still have it when it is taken out of the room", () => {
  const lights = read("lights.js");
  assert.match(lights, /allMasters\(\)\.forEach\(function \(m\) \{\s*lightUnits\(m\.ids\)\.forEach/);
  const w = glanceWorld({ masters: [{ id: "bath", master: 1, mm: 1, ml: [light("light.bath_1")] }], rooms: { bora: ["light.bed_1"] } });
  const masters = plain(w.allMasters().map((m) => [m.key, m.ids]));
  assert.deepEqual(masters, [["bora~lights", ["light.bed_1", "light.bed_2"]], ["bora~bath", ["light.bath_1"]]]);
});

test("the pieces are wired: the builder and the move page are popups, the section's settings list its masters, and a held master shows as a row with its settings behind it", () => {
  const popups = read("popups.js");
  assert.match(popups, /"lmaster-new": function \(id\)/);
  assert.match(popups, /"lmaster-move": function \(id\)/);
  assert.match(popups, /glLightsPage\(b\);/);
  const sections = read("sections.js");
  assert.match(sections, /extras\.forEach\(function \(m\) \{\s*masterRows\.push\(\s*edMark\(lightsMasterRow\(secKey\(\) \+ "~" \+ m\.id/);
  assert.match(read("editor.js"), /showPopup\("lmaster-new:" \+ key, true\);/);
  assert.match(read("glance.js"), /if \(id === "lights"\) glMasterPicks\(b\);/);
  assert.match(read("lights.js"), /masterThingRows\(box, sec, p\[0\], draw\);/);
  assert.match(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8"), /"app\/lightsmasters\.js"/);
});

test("a section that is duplicated gives the masters it holds ids of their own, so none of them is lost as a repeated id", () => {
  assert.match(read("editor.js"), /\(c\.masters \|\| \[\]\)\.forEach\(function \(m\) \{\s*m\.id = masterNewId\(sk === "home" \? "home" : sk\.slice\(5\)\);/);
});

test("a master that a section holds can hide its lights from the section, and can become the section's own master again", () => {
  const l = layout();
  const sec = l.rooms.bora[0];
  sec.masters = [{ id: "bath", master: 1, mm: 1, mn: "Bathroom", ml: [light("light.bed_2")], mhl: 1 }];
  const w = world(l);
  w.pluginDeviceKind = () => null;
  assert.equal(w.masterLeavesOut(sec, light("light.bed_2")), true, "the light the held master has is left out of the section");
  assert.equal(w.masterLeavesOut(sec, light("light.bed_1")), false, "the section's other lights stay");
  sec.masters[0].mhl = 0;
  assert.equal(w.masterLeavesOut(sec, light("light.bed_2")), false, "and with the setting off nothing is left out");
  sec.masters[0].mhl = 1;
  w.masterMakeOwn(sec, "bath");
  assert.equal(sec.masters, undefined, "it is not held any more");
  assert.equal(sec.mn, "Bathroom");
  assert.equal(sec.mm, 1);
  assert.equal(sec.master, 1);
  delete sec.mm;
  assert.equal(plain(w.masterLightIds(sec).sort()).join(), "light.bed_1,light.bed_2", "and it can be automatic again");
});
