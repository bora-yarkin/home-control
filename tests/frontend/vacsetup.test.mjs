// SPDX-License-Identifier: GPL-3.0-or-later
// The zones source of a robot vacuum appliance and its set-up as text (app/appliancevac.js, app/vacsetup.js, docs/vacuum-appliance.md). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const doc = readFileSync(new URL("../../docs/vacuum-appliance.md", import.meta.url), "utf8");
const examples = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]).filter((t) => t.includes('"format"'));

function world(response) {
  const asked = [];
  const ctx = vm.createContext({
    window: { HA: { serviceResponse: (d, s, data) => (asked.push([d, s, data]), Promise.resolve(response)) } },
    _T: (k) => k,
    iconOk: () => true,
    imgOk: () => false,
    cleanCond: () => null,
    deviceGet: (k, d) => d,
    H: () => ({ states: {}, entities: { "vacuum.robot": { device_id: "dev1" } } }),
    apHas: () => false,
    A: () => ({}),
  });
  const model = read("model.js");
  const cut = (from, to) => model.slice(model.indexOf(from), model.indexOf(to));
  vm.runInContext("var ENTRE = /^[a-z_]+\\.[a-z0-9_]+$/;" + cut("/* An appliance's slots", "/* A status tile as a device"), ctx);
  vm.runInContext(read("appliancevac.js"), ctx);
  vm.runInContext(read("vacsetup.js"), ctx);
  ctx.asked = asked;
  return ctx;
}

test("a path reads an answer through every value, text that holds JSON, and the first place that holds anything", () => {
  const w = world();
  const answer = { a: JSON.stringify({ forbidden_regions: [[1, 2, 3, 4]] }), b: JSON.stringify({ restricted_walls: [[5, 6, 7, 8]] }), c: "not json" };
  assert.deepEqual(plain(w.vacapPath(answer, "*.forbidden_regions|*.restricted_sweep_areas")), [[1, 2, 3, 4]]);
  assert.deepEqual(plain(w.vacapPath(answer, "*.restricted_walls")), [[5, 6, 7, 8]]);
  assert.deepEqual(plain(w.vacapPath({ data: { zones: [{ x0: 1 }] } }, "nothing|data.zones")), [{ x0: 1 }]);
  assert.deepEqual(plain(w.vacapPath({ no_go: [] }, "constructor.name|missing")), []);
});

test("zones come from the action set for them, and from the map when none is set", async () => {
  const w = world({ no_go: [[1, 2, 3, 4]], walls: [[1, 1, 2, 2]] });
  const ap = { slots: {}, vac: { zones: { action: "script.zones", data: { vacuum: "$vacuum", device: "$vacuum_device" } } } };
  const groups = await w.vacapZoneGroups(ap, "vacuum.robot", "");
  assert.deepEqual(plain(w.asked), [["script", "zones", { vacuum: "vacuum.robot", device: "dev1" }]]);
  assert.deepEqual(plain(groups), [{ wall: false, items: [[1, 2, 3, 4]] }, { wall: true, items: [[1, 1, 2, 2]] }]);
  const none = await w.vacapZoneGroups({ slots: {}, vac: {} }, "vacuum.robot", "");
  assert.equal(w.asked.length, 1, "nothing is asked");
  assert.deepEqual(plain(none), [{ wall: false, items: [] }, { wall: true, items: [] }]);
});

test("a room's own settings are not sent when they are turned off", async () => {
  const w = world();
  const sent = [];
  w.H = () => ({ states: {}, entities: {}, callService: (d, s, data) => sent.push(data) });
  w.setTimeout = (f) => f();
  const ap = { slots: {}, vac: { nopr: 1, rooms: [{ k: "3", l: "A" }], sets: [{ k: "fan", d: "low", o: ["low", "high"] }], run: [{ action: "a.b", data: { f: "$room.fan" }, each: 1 }] } };
  await w.vacapStart(ap, "", [], {}, () => ({ fan: "high" }));
  assert.deepEqual(plain(sent), [{ f: "low" }]);
});

test("the chosen rooms are sent as texts, or as numbers when asked for so", async () => {
  const w = world();
  const sent = [];
  w.H = () => ({ states: {}, entities: {}, callService: (d, s, data) => sent.push(data) });
  const ap = { slots: {}, vac: { rooms: [{ k: "16" }, { k: "hall" }], sets: [], run: [{ action: "a.b", data: { t: "$rooms", n: "$room_numbers", s: "{$room_numbers}" } }] } };
  await w.vacapStart(ap, "", [], {}, () => ({}));
  assert.deepEqual(plain(sent), [{ t: ["16", "hall"], n: [16, "hall"], s: '{[16,"hall"]}' }]);
});

test("an answer that is not the one expected is asked for once more, then Start fails with its error", async () => {
  for (const [answers, sends, fails] of [[[{ code: 0 }], 1, false], [[{ code: 1 }, { code: 0 }], 2, false], [[{ code: 1 }, { code: 1, error: "No response" }], 2, true], [[undefined], 1, false]]) {
    const w = world();
    let n = 0;
    w.window.HA.serviceResponse = () => Promise.resolve(answers[n++]);
    w.setTimeout = (f) => f();
    const run = w.vacapCall("a", "b", {}, { code: 0 });
    if (fails) await assert.rejects(run, /No response/);
    else await run;
    assert.equal(n, sends);
  }
});

test("every example of the document is accepted whole, and written back as it was read", () => {
  const w = world();
  assert.ok(examples.length >= 2);
  for (const text of examples) {
    const next = w.vacapFromText({ ap: { slots: {}, extra: [] } }, text);
    assert.ok(next, "a vacuum set-up");
    assert.deepEqual(plain(next.lost), [], text.slice(0, 200));
    const again = w.vacapFromText({ ap: next.ap, map: next.map }, w.vacapToText({ ap: next.ap, map: next.map }));
    assert.deepEqual(plain(again.ap), plain(next.ap));
    assert.deepEqual(plain(again.map), plain(next.map));
  }
});

test("what is not accepted is named, what is left out stays, and anything else is not a set-up", () => {
  const w = world();
  const d = { ap: { type: "vacuum", slots: { vacuum: "vacuum.robot" }, extra: [], vac: { rooms: [{ k: "3", l: "A" }], sets: [], run: [] } }, map: { m: 1 } };
  const head = { format: "home-control.vacuum", version: 1 };
  const next = w.vacapFromText(d, JSON.stringify({ ...head, entities: { vacuum: "light.x" }, start: [{ action: "bad action", data: {} }], map: { trail: true, lines: "pink" } }));
  assert.deepEqual(plain(next.ap.vac.rooms), [{ k: "3", l: "A" }], "rooms were left out, so they stay");
  assert.deepEqual(plain(next.map), { m: 1, tr: 1 });
  for (const at of ["entities.vacuum", "start.0", "map.lines"]) assert.ok(next.lost.includes(at), at + " in " + next.lost);
  assert.equal(w.vacapFromText(d, "not json"), null);
  assert.equal(w.vacapFromText(d, JSON.stringify({ format: "other", version: 1 })), null);
  assert.ok(w.vacapFromText(d, "```json\n" + JSON.stringify(head) + "\n```"), "the fences an AI puts around it are dropped");
  assert.deepEqual(plain(d.map), { m: 1 }, "reading changes nothing");
});
