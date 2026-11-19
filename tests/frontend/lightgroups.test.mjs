// SPDX-License-Identifier: GPL-3.0-or-later
// Light groups: Home Assistant's "Group" helper made and changed through its configuration flow (ha-adapter.js), and the add popup that checks lights, makes the group
// and opens its settings (app/addpopup.js, app/lightgroups.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/* The adapter on a pretend page. `api(method, path, body)` answers the REST calls, `ws[type](msg)` the websocket commands. */
function adapter({ api, ws = {} }) {
  const apiCalls = [];
  const wsCalls = [];
  const sandbox = {
    window: { addEventListener() {} },
    document: { hidden: false, addEventListener() {} },
    requestAnimationFrame() {},
    setTimeout: (fn) => (fn(), 1),
    clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {} },
    console: { ...console, warn() {} },
    Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("ha-adapter.js"), sandbox);
  const hass = {
    states: {},
    services: {},
    connected: true,
    user: { id: "u1" },
    callApi: (method, path, body) => {
      apiCalls.push([method, path, plain(body)]);
      return Promise.resolve(api(method, path, body));
    },
    connection: {
      connected: true,
      addEventListener() {},
      subscribeEvents() {},
      sendMessagePromise: (msg) => {
        wsCalls.push(plain(msg));
        const f = ws[msg.type];
        return Promise.resolve(f ? f(msg) : []);
      },
    },
  };
  sandbox.window.HA.attach(hass);
  return { HA: sandbox.window.HA, apiCalls, wsCalls };
}

const flowApi = (overrides = {}) => (method, path, body) => {
  if (method === "POST" && path === "config/config_entries/flow") return { type: "menu", flow_id: "f1", step_id: "user" };
  if (method === "POST" && path === "config/config_entries/flow/f1")
    return body.next_step_id ? { type: "form", flow_id: "f1", step_id: "light" } : { type: "create_entry", result: { entry_id: "e1" } };
  return overrides.fallback ? overrides.fallback(method, path, body) : {};
};

test("a light group is made through the helper's own flow: the light type, then the name, the lights and the two options; the new light's entity id comes from the registry", async () => {
  let listed = 0;
  const { HA, apiCalls } = adapter({
    api: flowApi(),
    ws: {
      "config/entity_registry/list": () => (++listed < 3 ? [] : [{ entity_id: "light.reading_corner", config_entry_id: "e1" }]),
    },
  });
  const made = await HA.lightGroups.create("Reading corner", ["light.a", "light.b"]);
  assert.deepEqual(plain(made), { entry_id: "e1", entity_id: "light.reading_corner" }, "found a moment after the entry was made");
  assert.deepEqual(apiCalls.map((c) => [c[0], c[1]]), [
    ["POST", "config/config_entries/flow"],
    ["POST", "config/config_entries/flow/f1"],
    ["POST", "config/config_entries/flow/f1"],
  ]);
  assert.deepEqual(apiCalls[0][2], { handler: "group", show_advanced_options: false });
  assert.deepEqual(apiCalls[1][2], { next_step_id: "light" });
  assert.deepEqual(apiCalls[2][2], { name: "Reading corner", entities: ["light.a", "light.b"], hide_members: true, all: false }, "the lights are hidden by default: the group stands for them");
});

test("a step Home Assistant does not accept ends the flow, says why, and leaves no flow open", async () => {
  const { HA, apiCalls } = adapter({
    api: (method, path, body) => {
      if (method === "DELETE") return {};
      if (path === "config/config_entries/flow") return { type: "menu", flow_id: "f1" };
      return body.next_step_id ? { type: "form", flow_id: "f1" } : { type: "form", flow_id: "f1", errors: { entities: "Choose at least one light" } };
    },
  });
  await assert.rejects(HA.lightGroups.create("x", []), /Choose at least one light/);
  assert.deepEqual(plain(apiCalls[apiCalls.length - 1].slice(0, 2)), ["DELETE", "config/config_entries/flow/f1"], "the open flow is deleted");
});

test("a group whose light never appears is reported, not guessed", async () => {
  const { HA } = adapter({ api: flowApi(), ws: { "config/entity_registry/list": () => [] } });
  await assert.rejects(HA.lightGroups.create("x", ["light.a"]), /light did not appear/);
});

