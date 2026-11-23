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

test("a remote keeps up to 150 pressable buttons, with a valid icon, a short label, and a width and height inside the grid", () => {
  const m = model();
  const r = plain(
    m.cleanRemote({
      cols: 9,
      btns: [
        { e: "script.tv_power", i: "power", l: "x".repeat(40), s: 2 },
        { e: "light.lamp", i: "power" }, // a light is not pressed
        { e: "scene.movie", i: "BAD ICON", s: 50, h: 99 },
        { e: "not an id" },
        null,
        { e: "switch.plug", i: "plug", s: -3 },
      ],
    })
  );
  assert.equal(r.cols, 9);
  assert.deepEqual(r.btns.map((b) => b.a.e), ["script.tv_power", "scene.movie", "switch.plug"]);
  assert.equal(r.btns[0].l.length, 24);
  assert.deepEqual(r.btns.map((b) => b.s), [2, 9, 1]);
  assert.deepEqual(r.btns.map((b) => b.h), [1, 8, 1]);
  assert.equal(r.btns[1].i, "info");
  assert.deepEqual(plain(m.cleanRemote(undefined)), { cols: 3, btns: [] });
  assert.equal(m.cleanRemote({ cols: 3, btns: Array.from({ length: 200 }, () => ({ e: "script.a" })) }).btns.length, 150);
});

test("a button can send a key to a remote entity, control a media player, select its source or press an LG button, and nothing else", () => {
  const m = model();
  const r = plain(
    m.cleanRemote({
      cols: 4,
      btns: [
        { a: { t: "key", e: "remote.tv", c: "KEY_VOLUP", r: 1 }, i: "volup", s: 1 },
        { a: { t: "key", e: "remote.tv", c: "bad;key" } },
        { a: { t: "key", e: "light.tv", c: "KEY_UP" } },
        { a: { t: "media", e: "media_player.tv", m: "volume_mute" } },
        { a: { t: "media", e: "media_player.tv", m: "format_disk" } },
        { a: { t: "src", e: "media_player.tv", v: "HDMI 1" }, i: "swap" },
        { a: { t: "webos", e: "media_player.lg", b: "ENTER" } },
        { a: { t: "webos", e: "media_player.lg", b: "enter; rm" } },
        { a: { t: "shell", e: "script.a" } },
      ],
    }),
  );
  assert.deepEqual(r.btns.map((b) => b.a.t), ["key", "media", "src", "webos"]);
  assert.deepEqual(r.btns[0].a, { t: "key", e: "remote.tv", c: "KEY_VOLUP", r: 1 });
});

test("a button can have no icon when it has a label, a colour from four, gaps, and five-way pads of up to five actions", () => {
  const m = model();
  const r = plain(
    m.cleanRemote({
      cols: 6,
      btns: [
        { a: { t: "key", e: "remote.tv", c: "KEY_1" }, i: "", l: "1" },
        { a: { t: "key", e: "remote.tv", c: "KEY_2" }, i: "", l: "" },
        { a: { t: "key", e: "remote.tv", c: "KEY_RED" }, i: "", l: "", k: "red" },
        { a: { t: "key", e: "remote.tv", c: "KEY_X" }, k: "pink" },
        { a: { t: "gap" }, s: 2, h: 3 },
        { a: { t: "dpad", u: { t: "key", e: "remote.tv", c: "KEY_UP" }, o: { t: "key", e: "remote.tv", c: "KEY_ENTER" }, l: { t: "shell", e: "x.y" } }, s: 9, h: 1 },
        { a: { t: "dpad" } },
      ],
    }),
  );
  assert.equal(r.btns[0].i, "", "a label can stand without an icon");
  assert.equal(r.btns[1].i, "info", "without a label there is the info icon");
  assert.equal(r.btns[2].k, "red");
  assert.equal("k" in r.btns[3], false);
  assert.deepEqual([r.btns[4].a.t, r.btns[4].s, r.btns[4].h], ["gap", 2, 3]);
  const pad = r.btns[5];
  assert.deepEqual(Object.keys(pad.a).sort(), ["o", "t", "u"], "only the parts with a valid action stay");
  assert.deepEqual([pad.s, pad.h], [6, 2], "a pad is at least two cells each way and no wider than the grid");
  assert.equal(r.btns.length, 6, "a pad with nothing in it is dropped");
});

