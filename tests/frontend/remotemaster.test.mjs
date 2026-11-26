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
    tvRemoteOf: (id) => id.replace("media_player.", "remote."),
    mediaKind: (id) => (id.includes("apple") ? "apple" : id.includes("tv") ? "samsung" : null),
    send: (rem, cmd, hold) => sent.push([rem, cmd, hold || 0]),
    call: (d, s, data) => sent.push([d + "." + s, data.entity_id]),
    Integrations: { media: { samsungSettingsKey: () => "KEY_MORE", samsungCanType: () => false }, remote: { experimental: () => false } },
    tvFamily: () => null,
    rbxKeys: () => {},
    mediaRemoteKind: () => "",
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
  const { ctx } = world(states, { deviceGet: (k, d) => kept[k] ?? d, deviceSet: (k, v) => (kept[k] = v), showPopup: () => assert.fail("picking a device must not open a popup") });
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
  const media = read("media.js") + read("remotebuttons.js");
  for (const role of ["settings", "text", "back", "home", "playpause", "ok", "dir", "hold"])
    assert.ok(media.includes(`rmo(hooks, "${role}"`) || new RegExp(`key\\([^\n]*"${role}"\\)`).test(media), role);
  assert.doesNotMatch(media, /rmo\(hooks, "(power|mute|volup|voldown|chup|chdown)"/);
  assert.match(read("popups.js"), /def\.titleMenu[\s\S]*openMenu\(t, def\.titleMenu\.options/);
  const files = JSON.parse(readFileSync(new URL("../version.json", APP), "utf8")).files;
  assert.ok(files.indexOf("app/remotemaster.js") > files.indexOf("app/widgetkinds.js"), "loaded after the widget registry");
});

