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
    TITLES: { home: "Home", robin: "Robin's Bedroom", bath: "Bathroom" },
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
  for (const f of ["model.js", "sections.js", "widgetkinds.js", "glance.js", "mastersettings.js", "lightsmasters.js"]) vm.runInContext(read(f), sandbox, { filename: f });
  /* what the files set up is replaced by the pretend dashboard */
  sandbox.UI = { rooms: [{ id: "robin", name: "Robin's Bedroom", area: "bedroom" }, { id: "bath", name: "Bathroom", area: "bathroom", hide: false }], layout: layout, meta: {} };
  sandbox.cleanCond = () => null;
  sandbox.TITLES = { home: "Home", robin: "Robin's Bedroom", bath: "Bathroom" };
  sandbox.ROOMLIGHTS = extra.ROOMLIGHTS || {};
  sandbox.masterLightIds = (sec) => (sec.mm ? (sec.ml || []).map((m) => m.id) : (sec.devs || []).filter((d) => d.id && d.kind === "light").map((d) => d.id));
  return sandbox;
}

const light = (id, name = id) => ({ id, name, icon: "light", kind: "light" });
/* a lights master as a widget of a section, as the dashboard keeps it */
const mw = (wid, wx = {}) => ({ kind: "widget", id: "", w: "lmaster", wid, name: "lights_master", icon: "lights", wx: { id: wid, master: 1, ...wx } });
const masters = (sec) => sec.devs.filter((d) => d.kind === "widget" && d.w === "lmaster");
const layout = () => ({
  home: [],
  rooms: {
    robin: [{ id: "lights", k: "devs", hide: false, devs: [mw("lights", { own: 1 }), light("light.bed_1"), light("light.bed_2")] }],
    bath: [{ id: "lights", k: "devs", hide: false, devs: [] }],
  },
});