test("a column count never goes below two or above twelve, and a width never exceeds the columns", () => {
  const m = model();
  assert.equal(m.cleanRemote({ cols: 1 }).cols, 2);
  assert.equal(m.cleanRemote({ cols: 40 }).cols, 12);
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
  assert.deepEqual(keep.img.hs[0], { x: 0, y: 80, w: 50, h: 20, r: "ellipse", a: { t: "ent", e: "script.power" } });
  assert.deepEqual([keep.img.hs[1].w, keep.img.hs[1].h, keep.img.hs[1].r], [1, 1, "rect"]);
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

test("a press sends a key to its remote entity, controls its media player, selects a source or presses an LG button, and only when that entity can run it", () => {
  const calls = [];
  const toasts = [];
  const states = { "remote.tv": { state: "on", attributes: {} }, "remote.off": { state: "unavailable", attributes: {} }, "media_player.tv": { state: "on", attributes: { is_volume_muted: false } }, "media_player.lg": { state: "on", attributes: {} } };
  const context = vm.createContext({
    H: () => ({ states }),
    A: (id) => (states[id] || { attributes: {} }).attributes,
    dom: (id) => id.split(".")[0],
    call: (d, s, data) => calls.push([d, s, plain(data)]),
    toast: (t) => toasts.push(t),
    _T: (k) => k,
    UI: { devs: {}, layout: {} },
    allSectionLists: () => [],
  });
  vm.runInContext(readFileSync(new URL("remote.js", APP), "utf8"), context);
  const press = (a, extra = {}) => context.remotePress({ a, ...extra });
  press({ t: "key", e: "remote.tv", c: "KEY_VOLUP" });
  press({ t: "key", e: "remote.off", c: "KEY_VOLUP" });
  press({ t: "media", e: "media_player.tv", m: "volume_mute" });
  press({ t: "media", e: "media_player.tv", m: "play_pause" });
  press({ t: "src", e: "media_player.tv", v: "HDMI 2" });
  press({ t: "webos", e: "media_player.lg", b: "ENTER" });
  assert.deepEqual(calls, [
    ["remote", "send_command", { entity_id: "remote.tv", command: "KEY_VOLUP" }],
    ["media_player", "volume_mute", { entity_id: "media_player.tv", is_volume_muted: true }],
    ["media_player", "media_play_pause", { entity_id: "media_player.tv" }],
    ["media_player", "select_source", { entity_id: "media_player.tv", source: "HDMI 2" }],
    ["webostv", "button", { entity_id: "media_player.lg", button: "ENTER" }],
  ]);
  assert.deepEqual(toasts, ["rm_not_available_right_now"]);
});

test("the keys of an integration are its documented ones: Samsung, Apple TV and Android TV Remote first, the others listed as built from documentation", () => {
  const w = { Integrations: null };
  const ctx = vm.createContext({ window: w, setTimeout });
  vm.runInContext(readFileSync(new URL("../../custom_components/home_control/frontend/integrations.js", import.meta.url), "utf8"), ctx);
  const R = w.Integrations.remote;
  assert.equal(R.family("samsungtv_smart"), "samsung");
  assert.equal(R.family("samsungtv"), "samsung");
  assert.equal(R.family("androidtv_remote"), "android");
  assert.equal(R.family("webostv"), "webos");
  assert.equal(R.family("something_else"), "");
  assert.equal(R.how("webos"), "webos");
  assert.equal(R.how("samsung"), "key");
  const all = R.groups("samsung").flatMap((g) => g[1].map((k) => k[0]));
  for (const k of ["KEY_UP", "KEY_ENTER", "KEY_VOLUP", "KEY_0", "KEY_9", "KEY_RED", "KEY_POWER"]) assert.ok(all.includes(k), k);
  assert.equal(new Set(all).size, all.length, "no key twice in a family");
  assert.equal(R.role("samsung", "up"), "", "Samsung and Apple have native remotes, not role maps");
  assert.equal(R.experimental("samsung"), false);
  for (const f of ["roku", "bravia", "philips", "vizio", "adb", "webos"]) {
    assert.equal(R.experimental(f), true, f);
    assert.ok(R.role(f, "up") && R.role(f, "ok") && R.role(f, "back") && R.role(f, "home"), f + " has the arrows, OK, back and home");
  }
  assert.equal(R.text("roku", "hi"), "Lit_hi");
  assert.equal(R.text("bravia", "hi"), null);
  for (const f of R.families()) for (const g of R.groups(f)) for (const k of g[1]) assert.ok(/^[A-Za-z0-9_ .,:+-]{1,40}$/.test(k[0]), f + ":" + k[0] + " is a key the model accepts");
});

test("a remote can have a touchpad, a now-playing card, a source menu, a keyboard button and a slider, each on the right kind of entity, and a key can be held or turn a player on instead", () => {
  const m = model();
  const k = (c, extra = {}) => ({ t: "key", e: "remote.tv", c, ...extra });
  const r = plain(
    m.cleanRemote({
      cols: 6,
      btns: [
        { a: { t: "touch", u: k("KEY_UP"), o: k("KEY_ENTER"), h: k("KEY_ENTER", { hs: 1 }), x: k("nope") }, s: 99, h: 1 },
        { a: { t: "touch" } },
        { a: { t: "now", e: "media_player.tv" }, s: 6 },
        { a: { t: "now", e: "light.tv" } },
        { a: { t: "source", e: "media_player.tv" } },
        { a: { t: "text", e: "media_player.tv" }, i: "BAD ICON" },
        { a: { t: "slider", e: "number.backlight" }, l: "Backlight" },
        { a: { t: "slider", e: "media_player.tv" } },
        { a: k("KEY_POWER", { w: "media_player.tv", hs: 9 }) },
        { a: k("KEY_OK", { w: "light.tv", hs: 1.3 }) },
      ],
    }),
  );
  assert.deepEqual(r.btns.map((b) => b.a.t), ["touch", "now", "source", "text", "slider", "key", "key"]);
  assert.deepEqual(Object.keys(r.btns[0].a).sort(), ["h", "o", "t", "u"], "only known parts with valid actions stay");
  assert.deepEqual([r.btns[0].s, r.btns[0].h], [6, 2], "a touchpad is at least two cells each way");
  assert.equal(r.btns[0].a.h.hs, 1);
  assert.equal(r.btns[3].i, "keyboard");
  assert.equal(r.btns[4].l, "Backlight");
  assert.deepEqual(r.btns[5].a, { t: "key", e: "remote.tv", c: "KEY_POWER", w: "media_player.tv" }, "a hold over five seconds is dropped, a player to wake is kept");
  assert.deepEqual(r.btns[6].a, { t: "key", e: "remote.tv", c: "KEY_OK", hs: 1.5 }, "a hold is in half seconds, and only a media player can be woken");
});
