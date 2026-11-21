// SPDX-License-Identifier: GPL-3.0-or-later
// A light panel whose groups are single lights (a lights master with grouped lights as one light): lights that look the same share a marker, a group is one light until it is separated, a light taken out of a group
// leaves the rest together, and dropping it back makes the group whole again (app/lightpanel.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const panel = readFileSync(new URL("lightpanel.js", APP), "utf8");
const fn = (name) => {
  const at = panel.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  return panel.slice(at, panel.indexOf("\n}\n", at) + 3);
};
const SRC = ["lpFrontier", "lpLeaves", "lpOpenKids", "lpCount", "lpFind", "lpFindIn", "lpVisible", "lpShownOf", "lpLook", "lpSameLook", "lpNodeLook", "lpHierInit", "lpTrayUnits", "lpState"].map(fn).join("\n");

// The lights: a floor lamp group (L, R) and the Iris look the same; the ceiling light does not.
const looks = { "light.l": "warm", "light.r": "warm", "light.iris": "warm", "light.ceil": "blue" };
function build() {
  const sandbox = {
    isOn: () => true,
    A: (id) => ({ brightness: 180, xy_color: looks[id] === "warm" ? [0.5, 0.4] : [0.2, 0.2], color_mode: "xy" }),
    lpCap: () => [1],
    reg() {},
    countOn: () => 1,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const leaf = (id) => ({ key: id, name: id, icon: "light", cmd: [id], kids: null, parent: null, zones: false });
  const group = (key, kids) => {
    const n = { key, name: key, icon: "light", cmd: kids.flatMap((k) => k.cmd), kids, parent: null, zones: false };
    kids.forEach((k) => (k.parent = n));
    return n;
  };
  const l = leaf("light.l"), r = leaf("light.r"), iris = leaf("light.iris"), ceil = leaf("light.ceil");
  const floor = group("light.floor", [l, r]);
  const root = group("m:x", [floor, iris, ceil]);
  const S = vm.runInContext("lpState", sandbox)(root, true, true);
  return { S, sandbox, nodes: { l, r, iris, ceil, floor, root } };
}
const keys = (list) => Array.from(list, (n) => n.key);

test("lights that look the same share a marker, a group stays one light, and the lights row has the groups as tiles", () => {
  const { S, sandbox, nodes } = build();
  assert.equal(S.hier, true);
  const shown = sandbox.lpVisible(S);
  assert.equal(shown.length, 2, "the floor lamps and the Iris are one marker, the ceiling light another");
  const together = shown.filter((n) => n.virtual)[0];
  assert.deepEqual(keys(together.kids), ["light.floor", "light.iris"], "a group is one light of the marker");
  assert.deepEqual(keys(sandbox.lpTrayUnits(S)), ["light.floor", "light.iris", "light.ceil"]);
  assert.equal(S.ex[nodes.floor.key], undefined, "the group is not opened by itself");
});

test("taking a light out of a group opens the group where it stands and leaves the others together", () => {
  const { S, sandbox, nodes } = build();
  S.rebuild = () => {};
  S.pullOut(nodes.r);
  const shown = sandbox.lpVisible(S);
  assert.deepEqual(keys(shown.filter((n) => n.virtual)[0].kids), ["light.l", "light.iris"], "the left lamp and the Iris still run together");
  assert.ok(keys(shown).includes("light.r"), "the right lamp has a marker of its own");
  assert.deepEqual(keys(sandbox.lpTrayUnits(S)), ["light.l", "light.r", "light.iris", "light.ceil"], "the opened group shows its lights in the row");
});

test("dropping the light back on that marker makes the group whole again, with the Iris", () => {
  const { S, sandbox, nodes } = build();
  S.rebuild = () => {};
  S.pullOut(nodes.r);
  const shown = sandbox.lpVisible(S);
  S.join(shown.filter((n) => n.key === "light.r")[0], shown.filter((n) => n.virtual)[0]);
  const after = sandbox.lpVisible(S);
  assert.deepEqual(keys(after.filter((n) => n.virtual)[0].kids), ["light.floor", "light.iris"]);
  assert.equal(S.ex[nodes.floor.key], undefined, "the group is closed again");
  assert.deepEqual(keys(sandbox.lpTrayUnits(S)), ["light.floor", "light.iris", "light.ceil"]);
});

test("taking a whole group out of a marker leaves it a group with a marker of its own", () => {
  const { S, sandbox, nodes } = build();
  S.rebuild = () => {};
  S.pullOut(nodes.floor);
  const shown = sandbox.lpVisible(S);
  assert.deepEqual(keys(shown).sort(), ["light.ceil", "light.floor", "light.iris"]);
  assert.equal(shown.filter((n) => n.virtual).length, 0, "the Iris alone is not a marker of several");
});
