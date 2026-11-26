// SPDX-License-Identifier: GPL-3.0-or-later
// The Popup widget's contents (a Section of the page marked `of` the widget) and the button settings of the ready-made remotes. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const cut = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to));

const popupWidget = (wid) => ({ kind: "widget", w: "popup", wid });

test("a popup's contents are kept while its widget is on the page, and go with it, nested ones too", () => {
  const ctx = vm.createContext({});
  vm.runInContext(cut(read("app/model.js"), "function dropOrphanPopups(", "/* The devices of a page are whatever"), ctx);
  const list = [
    { id: "a", devs: [popupWidget("w1")] },
    { id: "b", of: "w1", devs: [popupWidget("w2")] },
    { id: "c", of: "w2", devs: [] },
  ];
  assert.deepEqual(plain(ctx.dropOrphanPopups(list)).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(plain(ctx.dropOrphanPopups([{ id: "a", devs: [] }, list[1], list[2]])).map((s) => s.id), ["a"]);
});

test("a popup's Section is never one of the page's own", () => {
  assert.match(read("app/sections.js"), /if \(s\.of \|\| \(s\.hide && !editing\(\)\)\) return;/);
  assert.match(read("app/editor.js"), /return x\.k === "devs" && !x\.of;/, "a device added to the page never lands in a popup");
  const files = JSON.parse(read("version.json")).files;
  assert.ok(files.indexOf("app/popupwidget.js") > files.indexOf("app/widgetkinds.js"), "loaded after the widget registry");
  assert.ok(files.includes("app/remotebuttons.js"));
});

function buttons(rbx = {}, states = {}) {
  const ctx = vm.createContext({
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    UI: { rbx },
    V_: (id) => (states[id] || {}).state,
    A: (id) => (states[id] || {}).attributes || {},
    mk: () => ({ empty: true }),
    rbtn: (icon, fn) => ({ icon, fn }),
    rmo: () => false,
    remotePress: (b) => ctx.pressed.push(b.a),
    pressed: [],
  });
  vm.runInContext(read("app/remotebuttons.js"), ctx);
  return ctx;
}

const tv = "media_player.tv";

test("a button with nothing behind it is left out; a hidden one too; another integration's action replaces or adds one", () => {
  const run = () => {};
  const w = buttons({ [tv]: { mute: { off: 1 }, chup: { a: { t: "ent", e: "script.up" } } } });
  assert.equal(w.rkey(tv, "back", run).icon, "back");
  assert.ok(w.rkey(tv, "back", null).empty);
  assert.ok(w.rkey(tv, "mute", run).empty);
  const added = w.rkey(tv, "chup", null);
  added.fn();
  assert.deepEqual(plain(w.pressed), [{ t: "ent", e: "script.up" }]);
});

test("what a player cannot do is only believed while it is on", () => {
  assert.equal(buttons({}, { [tv]: { state: "off", attributes: {} } }).tvLacks(tv, 8), false);
  assert.equal(buttons({}, { [tv]: { state: "playing", attributes: { supported_features: 0 } } }).tvLacks(tv, 8), true);
  assert.equal(buttons({}, { [tv]: { state: "playing", attributes: { supported_features: 8 } } }).tvLacks(tv, 8), false);
});

test("button settings are checked: unknown roles, wrong kinds of entity and bad actions are dropped", () => {
  const model = read("app/model.js");
  const ctx = vm.createContext({ ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, cleanRmAct: (a) => (a && a.e ? { t: "ent", e: a.e } : null) });
  vm.runInContext(cut(model, "function cleanRbx(", "/* The remote of a device: a grid of buttons"), ctx);
  assert.deepEqual(
    plain(ctx.cleanRbx({ mute: { off: 1, x: 2 }, brightness: { e: "number.light" }, keyboard: { e: "light.x" }, home: { a: { e: "script.h" } }, back: { a: 3 }, other: { off: 1 } })),
    { mute: { off: 1 }, home: { a: { t: "ent", e: "script.h" } }, brightness: { e: "number.light" } },
  );
  assert.equal(ctx.cleanRbx({ keyboard: { e: "nope" } }), null);
});

test("Vizio types with its own action", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read("integrations.js"), ctx);
  assert.deepEqual(plain(ctx.window.Integrations.media.textCall("vizio", tv, "", "abc")), ["vizio", "send_text", { entity_id: tv, text: "abc" }]);
});

test("a popup widget moved to another page takes its contents along, nested popups too", () => {
  const pages = {
    "room:a": [{ id: "s1", devs: [] }, { id: "p1", of: "w1", devs: [popupWidget("w2")] }, { id: "p2", of: "w2", devs: [] }],
    "room:b": [{ id: "p1", devs: [popupWidget("w1")] }],
  };
  const ctx = vm.createContext({
    UIROOM: { a: {}, b: {} },
    scopeKey: (s) => (s === "home" ? "home" : "room:" + s),
    secOrder: (sc) => (pages[sc] = pages[sc] || []),
    setSecOrder: (sc, arr) => (pages[sc] = arr),
    newSecId: () => "fresh",
    registerWidget: () => {},
    _T: (k) => k,
  });
  vm.runInContext(read("app/popupwidget.js"), ctx);
  ctx.popupFollow(popupWidget("w1"), "b");
  assert.deepEqual(plain(pages["room:a"]).map((s) => s.id), ["s1"]);
  assert.deepEqual(plain(pages["room:b"]).map((s) => [s.id, s.of || ""]), [["p1", ""], ["fresh", "w1"], ["p2", "w2"]]);
  assert.match(read("app/manage.js"), /popupFollow\(d, pg\[0\]\);/);
});
