// SPDX-License-Identifier: GPL-3.0-or-later
// A Section can be given a width in columns (decision D-28): it shrinks with the screen and is one column on a phone. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const pages = read("pages.js");
const ctx = vm.createContext({});
vm.runInContext(pages.slice(pages.indexOf("function masonSpans"), pages.indexOf("function masonVisible")).replace("function outerH", "function outerH_"), ctx);
const spans = (its, n) => Array.from(ctx.masonSpans(its, n));
const plan = (its, h, W, n) => JSON.parse(JSON.stringify(ctx.masonPlan(its, spans(its, n), h, W, n, 24)));

test("a chosen width is kept, never wider than the page's columns, and one column on a phone", () => {
  const its = [{ span: 2 }, { span: 1 }, { span: 1 }];
  assert.deepEqual(spans(its, 3), [2, 1, 1]);
  assert.deepEqual(spans(its, 2), [2, 1, 1], "a two-column section is full width on a two-column page");
  assert.deepEqual(spans([{ span: 3 }, { span: 1 }], 2), [2, 1], "wider than the page: the whole page");
  assert.deepEqual(spans(its, 1), [1, 1, 1], "a phone has one column");
});

test("sections with no chosen width behave as before: full width when marked wide, or alone in a run", () => {
  assert.deepEqual(spans([{ wide: true }, {}, {}], 2), [2, 1, 1]);
  assert.deepEqual(spans([{ wide: true }, {}, { wide: true }], 2), [2, 2, 2]);
  assert.deepEqual(spans([{}, {}, {}], 3), [1, 1, 1]);
  assert.deepEqual(spans([{ span: 1 }, { wide: true }], 2), [1, 2], "a width of one column the person chose stays one column even when alone");
});

test("a wider section is put where the columns it needs are lowest, and takes their full width", () => {
  const out = plan([{}, {}, { span: 2 }, {}], [100, 300, 50, 80], 1000, 3);
  const cw = (1000 - 48) / 3;
  assert.deepEqual(out.pos[0], { x: 0, y: 0, w: cw, h: 100 });
  assert.equal(out.pos[2].w, 2 * cw + 24);
  assert.equal(out.pos[2].y, 300, "it starts below the taller of the two columns it covers");
  assert.equal(out.pos[2].x, 0);
  assert.equal(out.pos[3].x, 2 * (cw + 24), "the third column stayed free, and the next section goes there");
  assert.equal(out.pos[3].y, 0);
});

test("a section's width is cleaned: 1 to 4 are kept, anything else is dropped", () => {
  const model = read("model.js");
  assert.match(model, /s\.span === 1 \|\| s\.span === 2 \|\| s\.span === 3 \|\| s\.span === 4\) o\.span = s\.span/);
});

test("the width is chosen in the Section's settings from automatic up to the page's columns, and an editing preview uses the same spans", () => {
  const ed = read("editor.js");
  assert.match(ed, /dropRow\(\s*_T\("width"\)/);
  assert.match(ed, /pageCols\(sk\)/);
  assert.match(ed, /masonSpans\(its, n\)/);
  assert.match(read("sections.js"), /span: s\.span \|\| 0/);
  assert.doesNotMatch(pages, /masonFlags/);
});

test("a width the person chose wins over a Section that holds something wide, so a camera Section can be made narrower than the page", () => {
  assert.deepEqual(spans([{ wide: true, span: 2 }, {}, {}], 3), [2, 1, 1]);
  assert.deepEqual(spans([{ wide: true, span: 1 }, { wide: true }], 3), [1, 3], "one column when chosen, the whole page when not");
  assert.deepEqual(spans([{ wide: true, span: 2 }], 1), [1], "and a phone has one column whatever was chosen");
});

test("the Columns setting reaches the grids that At a glance, Rooms, Climate overview and the camera and security Sections build themselves", () => {
  const sections = read("sections.js");
  const ctx = vm.createContext({ layCols: (l) => ({ list: 1, grid2: 2, grid3: 3, grid4: 4 })[l] || 0 });
  const from = sections.indexOf("function applySecLay(el, lay)");
  vm.runInContext(sections.slice(from, sections.indexOf("function customSection(s)")), ctx);
  const grid = (cls) => {
    const set = new Set(cls.split(" "));
    return { classList: { remove: (...c) => c.forEach((x) => set.delete(x)), add: (...c) => c.forEach((x) => set.add(x)) }, closest: () => null, style: { gridTemplateColumns: "repeat(3,1fr)" }, has: (c) => set.has(c) };
  };
  const g3 = grid("grid3"),
    cam = grid("camgrid"),
    inHeader = grid("glance");
  inHeader.closest = () => ({});
  const el = { querySelectorAll: () => [g3, cam, inHeader] };
  ctx.applySecLay(el, "grid2");
  for (const g of [g3, cam]) assert.ok(g.has("gridl") && g.has("g2") && g.style.gridTemplateColumns === "", "two columns of tiles");
  assert.ok(!g3.has("grid3") && !cam.has("camgrid"), "the fixed layouts are replaced");
  assert.ok(!inHeader.has("gridl"), "the header's own tiles are left alone");
  const one = grid("grid2");
  ctx.applySecLay({ querySelectorAll: () => [one] }, "list");
  assert.ok(one.has("gridl") && !one.has("g2"), "one column");
  const auto = grid("grid3");
  ctx.applySecLay({ querySelectorAll: () => [auto] }, undefined);
  assert.ok(auto.has("grid3") && !auto.has("gridl"), "automatic keeps what the Section does by itself");
  assert.match(sections, /applySecLay\(widgetDef\(only\.w\)\.section\(only, s\), s\.lay\)/);
  assert.match(sections, /return applySecLay\(sx, s\.lay\);/);
});
