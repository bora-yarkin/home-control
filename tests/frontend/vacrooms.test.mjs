// SPDX-License-Identifier: GPL-3.0-or-later
// Rooms for any robot vacuum (decision D-32): bound room buttons or Home Assistant areas, shapes on a map, settings per room, and nothing sent until Start.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const src = read("vacrooms.js");
const plain = (v) => JSON.parse(JSON.stringify(v));

function sandbox(extra = {}) {
  const ctx = vm.createContext({ UIDEV: {}, H: () => ({ states: {}, areas: {} }), A: () => ({}), cap: (s) => s[0].toUpperCase() + s.slice(1), ...extra });
  vm.runInContext(src.slice(0, src.indexOf("/* A select as a row of choices")), ctx);
  return ctx;
}

test("the card is for a vacuum with bound rooms or one Home Assistant can clean by area, and no other", () => {
  const states = { "vacuum.a": {}, "vacuum.b": {}, "vacuum.c": {}, "button.k": {} };
  const ctx = sandbox({
    H: () => ({ states }),
    A: (id) => ({ supported_features: id === "vacuum.b" ? 28700 : 12 }),
    UIDEV: { "vacuum.a": { vx: { rooms: [{ e: "button.k" }] } }, "vacuum.c": { vx: { rooms: [{ e: "button.gone" }] } } },
  });
  assert.equal(ctx.vacRoomsFor("vacuum.a"), true, "bound rooms");
  assert.equal(ctx.vacRoomsFor("vacuum.b"), true, "clean by area");
  assert.equal(ctx.vacRoomsFor("vacuum.c"), false, "neither");
  assert.equal(ctx.vacRoomsFor("vacuum.none"), false);
});

test("areas are offered only when the vacuum's segments are mapped to them, by name", () => {
  const ctx = sandbox({ H: () => ({ states: {}, areas: { k: { name: "Kitchen" }, a: { name: "Attic" } } }) });
  assert.deepEqual(plain(ctx.vacAreaRooms({ k: ["1"], a: ["2"], gone: ["3"], empty: [] })).map((r) => [r.id, r.name]), [["a", "Attic"], ["k", "Kitchen"]]);
  assert.equal(ctx.vacWord("vacuum_then_mop"), "Vacuum then mop");
});

test("choosing a room sends nothing; Start presses the one bound room, or cleans the chosen areas, or starts everything", () => {
  assert.match(src, /if \(!chosen\.length\) call\("vacuum", "start", \{ entity_id: id \}\);\s*else if \(many\) call\("vacuum", "clean_area", \{ entity_id: id, cleaning_area_id: chosen\.slice\(\) \}\);\s*else remotePress\(byId\(chosen\[0\]\)\.press\);/);
  const flip = src.slice(src.indexOf("function flip(r)"), src.indexOf("function buildRooms()"));
  assert.doesNotMatch(flip, /call\(|remotePress/, "a tap on a room or its shape only chooses it");
  assert.match(src, /else chosen = \[r\];/, "bound rooms are one at a time");
});

test("a bound room keeps its shapes and settings, and a drawn map is only an uploaded picture", () => {
  const model = read("model.js");
  const from = model.indexOf('if (d.kind === "vacuum" && d.vx');
  const ctx = vm.createContext({ ENTRE: /^[a-z_]+\.[a-z0-9_]+$/ });
  const body = model.slice(from, model.indexOf('if (d.kind === "camera") {', from));
  vm.runInContext("function ent(e, doms) { return typeof e === 'string' && ENTRE.test(e) && doms.indexOf(e.split('.')[0]) >= 0 ? e : null; }\nfunction run(d) { var c = {}; " + body + " return c; }", ctx);
  const out = plain(ctx.run({ kind: "vacuum", vx: { pic: "/home_control_remotes/0123456789ab.png", rooms: [{ e: "button.k", l: "K", s: [[1, 2, 3, 4], [0, 0, 101, 1], "x"], o: ["select.m", "switch.no", "select.m"] }] } }));
  assert.deepEqual(out.vx.rooms[0], { e: "button.k", l: "K", s: [[1, 2, 3, 4]], o: ["select.m"] });
  assert.equal(out.vx.pic, "/home_control_remotes/0123456789ab.png");
  for (const pic of ["https://x/y.png", "/local/x.png", "/home_control_remotes/../x.png"]) assert.equal(ctx.run({ kind: "vacuum", vx: { pic } }).vx?.pic, undefined, pic);
});

test("the vacuum popup uses it for every vacuum with rooms that has no rooms card of its own, map first, without repeating the extras", () => {
  const vac = read("vacuum.js");
  assert.match(vac, /var universal = !rbRooms\(\)\.length && vacRoomsFor\(id\);/);
  assert.match(vac, /vacRooms\(b, id, function \(\) \{\s*vacSummary\(b, id\);/);
  assert.match(read("profiles.js"), /var rooms = universal \? \[\]/);
  const files = JSON.parse(readFileSync(new URL("../version.json", APP), "utf8")).files;
  assert.ok(files.includes("app/vacrooms.js"));
  assert.match(readFileSync(new URL("../ha-adapter.js", APP), "utf8"), /config\/entity_registry\/get/);
});
