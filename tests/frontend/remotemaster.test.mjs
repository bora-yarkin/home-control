// SPDX-License-Identifier: GPL-3.0-or-later
// Remote master (decision D-31): one remote for a TV and what is plugged into it, with speakers. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function world(states = {}, extra = {}) {
  const sent = [];
  const registry = {};
  const ctx = vm.createContext({
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    _T: (k) => k,
    registerWidget: (w, def) => (registry[w] = def),
    H: () => ({ states, entities: {}, devices: {} }),
    A: (id) => (states[id] || {}).attributes || {},
    V_: (id) => (states[id] || {}).state,
    wxVisible: () => true,
    entName: (id) => id,
    dom: (id) => id.split(".")[0],
    sibBy: (id) => id.replace("media_player.", "remote."),
    mediaKind: (id) => (id.includes("apple") ? "apple" : id.includes("tv") ? "samsung" : null),
    send: (rem, cmd, hold) => sent.push([rem, cmd, hold || 0]),
    call: (d, s, data) => sent.push([d + "." + s, data.entity_id]),
    Integrations: { media: { samsungSettingsKey: () => "KEY_MORE", samsungCanType: () => false }, remote: { experimental: () => false } },
    tvFamily: () => null,
    ...extra,
  });
  vm.runInContext(read("remotemaster.js"), ctx);
  return { ctx, sent, registry };
}

const st = (state, attributes = {}) => ({ state, attributes });

test("the settings keep each player once, never the default twice, at most six of a kind, and only media players", () => {
  const { ctx } = world();
  const out = plain(ctx.cleanRemoteMaster({ def: "media_player.tv", subs: [{ id: "media_player.apple", src: "HDMI 1" }, { id: "media_player.tv" }, { id: "light.x" }, { id: "media_player.apple" }], spk: ["media_player.apple", "media_player.pod", "media_player.pod"], keep: true, junk: 1 }));
  assert.deepEqual(out, { def: "media_player.tv", subs: [{ id: "media_player.apple", src: "HDMI 1" }], spk: ["media_player.pod"], keep: 1 });
  assert.equal(ctx.cleanRemoteMaster({ def: "switch.tv" }).def, "");
  const many = Array.from({ length: 9 }, (_, i) => "media_player.s" + i);
  assert.equal(ctx.cleanRemoteMaster({ spk: many }).spk.length, 6);
});

test("a supplementary player takes over only while the default is on its input and it is awake", () => {
  const states = { "media_player.tv": st("on", { source: "HDMI 1" }), "media_player.apple": st("playing") };
  const { ctx } = world(states);
  const x = { def: "media_player.tv", subs: [{ id: "media_player.apple", src: "HDMI 1" }], spk: [] };
  assert.equal(ctx.rmOnScreen(x), "media_player.apple");
  states["media_player.tv"].attributes.source = "Netflix";
  assert.equal(ctx.rmOnScreen(x), "");
  states["media_player.tv"].attributes.source = "HDMI 1";
  states["media_player.apple"].state = "standby";
  assert.equal(ctx.rmOnScreen(x), "", "asleep");
  states["media_player.apple"].state = "idle";
  states["media_player.tv"].state = "off";
  assert.equal(ctx.rmOnScreen(x), "", "the TV is off");
  assert.equal(ctx.rmOnScreen({ ...x, subs: [{ id: "media_player.apple", src: "" }] }), "", "no input chosen");
});

test("the keys a player has are sent to it; power, volume, mute and channels are never among them", () => {
  const { ctx, sent } = world();
  const apple = ctx.rmKeys("media_player.apple");
  apple.back();
  apple.home();
  apple.settings();
  apple.ok();
  apple.hold();
  apple.dir("left");
  assert.deepEqual(plain(sent), [["remote.apple", "menu", 0], ["remote.apple", "home", 0], ["remote.apple", "control_center", 0], ["remote.apple", "select", 0], ["remote.apple", "select", 1], ["remote.apple", "left", 0]]);
  for (const k of [apple, ctx.rmKeys("media_player.tv")]) for (const no of ["power", "volup", "voldown", "mute", "chup", "chdown"]) assert.equal(k[no], undefined);
});

