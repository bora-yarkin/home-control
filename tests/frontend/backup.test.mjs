// SPDX-License-Identifier: GPL-3.0-or-later
// Backup and restore (app/backups.js): what a backup holds, what is refused, and what a restore brings up to date. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

const PIC = "/home_control_remotes/0123456789ab.png";
const NEW_PIC = "/home_control_remotes/ba9876543210.png";
const store = (extra) => ({
  v: 1,
  ui: { rooms: [{ id: "den" }], devs: {}, layout: { home: [], rooms: { den: [{ id: "main", devs: [{ id: "light.a" }, { id: "light.b" }] }] } } },
  scenes: [{ id: "s1" }],
  eareas: [],
  notify: { rules: {}, watch: [] },
  ...extra,
});

function world(over = {}) {
  const log = [];
  const local = new Map(Object.entries(over.local || {}));
  const note = (...a) => (log.push(a), Promise.resolve());
  const ctx = vm.createContext({
    _T: (k) => k,
    localStorage: { get length() { return local.size; }, key: (i) => [...local.keys()][i] },
    deviceGet: (k, d) => (local.has(k) ? JSON.parse(local.get(k)) : d),
    deviceSet: (k, v) => (v === null ? local.delete(k) : local.set(k, JSON.stringify(v))),
    PREFS: { theme: "dark" },
    mergePrefs: (p) => Object.assign(ctx.PREFS, p),
    savePrefsLocal() {},
    cleanStore: (v) => ({ ...v, scenes: (v.scenes || []).filter((s) => !s.bad), eareas: v.eareas || [] }),
    STORE: store({ scenes: [{ id: "old", live: {} }], eareas: [{ id: "gone" }], notify: { rules: { doorbell: { on: true } }, watch: [{ id: "w1" }] } }),
    UI: {},
    STORE_SCOPE: "system",
    STORE_KEY: "dashboard",
    STORE_JSON: "",
    STORE_VER: 0,
    STORE_SAVED: 0,
    STORE_PENDING: null,
    STORE_NET: true,
    OFFLINE: false,
    ISADMIN: true,
    NRULES: { doorbell: {}, batt: {} },
    layoutCacheWrite() {},
    engineSensor: () => "sensor.engine",
    liveId: (x) => x,
    liveAreaPayload: (a) => ({ id: a.id }),
    liveScenePayload: (s) => (s.live ? { id: s.id } : null),
    LIVESVC: { scene: "scene_save", area: "area_save", delScene: "scene_delete", delArea: "area_delete" },
    H: () => ({ callService: (d, s, data) => note("service", s, data.id) }),
    syncNotify: (k) => note("rule", k),
    syncWatch: (w) => note("watch", w.id),
    fetch: () => Promise.reject(new Error("not here")),
    blobDataUrl: async () => "data:image/png;base64,aGVsbG8=",
    atob,
    Blob,
    ...over.globals,
  });
  ctx.watchRules = () => ctx.STORE.notify.watch;
  ctx.nrule = (k) => ctx.STORE.notify.rules[k] || { on: false };
  ctx.window = {
    HA: { automations: { remove: (id) => note("remove", id) } },
  };
  ctx.HA = {
    data: { set: (scope, key, v) => (over.refuse ? Promise.reject(new Error("no")) : note("save", scope, key, plain(v))) },
    sharing: {
      published: () => Promise.resolve({ scenes: { stays: "scene.stays", drop: "scene.drop" } }),
      publish: (id, on) => note("publish", id, on),
      tvHome: () => Promise.resolve({ calls: { "media_player.tv": { domain: "remote" } } }),
      setTvHome: (id, call) => note("tv", id, call),
    },
    effects: { exportFiles: () => Promise.resolve([{ schema: 1 }]), importFile: (f) => note("effect", f.schema).then(() => ({ ok: true })) },
    remotePictures: { upload: () => note("upload").then(() => NEW_PIC) },
  };
  vm.runInContext(read("backups.js"), ctx);
  ctx.log = log;
  ctx.local = local;
  return ctx;
}

const file = (data, extras, head = {}) => JSON.stringify({ app: "dashboard", version: 1, exported: "2026-01-02T03:04:05Z", data, extras, ...head });

test("a backup holds the dashboard and what is kept outside it", async () => {
  const w = world({ local: { "lp.fxs": '{"a":1}', db_ls_s1: "{}", home_control_layout_v1: "{}", other: "1" } });
  const { extras, missing } = await w.backupExtras();
  assert.deepEqual(plain(missing), []);
  assert.deepEqual(plain(extras.device), { "lp.fxs": { a: 1 }, db_ls_s1: {} }, "only the dashboard's own settings of this device");
  assert.deepEqual(plain(extras.published), ["stays", "drop"]);
  assert.deepEqual(plain(extras.effects), [{ schema: 1 }]);
  assert.equal(extras.prefs.theme, "dark");
  assert.ok(extras.tv_home["media_player.tv"]);
  assert.equal(JSON.parse(w.exportJSON(extras)).data.v, 1);
});

