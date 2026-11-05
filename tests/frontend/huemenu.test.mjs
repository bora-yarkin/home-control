// SPDX-License-Identifier: GPL-3.0-or-later
// The Hue Plus menu in Settings (huemenu.js): every page it opens exists, every text it uses is defined, and nothing a bridge or a device names is put into the page as markup.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const menu = read("huemenu.js");
const strings = read("strings.js");
const pages = new Set([...(menu + read("hueplus.js")).matchAll(/HP_PAGES\["([a-z-]+)"\]\s*=|^\s*"([a-z-]+)": \[/gm)].map((m) => m[1] || m[2]));

test("every page the menu opens is defined", () => {
  const opened = [...menu.matchAll(/(?:tap: |showPopup\()"(hue-[a-z]+|stg-hue)(?::|")/g)].map((m) => m[1]);
  assert.ok(opened.length > 10);
  for (const key of opened) assert.ok(pages.has(key), `${key} is opened but has no page`);
});

test("every text of the menu is defined", () => {
  const keys = new Set([...menu.matchAll(/_T\("([a-z0-9_]+)"\)/g)].map((m) => m[1]));
  for (const key of keys) assert.ok(strings.includes(`"${key}":`), `${key} has no text`);
  // The texts built from a value of the bridge or of an entity: every value the menu offers has its own.
  const families = {
    hm_fn_: ["decorative", "functional", "mixed"],
    fn_: ["decorative", "functional", "mixed"],
    hm_pw_: ["safety", "last_on_state", "powerfail", "custom"],
    hm_end_: ["last_state", "off", "pause", "scene"],
    end_: ["last_state", "off", "pause", "scene"],
    hm_: ["horizontal", "vertical", "forward", "reversed"],
    hp_: ["sunrise", "sunset", "no_effect"],
  };
  for (const [prefix, values] of Object.entries(families))
    for (const value of values) assert.ok(strings.includes(`"${prefix}${value}":`), `${prefix}${value} has no text`);
  for (const value of ["safety", "last_on_state", "powerfail", "custom"]) assert.ok(strings.includes(`"hm_pw_${value}_sub":`), `hm_pw_${value}_sub has no text`);
});

test("the menu puts no name of a device or of the bridge into the page as markup", () => {
  // Markup is only a fixed string and an icon; the only names allowed besides are the switches of a row (is there a toggle, a tick, an arrow, an icon).
  const allowed = new Set(["o", "icon", "toggle", "check", "key", "svg"]);
  const risky = [...menu.matchAll(/innerHTML\s*=\s*([^;]+);/g)]
    .map((m) => m[1].replace(/"(?:[^"\\]|\\.)*"/g, "S"))
    .flatMap((v) => v.match(/[A-Za-z_]+/g) || [])
    .filter((word) => word !== "S" && !allowed.has(word));
  assert.deepEqual(risky, []);
  const calls = [];
  for (let at = menu.indexOf("mk("); at >= 0; at = menu.indexOf("mk(", at + 1)) {
    let depth = 0,
      i = at + 2,
      quote = null;
    const args = [];
    let from = i + 1;
    for (; i < menu.length; i++) {
      const c = menu[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          args.push(menu.slice(from, i));
          break;
        }
      } else if (c === "," && depth === 1) {
        args.push(menu.slice(from, i));
        from = i + 1;
      }
    }
    if (args.length >= 3) calls.push(args[2].trim());
  }
  assert.ok(calls.length > 0);
  for (const html of calls)
    assert.ok(/^("[^"]*"|svg\("[a-z]+"\))(\s*\+\s*(svg\("[a-z]+"\)|svg\(icon\)|"[^"]*"))*$/.test(html), `markup from ${html}`);
});
