// SPDX-License-Identifier: GPL-3.0-or-later
// Every text the dashboard asks for exists (app/strings.js): a key deleted by mistake leaves a button with no words on it. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
/* a plugin may give this one; the code has a fallback */
const OPTIONAL = new Set(["scene_kind_plugin"]);

test("every text asked for by name is in the strings", () => {
  const strings = readFileSync(new URL("strings.js", APP), "utf8");
  const have = new Set([...strings.matchAll(/^ {2}"?([A-Za-z0-9_]+)"?\s*:/gm)].map((m) => m[1]));
  const missing = [];
  for (const file of readdirSync(APP).filter((f) => f.endsWith(".js") && f !== "strings.js")) {
    const src = readFileSync(new URL(file, APP), "utf8");
    for (const m of src.matchAll(/_T\(\s*"([A-Za-z0-9_]+)"\s*\)/g)) if (!have.has(m[1]) && !OPTIONAL.has(m[1])) missing.push(file + ": " + m[1]);
  }
  assert.deepEqual(missing, []);
});
