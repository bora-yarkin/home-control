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
  const states = { "script.a": { state: "off" }, "button.b": { state: "unknown" }, "scene.c": { state: "2026-01-01" }, "switch.d": { state: "on" } };
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
  for (const e of ["script.a", "button.b", "scene.c", "switch.d"]) context.remotePress({ e });
  assert.deepEqual(calls, [
    ["script", "turn_on", { entity_id: "script.a" }],
    ["scene", "turn_on", { entity_id: "scene.c" }],
    ["switch", "toggle", { entity_id: "switch.d" }],
  ]);
  assert.deepEqual(toasts, ["rm_not_available_right_now"], "only the unavailable button speaks");
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
