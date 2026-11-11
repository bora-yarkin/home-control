// SPDX-License-Identifier: GPL-3.0-or-later
// Door calls (app/doorcall.js, camera-stream.js): what state a call is in, where its audio is, when its popup opens, and the microphone
// that is sent to the door. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");

function page({ states = {}, UIDEV = {}, hidden = false, mode = () => ({ mode: "full" }) } = {}) {
  const popups = [];
  const sandbox = {
    H: () => ({ states }),
    dom: (id) => id.split(".")[0],
    Date,
    clearTimeout,
    isFinite,
    UIDEV,
    BOOTED: true,
    CURRENT: null,
    SHEET: null,
    WALL: { el: null },
    document: { get hidden() { return hidden; } },
    modeOf: mode,
    showPopup: (key) => {
      popups.push(key);
      sandbox.CURRENT = key;
      sandbox.SHEET = {};
    },
    toast() {},
    _T: (k) => k,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("app/doorcall.js"), sandbox);
  return { sandbox, popups, states, setHidden: (v) => (hidden = v) };
}
const door = { "camera.door": { ix: { ring: "sensor.call", answer: "button.a" } } };
const sensor = (state, attributes = {}) => ({ state, attributes });

test("a call sensor says ringing, call or idle in words; an on/off indicator and an event can only ring", () => {
  const recent = new Date(Date.now() - 5000).toISOString();
  const { sandbox: p } = page({
    states: {
      "sensor.a": sensor("idle"),
      "sensor.b": sensor("ringing"),
      "sensor.c": sensor("call in progress"),
      "sensor.d": sensor("unavailable"),
      "binary_sensor.e": sensor("on"),
      "binary_sensor.f": sensor("off"),
      "event.g": sensor(recent),
    },
  });
  const st = (ring) => p.ixState({ ring });
  assert.deepEqual(["sensor.a", "sensor.b", "sensor.c", "sensor.d", "binary_sensor.e", "binary_sensor.f", "event.g", "sensor.missing"].map(st), ["idle", "ringing", "call", "idle", "ringing", "idle", "ringing", "idle"]);
  assert.equal(p.ixState({}), "idle");
});

test("the audio of a call is found on the call indicator's attributes or the profile, and only as an /api path of this Home Assistant", () => {
  const attrs = { listen_path: "/api/x/listen/1/2", talk_path: "/api/x/talk/1/2" };
  const { sandbox: p } = page({ states: { "sensor.call": sensor("ringing", attrs) } });
  assert.deepEqual(JSON.parse(JSON.stringify(p.ixPaths({ ring: "sensor.call" }))), { listen: "/api/x/listen/1/2", talk: "/api/x/talk/1/2" });
  assert.equal(p.ixPaths({ ring: "sensor.call", listen: "/api/own/listen" }).listen, "/api/own/listen", "the profile's own address wins");
  for (const bad of ["https://evil.example/api/x", "//evil.example/api/x", "/api/../auth/token", "/auth/token", "", 5, null]) {
    const q = page({ states: { "sensor.call": sensor("ringing", { listen_path: bad, talk_path: bad }) } }).sandbox;
    assert.deepEqual(JSON.parse(JSON.stringify(q.ixPaths({ ring: "sensor.call" }))), { listen: null, talk: null }, String(bad));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(p.ixPaths({}))), { listen: null, talk: null }, "no indicator, no addresses");
});

test("a call opens its popup once, over what is open, and the popup closed during a call stays closed until that call is over", () => {
  const { sandbox: p, popups, states } = page({ states: { "sensor.call": sensor("idle") }, UIDEV: door });
  p.ixWatch();
  assert.deepEqual(popups, [], "nothing rings");
  states["sensor.call"] = sensor("ringing");
  p.ixWatch();
  p.ixWatch();
  assert.deepEqual(popups, ["call:camera.door"], "once, however often it is looked at");
  p.CURRENT = null; // closed by the person
  p.ixWatch();
  states["sensor.call"] = sensor("call in progress");
  p.ixWatch();
  assert.deepEqual(popups, ["call:camera.door"], "closed means not now, also when the call is answered elsewhere");
  states["sensor.call"] = sensor("idle");
  p.ixWatch();
  states["sensor.call"] = sensor("ringing");
  p.ixWatch();
  assert.deepEqual(popups, ["call:camera.door", "call:camera.door"], "the next call opens it again");
});

test("a dashboard opened while a call is going opens the call (the notification's tap), also when it is already answered", () => {
  const { sandbox: p, popups } = page({ states: { "sensor.call": sensor("call in progress") }, UIDEV: door });
  p.ixWatch();
  assert.deepEqual(popups, ["call:camera.door"]);
});

