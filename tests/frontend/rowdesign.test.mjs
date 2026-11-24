// SPDX-License-Identifier: GPL-3.0-or-later
// Rows by kind and state: the kind of device an icon stands for, what a media row shows while it plays, and when a section lays its rows out in columns. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const widgets = readFileSync(new URL("app/widgets.js", FRONTEND), "utf8");
const sections = readFileSync(new URL("app/sections.js", FRONTEND), "utf8");
const slice = (from, to) => widgets.slice(widgets.indexOf(from), widgets.indexOf(to));

function iconKinds() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(slice("var KINDWORDS", "/* A small round button"), sandbox);
  return sandbox.iconKind;
}

test("an icon stands for a kind of device (lights, climate, media, security, power, cleaning, scenes, appliances, blinds, warnings, links), built-in or Material Design, and any other icon is of kind other, so no icon is left without a colour", () => {
  const kind = iconKinds();
  for (const [icon, want] of [
    ["light", "light"],
    ["strip", "light"],
    ["mdi:lightbulb-on", "light"],
    ["ac", "climate"],
    ["purifier", "climate"],
    ["mdi:fan", "climate"],
    ["tv", "media"],
    ["apple", "media"],
    ["mdi:television-classic", "media"],
    ["lock", "security"],
    ["cctv", "security"],
    ["mdi:door-open", "security"],
    ["plug", "power"],
    ["mdi:battery-60", "power"],
    ["vac", "clean"],
    ["mdi:robot-vacuum", "clean"],
    ["scene", "scene"],
    ["play", "scene"],
    ["printer", "appliance"],
    ["mdi:printer", "appliance"],
    ["mdi:blinds", "cover"],
    ["alert", "alert"],
    ["swap", "link"],
    ["mdi:phone-ring", "security"],
    ["cog", "other"],
    ["plus", "other"],
    ["mdi:something-odd", "other"],
    ["mdi:desk-lamp", "light"],
    ["mdi:lightning-bolt", "power"],
    ["mdi:air-conditioner", "climate"],
    ["mdi:washing-machine", "appliance"],
    ["mdi:lightbulb-group", "light"],
    ["", ""],
    [undefined, ""],
  ])
    assert.equal(kind(icon), want, String(icon));
});

function mediaRow(states, devices = {}) {
  const calls = [];
  let options = null;
  const sandbox = {
    UIDEV: devices,
    V_: (id) => (states[id] || {}).state,
    A: (id) => (states[id] || {}).attributes || {},
    mediaOn: (id) => ["on", "playing", "paused", "buffering"].includes((states[id] || {}).state),
    cap: (s) => s.charAt(0).toUpperCase() + s.slice(1),
    _T: (k) => k,
    pinPop: () => null,
    showPopup: () => {},
    toggleEnt: () => {},
    call: (...a) => calls.push(a),
    pill: (icon, name, o) => (options = o),
  };
  vm.createContext(sandbox);
  vm.runInContext(slice("function mediaRow(", "/* An air conditioner row"), sandbox);
  sandbox.mediaRow("tv", "TV", "media_player.tv", "k", false);
  return { options, calls };
}

const player = (state, attributes = {}) => ({ "media_player.tv": { state, attributes } });

test("a playing media row shows the artwork, the title and artist, and a pause button that pauses the player", () => {
  const { options, calls } = mediaRow(
    player("playing", { media_title: "Severance", media_artist: "S2 E4", entity_picture: "/api/art.jpg", source: "Apple TV+" })
  );
  assert.equal(options.art(), "/api/art.jpg");
  assert.equal(options.sub(), "Severance · S2 E4");
  assert.equal(options.action.show(), true);
  assert.equal(options.action.icon(), "pause");
  options.action.fn();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["media_player", "media_play_pause", { entity_id: "media_player.tv" }]]);
});

test("a paused media row offers play; an idle or off one shows no artwork, no button and no title", () => {
  const paused = mediaRow(player("paused", { media_title: "Nocturne" })).options;
  assert.equal(paused.action.show(), true);
  assert.equal(paused.action.icon(), "play");
  for (const state of ["off", "idle", "on"]) {
    const { options } = mediaRow(player(state, { media_title: "Old title", entity_picture: "/api/art.jpg" }));
    assert.equal(options.art(), "", state);
    assert.equal(options.action.show(), false, state);
    assert.equal(options.sub(), "", state);
  }
});

test("a device whose Now playing is off shows nothing of what plays", () => {
  const { options } = mediaRow(player("playing", { media_title: "Secret", entity_picture: "/api/art.jpg" }), { "media_player.tv": { nonp: 1 } });
  assert.equal(options.art(), "");
  assert.equal(options.action.show(), false);
  assert.equal(options.sub, null);
});

function sectionOf(rows) {
  const element = (cls) => {
    const set = new Set(cls.split(" "));
    return {
      classList: { contains: (c) => set.has(c), add: (c) => set.add(c) },
      appendChild() {},
      firstChild: { querySelector: () => ({}) },
    };
  };
  const sandbox = { mk: (_tag, cls) => element(cls), svg: () => "" };
  vm.createContext(sandbox);
  vm.runInContext(slice("function section(", "/* A media row shows"), sandbox);
  const items = rows.map(element);
  return sandbox.section("S", "plug", items);
}

test("a section of four or more plain rows lays them out in columns; fewer rows, or any slider or other element, keep the single column", () => {
  assert.equal(sectionOf(Array(4).fill("pill pane")).classList.contains("dense"), true);
  assert.equal(sectionOf(Array(3).fill("pill pane")).classList.contains("dense"), false);
  assert.equal(sectionOf([...Array(3).fill("pill pane"), "pill pane slide"]).classList.contains("dense"), false);
  assert.equal(sectionOf([...Array(3).fill("pill pane"), "glance"]).classList.contains("dense"), false);
});

test("On now is a kind of section that exists once, is offered in the Add section list under the overview, and is built by secNow", () => {
  assert.match(sections, /now: \{ t: _T\("on_now"\)[^}]*one: 1/);
  assert.match(sections, /"glance",\s*"now",\s*"rooms"/);
  assert.match(sections, /if \(k === "now"\) return secNow\(\);/);
  assert.match(readFileSync(new URL("app/editor.js", FRONTEND), "utf8"), /\["glance", "now", "rooms"/);
});

test("rows of blinds, appliances and vacuums take their kind from what the device is, not from the icon the owner picked", () => {
  const frontend = (file) => readFileSync(new URL("app/" + file, FRONTEND), "utf8");
  assert.match(frontend("devices.js"), /kind: "cover"/);
  assert.match(frontend("appliance.js"), /kind: "appliance"/);
  assert.match(frontend("scenes.js"), /kind: "clean"/);
  assert.match(readFileSync(new URL("app/mastersettings.js", FRONTEND), "utf8"), /kind: "light"/, "a light in the order list is a light whatever icon it has");
  assert.match(widgets, /var kind = o\.kind \|\| iconKind\(icon\)/);
});