test("the options of a group are read from its own options form and changed through the same flow, keeping what was not changed", async () => {
  const { HA, apiCalls } = adapter({
    api: (method, path, body) => {
      if (method === "POST" && path === "config/config_entries/options/flow" && body.handler === "e1")
        return {
          type: "form",
          flow_id: "o1",
          data_schema: [
            { name: "entities", description: { suggested_value: ["light.a", "light.b"] } },
            { name: "hide_members", default: false, description: { suggested_value: true } },
            { name: "all", default: false },
          ],
        };
      if (method === "POST" && path === "config/config_entries/options/flow/o1") return { type: "create_entry" };
      return {};
    },
  });
  assert.deepEqual(plain(await HA.lightGroups.options("e1")), { entities: ["light.a", "light.b"], hide_members: true, all: false });
  apiCalls.length = 0;
  await HA.lightGroups.update("e1", { entities: ["light.a"] });
  const body = plain(apiCalls.filter((c) => c[0] === "POST" && c[1].endsWith("/o1"))[0][2]);
  assert.deepEqual(body, { entities: ["light.a"], hide_members: true, all: false });
});

test("only a light made by the group helper has a helper behind it", async () => {
  const { HA } = adapter({
    api: () => ({}),
    ws: {
      "config/entity_registry/get": (msg) => (msg.entity_id === "light.mine" ? { platform: "group", config_entry_id: "e9" } : { platform: "hue_plus", config_entry_id: "h1" }),
    },
  });
  assert.equal(await HA.lightGroups.entryOf("light.mine"), "e9");
  assert.equal(await HA.lightGroups.entryOf("light.hue"), null);
});

/* app/lightgroups.js and app/addpopup.js on a pretend page; pills are recorded, so a tap can be made on a row by its name. */
function dashboard({ create, lights = ["Desk lamp", "Shelf strip", "Ceiling"], rid = "~r~lights" } = {}) {
  const calls = { toasts: [], popups: [], created: [], guard: null };
  const states = {};
  const names = { "light.desk": "Desk lamp", "light.shelf": "Shelf strip", "light.ceiling": "Ceiling", "light.existing": "Light group" };
  Object.keys(names).forEach((id) => (states[id] = { attributes: { friendly_name: names[id] } }));
  const pills = [];
  const tiles = [];
  const el = () => ({ children: [], style: {}, classList: { toggle() {}, add() {} }, appendChild(x) { this.children.push(x); return x; }, addEventListener() {}, setAttribute() {}, querySelector: () => el() });
  const section = { id: "lights", k: "lights", devs: [] };
  const sandbox = {
    H: () => ({ states, areas: { kitchen: { area_id: "kitchen", name: "Kitchen" }, bath: { area_id: "bath", name: "Bathroom" } } }),
    A: (id) => (states[id] ? states[id].attributes : {}),
    dom: (id) => id.split(".")[0],
    DOMKIND: { light: "light" },
    ADDPRE: "lights",
    ADDPRE_IX: { lights: 0 },
    ADDDOMS: [["Lights", ["light"]]],
    ISADMIN: true,
    _T: (k) => (k === "lg_light_group" ? "Light group" : k),
    mk: () => el(),
    svg: () => "",
    selectTile: (label, opts, cur, pick, icon, fmt) => {
      const t = Object.assign(el(), { label, opts, cur, pick, fmt, refresh() {} });
      tiles.push(t);
      return t;
    },
    pill: (icon, name, o) => {
      const p = Object.assign(el(), { name, o, refresh() {} });
      pills.push(p);
      return p;
    },
    redrawBox: (box, fn) => fn(),
    candidates: (doms, rid, q, area) => {
      calls.candidateArgs = [doms, rid, q, area];
      return lights.map((n) => ({ id: Object.keys(names).filter((k) => names[k] === n)[0], name: n, area: "", group: n === "Ceiling" }));
    },
    defIcon: () => "light",
    devSetupKind: () => null,
    devSetupAlways: () => false,
    kAuto: () => 0,
    devList: () => section.devs,
    addDevToPage: (room, d) => {
      calls.pagePlaced = (calls.pagePlaced || []).concat([[room, d.id]]);
      return { rid: "~" + room + "~lights", i: 0 };
    },
    allSectionLists: () => [[section]],
    UI: { devs: {}, layout: {} },
    uiChanged() {},
    toast: (m) => calls.toasts.push(m),
    showPopup: (key, push) => calls.popups.push([key, push]),
    guardUnsaved: (o) => (calls.guard = o),
    POPGUARD: null,
    HA: { lightGroups: { create: (name, members, opts) => create(name, members, opts, calls) } },
    RM: {}, AP_TYPES: {}, remoteNew() {}, apNew() {},
    Object, Array, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("app/lightgroups.js"), sandbox);
  vm.runInContext(read("app/addpopup.js"), sandbox);
  const b = el();
  sandbox.devAdd(b, rid);
  const tap = (name) => pills.filter((p) => p.name === name).pop().o.tap();
  return { sandbox, calls, tap, section, pills, tiles, save: () => calls.guard.save(() => calls.toasts.push("left")) };
}

