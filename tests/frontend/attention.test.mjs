// SPDX-License-Identifier: GPL-3.0-or-later
// Attention is a device (decision D-29): rows in a plain Section that hides when there is nothing to say, a chip of the header's global row and a tile of a page's row. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const status = read("status.js");

function sandbox(list) {
  const ctx = vm.createContext({ alertList: () => list, _T: (k) => ({ nt_alerts: "Alerts" })[k] || k, UI: { stat: {} }, glance: (it) => it });
  const from = status.indexOf("function alertText()");
  vm.runInContext(status.slice(from, status.indexOf("/* Thresholds shown")), ctx);
  const g = status.indexOf("/* The tiles of a page's header row");
  vm.runInContext(status.slice(g, status.indexOf("function addStatTile")), ctx);
  return ctx;
}

test("an Attention chip or tile says the one thing that needs attention, or how many", () => {
  assert.equal(sandbox([["Low battery", "", null]]).alertText(), "Low battery");
  assert.equal(sandbox([["a", "", null], ["b", "", null]]).alertText(), "2 alerts");
});

test("a page's Attention tile is in its row only while there is something to say, and the other tiles always", () => {
  const tiles = [{ k: "alerts", l: "Attention" }, { l: "Temp", id: "sensor.t" }];
  const none = sandbox([]);
  none.UI.stat.home = tiles;
  assert.deepEqual(Array.from(none.statShown("home")).map((t) => t.l), ["Temp"]);
  const some = sandbox([["x", "", null]]);
  some.UI.stat.home = tiles;
  assert.deepEqual(Array.from(some.statShown("home")).map((t) => t.l), ["Attention", "Temp"]);
  some.UI.stat.home = [tiles[0]];
  assert.equal(some.statGrid("home")[0][1](), "x");
  none.UI.stat.home = [tiles[0]];
  assert.equal(none.statGrid("home"), null, "a row of nothing but Attention is no row when there is nothing to say");
});

test("Attention is a widget that draws its own rows, hides its Section when empty and is not kept in a stack", () => {
  const kinds = read("widgetkinds.js");
  assert.match(kinds, /registerWidget\("alerts", \{[\s\S]*?draw: function \(d, wx, ed\) \{\s*return alertsDevice\(ed\)/);
  assert.doesNotMatch(kinds, /overview\("alerts"/, "no longer an overview built as a section of its own");
  assert.match(kinds, /noStack: true/);
  assert.match(status, /sec\.style\.display = list\.length \? "" : "none"/, "the Section holding it is hidden while it has nothing");
  assert.match(status, /if \(!list\.length && ed\)/, "only the page editor shows it empty");
});

test("the header takes Attention as a chip and a tile, and each is cleaned", () => {
  const model = read("model.js");
  assert.match(model, /\["weather", "people", "lights", "alerts", "entity"\]\.indexOf\(x\.k\) < 0/);
  assert.match(model, /s && s\.k === "alerts"/);
  const header = read("header.js");
  assert.match(header, /it\.k === "alerts"\) return alertList\(\)\.length \? \{ i: "alert", t: alertText\(\) \} : null/);
  assert.match(header, /hdrStatusSync\(false\);\n\}/, "the row follows the alerts as they come and go");
  assert.match(header, /add_attention/);
});

test("the sky is drawn at one stage height that the header shows as much of as it is tall, so a header that opens or shuts never stretches or remakes it", () => {
  const sky = read("sky.js");
  assert.match(sky, /var SKYH_MIN = 320/);
  assert.match(sky, /h = Math\.max\(SKYS\.stage \|\| 0, SKYH_MIN, cv\.parentNode\.clientHeight\)/);
  assert.match(sky, /cv\.style\.height = h \+ "px"/);
  assert.match(sky, /SKYS\.top\.style\.height = h \+ "px"/, "the drops on the controls share the same stage");
  assert.doesNotMatch(sky, /o\.y \*= kh/);
  const css = readFileSync(new URL("../dashboard.css", APP), "utf8");
  assert.match(css, /\.hsky canvas\{position:absolute;inset:0 0 auto 0/, "anchored to the top, clipped by the header");
});
