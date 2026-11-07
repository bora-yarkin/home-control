// SPDX-License-Identifier: GPL-3.0-or-later
// The effects catalogue in the dashboard (app/effects.js): which catalogue is for a light, how effects are grouped and drawn, and that a picture an
// integration brought can never put anything but a drawing on the page. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));

const HUE = {
  id: "hue_plus",
  name: "Hue Plus",
  kind: "provider",
  set_effect: "set_effect",
  lights: { platforms: ["hue_plus"] },
  groups: [
    { id: "flames", label: "Flames" },
    { id: "wavy", label: "Wavy" },
  ],
  effects: [
    { id: "candle", label: "Candle", group: "flames", palette: ["#ffd27a", "#ff8a1e"], brightness: 26, speed: 6, hue: 35, default_label: "", variants: [{ id: "orange", label: "Orange", colour: { hs: [30, 100] } }] },
    { id: "fire", label: "Fireplace", group: "flames", palette: ["#ffb13a"] },
    { id: "underwater", label: "Underwater", group: "wavy", speed_range: [0.2, 0.5], default_label: "Blue", art: "<svg viewBox='0 0 100 100'><defs><linearGradient id='g'><stop offset='0' stop-color='#86ecff'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/></svg>" },
  ],
};
const FILE = {
  id: "my_strips_1",
  name: "My strips",
  kind: "file",
  lights: { entities: ["light.desk_strip"], platforms: ["govee"], models: ["H6159"] },
  groups: [{ id: "calm", label: "Calm" }],
  effects: [{ id: "Aurora", label: "Aurora", group: "calm", palette: ["#86ecff", "#07203f"] }, { id: "Plain" }],
};

function page(sources = [HUE, FILE]) {
  const entities = {
    "light.floor": { platform: "hue_plus", device_id: "d1" },
    "light.desk_strip": { platform: "other", device_id: "d2" },
    "light.govee_a": { platform: "govee", device_id: "d3" },
    "light.model_match": { platform: "other", device_id: "d4" },
    "light.stranger": { platform: "other", device_id: "d5" },
  };
  const devices = { d1: { model: "LCT" }, d2: {}, d3: { model: "H6001" }, d4: { model: "H6159" }, d5: { model: "X" } };
  const sandbox = { _T: (k) => ({ fx_more: "More", no_effect: "No effect", default: "Default" })[k] || k, H: () => ({ entities, devices }), HA: {}, mk() {}, pill() {}, toast() {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("effects.js", APP), "utf8"), sandbox);
  sandbox.FX.sources = sources;
  return sandbox;
}

test("a catalogue is for the lights it names: by entity, by integration or by device model", () => {
  const p = page();
  assert.equal(p.fxMatches(FILE, "light.desk_strip"), true);
  assert.equal(p.fxMatches(FILE, "light.govee_a"), true);
  assert.equal(p.fxMatches(FILE, "light.model_match"), true);
  assert.equal(p.fxMatches(FILE, "light.stranger"), false);
  assert.equal(p.fxMatches(HUE, "light.floor"), true);
  assert.equal(p.fxMatches(HUE, "light.govee_a"), false);
  assert.equal(p.fxMatches(HUE, "light.unknown"), false, "a light Home Assistant has no entity for matches nothing");
});

test("an effect is read as the panel uses it: group, defaults, calibration and colour variants", () => {
  const p = page();
  const c = plain(p.lpFxCat("candle"));
  assert.equal(c.cat, "hue_plus:flames");
  assert.equal(c.catLabel, "Flames");
  assert.deepEqual([c.bri, c.spd, c.h], [26, 6, 35]);
  assert.deepEqual(c.v, [["orange", "Orange", { hs: [30, 100] }]]);
  assert.deepEqual(plain(p.lpFxCat("underwater")).rng, [0.2, 0.5]);
  assert.equal(p.lpFxCat("underwater").def, "Blue");
  assert.equal(p.lpFxCat("not an effect"), null, "an effect no catalogue knows");
});

test("with lights in hand the catalogue for those lights wins; otherwise any catalogue that lists the effect", () => {
  const shared = { ...FILE, id: "other_file", name: "Other", lights: { platforms: ["hue_plus"] }, effects: [{ id: "candle", label: "Taper", group: "calm" }], groups: [{ id: "calm", label: "Calm" }] };
  const p = page([FILE, shared, HUE]);
  p.FX.lights = ["light.floor"];
  assert.equal(p.lpFxCat("candle").label, "Taper", "the first catalogue that is for the light and lists it");
  p.FX.lights = ["light.govee_a"];
  assert.equal(p.lpFxCat("candle").label, "Taper", "none is for this light: the first that lists the effect");
});

