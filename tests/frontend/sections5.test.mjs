// SPDX-License-Identifier: GPL-3.0-or-later
// Layout 5: one kind of section for devices, and what the older kinds become.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function world() {
  const sandbox = {
    _T: (k) => k,
    window: {},
    document: { getElementById: () => null, querySelector: () => null },
    iconOk: (n) => typeof n === "string" && !!n,
    deviceGet: (k, d) => d,
    TITLES: { home: "Home" },
    uiChanged() {},
    H: () => ({ states: {}, areas: {} }),
    cleanCond: () => null,
  };
  vm.createContext(sandbox);
  for (const f of ["model.js", "sections.js"]) vm.runInContext(read(f), sandbox, { filename: f });
  sandbox.cleanCond = () => null;
  return sandbox;
}

const light = (id) => ({ id, name: id, icon: "light", kind: "light" });

test("sections of layout 4 that held devices become one kind, Section, and keep the name and icon their type gave them", () => {
  const w = world();
  const out = plain(
    w.cleanLayout([
      { id: "lights", k: "lights", devs: [light("light.a")] },
      { id: "tv", k: "media", t: "Telly", i: "tv", devs: [] },
      { id: "cl", k: "climate", devs: [] },
      { id: "ctl", k: "controls", devs: [] },
      { id: "sn", k: "sensors", devs: [] },
      { id: "ot", k: "other", devs: [] },
      { id: "dv", k: "devs", devs: [] },
    ]),
  );
  assert.deepEqual(out.map((s) => s.k), ["devs", "devs", "devs", "devs", "devs", "devs", "devs"]);
  assert.equal(out[0].t, "lights");
  assert.equal(out[0].i, "lights");
  assert.equal(out[0].devs[0].id, "light.a");
  assert.equal(out[1].t, "Telly", "a name the person gave is kept");
  assert.equal(out[2].t, "climate");
  assert.equal(out[6].t, undefined, "a plain devices section has no old name to keep");
});

test("quick actions are scenes, and the kinds that are not devices stay as they are", () => {
  const w = world();
  const out = plain(w.cleanLayout([{ id: "quick", k: "quick", scn: ["a"] }, { id: "glance", k: "glance" }, { id: "rooms", k: "rooms" }, { id: "alerts", k: "alerts" }, { id: "nt", k: "note", txt: "hi" }]));
  assert.deepEqual(out.map((s) => s.k), ["devs", "glance", "rooms", "alerts", "note"]);
  assert.deepEqual(out[0].scn, ["a"]);
  assert.equal(out[0].scs, undefined, "quick actions were not a scenes section");
  assert.equal(out[4].txt, "hi");
});

test("a master of the section (its own, or held) is kept by a Section whatever it was called", () => {
  const w = world();
  const out = plain(w.cleanLayout([{ id: "lights", k: "lights", devs: [light("light.a"), light("light.b")], master: 1, mn: "All", masters: [{ id: "mrm", master: 1, mm: 1, ml: [light("light.a")], mn: "Two" }] }]));
  assert.equal(out[0].k, "devs");
  assert.equal(out[0].master, 1);
  assert.equal(out[0].mn, "All");
  assert.equal(out[0].masters[0].mn, "Two");
});

test("a new Home page starts with Attention, At a glance, Rooms and Scenes; a new room with its status tiles and one empty Section", () => {
  const w = world();
  const home = plain(w.seedSections("home"));
  assert.deepEqual(home.map((s) => s.k), ["alerts", "glance", "rooms", "devs"]);
  assert.equal(home[3].t, "scenes");
  assert.deepEqual(home[3].spage, ["home"]);
  const room = plain(w.seedSections("room:r1"));
  assert.deepEqual(room.map((s) => s.k), ["status", "devs"]);
  assert.deepEqual(room[1].devs, []);
});

test("the Add section list has every kind, grouped, and a kind that exists once is listed too, as already on the page", () => {
  const editor = read("editor.js");
  for (const k of ["devs", "glance", "rooms", "alerts", "chips", "status", "pinned", "chart", "read", "note", "security", "energy", "camera", "cameras", "link"]) assert.match(editor, new RegExp('"' + k + '"'), k);
  assert.match(editor, /already_on_this_page/);
  assert.doesNotMatch(editor, /secSetKind|secTypePage/, "a section does not change type");
});

