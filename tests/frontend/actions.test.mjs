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

test("a condition reads any entity, its state or an attribute", () => {
  const states = { "number.level": { state: "40", attributes: { mode: "Güçlü" } } };
  const ctx = vm.createContext({ V_: (id) => states[id]?.state ?? "unavailable", A: (id) => states[id]?.attributes ?? {}, _T: (k) => k, numIn: (x) => x });
  const src = read("conditions.js");
  vm.runInContext(src.slice(src.indexOf("var HHMM"), src.indexOf("function numIn")), ctx);
  vm.runInContext(src.slice(src.indexOf("var RE_SVAL"), src.indexOf("\n", src.indexOf("var RE_SVAL"))).replace(/,\s*$/, ";"), ctx);
  vm.runInContext(src.slice(src.indexOf("function withAttr("), src.indexOf("function allDomains(")), ctx);
  vm.runInContext(src.slice(src.indexOf("function cleanCond("), src.indexOf("/* ---- plain-language")), ctx);
  const c = ctx.cleanCond({ c: "state", id: "number.level", is: "Güçlü", attr: "mode" });
  assert.deepEqual(plain(c), { c: "state", id: "number.level", is: "Güçlü", attr: "mode" });
  assert.equal(ctx.condValue(c), "Güçlü");
  assert.deepEqual(plain(ctx.cleanCond({ c: "sensor", id: "number.level", op: "above", val: 5 })), { c: "sensor", id: "number.level", op: "above", val: 5 });
  assert.equal(ctx.condValue({ id: "number.level" }), "40");
  assert.equal(ctx.condValue({ id: "number.level", attr: "none" }), undefined);
  assert.equal(ctx.cleanCond({ c: "state", id: "bad", is: "x" }), null);
});

test("the parts of an appliance's popup move only when the appliance says so", () => {
  const src = read("appliance.js");
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(src.indexOf("var AP_PARTS"), src.indexOf("function apPartsPage(")), ctx);
  const box = () => {
    const b = { children: [], __parts: [] };
    b.appendChild = (x) => {
      const i = b.children.indexOf(x);
      if (i >= 0) b.children.splice(i, 1);
      b.children.push(x);
    };
    b.removeChild = (x) => b.children.splice(b.children.indexOf(x), 1);
    return b;
  };
  const build = (ap) => {
    const b = box();
    for (const p of ["top", "readings", "actions", "settings"]) {
      ctx.apMark(b, p);
      b.appendChild(p);
    }
    ctx.apArrange(b, ap);
    return b.children;
  };
  assert.deepEqual(build({ type: "oven" }), ["top", "readings", "actions", "settings"]);
  assert.deepEqual(build({ type: "oven", parts: { order: ["actions"], hide: ["readings"] } }), ["actions", "top", "settings"]);
});

test("Advanced settings are changed only where something was changed, and bad entries are dropped", () => {
  const model = read("model.js");
  const ctx = vm.createContext({ ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
  vm.runInContext(model.slice(model.indexOf("function cleanAdv("), model.indexOf("/* A popup's contents go with its widget")), ctx);
  assert.deepEqual(plain(ctx.cleanAdv({ "fan.a": { hide: ["switch.x", "__care", "junk"], order: [], name: { "switch.x": " Ion ", bad: "n" }, add: ["sensor.y"] }, "fan.b": {}, bad: { hide: ["switch.x"] } })), {
    "fan.a": { hide: ["switch.x", "__care"], add: ["sensor.y"], name: { "switch.x": "Ion" } },
  });
  const advanced = read("advanced.js");
  const shown = vm.createContext({ UI: {}, dom: (id) => id.split(".")[0], H: () => ({ states: { "sensor.y": {} }, entities: {} }), advFound: () => [{ entity_id: "switch.a" }, { entity_id: "switch.b" }] });
  vm.runInContext(advanced.slice(advanced.indexOf("function advCfg("), advanced.indexOf("/* What Home Assistant has for the device. */")), shown);
  const ids = () => plain(shown.advList("fan.a").map((e) => e.entity_id));
  assert.deepEqual(ids(), ["switch.a", "switch.b"]);
  shown.UI.adv = { "fan.a": { hide: ["switch.a"], add: ["sensor.y"], order: ["sensor.y", "switch.b"] } };
  assert.deepEqual(ids(), ["sensor.y", "switch.b"]);
});

test("a file leaves this home's entities, devices and areas out, also inside texts, and lists what it can run", () => {
  const ctx = vm.createContext({ ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, H: () => ({ states: { "switch.mine": { attributes: { friendly_name: "Plug" } }, "sensor.mine": { attributes: {} } } }), dom: (id) => id.split(".")[0] });
  const src = read("presets.js");
  vm.runInContext(src.slice(0, src.indexOf("function presetFromDevice(")), ctx);
  const file = plain(
    ctx.presetFrom({
      devs: [
        { wx: { a: { t: "do", s: "switch.turn_on", tg: { entity_id: ["switch.mine"], area_id: ["den"] }, d: { device_id: "abc" } } } },
        { wx: { t: "{{ states('sensor.mine') }} W" } },
      ],
    })
  );
  assert.doesNotMatch(JSON.stringify(file.section), /switch\.mine|sensor\.mine|den|abc/);
  assert.deepEqual(ctx.presetActions(file.section).length, 1);
  const back = plain(ctx.presetFill(file, ["switch.yours", "sensor.yours"]));
  assert.deepEqual(back.devs[0].wx.a.tg.entity_id, ["switch.yours"]);
  assert.equal(back.devs[1].wx.t, "{{ states('sensor.yours') }} W");
});

test("access rules cannot be walked around: entities anywhere in the data count, and floors, labels or everything are the administrator's", () => {
  const c = load();
  assert.deepEqual(plain(c.actIds({ s: "scene.apply", d: { entities: { "light.a": "off" }, group: ["light.b"] } })), ["light.a", "light.b"]);
  for (const d of [{ floor_id: "up" }, { label_id: "x" }, { entity_id: "all" }]) {
    const other = load({ ISADMIN: false });
    other.actRun({ t: "do", s: "light.turn_off", d });
    assert.deepEqual(plain(other.log), [["toast", "act_admin_only"]], JSON.stringify(d));
  }
});
