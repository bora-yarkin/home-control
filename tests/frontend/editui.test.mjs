// SPDX-License-Identifier: GPL-3.0-or-later
// Small pieces of the editing UI: the icons suggested for a device, the add row that shows only for an empty section, and where a device added from the page's Add is put.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

/* One top-level function (or var) of a file, run on its own with what it needs. */
function piece(file, startMarker, endMarker, context) {
  const src = read(file);
  const code = src.slice(src.indexOf(startMarker), src.indexOf(endMarker));
  const sandbox = vm.createContext({ Array, Object, ...context });
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("the icons suggested for a device fit its kind, start with the one it has, are known icons only and are at most eight", () => {
  const known = new Set(["light", "lamp", "floor", "ceiling", "strip", "bed", "lights", "mine"]);
  const s = piece("manage.js", "var KINDICONS", "function devManage(", { iconOk: (n) => known.has(n) });
  assert.deepEqual(plain(s.iconSuggestions({ kind: "light", icon: "light" })), ["light", "lamp", "floor", "ceiling", "strip", "bed", "lights"]);
  assert.equal(s.iconSuggestions({ kind: "light", icon: "mine" })[0], "mine", "an icon of its own stays in front");
  assert.deepEqual(plain(s.iconSuggestions({ kind: "unknown-kind", icon: "nope" })), [], "an icon that is not known is not offered");
  const many = piece("manage.js", "var KINDICONS", "function devManage(", { iconOk: () => true });
  assert.ok(many.iconSuggestions({ kind: "light", icon: "x" }).length <= 8);
});

test("an add row is shown only while its section is empty", () => {
  const rows = [];
  const s = piece("editor.js", "/* `soft`: the add row", "/* Arrow keys on a drag grip", {
    pill: (icon, label, o) => {
      const classes = new Set();
      const p = { label, o, classList: { add: (...c) => c.forEach((x) => classes.add(x)), has: (x) => classes.has(x) } };
      rows.push(p);
      return p;
    },
  });
  const empty = s.edAdd("Add light", () => {}, null, false);
  const full = s.edAdd("Add light", () => {}, null, true);
  assert.equal(empty.classList.has("ed-add-soft"), false);
  assert.equal(full.classList.has("ed-add-soft"), true);
  const css = readFileSync(new URL("../../custom_components/home_control/frontend/dashboard.css", import.meta.url), "utf8");
  assert.match(css, /\.ed-add-soft\{display:none\}/, "and the style sheet hides a soft row");
});

test("a device from the page's Add goes to the first section of its kind, one is made when there is none, and where it went is given back", () => {
  const rooms = { living: [{ id: "lights", k: "lights", devs: [{ id: "light.a" }] }] };
  const s = piece("editor.js", "function addDevToPage", "function allSectionLists", {
    secOrder: (sc) => rooms[sc.slice(5)],
    secOf: (d) => (d.kind === "light" ? "lights" : "other"),
    newSecId: (arr) => "s" + arr.length,
  });
  assert.deepEqual(plain(s.addDevToPage("living", { id: "light.b", kind: "light" })), { rid: "~living~lights", i: 1 });
  assert.deepEqual(rooms.living[0].devs.map((d) => d.id), ["light.a", "light.b"]);
  assert.deepEqual(plain(s.addDevToPage("living", { id: "switch.c", kind: "switch" })), { rid: "~living~s1", i: 0 }, "a new section of its kind");
  assert.equal(rooms.living.length, 2);
});
