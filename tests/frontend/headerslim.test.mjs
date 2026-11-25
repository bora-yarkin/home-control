// SPDX-License-Identifier: GPL-3.0-or-later
// There is one header size. The slim header and its settings are gone, and a saved page that still says slim keeps the regular header. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (path) => readFileSync(new URL(path, APP), "utf8");

test("a saved header that says slim is cleaned to a header with a clock and no size", () => {
  const sandbox = { _T: (k) => k, cleanHdr: () => [] };
  vm.createContext(sandbox);
  const model = read("app/model.js");
  const from = model.indexOf("function cleanMeta(");
  vm.runInContext(model.slice(from, model.indexOf("\n}\n", from) + 3), sandbox);
  const meta = JSON.parse(JSON.stringify(sandbox.cleanMeta({ size: "slim", clockSlim: true, clock: true })));
  assert.equal(meta.size, undefined);
  assert.equal(meta.clockSlim, undefined);
  assert.equal(meta.clock, true);
});

test("nothing of the slim header is left in the code, the style sheet or the settings", () => {
  for (const file of ["app/header.js", "app/appearance.js", "app/manage.js", "app/model.js", "app/settings.js", "app/strings.js", "dashboard.css"])
    assert.doesNotMatch(read(file), /slim|hdrSize|clockSlim/i, file);
});

test("a page has the weather sky on, and there is no setting that turns the status row on or off", () => {
  const sandbox = { _T: (k) => k, cleanHdr: () => [] };
  vm.createContext(sandbox);
  const model = read("app/model.js");
  const from = model.indexOf("function cleanMeta(");
  vm.runInContext(model.slice(from, model.indexOf("\n}\n", from) + 3), sandbox);
  const clean = (m) => JSON.parse(JSON.stringify(sandbox.cleanMeta(m)));
  assert.equal(clean({}).sky, true);
  assert.equal(clean({ sky: false }).sky, false);
  assert.equal("hdrStatus" in clean({ hdrStatus: true }), false, "the setting is gone: the row is there when the page has tiles for it");
});

test("the status row of the header is the page's own list of tiles, shown whenever it has some, and nothing hides a section for it", () => {
  const header = read("app/header.js");
  assert.match(header, /g = statGrid\(key\)/);
  assert.match(header, /on = tiles\.length > 0/);
  assert.doesNotMatch(header, /hdrStatusOn|hdrStatus\b/);
  assert.doesNotMatch(read("app/sections.js"), /hdrStatusOn/, "a page's sections are never left out for the header");
  assert.match(header, /function hdrStatusBlock\(/, "its tiles are chosen in the header's settings, for the page picked there");
});

test("the status row is a drawer that slides open and shut when a page change begins, inside a header whose own row never changes layout", () => {
  const header = read("app/header.js");
  assert.match(header, /function hdrSlide\(hd, box, from, to, fromMt, toMt, done\)/);
  assert.match(header, /prefers-reduced-motion: reduce/);
  assert.match(header, /marginTop: fromMt/, "the height and the gap above it move together");
  assert.match(header, /function hdrStatusSync\(force, key\)/);
  assert.match(read("app/pages.js"), /hdrStatusSync\(false, key\)/, "it starts with the page change, so the header and the page move together");
  const css = read("dashboard.css");
  assert.doesNotMatch(css, /\.hdr:has\(>\.hstat\)\{flex-wrap/, "adding the row must not re-wrap the title and buttons");
  assert.match(css, /\.hrow\{display:flex/);
  assert.match(read("dashboard-panel.js"), /<div class="hdr pane"><div class="hrow">/);
});
