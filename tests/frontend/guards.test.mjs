// SPDX-License-Identifier: GPL-3.0-or-later
// Everything that saves does it the same way: a checkmark next to the close button, and closing with changes that are not saved asks. (The Hue Plus menu's own checks are in Hue Plus.)
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");

test("everything that saves does it the same way: a checkmark next to the close button, and closing asks", () => {
  const popups = read("popups.js");
  const asks = read("scenenew.js");
  assert.match(popups, /function popupCheck\(guard\)/);
  assert.match(popups, /POPHEAD = h;\s*def\.build\(body\);/, "the header is known to the page that is built");
  assert.match(popups, /h\.insertBefore\(c, h\.lastChild\)/, "the checkmark sits next to the close button");
  assert.match(asks, /if \(!o\.inner\) popupCheck\(guard\);/);
  // No popup swaps its close button for a tick, and nothing closes a popup around the question.
  assert.doesNotMatch(popups, /def\.tick|SHEETGUARD/);
  // Every place that saves goes through guardUnsaved: the scene editors, the area editor, the light editor and the Hue Plus menu.
  for (const file of ["staticmaker.js", "livemaker.js", "areas.js", "lighteditor.js"]) assert.match(read(file), /guardUnsaved\(/, `${file} does not use guardUnsaved`);
  // The big Save buttons of those places are gone.
  const everything = readdirSync(APP).filter((f) => f.endsWith(".js") && f !== "strings.js").map(read).join("\n");
  for (const key of ["save_scene", "save_area", "hm_save_to_the_bridge", "hm_save", "hm_unsaved_note"]) assert.doesNotMatch(everything, new RegExp(`_T\\("${key}"\\)`), `${key} is still shown`);
});

