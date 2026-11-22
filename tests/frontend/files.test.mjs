// SPDX-License-Identifier: GPL-3.0-or-later
// Export and import go through files: a page is saved as a .json file and read back from one, checked and summed up before anything is replaced; the helpers that save and read
// files are shared by the page, the backup and the effects file. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function widgets(extra = {}) {
  const downloads = [];
  const toasts = [];
  const inputs = [];
  const src = read("widgets.js");
  const code = src.slice(src.indexOf("/* Files, for every export and import"), src.indexOf("/* Every question and every short entry"));
  const sandbox = vm.createContext({
    document: {
      createElement: (tag) => {
        const e = { tag, listeners: {}, files: null, click() { this.clicked = true; }, remove() {}, addEventListener(n, fn) { this.listeners[n] = fn; } };
        if (tag === "a") downloads.push(e);
        if (tag === "input") inputs.push(e);
        return e;
      },
      body: { appendChild() {} },
    },
    Blob: class { constructor(parts, o) { this.text = parts.join(""); this.type = o.type; } },
    URL: { createObjectURL: (b) => (downloads.blobs = (downloads.blobs || []).concat([b]), "blob:x"), revokeObjectURL() {} },
    setTimeout: (fn) => fn(),
    toast: (m) => toasts.push(m),
    _T: (k) => k,
    FileReader: class { readAsText(f) { this.result = f.text; this.onload(); } },
    Date: class extends Date { constructor() { super(2026, 10, 19, 9, 5); } },
    String,
    ...extra,
  });
  vm.runInContext(code, sandbox);
  return { sandbox, downloads, toasts, inputs };
}

test("a file is saved under the name given, with its text, and a stamp and a slug make a safe name", () => {
  const w = widgets();
  w.sandbox.downloadText("a.json", '{"x":1}');
  assert.equal(w.downloads[0].download, "a.json");
  assert.equal(w.downloads.blobs[0].text, '{"x":1}');
  assert.equal(w.downloads.blobs[0].type, "application/json");
  assert.ok(w.downloads[0].clicked);
  assert.equal(w.sandbox.fileStamp(), "20261119-0905");
  assert.equal(w.sandbox.fileSlug("Living Room / Ceiling!"), "living-room-ceiling");
  assert.equal(w.sandbox.fileSlug("Çalışma Odası"), "calisma-odasi", "accents are dropped, not the letters");
  assert.equal(w.sandbox.fileSlug("???", "page"), "page");
});

test("a file is read as text and given to the caller; one that is too large is refused with a message", () => {
  const w = widgets();
  const got = [];
  w.sandbox.pickTextFile({ maxBytes: 100 }, (text, name) => got.push([text, name]));
  const input = w.inputs[0];
  assert.equal(input.accept, ".json,application/json");
  input.files = [{ size: 500, name: "big.json", text: "x" }];
  input.listeners.change();
  assert.deepEqual(got, []);
  assert.deepEqual(w.toasts, ["that_file_is_too_large"]);
  input.files = [{ size: 10, name: "ok.json", text: '{"a":1}' }];
  input.listeners.change();
  assert.deepEqual(got, [['{"a":1}', "ok.json"]]);
  input.files = [];
  input.listeners.change();
  assert.equal(got.length, 1, "no file chosen: nothing happens");
});

test("no export or import is made of pasted text any more", () => {
  const editor = read("editor.js");
  assert.doesNotMatch(editor, /navigator\.clipboard|"textarea"|paste/i);
  for (const f of ["effects.js", "backups.js"]) assert.doesNotMatch(read(f), /new FileReader|clipboard/, f);
});

/* An icon of the person's own is read from an SVG file. node has no DOMParser, so this one reads just what the function asks of it. */
function icons() {
  class FakeParser {
    parseFromString(text) {
      const root = /<svg\b([^>]*)>/i.exec(text);
      const attr = (src, name) => ((new RegExp(name + '="([^"]*)"').exec(src) || [])[1] || "");
      const paths = [...text.matchAll(/<path\b([^>]*)>/gi)].map((m) => ({ getAttribute: (n) => attr(m[1], n) }));
      return {
        documentElement: root ? { nodeName: "svg", getAttribute: (n) => attr(root[1], n), getElementsByTagName: (t) => (t === "path" ? paths : []) } : null,
        getElementsByTagName: () => (root ? [] : [{}]),
      };
    }
  }
  const src = read("icons.js");
  const code = src.slice(src.indexOf("function pathOk"), src.indexOf("function svg(n)"));
  const sandbox = vm.createContext({ DOMParser: FakeParser, _T: (k) => k, String, Number, Array });
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("an SVG file becomes an icon: its paths are joined; a file that is not an SVG, is on another grid, or has no paths is refused with the reason", () => {
  const i = icons();
  const svg = (inner, attrs = 'viewBox="0 0 24 24"') => `<svg xmlns="x" ${attrs}>${inner}</svg>`;
  assert.deepEqual(plain(i.iconFromSvg(svg('<path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/>'))), { path: "M4 4h16v16H4z M8 8h8v8H8z" });
  assert.deepEqual(plain(i.iconFromSvg(svg('<path d="M4 4h16v16H4z"/>', ""))), { path: "M4 4h16v16H4z" }, "no grid given: taken as 24");
  assert.equal(i.iconFromSvg("hello").problem, "that_isn_t_an_svg_file");
  assert.equal(i.iconFromSvg(svg('<path d="M4 4h16v16H4z"/>', 'viewBox="0 0 512 512"')).problem, "the_icon_must_be_drawn_on_a_24_by_24_grid");
  assert.equal(i.iconFromSvg(svg('<circle r="3"/>')).problem, "that_svg_has_no_paths");
  assert.equal(i.iconFromSvg(svg('<path d="javascript:alert(1)"/>')).problem, "that_path_data_isn_t_valid", "only drawing commands are kept");
});
