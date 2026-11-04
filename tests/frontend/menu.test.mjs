// SPDX-License-Identifier: GPL-3.0-or-later
// The options of a dropdown come from devices (a select entity's options, a climate's modes): they are shown as text, never as markup.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

class Element {
  constructor() {
    this.children = [];
    this.classList = { add() {}, contains: () => false };
    this.style = { setProperty() {} };
    this.className = "";
    this.innerHTML = "";
    this.textContent = "";
    this.offsetHeight = this.offsetWidth = 100;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  addEventListener() {}
}

function openMenuWith(options) {
  const body = new Element();
  const context = vm.createContext({
    Object,
    Array,
    String,
    Math,
    document: { body, createElement: () => new Element(), addEventListener() {} },
    window: { innerWidth: 400, innerHeight: 800 },
    setTimeout: () => 0,
    closeMenu() {},
    cap: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),
  });
  vm.runInContext(readFileSync(new URL("core.js", APP), "utf8").match(/function mk\(t, c, h\) \{[\s\S]*?\n\}\n/)[0], context);
  vm.runInContext(readFileSync(new URL("widgets.js", APP), "utf8").match(/function openMenu\([\s\S]*?\n\}\n/)[0], context);
  const anchor = Object.assign(new Element(), { getBoundingClientRect: () => ({ left: 0, width: 100, bottom: 10, top: 0 }) });
  context.openMenu(anchor, options, options[0], () => {});
  return body.children[0].children;
}

test("a menu option with markup in it is shown as text and creates no element", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const [item] = openMenuWith([hostile]);
  assert.equal(item.textContent, hostile); // capitalising leaves a leading "<" alone
  assert.equal(item.innerHTML, "");
});

test("plain options are capitalised as before", () => {
  const [item] = openMenuWith(["cool"]);
  assert.equal(item.textContent, "Cool");
});