test("a section that held masters (its own, and more) has them as widgets, each with an id that no section or master of the page has, and the settings of a master only", () => {
  const w = world(layout());
  const out = plain(
    w.cleanLayout([
      {
        id: "lights",
        k: "devs",
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
      { id: "second", k: "devs", devs: [] },
    ])
  );
  assert.equal(out.length, 2, "the section and its neighbour");
  const held = masters(out[0]);
  assert.deepEqual(held.map((m) => m.wid), ["lights", "bath", "other"], "the section's own first; a clash with a section, a bad id and a repeated id are dropped");
  assert.equal(held[0].wx.own, 1, "the section's own master is the automatic one, named by the section's id");
  assert.equal(held[1].wx.mn, "Bathroom");
  assert.equal(held[1].wx.mgr, "ha");
  assert.deepEqual(held[1].wx.ml.map((d) => d.id), ["light.bath_1", "light.bath_2"]);
  assert.equal(out[0].master, undefined, "the section keeps no master settings");
  assert.equal(out[0].masters, undefined);
  assert.deepEqual(out[0].devs.filter((d) => d.kind === "light").map((d) => d.id), ["light.bed_1"], "its own lights are its own");
});

test("a held master is manual whatever it said, and keeps only the settings of a master", () => {
  const out = plain(world(layout()).cleanLayout([{ id: "sec", k: "devs", devs: [], masters: [{ id: "bath", mn: "Bathroom", mm: 0, ml: [light("light.bath_1"), light("light.bath_2")], t: "x", devs: [light("light.zzz")] }] }]));
  const [m] = masters(out[0]);
  assert.equal(m.wx.mm, 1, "chosen lights, whatever it said");
  assert.deepEqual(m.wx.ml.map((d) => d.id), ["light.bath_1", "light.bath_2"]);
  for (const x of ["devs", "t", "k", "masters", "hide"]) assert.equal(x in m.wx, false, x + " is not a master's");
});

test("a master is found by its id with masterById, a section by secById, and the host of one that is not the section's own is the section", () => {
  const l = layout();
  l.rooms.robin[0].devs.push(mw("bath", { mm: 1, ml: [light("light.bath_1")] }));
  const w = world(l);
  assert.equal(w.masterById("robin", "bath").id, "bath");
  assert.equal(w.masterById("robin", "lights").own, 1, "the section's own master is named by the section's id");
  assert.equal(w.secById("robin", "lights").k, "devs", "while the section is found by it too");
  assert.equal(w.secById("robin", "bath"), null, "a master is not a section");
  assert.equal(w.masterHost("robin", "bath").id, "lights");
  assert.equal(w.masterHost("robin", "lights"), null, "the section's own master has no host");
  assert.equal(w.masterById("bath", "bath"), null, "on its own page only");
  assert.equal(w.masterNewId("robin").length >= 3, true);
  assert.notEqual(w.masterNewId("robin"), "bath");
  assert.equal(w.masterById("robin", "lights").devs.length, 4, "an automatic master has the lights of its section to work with (a view, not saved)");
  assert.equal("devs" in JSON.parse(JSON.stringify(w.masterById("robin", "lights"))), false, "the view is never saved");
});

test("moving the automatic master of a section saves its lights as chosen ones, takes the master out of the section and leaves the lights of the section and of the target alone", () => {
  const l = layout();
  Object.assign(l.rooms.robin[0].devs[0].wx, { mn: "Bed", mall: 1, scn: ["sc1"], msrc: ["hue", "sec:other", "sec:gone"], mhl: 1, mtab: "color", mps: "scene.read", mpw: "scene" });
  l.rooms.bath[0].devs = [light("light.bath_1")];
  l.rooms.robin.push({ id: "other", k: "devs", scs: 1, devs: [] });
  const w = world(l);
  const target = { scope: "bath", sec: l.rooms.bath[0] };
  const moved = plain(w.masterTransfer("robin", "lights", target, false));
  assert.equal(moved.mm, 1);
  assert.deepEqual(moved.ml.map((m) => m.id), ["light.bed_1", "light.bed_2"], "the lights it had, as chosen lights with their names");
  assert.equal(moved.mn, "Bed");
  assert.equal(moved.mtab, "color");
  assert.equal("mhl" in moved, false, "what hides the section's own lights is about the section");
  assert.deepEqual(moved.scn, ["sc1"], "the scenes are listed by id");
  assert.deepEqual(moved.msrc, ["hue"], "a section of the old page is not on the new page");
  assert.deepEqual(masters(l.rooms.bath[0]).map((m) => m.wid), [moved.id]);
  assert.deepEqual(plain(l.rooms.bath[0].devs.filter((d) => d.kind === "light")), [light("light.bath_1")], "the target's own lights are untouched");
  assert.equal(masters(l.rooms.robin[0]).length, 0, "no master any more");
  assert.equal(l.rooms.robin[0].devs.filter((d) => d.kind === "light").length, 2, "the section keeps its lights");
  assert.equal(w.changed.length > 0, true);
});

test("copying leaves the master where it is, and a held master can be moved to another section of the same page or copied into its own", () => {
  const l = layout();
  l.rooms.robin[0].devs.push(mw("bath", { mm: 1, mn: "Bath", ml: [light("light.bath_1"), light("light.bath_2")], msrc: ["sec:lights"] }));
  l.rooms.robin.push({ id: "second", k: "devs", devs: [light("light.hall_1")] });
  const w = world(l);
  const copy = plain(w.masterTransfer("robin", "bath", { scope: "robin", sec: l.rooms.robin[1] }, true));
  assert.equal(masters(l.rooms.robin[0]).filter((d) => d.wid === "bath").length, 1, "the original stays");
  assert.equal(masters(l.rooms.robin[1]).length, 1);
  assert.notEqual(copy.id, "bath", "a copy has an id of its own");
  assert.deepEqual(copy.msrc, ["sec:lights"], "on the same page the sections are still there");
  copy.ml.length = 0;
  assert.equal(w.masterById("robin", "bath").ml.length, 2, "a copy shares nothing with the original");
  w.masterTransfer("robin", "bath", { scope: "robin", sec: l.rooms.robin[1] }, false);
  assert.equal(masters(l.rooms.robin[0]).filter((d) => d.wid === "bath").length, 0, "moved out: the section holds none");
  assert.equal(masters(l.rooms.robin[1]).length, 2);
});

function glanceWorld({ lm = [], held = [], rooms = {} } = {}) {
  const l = layout();
  l.rooms.robin[0].devs.push(...held);
  const w = world(l, { ROOMLIGHTS: rooms });
  w.glanceCfg = () => ({ lm, f: false });
  return w;
}

test("the At a glance lights popup lists the lights of the rooms and of the masters, each once, under the room of the page the master is on", () => {
  const bathroom = mw("bath", { mm: 1, mn: "Bath", ml: [light("light.bath_1"), light("light.bath_2")] });
  const w = glanceWorld({ held: [bathroom], rooms: { robin: ["light.bed_1", "light.bed_2", "light.bath_1"], bath: [] } });
  const groups = plain(w.glLightGroups());
  assert.deepEqual(groups.map((g) => g.name), ["Robin's Bedroom"], "a room with no light of its own has no heading");
  assert.deepEqual(groups[0].lights, ["light.bed_1", "light.bed_2", "light.bath_1", "light.bath_2"], "a light that two things have is listed once");
});

test("the room of a master can be the Home Assistant room of its lights: the dashboard room that has that area, or the area itself", () => {
  const bathroom = mw("bath", { mm: 1, mn: "Bath", mgr: "ha", ml: [light("light.bath_1"), light("light.bath_2"), light("light.hall_1")] });
  let w = glanceWorld({ held: [bathroom], rooms: { robin: ["light.bed_1", "light.bed_2"] } });
  let groups = plain(w.glLightGroups());
  assert.deepEqual(groups.map((g) => [g.name, g.lights]), [["Robin's Bedroom", ["light.bed_1", "light.bed_2"]], ["Bathroom", ["light.bath_1", "light.bath_2", "light.hall_1"]]], "the area most of its lights are in, which a dashboard room has");
  bathroom.wx.ml = [light("light.hall_1"), light("light.hall_1")];
  w = glanceWorld({ held: [bathroom], rooms: { robin: ["light.bed_1", "light.bed_2"] } });
  groups = plain(w.glLightGroups());
  assert.deepEqual(groups.map((g) => g.name), ["Robin's Bedroom", "Hall"], "an area no dashboard room has is a heading of its own");
});

test("a master that is shown is one row and its lights are not listed again; the lights of the others are listed one by one", () => {
  const a = mw("bath", { mm: 1, ml: [light("light.bath_1"), light("light.bath_2")] });
  const b = mw("hall", { mm: 1, ml: [light("light.hall_1"), light("light.bed_1")] });
  const w = glanceWorld({ lm: ["robin~bath"], held: [a, b], rooms: { robin: ["light.bed_1", "light.bed_2", "light.bath_1"] } });
  const groups = plain(w.glLightGroups());
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].masters.map((m) => m.key), ["robin~bath"]);
  assert.deepEqual(groups[0].lights, ["light.bed_1", "light.bed_2", "light.hall_1"], "the lights of the master that is shown are in its row, the others are listed");
  const none = plain(glanceWorld({ lm: [], held: [a], rooms: {} }).glLightGroups());
  assert.deepEqual(none[0].masters, [], "nothing is shown as a row until it is chosen");
});