test("a part that cannot be read is named, and the backup is made without it", async () => {
  const w = world();
  w.HA.effects.exportFiles = () => Promise.reject(new Error("old integration"));
  const { extras, missing } = await w.backupExtras();
  assert.deepEqual(plain(missing), ["backup_part_effects"]);
  assert.equal("effects" in extras, false);
});

test("what is not a backup of this dashboard is refused", () => {
  const w = world();
  assert.equal(w.backupRead("{").error, "that_isn_t_valid_backup_text");
  assert.equal(w.backupRead('{"v":1}').error, "that_isn_t_a_dashboard_backup", "a file with no dashboard would empty the dashboard");
  assert.equal(w.backupRead(file(store(), {}, { app: "other" })).error, "that_isn_t_a_dashboard_backup");
  assert.equal(w.backupRead(file(store(), {}, { version: 2 })).error, "backup_is_newer");
  assert.equal(w.backupRead("﻿" + file(store())).error, undefined);
  assert.equal(w.backupRead(JSON.stringify(store())).error, undefined, "a bare dashboard, as old backups could be");
});

test("what would be dropped is counted before anything is replaced", () => {
  const read2 = world().backupRead(file(store({ scenes: [{ id: "a" }, { id: "b", bad: 1 }] })));
  assert.deepEqual(plain(read2.counts), { rooms: 1, devices: 2, scenes: 1, areas: 0 });
  assert.deepEqual(plain(read2.lost), { scenes: 1 });
  assert.equal(read2.exported, "2026-01-02");
});

test("a restore saves the dashboard and brings automations, live scenes and the integration's lists up to date", async () => {
  const w = world({ local: { "lp.mem": "{}" } });
  const data = store({ scenes: [{ id: "new", live: {} }], eareas: [{ id: "here" }], notify: { rules: {}, watch: [{ id: "w2" }] } });
  const problems = await w.backupApply(w.backupRead(file(data, { published: ["stays", "new"], tv_home: {}, effects: [{ schema: 1 }], prefs: { theme: "light" }, device: { db_large: 1, evil: 2 } })));
  assert.deepEqual(plain(problems), []);
  const did = (name) => w.log.filter((x) => x[0] === name).map((x) => x.slice(1));
  assert.equal(w.log[0][0], "save");
  assert.deepEqual(did("remove"), [["dashboard_n_w1"]], "the alert that is gone loses its automation");
  assert.deepEqual(did("rule"), [["doorbell"]], "a rule that was on is brought to off");
  assert.deepEqual(did("watch"), [["w2"]]);
  assert.deepEqual(did("service"), [["scene_delete", "old"], ["area_delete", "gone"], ["area_save", "here"], ["scene_save", "new"]]);
  assert.deepEqual(did("publish"), [["drop", false], ["new", true]]);
  assert.deepEqual(did("tv"), [["media_player.tv", null]]);
  assert.deepEqual(did("effect"), [[1]]);
  assert.equal(w.PREFS.theme, "light");
  assert.deepEqual([...w.local.keys()], ["db_large"], "this device's settings are the backup's, and nothing else is written");
});

test("a dashboard that cannot be saved leaves everything as it was", async () => {
  const w = world({ refuse: true, local: { "lp.mem": "{}" } });
  await assert.rejects(w.backupApply(w.backupRead(file(store(), { published: [], device: {} }))));
  assert.deepEqual(plain(w.log), []);
  assert.equal(w.STORE.scenes[0].id, "old");
  assert.deepEqual([...w.local.keys()], ["lp.mem"]);
});

test("a remote picture this Home Assistant does not have is uploaded and the dashboard pointed at it", async () => {
  const w = world();
  const data = store({ remotes: [{ img: PIC }] });
  const problems = [];
  const out = await w.backupPictures(data, { [PIC]: "data:image/png;base64,aGVsbG8=" }, problems);
  assert.equal(out.remotes[0].img, NEW_PIC);
  assert.deepEqual(plain(problems), []);
  const none = await w.backupPictures(store({ remotes: [{ img: PIC }] }), {}, problems);
  assert.equal(none.remotes[0].img, PIC);
  assert.deepEqual(plain(problems), ["backup_part_picture"]);
});

test("a part that cannot be restored is named and the rest still is", async () => {
  const w = world();
  w.HA.sharing.publish = () => Promise.reject(new Error("no such scene"));
  const problems = await w.backupApply(w.backupRead(file(store(), { published: ["x"], effects: [{ schema: 1 }] })));
  assert.deepEqual(plain(problems), ["backup_part_published"]);
  assert.ok(w.log.some((x) => x[0] === "effect"));
});
