// Any Home Assistant action on a button (app/actions.js, cleanDo in app/model.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (n) => readFileSync(new URL(n, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

function load(extra = {}) {
  const log = [];
  const ctx = vm.createContext({
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    ISADMIN: true,
    log,
    dom: (id) => id.split(".")[0],
    H: () => ({
      entities: { "light.a": { device_id: "dev1" }, "light.b": { area_id: "den" }, "switch.c": {} },
      devices: { dev1: { area_id: "hall" } },
      states: { "light.a": { state: "on" }, "light.b": { state: "unavailable" } },
      services: { light: { turn_on: { name: "Turn on" } }, shell_command: { go: {} } },
    }),
    A: () => ({}),
    _T: (k) => k,
    toast: (t) => log.push(["toast", t]),
    gate: (ids, go) => {
      log.push(["gate", ids]);
      go();
    },
    callRaw: (d, s, data) => log.push(["call", d, s, data]),
    confirmDlg: (t, go) => {
      log.push(["ask"]);
      go();
    },
    asksFirst: () => false,
    ...extra,
  });
  const model = read("model.js");
  vm.runInContext(model.slice(model.indexOf("function cleanDo("), model.indexOf("function cleanRmAct(")), ctx);
  const actions = read("actions.js");
  vm.runInContext(actions.slice(0, actions.indexOf("/* ---- choosing one ---- */")), ctx);
  return ctx;
}

test("an action keeps its target and data, and drops what is not one", () => {
  const c = load();
  assert.deepEqual(
    plain(c.cleanDo({ t: "do", s: "light.turn_on", tg: { entity_id: ["light.a", "light.a", "bad"], area_id: ["den"], junk: ["x"] }, d: { brightness: 3 }, q: true, n: " Lamp " })),
    { t: "do", s: "light.turn_on", tg: { entity_id: ["light.a"], area_id: ["den"] }, d: { brightness: 3 }, q: 1, n: "Lamp" }
  );
  assert.equal(c.cleanDo({ t: "do", s: "nodot" }), null);
  assert.deepEqual(plain(c.cleanDo({ t: "do", s: "a.b", d: [1] })), { t: "do", s: "a.b" });
});

test("every entity it reaches goes through the access rules", () => {
  const c = load();
  assert.deepEqual(plain(c.actIds({ s: "light.turn_on", tg: { device_id: ["dev1"], area_id: ["den"] }, d: { entity_id: "switch.c" } })), ["switch.c", "light.a", "light.b"]);
  c.actRun({ t: "do", s: "light.turn_on", tg: { area_id: ["hall"] }, d: { brightness: 3 } });
  assert.deepEqual(plain(c.log), [
    ["gate", ["light.a"]],
    ["call", "light", "turn_on", { brightness: 3, area_id: ["hall"] }],
  ]);
});

test("program and restart commands are the administrator's, and always ask", () => {
  for (const s of ["shell_command.go", "homeassistant.restart", "hassio.host_reboot", "recorder.purge"]) assert.equal(load().actRisk(s), "admin", s);
  for (const s of ["lock.unlock", "todo.remove_item", "update.install"]) assert.equal(load().actRisk(s), "ask", s);
  assert.equal(load().actRisk("light.turn_on"), "");
  const admin = load();
  admin.actRun({ t: "do", s: "shell_command.go" });
  assert.deepEqual(admin.log.map((x) => x[0]), ["ask", "gate", "call"]);
  const other = load({ ISADMIN: false });
  other.actRun({ t: "do", s: "shell_command.go" });
  assert.deepEqual(plain(other.log), [["toast", "act_admin_only"]]);
});

test("an action is usable only while Home Assistant has it and its entities are there", () => {
  const c = load();
  assert.equal(c.actUsable({ s: "light.turn_on", tg: { entity_id: ["light.a"] } }), true);
  assert.equal(c.actUsable({ s: "light.turn_on", tg: { entity_id: ["light.b"] } }), false);
  assert.equal(c.actUsable({ s: "light.nothing" }), false);
});