test("the combined view sends a key to the player on the screen only while there is one with that key", () => {
  const states = { "media_player.tv": st("on", { source: "HDMI 1" }), "media_player.apple": st("playing"), "media_player.box": st("on") };
  const { ctx, sent } = world(states);
  const x = { def: "media_player.tv", subs: [{ id: "media_player.apple", src: "HDMI 1" }], spk: [] };
  const hooks = ctx.rmHooks(x);
  assert.equal(hooks.ovr("back"), true);
  assert.deepEqual(plain(sent.pop()), ["remote.apple", "menu", 0]);
  states["media_player.tv"].attributes.source = "TV";
  assert.equal(hooks.ovr("back"), false, "off its input the default keeps the key");
  /* a player the dashboard has no keys for keeps nothing but play/pause */
  states["media_player.tv"].attributes.source = "HDMI 2";
  const other = ctx.rmHooks({ ...x, subs: [{ id: "media_player.box", src: "HDMI 2" }] });
  assert.equal(other.ovr("back"), false);
  assert.equal(other.ovr("playpause"), true);
});

test("a speaker is shown while it plays something the screen is not showing", () => {
  const states = { "media_player.tv": st("playing", { media_title: "The news" }), "media_player.pod": st("playing", { media_title: "A song", media_artist: "X" }) };
  const { ctx } = world(states);
  const x = { def: "media_player.tv", subs: [], spk: ["media_player.pod"] };
  assert.equal(ctx.rmSpeaker(x, x.def), "media_player.pod");
  states["media_player.tv"].attributes = { media_title: "A song", media_artist: "X" };
  assert.equal(ctx.rmSpeaker(x, x.def), "", "the same content");
  states["media_player.tv"] = st("on");
  assert.equal(ctx.rmShows(x.def), false);
  assert.equal(ctx.rmSpeaker(x, x.def), "media_player.pod");
  states["media_player.pod"].state = "paused";
  assert.equal(ctx.rmSpeaker(x, x.def), "");
});

test("the popup opens on the default unless the master remembers the pick", () => {
  const states = { "media_player.tv": st("on"), "media_player.apple": st("on") };
  const kept = {};
  const { ctx } = world(states, { deviceGet: (k, d) => kept[k] ?? d, deviceSet: (k, v) => (kept[k] = v), showPopup() {} });
  const d = { wid: "w1", wx: { def: "media_player.tv", subs: [{ id: "media_player.apple", src: "HDMI 1" }], spk: [] } };
  const reopen = () => {
    ctx.RMS = null;
    return ctx.rmSelected("k", d);
  };
  ctx.rmPick("k", d, "media_player.apple");
  assert.equal(ctx.rmSelected("k", d), "media_player.apple", "while it is open");
  assert.equal(reopen(), "media_player.tv");
  d.wx.keep = 1;
  ctx.rmPick("k", d, "media_player.apple");
  assert.equal(reopen(), "media_player.apple");
});

test("it is a widget, every TV remote lets it take its keys, and the popup's title is a dropdown", () => {
  const { registry } = world();
  assert.equal(registry.rmaster.noStack, true);
  const media = read("media.js");
  for (const role of ["settings", "text", "back", "home", "playpause", "ok", "dir", "hold"]) assert.ok(media.includes(`rmo(hooks, "${role}"`), role);
  assert.doesNotMatch(media, /rmo\(hooks, "(power|mute|volup|voldown|chup|chdown)"/);
  assert.match(read("popups.js"), /def\.titleMenu[\s\S]*openMenu\(t, def\.titleMenu\.options/);
  const files = JSON.parse(readFileSync(new URL("../version.json", APP), "utf8")).files;
  assert.ok(files.indexOf("app/remotemaster.js") > files.indexOf("app/widgetkinds.js"), "loaded after the widget registry");
});
