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
  const ctx = vm.createContext({ alertList: () => list, _T: (k) => ({ nt_alerts: "Alerts" })[k] || k, UI: { stat: {} }, glance: (it) => Object.assign(it, { children: [] }) });
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

test("the Attention tile's editor opens (label and remove), and removing it takes the tile off the page's row", () => {
  const from = status.indexOf("function statTile(b, key)");
  const body = status.slice(from, status.indexOf("/* home climate tiles */"));
  const made = [];
  let popped = 0,
    changed = 0;
  const el = (kind, label, o) => ({ kind, label, o, kids: [], appendChild(c) { if (!c) throw new Error("appendChild(" + c + ")"); this.kids.push(c); } });
  const ctx = vm.createContext({
    UI: { stat: { home: [{ k: "alerts", l: "Attention" }] } },
    textRow: (i, label) => el("text", label),
    pill: (i, label, o) => el("pill", label, o),
    stgActions: (parent, rows) => rows.forEach((r) => parent.appendChild(r)),
    stgIdentity() {
      throw new Error("the one-field editor must not use the two-field layout helper");
    },
    popBack: () => popped++,
    uiChanged: () => changed++,
    _T: (k) => k,
  });
  vm.runInContext(body, ctx);
  const b = el("box");
  ctx.statTile(b, "home:0");
  assert.deepEqual(b.kids.map((k) => k.kind + ":" + k.label), ["text:label", "pill:remove_tile"]);
  b.kids[1].o.tap();
  assert.equal(ctx.UI.stat.home.length, 0);
  assert.equal(popped, 1);
  assert.ok(changed >= 1);
});

test("the Attention chip and the Attention tile use the same icon in the header's settings", () => {
  const header = read("header.js");
  assert.match(header, /pill\(t\.k === "alerts" \? "alert" : "thermo"/);
  assert.match(header, /i: it\.k === "alerts" \? "alert" : "info"/);
});

test("an offline lock needs attention, whether or not it is on a page, and the kind can be switched off", () => {
  const from = status.indexOf("function alertList()");
  const body = status.slice(from, status.indexOf("/* To the page an alert is about"));
  const run = (off) => {
    const ctx = vm.createContext({
      BATLIST: [],
      batIndex: () => ({}),
      alertOn: (k) => !off.includes(k),
      devsOf: (kind) => (kind === "lock" ? [{ id: "lock.front", name: "Front door", room: "door" }] : []),
      allLights: () => [],
      H: () => ({}),
      secEnts: () => ({ lock: ["lock.front", "lock.shed", "lock.ok"] }),
      V_: (id) => (id === "lock.ok" ? "locked" : "unavailable"),
      entName: (id) => "Shed lock",
      _T: (k) => ({ is_offline: " is offline" })[k] || k,
      alertGo() {},
    });
    vm.runInContext(body, ctx);
    return Array.from(ctx.alertList()).map((a) => [a[0], typeof a[2]]);
  };
  assert.deepEqual(run([]).map((a) => Array.from(a)), [["Front door is offline", "function"], ["Shed lock is offline", "object"]]);
  assert.equal(run(["lock"]).length, 0);
  assert.match(status, /ALERT_KEYS = \["battery", "vacuum", "camera", "lock", "climate", "lights"\]/);
});

test("the Attention chip and tile of the header open a popup of the details", () => {
  assert.match(read("popups.js"), /"g-alerts": function[\s\S]*?alertsDevice\(true\)/);
  assert.match(read("header.js"), /if \(it\.k === "alerts"\) alertsTap\(el\)/);
  assert.match(status, /if \(s\.k === "alerts"\) alertsTap\(g\.children\[i\]\)/);
  assert.match(status, /showPopup\("g-alerts", false\)/);
});

test("the header's row has a class of its own: no other part of the dashboard is styled by it, and it takes none of another's", () => {
  const css = readFileSync(new URL("../dashboard.css", APP), "utf8");
  assert.match(readFileSync(new URL("../dashboard-panel.js", APP), "utf8"), /<div class="hdr pane"><div class="hdrow">/);
  assert.match(read("history.js"), /"hrow pane"/, "history rows keep .hrow");
  assert.equal((css.match(/^\.hrow\{/gm) || []).length, 1, "one rule for .hrow, the history row's");
  assert.doesNotMatch(css, /^\.hrow>div:first-child/m);
});
