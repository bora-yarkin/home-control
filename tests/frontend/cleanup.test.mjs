// SPDX-License-Identifier: GPL-3.0-or-later
// Settings that were taken away stay away, and keyboard use works without a setting.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const all = ["editor.js", "settings.js", "appearance.js", "backups.js", "manage.js", "popups.js", "lights.js", "lightpanel.js", "wall.js", "store.js", "model.js", "glance.js"].map(read).join("\n");

test("the colour wheel, the colour slider and the popup colour are not settings any more", () => {
  assert.doesNotMatch(all, /nowheel|LWHEEL|lpSliders|lightColourRow|\bpopFill\(/);
  assert.doesNotMatch(read("glance.js"), /light_colour_in_popups/);
});

test("the separate colour and white option of a light is gone", () => {
  assert.doesNotMatch(all, /lpSplit|lzone|"split"|\.split\)/);
});

test("automatic backups, page export and import, hidden sections list and the layout check are gone", () => {
  assert.doesNotMatch(all, /bkAdd|bkAutoPage|manage-autobackup|pageExportFile|pageImportFile|manage-check|lcAudit|hidden_sections/);
});

test("Tab and Enter work without a setting: every control is reachable and pressable", () => {
  const appearance = read("appearance.js");
  assert.doesNotMatch(appearance + read("wall.js"), /PREFS\.a11y|KBD/);
  assert.match(appearance, /function a11yScan\(\) \{\s*var n = document\.querySelectorAll/);
  assert.match(read("wall.js"), /getAttribute\("role"\) === "button"[\s\S]*el\.click\(\)/);
});

test("the page version shown in Settings is the integration's, given to the panel by Home Assistant, not a number kept in the code", () => {
  assert.doesNotMatch(read("widgets.js"), /var BUILD/);
  assert.match(read("widgets.js"), /window\.HC_RELEASE/);
  assert.match(readFileSync(new URL("../../custom_components/home_control/frontend/dashboard-panel.js", import.meta.url), "utf8"), /set panel\(value\)/);
  assert.match(readFileSync(new URL("../../custom_components/home_control/__init__.py", import.meta.url), "utf8"), /config=\{"release": await hass\.async_add_executor_job\(_release_version\)\}/);
});

test("the section's settings have no lights master rows: the master's settings are opened from the master", () => {
  const editor = read("editor.js");
  assert.doesNotMatch(editor, /lights_master_settings|lmaster-edit|lmaster-new/);
});

test("every file of the dashboard is valid JavaScript, so one slip in a long list of strings cannot stop the whole page", async () => {
  const { Script } = await import("node:vm");
  const files = JSON.parse(readFileSync(new URL("../../custom_components/home_control/frontend/version.json", import.meta.url), "utf8")).files;
  for (const f of files) {
    const text = readFileSync(new URL("../../custom_components/home_control/frontend/" + f, import.meta.url), "utf8");
    assert.doesNotThrow(() => new Script(text, { filename: f }), f);
  }
});