test("lights a master shows that nothing else holds as a device are kept as devices (lx), only lights, once each, so their settings open from the master", () => {
  const w = world();
  const out = plain(w.cleanLayout([{ id: "mn", k: "devs", devs: [], master: 1, lx: [light("light.g1"), light("light.g1"), { id: "switch.x", name: "X", icon: "plug", kind: "switch" }, light("light.g2")] }]));
  assert.deepEqual(out[0].lx.map((d) => d.id), ["light.g1", "light.g2"]);
});

test("a device has two tabs, Appearance and Behaviour; visibility, moving and removing are in Behaviour; the per-device Advanced settings button and the setting that hid it are gone", () => {
  const manage = read("manage.js");
  assert.match(manage, /\["look", _T\("dp_appearance"\)\], \["behave", _T\("dp_behaviour"\)\]/);
  assert.match(manage, /function devPlaceRows\(c\)/);
  assert.doesNotMatch(manage, /noadv|devPlaceTab|devMoreTab|devOptionsTab/);
  assert.doesNotMatch(read("popups.js") + read("camera.js") + read("appearance.js"), /PREFS\.adv|noadv/);
});

test("every object says whether it is shown with the same row, Visible, On or Off", () => {
  assert.match(read("widgets.js"), /function visiblePill\(isOn, toggle\)/);
  for (const f of ["editor.js", "glance.js", "manage.js"]) assert.match(read(f), /visiblePill\(/, f);
  assert.doesNotMatch(read("manage.js"), /hide_room/);
});

test("the lights chosen for a master are lights of the page: room counts, everything-off and conditions see them once, also when no section lists them", () => {
  const w = world();
  const o = { rooms: [{ id: "r" }], layout: { rooms: { r: [
    { id: "a", k: "devs", devs: [light("light.a")], master: 1, mm: 1, ml: [light("light.a"), light("light.only")] },
    { id: "b", k: "devs", devs: [], masters: [{ id: "mx", master: 1, mm: 1, ml: [light("light.held"), light("light.only")] }] },
  ] } } };
  w.devIndex(o);
  assert.deepEqual(plain(o.devs.r.map((d) => d.id)), ["light.a", "light.only", "light.held"]);
});

test("a master can be hidden as a whole (mhide), and is then left out of the page, the At a glance popup and the search", () => {
  const w = world();
  const out = plain(w.cleanLayout([{ id: "mn", k: "devs", devs: [], master: 1, mhide: 1 }]));
  assert.equal(out[0].mhide, 1);
  assert.match(read("sections.js"), /\(ed \|\| !m\.mhide\)/);
  assert.match(read("search.js"), /if \(m\.sec\.mhide\) return;/);
  assert.match(read("lightsmasters.js"), /!m\.sec\.mhide/);
});

test("a master is found by search as \"Name Master\", and each of its lights as \"Name Master · Light\", which switches only that light", () => {
  const search = read("search.js");
  assert.match(search, /lm_master_word/);
  assert.match(search, /mn \+ " · " \+ LNAME\[id\]\[0\], r: m\.page, i: LNAME\[id\]\[1\] \|\| "lights", k: "light", v: id/);
  assert.match(search, /showPopup\("lmaster:" \+ x\.v, true\)/);
});

test("the icon of a master is a stop button while any of its lights plays an effect or a sync, and the row and tiles say which light is unavailable", () => {
  const lights = read("lights.js");
  assert.match(lights, /function masterPlaying\(ids\)/);
  assert.match(lights, /fx\.syncs\.forEach[\s\S]*effect: "off"/);
  assert.match(lights, /unavailable"\)\.toLowerCase\(\)/);
  assert.match(read("lightpanel.js"), /if \(V_\(e\) === "unavailable"\) return _T\("unavailable"\);/);
});

test("Light groups have a page in Settings and in the master's settings, and a group made there is not put in a section", () => {
  assert.match(read("settings.js"), /\["lgroups", _T\("lgs_title"\), "lgroups", "lights"\]/);
  assert.match(read("lights.js"), /showPopup\("lgroups", true\)/);
  assert.match(read("lightgroups.js"), /if \(f\.o\.rid\) placeDevice/);
  assert.match(read("popups.js"), /"lgroups": function/);
});
