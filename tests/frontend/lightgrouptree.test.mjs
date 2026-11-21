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
const SRC = ["lpFrontier", "lpLeaves", "lpOpenKids", "lpCount", "lpFind", "lpFindIn", "lpVisible", "lpShownOf", "lpHolds", "lpLook", "lpSameLook", "lpNodeLook", "lpHierInit", "lpTrayUnits", "lpSortLights", "lpIsGroup", "lpTrayStruct", "lpTraySig", "lpGroupColours", "lpState"].map(fn).join("\n");

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

test("taking a light out of a group on the wheel opens the group there and leaves the others together, and the lights row keeps the group", () => {
  const { S, sandbox, nodes } = build();
  S.rebuild = () => {};
  S.pullOut(nodes.r);
  const shown = sandbox.lpVisible(S);
  assert.deepEqual(keys(shown.filter((n) => n.virtual)[0].kids), ["light.l", "light.iris"], "the left lamp and the Iris still run together");
  assert.ok(keys(shown).includes("light.r"), "the right lamp has a marker of its own");
  assert.deepEqual(keys(sandbox.lpTrayUnits(S)), ["light.floor", "light.iris", "light.ceil"], "the lights row still has the group as a group: separating a light on the wheel does not separate it there");
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

test("a group that is one light shows its icon on its marker, not the number of its lights; a marker of several lights shows the number", () => {
  assert.match(panel, /lpCount\(n\) > 1 && !asIcon \? "<span class='lw-num'>"/);
  assert.match(panel, /lpMarker\(n, list\.length > 1, S\.hier && lpIsGroup\(n\)\)/);
  assert.match(panel, /lpMarker\(k, true, S\.hier && lpIsGroup\(k\)\)/);
  const { sandbox, nodes } = build();
  vm.runInContext(fn("lpIsGroup"), sandbox);
  assert.equal(sandbox.lpIsGroup(nodes.floor), true);
  assert.equal(sandbox.lpIsGroup(nodes.l), false);
  assert.equal(sandbox.lpIsGroup({ kids: [1, 2], virtual: true }), false, "lights that share a marker are not a group");
  assert.equal(sandbox.lpIsGroup({ kids: [1, 2], zones: true }), false, "the zones of a light are not a group");
});

test("tapping an entry of the circle never separates it: a group or a light made of zones lists what it is made of, and a drag needs more than a slip of the finger", () => {
  assert.match(panel, /if \(!moved && bub && S\.hier && cur\.n\.kids\) \{/);
  assert.match(panel, /\(cur\.inBub \? 12 : 6\)/);
});

test("a light dropped on a marker takes that marker's own colour or temperature, not the one its place on the wheel reads as", () => {
  assert.match(panel, /exact = own && isOn\(own\) \? \(isColor \? \{ hs_color: lpHs\(own\) \} : \{ color_temp_kelvin: lpKelvin\(own\) \}\) : null/);
  assert.match(panel, /data = exact && \(exact\.hs_color \|\| exact\.color_temp_kelvin\) \? exact : finger\(/);
});

test("the lights of a circle are spread evenly round the whole circle, not a fixed step apart", () => {
  assert.match(panel, /return -Math\.PI \/ 2 \+ \(i \* 2 \* Math\.PI\) \/ kids\.length;/);
  assert.doesNotMatch(panel, /Math\.min\(\(2 \* Math\.PI\) \/ kids\.length, Math\.PI \/ 4\)/);
});

test("a group of the lights row that is opened has its lights beside it, which can be groups that are opened too", () => {
  const { S, sandbox, nodes } = build();
  const units = () => sandbox.lpTrayStruct(S, sandbox.lpSortLights(sandbox.lpTrayUnits(S), null));
  assert.equal(sandbox.lpTraySig(units()), "light.ceil,light.floor,light.iris");
  S.trayEx["light.floor"] = true;
  assert.equal(sandbox.lpTraySig(units()), "light.ceil,light.floor[light.l,light.r],light.iris", "the group stays, its lights follow it");
  S.trayEx["light.l"] = true;
  assert.equal(sandbox.lpTraySig(units()), "light.ceil,light.floor[light.l,light.r],light.iris", "a light that is not a group has nothing to open");
  assert.deepEqual(Object.keys(S.ex), ["m:x"], "nothing was separated on the wheel");
  assert.deepEqual(keys(sandbox.lpVisible(S).filter((n) => n.virtual)[0].kids), ["light.floor", "light.iris"]);
});

test("a group whose lights run at different colours shows them as a gradient, and one colour when they run alike", () => {
  const w = build();
  vm.runInContext("var avgLight = function (ids) { return ids.length ? (ids[0] === 'light.r' ? [200, 100, 0] : [100, 100, 100]) : null; };", w.sandbox);
  assert.equal(w.sandbox.lpGroupColours({ kids: [{ cmd: ["light.l"] }, { cmd: ["light.l"] }] }), null, "alike: one colour");
  const two = w.sandbox.lpGroupColours({ kids: [{ cmd: ["light.l"] }, { cmd: ["light.r"] }] });
  assert.equal(two.length, 2, "different: the colours of its lights");
  assert.match(panel, /"linear-gradient\(" \+ \(grp \? "135deg" : "180deg"\)/);
});

test("a tap on a group tile opens it beside its tile, with a button that closes it, and neither double tap nor long press separates anything", () => {
  assert.match(panel, /if \(S\.hier && lpIsGroup\(n\)\) \{\s*if \(!S\.trayEx\[n\.key\]\) \{/);
  assert.match(panel, /col = mk\("div", "lp-tcol", svg\("chevs"\)\)/);
  assert.doesNotMatch(panel, /S\.openGroup|dblclick/);
});

test("tapping the tile of a group or of a light of a group picks it inside the marker that holds it and separates nothing", () => {
  const { S, sandbox, nodes } = build();
  S.rebuild = () => {};
  // everything runs alike: the whole is one marker
  for (const id of Object.keys(looks)) looks[id] = "warm";
  const s2 = vm.runInContext("lpState", sandbox)(nodes.root, true, true);
  s2.rebuild = () => {};
  assert.deepEqual(keys(sandbox.lpVisible(s2)), ["m:x"], "one marker for all the lights");
  assert.equal(sandbox.lpShownOf(s2, nodes.floor).key, "m:x", "a group is found in it");
  assert.equal(sandbox.lpShownOf(s2, nodes.l).key, "m:x", "and a light of a group");
  s2.reveal(nodes.floor);
  assert.equal(s2.focus.n, nodes.floor, "the marker shows the group's icon");
  assert.equal(s2.ex[nodes.root.key], undefined, "the whole is not separated");
  s2.reveal(nodes.r);
  assert.equal(s2.focus.n, nodes.r, "or the light's");
  looks["light.ceil"] = "blue";
});

test("a group whose lights run at different settings is opened by itself in the lights row (once), and closing it stays closed", () => {
  const { S, sandbox } = build();
  const units = () => sandbox.lpTrayStruct(S, sandbox.lpSortLights(sandbox.lpTrayUnits(S), null));
  assert.equal(sandbox.lpTraySig(units()), "light.ceil,light.floor,light.iris", "running alike: closed");
  const other = build();
  looks["light.r"] = "blue";
  assert.equal(other.sandbox.lpTraySig(other.sandbox.lpTrayStruct(other.S, other.sandbox.lpSortLights(other.sandbox.lpTrayUnits(other.S), null))), "light.ceil,light.floor[light.l,light.r],light.iris", "different: open, beside its tile");
  other.S.trayEx["light.floor"] = false;
  assert.equal(other.sandbox.lpTraySig(other.sandbox.lpTrayStruct(other.S, other.sandbox.lpSortLights(other.sandbox.lpTrayUnits(other.S), null))), "light.ceil,light.floor,light.iris", "closed by the person: it stays closed");
  looks["light.r"] = "warm";
});

// What the line under a light's name says.
function doing(over = {}) {
  const sandbox = {
    V_: (e) => (over.off && over.off.includes(e) ? "off" : "on"),
    A: (e) => ({ effect: (over.fx || {})[e] || "off", dynamics: (over.dynamics || {})[e] || "none" }),
    lpFxLight: (e) => e,
    pluginPlays: (e) => (over.sync || []).includes(e),
    lpFxLabel: (f) => f[0].toUpperCase() + f.slice(1),
    _T: (k) => ({ tile_sync: "Sync", tile_dynamics: "Dynamics", tile_static: "Static", tile_mixed: "Mixed" })[k] || k,
    cap: (s) => s,
  };
  vm.createContext(sandbox);
  vm.runInContext(["lpLightDoing", "lpLeaves", "lpTileDoing"].map(fn).join("\n"), sandbox);
  return sandbox;
}

test("under a light's name: the effect it runs, Dynamics for a scene that moves, Sync for a sync, Static for one colour, nothing when it is off", () => {
  const w = doing({ fx: { "light.bed": "candle" }, sync: ["light.iris"], off: ["light.off"] });
  const dyn = { "light.scene": 1 };
  assert.equal(w.lpLightDoing("light.bed", dyn), "Candle");
  assert.equal(w.lpLightDoing("light.iris", dyn), "Sync", "a plugin says a sync plays on it");
  assert.equal(w.lpLightDoing("light.scene", dyn), "Dynamics");
  assert.equal(w.lpLightDoing("light.plain", dyn), "Static");
  assert.equal(w.lpLightDoing("light.off", dyn), "");
  const hue = doing({ dynamics: { "light.play": "dynamic_palette" } });
  assert.equal(hue.lpLightDoing("light.play", {}), "Dynamics", "the bridge says the light plays a scene's colours");
  assert.equal(hue.lpLightDoing("light.other", {}), "Static", "dynamics none is one colour");
});

test("a group section of the lights row is clipped only while it slides, and is never narrower than its lights", () => {
  const css = readFileSync(new URL("../dashboard.css", APP), "utf8");
  assert.match(css, /\.lp-tg\{[^}]*min-width:max-content\}/);
  assert.doesNotMatch(css.match(/\.lp-tg\{[^}]*\}/)[0], /gap/, "spaced with margins: Safari leaves a flex container's gap out of its content width");
  assert.match(css, /\.lp-tg>\*\+\*\{margin-left:10px\}/);
  assert.match(css, /\.lp-tile\{[^}]*flex:0 0 98px/, "the width the group is worked out from");
  assert.match(css, /\.lp-tcol\{flex:0 0 30px;width:30px/);
  assert.match(panel, /g\.style\.width = g\.style\.flexBasis = groupWidth\(g\) \+ "px"/, "an opened group is as wide as its lights, said outright");
  assert.match(css, /\.lp-tg\.lp-slide\{overflow:hidden;min-width:0\}/);
  assert.match(panel, /run\.onfinish = run\.oncancel = function \(\) \{\s*wrap\.classList\.remove\("lp-slide"\)/);
});

test("a tile of several lights says what they all do, and Mixed when they do not do the same", () => {
  const w = doing({ fx: { "light.a": "candle" } });
  const leaf = (id) => ({ cmd: [id], kids: null });
  const group = (...ids) => ({ cmd: ids, kids: ids.map(leaf) });
  assert.equal(w.lpTileDoing(group("light.b", "light.c"), {}), "Static");
  assert.equal(w.lpTileDoing(group("light.a", "light.b"), {}), "Mixed");
  assert.equal(w.lpTileDoing(group("light.a", "light.a"), {}), "Candle");
});

test("the tile of a light has the line under its name, kept up to date with the light", () => {
  assert.match(panel, /var doing = mk\("div", "lp-ts"\);/);
  assert.match(panel, /if \(t\.sub\) t\.sub\.textContent = lpTileDoing\(t\.n, dyn\);/);
  assert.match(panel, /Object\.keys\(s\)\.forEach\(function \(sid\) \{\s*\(s\[sid\]\.lights \|\| \[\]\)/, "the lights of the live scenes that run");
  assert.match(panel, /kind\.lights && kind\.dynamic\(id\) && kind\.active\(id\)/, "and of a plugin's scenes that play");
});

test("when the master's sync starts, its lights that the sync does not play on go off", () => {
  const lights = readFileSync(new URL("lights.js", APP), "utf8");
  assert.match(lights, /if \(on && !was\)/);
  assert.match(lights, /return V_\(e\) === "on" && !pluginPlays\(e\);/);
  assert.match(lights, /call\("light", "turn_off", \{ entity_id: off \}\)/);
});

test("tapping an opened group again closes it, and the arrow between has no background and spins half a turn back when it closes and forward when it opens", () => {
  assert.match(panel, /else \{\s*var open = tray\.querySelector\('\.lp-tg\[data-key="' \+ n\.key \+ '"\]'\);\s*if \(open && !open\.classList\.contains\("lp-slide"\)\) collapseGroup\(n, open\);/);
  assert.match(panel, /arrow\.animate\(\[\{ transform: "rotate\(0deg\)" \}, \{ transform: "rotate\(180deg\)" \}\]/, "spins back when it closes");
  assert.match(panel, /arrow\.animate\(\[\{ transform: "rotate\(180deg\)" \}, \{ transform: "rotate\(0deg\)" \}\]/, "and the other way when it opens");
  const css = readFileSync(new URL("../dashboard.css", APP), "utf8");
  assert.doesNotMatch(css.match(/\.lp-tcol\{[^}]*\}/)[0], /background|border-radius/);
});
