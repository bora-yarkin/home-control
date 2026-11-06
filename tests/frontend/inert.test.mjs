// SPDX-License-Identifier: GPL-3.0-or-later
// An air conditioner that is off cannot be changed from the dashboard, and it is not greyed out. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FRONTEND = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const css = readFileSync(new URL("dashboard.css", FRONTEND), "utf8");
const climate = readFileSync(new URL("app/climate.js", FRONTEND), "utf8");

function rule(selector) {
  const match = css.match(new RegExp("(?:^|\\})\\s*" + selector.replace(".", "\\.") + "\\s*\\{([^}]*)\\}", "m"));
  assert.ok(match, "no rule for " + selector);
  return match[1];
}

test("an inert control takes no pointer input but keeps its colour and opacity", () => {
  const declarations = rule(".inert");
  assert.match(declarations, /pointer-events:\s*none/);
  assert.doesNotMatch(declarations, /opacity|filter|grayscale/);
});

test("no rule greys a control out because it is off", () => {
  assert.doesNotMatch(css, /off-dim/);
  assert.doesNotMatch(climate, /off-dim/);
});

test("the temperature dial ignores the arrow keys and leaves the tab order while the air conditioner is off", () => {
  const keydown = climate.slice(climate.indexOf('sv.addEventListener("keydown"'));
  const guard = keydown.indexOf('if (V_(id) === "off" || V_(id) === "unavailable") return;');
  const change = keydown.indexOf('call("climate", "set_temperature"');
  assert.ok(guard > 0 && change > guard, "the off check must come before the temperature is set");
  assert.match(climate, /sv\.setAttribute\("tabindex", off \? "-1" : "0"\)/);
});
