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

test("columns: a page has Auto or 1 to 4 sections side by side, a section has Auto or 1 to 4 columns of items, and there is no section width or all-off button", () => {
  const editor = read("editor.js");
  assert.match(editor, /\["0", "1", "2", "3", "4"\]/);
  assert.match(editor, /\["auto", "list", "grid2", "grid3", "grid4"\]/);
  assert.doesNotMatch(editor, /half_width|turn_all_off_button|noall/);
  const model = read("model.js");
  assert.match(model, /c === 1 \|\| c === 2 \|\| c === 3 \|\| c === 4/);
  assert.match(model, /if \(layCols\(s\.lay\)\) o\.lay = s\.lay;/);
  assert.doesNotMatch(model, /s\.w\b|noall/);
  assert.doesNotMatch(read("sections.js"), /secWide|noall|turn_all_lights/);
  const vm = require_vm();
  const ctx = vm.createContext({});
  vm.runInContext(read("sections.js").match(/function layCols\(lay\) \{[\s\S]*?\n\}/)[0], ctx);
  assert.equal(ctx.layCols("list"), 1);
  assert.equal(ctx.layCols("grid4"), 4);
  assert.equal(ctx.layCols("nonsense"), 0);
});

function require_vm() {
  return globalThis.__vm || (globalThis.__vm = vmModule);
}
import vmModule from "node:vm";
