// SPDX-License-Identifier: GPL-3.0-or-later
// Every question and short entry opens as one sheet at the bottom of the screen (app/widgets.js): "Are you sure", "Unsaved changes", the TV's keyboard. None opens in the middle.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (name) => readFileSync(new URL(name, FRONTEND), "utf8");

function page() {
  const body = { children: [], appendChild(x) { this.children.push(x); x.parent = this; return x; } };
  const timers = [];
  const el = (cls = "") => {
    const classes = new Set(String(cls).split(" ").filter(Boolean));
    const self = {
      className: cls,
      children: [],
      listeners: {},
      style: {},
      textContent: "",
      value: "",
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
      appendChild(x) { this.children.push(x); return x; },
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
      setAttribute() {},
      focus() {},
      remove() { self.removed = true; },
      click() { (this.listeners.click || []).forEach((fn) => fn()); },
    };
    return self;
  };
  const created = [];
  const sandbox = {
    mk: (tag, cls) => {
      const e = el(cls);
      e.tag = tag;
      created.push(e);
      return e;
    },
    document: { body },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    _T: (k) => k,
  };
  vm.createContext(sandbox);
  const src = read("app/widgets.js");
  vm.runInContext(src.slice(src.indexOf("/* Every question and every short entry"), src.indexOf("function rbtn(")), sandbox);
  return { sandbox, body, created, run: () => timers.splice(0).forEach((t) => t.fn()) };
}

const buttons = (sheet) => sheet.children.filter((c) => c.className.indexOf("as-b") >= 0);

test("Are you sure is a bottom sheet with the text, Confirm and Cancel; Confirm runs the action once and closes it", () => {
  const p = page();
  let ran = 0;
  p.sandbox.confirmDlg("Delete the thing?", () => ran++);
  const [scrim, sheet] = p.body.children;
  assert.ok(sheet.classList.has("asheet"), "a sheet from the bottom, not a dialog in the middle");
  assert.equal(sheet.children[0].textContent, "Delete the thing?");
  assert.deepEqual(buttons(sheet).map((b) => b.textContent), ["confirm", "cancel"], "Cancel is last");
  assert.equal(sheet.classList.has("in"), true, "slides in");
  buttons(sheet)[0].click();
  assert.equal(ran, 1);
  assert.equal(sheet.classList.has("in"), false);
  p.run();
  assert.equal(sheet.removed && scrim.removed, true, "taken away after it has slid down");
});

test("Cancel and a tap outside close it without running the action", () => {
  const p = page();
  let ran = 0;
  p.sandbox.confirmDlg("Sure?", () => ran++);
  buttons(p.body.children[1])[1].click();
  p.sandbox.confirmDlg("Sure?", () => ran++);
  p.body.children[2].click();
  assert.equal(ran, 0);
  assert.equal(p.body.children[3].classList.has("in"), false, "the scrim closed the second one");
});

test("a button that names what it does (Delete) is shown as a risk", () => {
  const p = page();
  p.sandbox.confirmDlg("Delete the group?", () => {}, "Delete");
  const b = buttons(p.body.children[1])[0];
  assert.equal(b.textContent, "Delete");
  assert.match(b.className, /danger/);
  const plain = page();
  plain.sandbox.confirmDlg("Sure?", () => {});
  assert.doesNotMatch(buttons(plain.body.children[1])[0].className, /danger/, "a plain Confirm is not");
});

test("the question about unsaved changes and every other choice list use the same sheet, with Cancel last", () => {
  const p = page();
  const picked = [];
  p.sandbox.askSheet("Unsaved changes", [
    { label: "Save", fn: () => picked.push("save") },
    { label: "Discard changes", fn: () => picked.push("discard") },
  ]);
  const sheet = p.body.children[1];
  assert.ok(sheet.classList.has("asheet"));
  assert.deepEqual(buttons(sheet).map((b) => b.textContent), ["Save", "Discard changes", "cancel"]);
  buttons(sheet)[1].click();
  assert.deepEqual(picked, ["discard"]);
});

test("the TV's keyboard is a bottom sheet too: typed text is not thrown away by a tap outside, and Send sends it", () => {
  const p = page();
  const src = read("app/media.js");
  const piece = (name) => src.slice(src.indexOf("function " + name), src.indexOf("\n}\n", src.indexOf("function " + name)) + 3);
  const code = piece("textDlg") + piece("kbDlg");
  vm.runInContext(code, p.sandbox);
  const sent = [];
  p.sandbox.kbDlg((t) => sent.push(t));
  const [scrim, sheet] = p.body.children;
  assert.ok(sheet.classList.has("asheet"));
  const ta = p.created.filter((e) => e.tag === "textarea")[0];
  ta.value = "hello";
  scrim.click();
  assert.equal(sheet.classList.has("in"), true, "still open: the text would be lost");
  buttons(sheet)[0].click();
  assert.deepEqual(sent, ["hello"]);
  assert.equal(sheet.classList.has("in"), false);
  const empty = page();
  vm.runInContext(code, empty.sandbox);
  empty.sandbox.kbDlg(() => {});
  empty.body.children[0].click();
  assert.equal(empty.body.children[1].classList.has("in"), false, "nothing typed: a tap outside closes it");
});

test("no dialog opens in the middle of the screen any more: the code makes none and the style sheet has none", () => {
  const files = readdirSync(new URL("app/", FRONTEND)).filter((f) => f.endsWith(".js") && f !== "strings.js");
  for (const f of files) assert.doesNotMatch(read("app/" + f), /"dlg( pane)?"|'dlg pane'|querySelector\("\.dlg"\)/, f);
  assert.doesNotMatch(read("dashboard.css"), /\.dlg[{ ,.:]/, "no .dlg rule");
});