test("every light of a lights master counts as a light of the house, so the tile and the alerts still have it when it is taken out of the room", () => {
  const lights = read("lights.js");
  assert.match(lights, /allMasters\(\)\.forEach\(function \(m\) \{\s*lightUnits\(m\.ids\)\.forEach/);
  const w = glanceWorld({ held: [mw("bath", { mm: 1, ml: [light("light.bath_1")] })], rooms: { robin: ["light.bed_1"] } });
  const found = plain(w.allMasters().map((m) => [m.key, m.ids]));
  assert.deepEqual(found, [["robin~lights", ["light.bed_1", "light.bed_2"]], ["robin~bath", ["light.bath_1"]]]);
});

test("the pieces are wired: the builder and the move page are popups, a master is a row of its section with its settings behind it, and the section's + offers it", () => {
  const popups = read("popups.js");
  assert.match(popups, /"lmaster-new": function \(id\)/);
  assert.match(popups, /"lmaster-move": function \(id\)/);
  assert.match(popups, /glLightsPage\(b\);/);
  const kinds = read("widgetkinds.js");
  assert.match(kinds, /registerWidget\("lmaster"/);
  assert.match(kinds, /showPopup\("lmaster-edit:" \+ secKey\(\) \+ ":" \+ d\.wid, true\)/, "tapping it while the page is edited opens its settings");
  assert.match(read("addpopup.js"), /showPopup\("lmaster-add:" \+ f\.rid\.split\("~"\)\[1\] \+ ":" \+ host\.id, true\);/, "the + of a Lights section has Lights master first");
  assert.match(read("popups.js"), /"lmaster-add": function \(id\)/);
  assert.doesNotMatch(read("editor.js"), /lm_add_a_lights_master|_T\("lights_master"\)/, "no toggle or add row in the section's settings");
  assert.match(read("glance.js"), /if \(id === "lights"\) glMasterPicks\(b\);/);
  assert.match(read("lights.js"), /masterActionRows\(box, sec, p\[0\]\);/);
  assert.match(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8"), /"app\/lightsmasters\.js"/);
});

test("a section that is duplicated gives the masters it holds ids of their own, so none of them is lost as a repeated id", () => {
  assert.match(read("editor.js"), /x\.wid = x\.w === "lmaster" \? masterNewId\(sk === "home" \? "home" : sk\.slice\(5\)\) : widgetNewId\(\);/);
  assert.match(read("editor.js"), /if \(x\.wx && x\.w === "lmaster"\) x\.wx\.id = x\.wid;/);
});

test("a master that a section holds can hide its lights from the section, and can become the section's own master again", () => {
  const l = layout();
  const sec = l.rooms.robin[0];
  sec.devs.push(mw("bath", { mn: "Bathroom", mm: 1, ml: [light("light.bed_2")], mhl: 1 }));
  const w = world(l);
  w.pluginDeviceKind = () => null;
  assert.equal(w.masterLeavesOut(sec, light("light.bed_2")), true, "the light the held master has is left out of the section");
  assert.equal(w.masterLeavesOut(sec, light("light.bed_1")), false, "the section's other lights stay");
  const held = masters(sec).find((d) => d.wid === "bath");
  held.wx.mhl = 0;
  assert.equal(w.masterLeavesOut(sec, light("light.bed_2")), false, "and with the setting off nothing is left out");
  held.wx.mhl = 1;
  w.masterMakeOwn(sec, "bath");
  assert.equal(masters(sec).length, 1, "the section's own master that was there is gone");
  assert.equal(masters(sec)[0].wid, "bath");
  assert.equal(w.masterById("robin", "bath").own, 1);
  assert.equal(w.masterById("robin", "bath").mn, "Bathroom");
});

test("the settings of a master are a short page with a row for each part, and the move, make-own and delete rows are on it, not far down a long list", () => {
  const lights = read("lights.js");
  for (const part of ["lights", "popup", "scenes", "where"]) assert.match(lights, new RegExp('part_\\("' + part + '"'));
  assert.match(lights, /if \(!part\) \{[\s\S]*masterActionRows\(box, sec, p\[0\]\);\s*return;/);
  assert.match(read("popups.js"), /"lmaster-part": function \(id\)/);
  const things = read("lightsmasters.js");
  assert.match(things, /"lm_make_own"/);
  for (const part of ["lights", "popup", "scenes", "where"]) assert.ok(read("strings.js").includes('"lm_part_' + part + '"'), part);
});

test("a Lights master from the + asks auto or manual: auto is the section's own master named All lights, once; manual opens the builder", () => {
  const l = layout();
  const w = world(l);
  const shown = [];
  w.pill = (icon, title, o) => ({ title, o });
  w.toast = (m) => shown.push(m);
  w.showPopup = (k) => shown.push(k);
  w.closeSheet = () => shown.push("closed");
  const box = { rows: [], appendChild(r) { this.rows.push(r); } };
  const sec = l.rooms.bath[0];
  w.masterAddPage(box, "bath:lights");
  assert.equal(masters(sec).length, 0);
  box.rows[0].o.tap();
  assert.equal(masters(sec).length, 1);
  assert.equal(masters(sec)[0].wx.own, 1);
  assert.equal(masters(sec)[0].wx.mn, "all_lights", "named All lights");
  assert.ok(shown.includes("closed"));
  box.rows[0].o.tap();
  assert.equal(shown.at(-1), "lm_add_auto_taken", "the section has its automatic master already");
  box.rows[1].o.tap();
  assert.equal(shown.at(-1), "lmaster-new:bath:lights");
});

test("a master can be deleted, the section's own too: its settings go, the section's lights stay", () => {
  const l = layout();
  const sec = l.rooms.robin[0];
  Object.assign(sec.devs[0].wx, { mn: "All", mhl: 1 });
  const w = world(l);
  w.pill = (icon, title, o) => ({ title, o });
  w.stgActions = (box, rows) => rows.forEach((r) => box.appendChild(r));
  w.confirmDlg = (q, go) => go();
  w.closeSheet = () => {};
  const box = { rows: [], appendChild(r) { this.rows.push(r); } };
  w.masterActionRows(box, w.masterById("robin", "lights"), "robin");
  box.rows.find((r) => r.title === "lm_delete").o.tap();
  assert.equal(masters(sec).length, 0, "the master is gone");
  assert.equal(sec.devs.filter((d) => d.kind === "light").length, 2);
});