test("nothing is checked, nothing is saved, and the popup is not dirty; a check makes it dirty", () => {
  const d = dashboard({ create: () => Promise.reject(new Error("no")) });
  assert.equal(d.calls.guard.dirty(), false);
  d.tap("Desk lamp");
  assert.equal(d.calls.guard.dirty(), true);
  d.tap("Desk lamp");
  assert.equal(d.calls.guard.dirty(), false, "checked again: unchecked");
});

test("checked lights are all added by the checkmark, in the order they were checked", () => {
  const d = dashboard({ create: () => Promise.reject(new Error("no")) });
  d.tap("Shelf strip");
  d.tap("Desk lamp");
  assert.equal(d.save(), true);
  assert.deepEqual(d.section.devs.map((x) => x.id), ["light.shelf", "light.desk"]);
  assert.ok(d.calls.toasts.includes("left"), "the popup closes");
});

test("with Light group checked the lights become one group, made first, and its settings open in place of the popup", async () => {
  const d = dashboard({
    create: (name, members, opts, calls) => {
      calls.created.push({ name, members, opts });
      return Promise.resolve({ entry_id: "e1", entity_id: "light.light_group_2" });
    },
  });
  d.tap("Light group");
  d.tap("Desk lamp");
  d.tap("Ceiling · lg_group");
  const done = d.save();
  assert.ok(done.then, "the save waits for the helper");
  assert.equal(await done, true);
  assert.deepEqual(plain(d.calls.created), [{ name: "Light group 2", members: ["light.desk", "light.ceiling"], opts: { hide_members: true, all: false } }], "a name no light has");
  assert.deepEqual(d.section.devs.map((x) => x.id), ["light.light_group_2"], "the group, and not its lights");
  assert.deepEqual(plain(d.calls.popups), [["lgroup:light.light_group_2", false]]);
});

test("a group needs two lights, and a group that could not be made adds nothing and keeps the popup open", async () => {
  const d = dashboard({ create: () => Promise.reject(new Error("Home Assistant refused")) });
  d.tap("Light group");
  d.tap("Desk lamp");
  assert.equal(d.save(), false);
  assert.ok(d.calls.toasts.includes("lg_check_two_lights"));
  d.tap("Shelf strip");
  assert.equal(await d.save(), false);
  assert.ok(d.calls.toasts.includes("Home Assistant refused"), "the reason is shown");
  assert.deepEqual(d.section.devs, [], "nothing was added");
  assert.deepEqual(d.calls.popups, []);
  assert.equal(d.calls.guard.dirty(), true, "the choices are still there");
});

test("a light that is not a group has no helper; the group's lights come from Home Assistant, and deleting takes its devices from every list", () => {
  const d = dashboard({ create: () => Promise.reject(new Error("no")) });
  const { sandbox } = d;
  assert.deepEqual(plain(sandbox.lgMembers("light.nothing")), []);
  d.section.devs.push({ id: "light.g", name: "G" }, { id: "light.other", name: "O" });
  assert.equal(sandbox.lgDevices("light.g").length, 1);
  sandbox.lgDropDevices("light.g");
  assert.deepEqual(d.section.devs.map((x) => x.id), ["light.other"]);
});

test("from the page's own Add the checked devices go to the first section of their kind, and a group goes the same way", async () => {
  const d = dashboard({ rid: "r_living", create: () => Promise.resolve({ entry_id: "e1", entity_id: "light.g" }) });
  d.tap("Desk lamp");
  d.save();
  assert.deepEqual(plain(d.calls.pagePlaced), [["r_living", "light.desk"]], "placed by kind, not into a list of its own");
  assert.deepEqual(d.section.devs, [], "no section was named");
  const g = dashboard({ rid: "r_living", create: () => Promise.resolve({ entry_id: "e1", entity_id: "light.g" }) });
  g.tap("Light group");
  g.tap("Desk lamp");
  g.tap("Ceiling · lg_group");
  await g.save();
  assert.deepEqual(plain(g.calls.pagePlaced), [["r_living", "light.g"]]);
});