test("effects are grouped in the order the catalogues list their groups, and the rest come last under More", () => {
  const p = page();
  p.FX.lights = ["light.floor", "light.govee_a"];
  const groups = plain(p.fxGroups(["underwater", "Mystery", "candle", "Aurora", "fire"]));
  assert.deepEqual(groups.map((g) => [g.label, g.names]), [
    ["Flames", ["candle", "fire"]],
    ["Wavy", ["underwater"]],
    ["Calm", ["Aurora"]],
    ["More", ["Mystery"]],
  ]);
});

test("an effect that a catalogue lists without a group goes under More, as does one nothing knows", () => {
  const p = page();
  assert.deepEqual(plain(p.fxGroups(["Plain", "x"])).map((g) => [g.label, g.names]), [["More", ["Plain", "x"]]]);
});

test("labels: the catalogue's, else the name with a capital, and off is No effect", () => {
  const p = page();
  assert.equal(p.lpFxLabel("fire"), "Fireplace");
  assert.equal(p.lpFxLabel("rainbow_chase"), "Rainbow chase");
  assert.equal(p.lpFxLabel("off"), "No effect");
});

test("a picture: the catalogue's own, else its palette as a gradient, else a plain one", () => {
  const p = page();
  assert.match(p.lpFxArt("underwater"), /^<svg[^>]*><defs><linearGradient id='fx\d+-g'>/);
  const palette = p.lpFxArt("Aurora");
  assert.match(palette, /stop-color='#86ecff'/);
  assert.match(palette, /stop-color='#07203f'/);
  assert.match(p.lpFxArt("nothing"), /^<svg/);
  assert.match(p.lpFxArt("off"), /currentColor/);
});

test("two pictures on one page never share an id, so one cannot take the other's gradient", () => {
  const p = page();
  const ids = (svg) => [...svg.matchAll(/id='([^']+)'/g)].map((m) => m[1]);
  const a = ids(p.lpFxArt("underwater")),
    b = ids(p.lpFxArt("underwater"));
  assert.ok(a.length && b.length);
  assert.deepEqual(a.filter((x) => b.includes(x)), []);
});

const HOSTILE = [
  "<svg><script>alert(1)</script></svg>",
  "<svg><foreignObject><div>x</div></foreignObject></svg>",
  "<svg><a href='javascript:alert(1)'><rect/></a></svg>",
  "<svg><image href='https://evil.example/x.png'/></svg>",
  "<svg><use href='#a'/></svg>",
  "<svg><style>*{display:none}</style></svg>",
  "<svg>text outside</svg>",
  "<svg><rect/></svg><script>alert(1)</script>",
  "<!DOCTYPE svg><svg></svg>",
  "<?xml version='1.0'?><svg></svg>",
  "<svg><![CDATA[x]]></svg>",
  "<div><svg></svg></div>",
  "<svg><rect></svg>",
  "<svg></rect></svg>",
  "",
  "not a picture",
  "<svg>" + "x".repeat(4100) + "</svg>",
];

test("anything that could carry code or a link is refused whole", () => {
  const p = page();
  for (const text of HOSTILE) assert.equal(p.fxSvg(text, "fx1"), "", text.slice(0, 60));
  assert.equal(p.fxSvg(5, "fx1"), "");
  assert.equal(p.fxSvg(null, "fx1"), "");
});

test("an attribute that is not on the list, or has an odd value, is left out and the rest is kept", () => {
  const p = page();
  const out = p.fxSvg("<svg viewBox='0 0 100 100' onclick='alert(1)'><rect width='5' fill='url(http://evil/x)' style='x:y' onmouseover='alert(1)' stroke='#fff'/></svg>", "fx9");
  assert.equal(out, "<svg viewBox='0 0 100 100'><rect width='5' stroke='#fff'/></svg>");
  assert.equal(p.fxSvg("<svg onload='alert(1)'></svg>", "fx9"), "<svg></svg>", "an event handler is dropped, and only a drawing is left");
});

test("references stay inside the picture: they are renamed with it, and a reference elsewhere is left out", () => {
  const p = page();
  const out = p.fxSvg("<svg><defs><radialGradient id='a'><stop offset='1' stop-color='#000'/></radialGradient></defs><circle r='5' fill='url(#a)' stroke='url(#a) url(https://evil)'/></svg>", "fx2");
  assert.match(out, /<radialGradient id='fx2-a'>/, "the element names are written as SVG spells them");
  assert.match(out, /fill='url\(#fx2-a\)'/);
  assert.doesNotMatch(out, /evil/);
});

test("the output is made only of the pieces that were checked", () => {
  const p = page();
  const out = p.fxSvg("<svg viewBox='0 0 100 100'><g opacity='.5'><path d='M0 0L10 10Z' fill='#ffffff'/></g></svg>", "fx3");
  assert.equal(out, "<svg viewBox='0 0 100 100'><g opacity='.5'><path d='M0 0L10 10Z' fill='#ffffff'/></g></svg>");
  for (const word of ["script", "onload", "href", "javascript"]) assert.ok(!out.includes(word));
});