test("a page that is not shown opens nothing until it is; a device this person may not see never opens", () => {
  const states = { "sensor.call": sensor("ringing") };
  const hiddenPage = page({ states, UIDEV: door, hidden: true });
  hiddenPage.sandbox.ixWatch();
  assert.deepEqual(hiddenPage.popups, []);
  hiddenPage.setHidden(false);
  hiddenPage.sandbox.ixWatch();
  assert.deepEqual(hiddenPage.popups, ["call:camera.door"]);
  const forbidden = page({ states, UIDEV: door, mode: () => ({ mode: "hide" }) });
  forbidden.sandbox.ixWatch();
  assert.deepEqual(forbidden.popups, []);
});

test("a screensaver is taken away for a call, and the audio stops when the popup is gone", () => {
  const { sandbox: p } = page({ states: { "sensor.call": sensor("ringing") }, UIDEV: door });
  let hid = 0;
  p.WALL.el = {};
  p.wallHide = () => hid++;
  p.ixWatch();
  assert.equal(hid, 1);
  let stopped = 0;
  p.IXA.talker = { stop: () => stopped++ };
  p.CURRENT = "settings";
  p.ixWatch();
  assert.equal(stopped, 1);
  assert.equal(p.IXA.talker, null);
});

test("the slide to unlock is offered when an unlock is bound, unless the call indicator says this caller has nothing to unlock", () => {
  const { sandbox: p } = page({
    states: {
      "sensor.door": sensor("ringing", { can_unlock: true }),
      "sensor.plain": sensor("ringing"),
      "sensor.guard": sensor("ringing", { can_unlock: false }),
      "sensor.odd": sensor("ringing", { can_unlock: "no" }),
    },
  });
  const can = (ring, unlock = "lock.door") => p.ixCanUnlock({ ring, unlock });
  assert.equal(can("sensor.door"), true);
  assert.equal(can("sensor.plain"), true, "an indicator that says nothing leaves the unlock available");
  assert.equal(can("sensor.guard"), false, "a guard desk has no door");
  assert.equal(can("sensor.odd"), true, "only a plain false hides it");
  assert.equal(p.ixCanUnlock({ ring: "sensor.door" }), false, "no unlock bound, nothing to slide");
  assert.equal(p.ixCanUnlock(null), false);
  assert.equal(p.ixCanUnlock({ unlock: "lock.door" }), true, "no indicator at all");
});

test("the door slides open only while it can: a lock that is locked, or a button that has not just been pressed, and never for a caller with no door", () => {
  const { sandbox: p } = page({ states: { "sensor.call": sensor("ringing", { can_unlock: true }), "sensor.guard": sensor("ringing", { can_unlock: false }) } });
  let lock = "locked";
  let open = false;
  let usable = true;
  p.V_ = () => lock;
  p.remoteUsable = () => usable;
  p.ixUnlocked = () => open;
  const lockIx = { ring: "sensor.call", unlock: "lock.door" };
  const buttonIx = { ring: "sensor.call", unlock: "button.door" };
  assert.equal(p.ixCanSlide(lockIx), true);
  lock = "unlocked";
  assert.equal(p.ixCanSlide(lockIx), false, "a lock that is open does not slide, as in the dashboard's own lock row");
  lock = "jammed";
  assert.equal(p.ixCanSlide(lockIx), false);
  assert.equal(p.ixCanSlide(buttonIx), true);
  open = true;
  assert.equal(p.ixCanSlide(buttonIx), false, "a button that was just pressed counts as open for a few seconds");
  open = false;
  usable = false;
  assert.equal(p.ixCanSlide(buttonIx), false, "a button that is not available");
  usable = true;
  lock = "locked";
  assert.equal(p.ixCanSlide({ ring: "sensor.guard", unlock: "lock.door" }), false, "nothing to unlock for a guard desk");
});

test("the door sound is silenced by the mute button and starts again with the next call", () => {
  const { sandbox: p } = page();
  const audio = { muted: false, pause() {}, removeAttribute() {}, load() {} };
  p.IXA.audio = audio;
  p.IXA.silent = true;
  p.ixAudioStop();
  assert.equal(p.IXA.audio, null);
  assert.equal(p.IXA.silent, false, "a muted call does not mute the next one");
});

// ---- the microphone sent to the door ----

function talker() {
  const win = { isSecureContext: true };
  win.parent = win;
  const context = vm.createContext({
    window: win,
    document: { currentScript: { src: "http://h/camera-stream.js" }, addEventListener() {}, hidden: false },
    navigator: {},
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    console,
    Date,
    clearTimeout,
    Promise,
    Object,
    String,
    Error,
    Math,
    Array,
    Int16Array,
    JSON,
  });
  vm.runInContext(read("camera-stream.js"), context);
  return { win, context };
}