test("the type and the area are dropdowns: the type chooses what is listed, the area (all of them to begin with) filters the list", () => {
  const d = dashboard({ create: () => Promise.reject(new Error("no")) });
  const [type, area] = d.tiles;
  assert.equal(type.label, "add_type");
  assert.equal(area.label, "add_area");
  assert.deepEqual(plain(area.opts()), ["all", "bath", "kitchen"], "all areas first, then the areas by name");
  assert.equal(area.fmt("all"), "all_areas");
  assert.equal(area.fmt("bath"), "Bathroom");
  assert.equal(area.cur(), "all", "all areas to begin with");
  assert.deepEqual(plain(d.calls.candidateArgs), [["light"], "~r~lights", "", ""]);
  area.pick("kitchen");
  assert.equal(d.calls.candidateArgs[3], "kitchen", "the list is asked for that area");
  assert.equal(type.fmt("0"), "Lights");
});

test("a light that is already a group says so in its name, and a choice made under one area stays checked under another", () => {
  const d = dashboard({ create: () => Promise.reject(new Error("no")) });
  const ceiling = d.pills.filter((p) => p.name === "Ceiling · lg_group").pop();
  assert.ok(ceiling, "the group's name carries the word");
  assert.equal(ceiling.o.sub(), "light.ceiling", "and the second line is the usual one");
  const desk = d.pills.filter((p) => p.name === "Desk lamp").pop();
  assert.match(desk.o.sub(), /light\.desk/);
  d.tap("Desk lamp");
  d.tiles[1].pick("kitchen");
  assert.equal(d.calls.guard.dirty(), true, "the check is kept when the list changes");
  assert.equal(d.save(), true);
  assert.deepEqual(d.section.devs.map((x) => x.id), ["light.desk"]);
});


test("the list offers lights that stand for others as groups (a Hue room lists no entities but is one), and no zone of a light", () => {
  const states = {
    "light.plain": { attributes: { friendly_name: "Plain" } },
    "light.ha_group": { attributes: { friendly_name: "HA group", entity_id: ["light.plain"] } },
    "light.bathroom": { attributes: { friendly_name: "Bathroom", is_hue_group: true, entity_id: [], hue_type: "room" } },
    "light.strip": { attributes: { friendly_name: "Strip", zone_colors: [[1, 1]], entity_id: ["light.strip_zone_1", "light.strip_zone_2"] } },
    "light.strip_zone_1": { attributes: { friendly_name: "Strip zone 1" } },
    "light.strip_zone_2": { attributes: { friendly_name: "Strip zone 2" } },
    "light.hue_sync": { attributes: { friendly_name: "Not a group", entity_id: [] } },
  };
  const src = read("app/manage.js");
  const code = src.slice(src.indexOf("/* A light that stands for other lights"), src.indexOf("function defIcon"));
  const zoneSrc = read("app/model.js");
  const zoneCode = zoneSrc.slice(zoneSrc.indexOf("function zoneLightIds"), zoneSrc.indexOf("function seedUI"));
  const sandbox = vm.createContext({
    H: () => ({ states, entities: {} }),
    A: (id) => states[id].attributes,
    dom: (id) => id.split(".")[0],
    pageDevIds: () => ({}),
    isVacuumMap: () => false,
    pluginDeviceKind: () => null,
    areaName: () => "",
    areaIdOf: () => "",
    norm: (t) => String(t).toLowerCase(),
    Object, Array,
  });
  vm.runInContext(zoneCode + "\n" + code, sandbox);
  const found = plain(sandbox.candidates(["light"], "~r~lights", "", ""));
  assert.deepEqual(found.map((c) => c.id).sort(), ["light.bathroom", "light.ha_group", "light.hue_sync", "light.plain", "light.strip"], "the zones are not there");
  const group = (id) => found.filter((c) => c.id === id)[0].group;
  assert.equal(group("light.bathroom"), true);
  assert.equal(group("light.ha_group"), true);
  assert.equal(group("light.plain"), false);
  assert.equal(group("light.hue_sync"), false, "a light that lists no lights is not a group");
});
