// SPDX-License-Identifier: GPL-3.0-or-later
// Custom remotes: what the layout keeps of one, and what a press runs. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function model() {
  const context = vm.createContext({
    Object,
    Array,
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    POPRE_PLACEHOLDER: 0,
    iconOk: (n) => typeof n === "string" && /^[a-z0-9-]{1,30}$/.test(n),
  });
  vm.runInContext(readFileSync(new URL("model.js", APP), "utf8"), context);
  return context;
}

test("a remote keeps up to 60 pressable buttons, with a valid icon, a short label and a width of one or two columns", () => {
  const m = model();
  const r = plain(
    m.cleanRemote({
      cols: 9,
      btns: [
        { e: "script.tv_power", i: "power", l: "x".repeat(40), s: 2 },
        { e: "light.lamp", i: "power" }, // a light is not pressed
        { e: "scene.movie", i: "BAD ICON", s: 5 },
        { e: "not an id" },
        null,
        { e: "switch.plug", i: "plug", s: -3 },
      ],
    })
  );
  assert.equal(r.cols, 6);
  assert.deepEqual(r.btns.map((b) => b.e), ["script.tv_power", "scene.movie", "switch.plug"]);
  assert.equal(r.btns[0].l.length, 24);
  assert.deepEqual(r.btns.map((b) => b.s), [2, 2, 1]);
  assert.equal(r.btns[1].i, "info");
  assert.deepEqual(plain(m.cleanRemote(undefined)), { cols: 3, btns: [] });
  assert.equal(m.cleanRemote({ cols: 3, btns: Array.from({ length: 80 }, () => ({ e: "script.a" })) }).btns.length, 60);
});

test("a column count never goes below two or above six, and a width never exceeds the columns", () => {
  const m = model();
  assert.equal(m.cleanRemote({ cols: 1 }).cols, 2);
  assert.equal(m.cleanRemote({ cols: 2, btns: [{ e: "script.a", s: 2 }] }).btns[0].s, 2);
});

test("a press runs the right service for each kind and says nothing when it goes through", () => {
  const calls = [];
  const toasts = [];
  const states = { "script.a": { state: "off" }, "button.b": { state: "unknown" }, "button.e": { state: "unavailable" }, "sensor.f": { state: "unknown" }, "scene.c": { state: "2026-01-01" }, "switch.d": { state: "on" } };
  const context = vm.createContext({
    H: () => ({ states }),
    dom: (id) => id.split(".")[0],
    call: (d, s, data) => calls.push([d, s, plain(data)]),
    toast: (t) => toasts.push(t),
    _T: (k) => k,
    UI: { devs: {}, layout: {} },
    allSectionLists: () => [],
  });
  vm.runInContext(readFileSync(new URL("remote.js", APP), "utf8"), context);
  for (const e of ["script.a", "button.b", "scene.c", "switch.d", "button.e"]) context.remotePress({ e });
  assert.deepEqual(calls, [
    ["script", "turn_on", { entity_id: "script.a" }],
    ["button", "press", { entity_id: "button.b" }], // a button nobody has pressed yet reads "unknown" and works
    ["scene", "turn_on", { entity_id: "scene.c" }],
    ["switch", "toggle", { entity_id: "switch.d" }],
  ]);
  assert.deepEqual(toasts, ["rm_not_available_right_now"], "only the unavailable button speaks");
  assert.equal(context.remoteUsable("sensor.f"), false, "for anything that is not a button, unknown is no reading");
});

test("a picture of a remote keeps only an upload of the integration or a file under /local, with touch areas inside the picture", () => {
  const m = model();
  const keep = plain(
    m.cleanRemote({
      cols: 3,
      v: "i",
      img: {
        u: "/home_control_remotes/0123456789ab.png",
        hs: [
          { x: -5, y: 95, w: 50, h: 20, r: "ellipse", e: "script.power" },
          { x: 10, y: 10, w: 1, h: 1, e: "script.tiny" },
          { x: 10, y: 10, w: 10, h: 10, e: "light.lamp" },
          { x: 10, y: 10, w: 10, h: 10, e: "bad id" },
        ],
      },
    })
  );
  assert.equal(keep.v, "i");
  assert.equal(keep.img.hs.length, 2);
  assert.deepEqual(keep.img.hs[0], { x: 0, y: 80, w: 50, h: 20, r: "ellipse", e: "script.power" });
  assert.deepEqual([keep.img.hs[1].w, keep.img.hs[1].h, keep.img.hs[1].r], [3, 3, "rect"]);
  for (const u of ["https://evil.example/x.png", "/local/../secret.png", "/api/states", "/home_control_remotes/../x.png", "javascript:alert(1)", "/local/a b.png"]) {
    assert.equal(m.cleanRemote({ img: { u, hs: [] } }).img, undefined, u);
  }
  assert.equal(m.cleanRemote({ img: { u: "/local/rasta/remote.png?v=3", hs: [] } }).img.u, "/local/rasta/remote.png?v=3");
  assert.equal("v" in m.cleanRemote({ v: "i", btns: [] }), false, "the picture layout needs a picture");
});

test("a button set to ask first asks, runs only when the answer is yes, and a plain button never asks", () => {
  const calls = [];
  const asked = [];
  let answer = null;
  const states = { "button.garage": { state: "unknown" }, "script.lights": { state: "off" } };
  const context = vm.createContext({
    H: () => ({ states }),
    A: (id) => (id === "button.garage" ? { friendly_name: "Garage door" } : {}),
    dom: (id) => id.split(".")[0],
    call: (d, s, data) => calls.push([d, s, plain(data)]),
    toast() {},
    confirmDlg: (text, fn) => {
      asked.push(text);
      answer = fn;
    },
    _T: (k) => k,
    UI: { devs: {}, layout: {} },
    allSectionLists: () => [],
  });
  vm.runInContext(readFileSync(new URL("remote.js", APP), "utf8"), context);
  context.remotePress({ e: "button.garage", q: 1 });
  assert.deepEqual(calls, [], "nothing runs before the answer");
  assert.deepEqual(asked, ["Garage door?"]);
  answer();
  assert.deepEqual(calls, [["button", "press", { entity_id: "button.garage" }]]);
  context.remotePress({ e: "script.lights" });
  assert.equal(asked.length, 1);
  assert.equal(calls.length, 2);
  context.remotePress({ e: "button.garage", q: 1, l: "Open the gate" });
  assert.equal(asked[1], "Open the gate?", "a label names it");
});

test("a remote keeps a button's ask-first choice and drops it when it is off", () => {
  const r = plain(model().cleanRemote({ btns: [{ e: "button.a", q: 1 }, { e: "button.b", q: 0 }, { e: "button.c" }] }));
  assert.deepEqual(r.btns.map((b) => b.q), [1, undefined, undefined]);
});