const wave = (count, rate, hz = 440) => Float32Array.from({ length: count }, (_, n) => 0.5 * Math.sin((2 * Math.PI * hz * n) / rate));

test("the microphone is brought to 16 kHz from any rate, in chunks of any size, with the same result", () => {
  const { win } = talker();
  for (const rate of [48000, 44100, 16000]) {
    const input = wave(rate / 2, rate); // half a second
    const whole = Array.from(win.IntercomTalk.resampler(rate)(input));
    assert.ok(Math.abs(whole.length - 8000) <= 1, `${rate}: ${whole.length} samples for half a second`);
    const pieces = win.IntercomTalk.resampler(rate);
    const joined = [];
    for (let at = 0; at < input.length; at += 1000) joined.push(...pieces(input.subarray(at, at + 1000)));
    assert.deepEqual(joined, whole, `${rate}: chunk size changes nothing`);
  }
});

test("the resampler keeps level and sign, never exceeds 16 bits, and passes silence through", () => {
  const { win } = talker();
  const out = Array.from(win.IntercomTalk.resampler(48000)(Float32Array.from({ length: 4800 }, () => 1)));
  assert.ok(out.every((v) => v === 32767), "full scale stays full scale and does not wrap");
  assert.ok(Array.from(win.IntercomTalk.resampler(48000)(Float32Array.from({ length: 4800 }, () => -1))).every((v) => v === -32768));
  assert.ok(Array.from(win.IntercomTalk.resampler(48000)(new Float32Array(4800))).every((v) => v === 0));
  const tone = Array.from(win.IntercomTalk.resampler(48000)(wave(48000, 48000, 400)));
  assert.ok(Math.max(...tone) > 14000 && Math.max(...tone) < 17500, "a 0.5 tone is about 16000");
});

test("a page without a microphone (plain http) says so, and a page with one in its parent frame can use it", () => {
  const none = talker();
  none.context.navigator.mediaDevices = undefined;
  assert.equal(none.win.IntercomTalk.available(), false);
  const own = talker();
  own.context.navigator.mediaDevices = { getUserMedia() {} };
  assert.equal(own.win.IntercomTalk.available(), true);
  const parent = talker();
  parent.win.parent = { navigator: { mediaDevices: { getUserMedia() {} } } };
  assert.equal(parent.win.IntercomTalk.available(), true);
});

test("a door that says there is no call ends the talk with that reason, and releases the microphone", async () => {
  const { win, context } = talker();
  const stopped = [];
  const track = { stop: () => stopped.push(1), enabled: true };
  context.navigator.mediaDevices = { getUserMedia: () => Promise.resolve({ getTracks: () => [track], getAudioTracks: () => [track] }) };
  let socket;
  context.WebSocket = class {
    constructor(url) {
      this.url = url;
      socket = this;
      setTimeout(() => this.onopen(), 1);
    }
    close() {
      this.closed = true;
    }
  };
  win.AudioContext = class {
    sampleRate = 48000;
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {} }; }
    close() {}
  };
  const ended = [];
  const line = win.IntercomTalk.start("ws://h/api/talk?authSig=x", (code) => ended.push(code));
  await line.ready;
  assert.equal(socket.url, "ws://h/api/talk?authSig=x");
  socket.onmessage({ data: JSON.stringify({ error: "no_call" }) });
  assert.deepEqual(ended, ["no_call"]);
  assert.equal(stopped.length, 1, "the microphone is released");
  assert.equal(socket.closed, true);
  line.stop();
  assert.equal(stopped.length, 1, "stopping again does nothing more");
});

test("the door's sound is asked for again when the station is not yet in the call, and the person is told only after the last try", async () => {
  const { sandbox } = page();
  const toasts = [];
  const timers = [];
  const players = [];
  sandbox.toast = (key) => toasts.push(key);
  sandbox.setTimeout = (fn) => timers.push(fn) && timers.length;
  sandbox.clearTimeout = () => {};
  sandbox.window = { HA: { signPath: async (path) => path } };
  sandbox.Audio = class {
    constructor() {
      this.listeners = {};
      players.push(this);
    }
    addEventListener(ev, fn) {
      this.listeners[ev] = fn;
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
    removeAttribute() {}
    load() {}
  };
  vm.runInContext('ixListenStart("/listen")', sandbox);
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(players.length, attempt + 1);
    players[attempt].listeners.error();
    assert.equal(toasts.length, attempt < 4 ? 0 : 1);
    if (attempt < 4) timers.shift()();
  }
  assert.deepEqual(toasts, ["px_listen_failed"]);
  assert.equal(timers.length, 0);
});