test("when the speaker takes now playing's row, the default's inputs stay within reach beside power", () => {
  const src = read("remotemaster.js");
  assert.match(src, /inCard = !!onTap;/, "known from whether now playing opens the input list");
  assert.match(src, /if \(free && inCard\) \{\s*var inputs = tvSources\(rmState\(x, x\.def\)\)/);
  assert.match(src, /inputs\.style\.display = speakerHasRow\(\) \? "" : "none";/, "only while that row is the speaker's");
});

test("switching device rebuilds the popup's content in place, with the device's own Advanced settings, and needs no device of the dashboard", () => {
  const src = read("remotemaster.js");
  const pick = src.slice(src.indexOf("function rmPick("), src.indexOf("function rmIcon("));
  assert.doesNotMatch(pick, /showPopup|closeSheet/, "the popup is never closed or opened again");
  assert.match(src, /function rmShow\(sel\)[\s\S]*o\.draw\(sel\)/);
  assert.match(src, /showPopup\("adv:" \+ sel, true\)/, "pushed, so back returns to the master");
  assert.doesNotMatch(src, /secOrder|UI\.layout|devsOf|allLights|ROOMLIGHTS/, "its players are chosen from Home Assistant, whether or not they are on a page");
});

const key = (c) => ({ t: "key", e: "remote.ir", c });
const custom = { rid: "rm1", name: "Sofa", icon: "media", rm: { cols: 3, btns: [{ a: { t: "dpad", u: key("UP"), d: key("DOWN"), l: key("LEFT"), r: key("RIGHT"), o: key("OK") } }, { a: key("BACK"), l: "Back" }, { a: key("MENU"), l: "Menu" }] } };

function withRemotes(states = {}, extra = {}) {
  const pressed = [];
  const w = world(states, {
    cleanRmAct: (a) => (a && a.e ? { t: a.t, e: a.e, c: a.c } : null),
    cleanRemote: (r) => r || { cols: 4, btns: [] },
    iconOk: () => true,
    remoteFind: (rid) => (rid === "page1" ? { rid, name: "Projector", rm: custom.rm } : null),
    remotePress: (b) => pressed.push(b.a.c),
    npMode: () => "on",
    ...extra,
  });
  return { ...w, pressed };
}

test("a custom remote, made in the master or taken from a page, is a device of it, with its options kept only for devices it has", () => {
  const { ctx } = withRemotes();
  const out = plain(ctx.cleanRemoteMaster({ def: "media_player.tv", subs: [{ id: "rm:rm1", src: "HDMI 2" }, { id: "rm:page1" }], spk: ["rm:rm1"], own: [custom, { rid: "unused", rm: custom.rm }], opt: { "rm:rm1": { state: "media_player.box", name: " Sofa ", roles: { back: key("BACK"), power: key("POWER") }, np: "weird", links: ["number.a", "number.a", "x"] }, "media_player.gone": { name: "x" } } }));
  assert.deepEqual(out.subs.map((s) => s.id), ["rm:rm1", "rm:page1"]);
  assert.deepEqual(out.spk, [], "a speaker is a media player");
  assert.deepEqual(out.own.map((r) => r.rid), ["rm1"]);
  assert.deepEqual(Object.keys(out.opt), ["rm:rm1"]);
  assert.deepEqual(Object.keys(out.opt["rm:rm1"].roles), ["back"], "only the roles there are");
  assert.equal(out.opt["rm:rm1"].name, "Sofa");
  assert.deepEqual(out.opt["rm:rm1"].links, ["number.a"]);
});

test("a custom remote's roles are what was chosen, else its five-way pad, and it takes over and is taken over by them", () => {
  const states = { "media_player.tv": st("on", { source: "HDMI 2" }), "media_player.apple": st("playing") };
  const { ctx, pressed, sent } = withRemotes(states);
  const x = { def: "media_player.tv", subs: [{ id: "rm:rm1", src: "HDMI 2" }], spk: [], own: [custom], opt: { "rm:rm1": { roles: { back: key("BACK") } } } };
  assert.equal(ctx.rmOnScreen(x), "rm:rm1", "with no player of its own it counts as awake");
  const hooks = ctx.rmHooks(x);
  assert.equal(hooks.ovr("back"), true);
  assert.equal(hooks.ovr("ok"), true);
  assert.equal(hooks.ovr("dir", "left"), true);
  assert.equal(hooks.ovr("home"), false, "no such role: the default keeps it");
  assert.deepEqual(pressed, ["BACK", "OK", "LEFT"]);
  /* the other way round: a custom default, the Apple TV on its input */
  const y = { def: "rm:rm1", subs: [{ id: "media_player.apple", src: "HDMI 2" }], spk: [], own: [custom], opt: { "rm:rm1": { state: "media_player.tv", roles: { back: key("BACK") } } } };
  assert.equal(ctx.rmOnScreen(y), "media_player.apple");
  assert.equal(ctx.rmHooks(y).ovr("back"), true);
  assert.deepEqual(plain(sent.pop()), ["remote.apple", "menu", 0]);
  assert.equal(ctx.rmOnScreen({ ...y, opt: {} }), "", "a custom default with no player has no input to read");
});

test("the master keeps what the standalone remotes have: the builder reaches its own remotes, roles take a press, linked entities are listed", () => {
  assert.match(read("remote.js"), /d\.kind === "widget" && d\.w === "rmaster"[\s\S]*if \(o\.rid === rid\) found = o;/);
  assert.match(read("remote.js"), /function remotePress\(b\) \{\s*\/\*[^*]*\*\/\s*if \(b\.a && b\.a\.hook && b\.a\.hook\(\)\) return;/);
  assert.match(read("advanced.js"), /rmLinks\(id\)/);
  assert.match(read("media.js"), /function npMode\(id\)[\s\S]*RMNP\[id\]/);
  assert.match(read("access.js"), /rm-\(pick\|member\)\|/, "the settings pages are an administrator's");
  assert.match(read("remotemaster.js"), /showPopup\("remote-build:" \+ rid, true\)/);
});

test("a device's Advanced settings are hidden when switched off for the master, for the device in it, or on its page", () => {
  const states = { "media_player.tv": st("on") };
  const UIDEV = {};
  const has = (id) => (id === "media_player.tv" ? [1] : []);
  let allOff = false;
  const { ctx } = withRemotes(states, { ISADMIN: true, advList: has, advAllOff: () => allOff, advDevOff: (id) => !!(UIDEV[id] && UIDEV[id].noadv), advButton: (id) => !allOff && has(id).length > 0 });
  const x = { def: "media_player.tv", subs: [], spk: [] };
  assert.equal(ctx.rmHasAdv(x, "media_player.tv"), true);
  assert.equal(ctx.rmHasAdv({ ...x, noadv: 1 }, "media_player.tv"), false, "the master's switch");
  assert.equal(ctx.rmHasAdv({ ...x, opt: { "media_player.tv": { noadv: 1 } } }, "media_player.tv"), false, "the device's switch in the master");
  UIDEV["media_player.tv"] = { noadv: 1 };
  assert.equal(ctx.rmHasAdv(x, "media_player.tv"), false, "the device's own page");
  delete UIDEV["media_player.tv"];
  assert.equal(ctx.rmHasAdv(x, "media_player.other"), false, "nothing to show");
  allOff = true;
  assert.equal(ctx.rmHasAdv(x, "media_player.tv"), false, "the whole dashboard's switch");
  const kept = plain(ctx.cleanRemoteMaster({ ...x, noadv: true, opt: { "media_player.tv": { noadv: true } } }));
  assert.equal(kept.noadv, 1);
  assert.equal(kept.opt["media_player.tv"].noadv, 1);
  assert.match(read("remotemaster.js"), /flagPill\("tune", _T\("advanced_settings_button"\), x, "noadv"/, "the same switch as a device's settings");
});

test("a custom remote's typed text goes to the player its keyboard button names, and its grid keeps the built-in look", () => {
  const sent = [];
  const { ctx } = withRemotes({}, { rmSendText: (e, v) => sent.push([e, v]) });
  const own = [{ rid: "box", name: "Box", icon: "tv", rm: { cols: 6, btns: [{ a: { t: "text", e: "media_player.box" } }] } }];
  ctx.rmMemberKeys({ def: "rm:box", subs: [], spk: [], own }, "rm:box").text("hello");
  assert.deepEqual(sent, [["media_player.box", "hello"]]);
  const model = readFileSync(new URL("../../custom_components/home_control/frontend/app/model.js", import.meta.url), "utf8");
  assert.match(model, /if \(r && r\.look === "native"\) out\.look = "native";/);
});
