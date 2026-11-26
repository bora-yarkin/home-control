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
    for (const m of src.matchAll(/_T\(\s*"([A-Za-z0-9_]+)"\s*[,)]/g)) if (!have.has(m[1]) && !OPTIONAL.has(m[1])) missing.push(file + ": " + m[1]);
  }
  assert.deepEqual(missing, []);
});

// A sentence is one key with its places ({x}), so a language can put them in its own order; no file writes text of its own.
test("no file writes its own user-facing text", () => {
  const allowed = /(^use strict$)|update$|^(Enter|Escape|Tab)$/;
  const bad = [];
  for (const name of readdirSync(APP).filter((f) => f.endsWith(".js") && f !== "strings.js")) {
    const src = readFileSync(new URL(name, APP), "utf8");
    // a capitalised sentence of three words or more, given directly as a text
    for (const m of src.matchAll(/(?:textContent\s*=\s*|toast\(|confirmDlg\(|hintRow\(|pill\([^,()]+,\s*)"([A-Z][a-z]+(?: [a-z]+){1,}[.?]?)"/g))
      if (!allowed.test(m[1])) bad.push(`${name}: ${m[1]}`);
    for (const m of src.matchAll(/_T\("[a-z0-9_]+"\) \+ " [a-z]/g)) bad.push(`${name}: glued ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});
