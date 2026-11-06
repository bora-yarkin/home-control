// SPDX-License-Identifier: GPL-3.0-or-later
// The Hue Plus menu in Settings (huemenu.js): every page it opens exists, every text it uses is defined, and nothing a bridge or a device names is put into the page as markup.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
    hm_kind_: ["brighten", "dim", "off", "nothing", "scene", "cycle", "time"],
  };
  for (const [prefix, values] of Object.entries(families))
    for (const value of values) assert.ok(strings.includes(`"${prefix}${value}":`), `${prefix}${value} has no text`);
  for (const value of ["safety", "last_on_state", "powerfail", "custom"]) assert.ok(strings.includes(`"hm_pw_${value}_sub":`), `hm_pw_${value}_sub has no text`);
  for (const value of ["scene_cycle", "single_scene", "brighten", "dim", "lights_off", "do_nothing"]) assert.ok(strings.includes(`"hm_${value}_sub":`), `hm_${value}_sub has no text`);
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

test("a page never writes a setting of a device: only saving a device's draft does", () => {
  // The settings of a light, a switch, a MotionAware area and an entertainment area are staged and sent by hmSaveLight, hmSaveSwitch, hmSaveMotion and hmSaveArea; no other function of the menu may send them.
  const writes = [
    ...menu.matchAll(/(?:hpCall|call|callRaw)\(\s*"(hue_plus|select)",\s*"(configure_light|configure_button|set_motion_area|select_option|set_streaming_end_state|update_entertainment_area)"/g),
  ];
  assert.ok(writes.length >= 6, "the device writes are all there");
  for (const match of writes) {
    const owner = [...menu.slice(0, match.index).matchAll(/^function (\w+)/gm)].pop()[1];
    assert.match(owner, /^hmSave(Light|Switch|Motion|Area)$/, `${match[2]} is sent from ${owner}`);
  }
});

test("the menu is read once when it opens, and every page draws from that", () => {
  assert.equal([...menu.matchAll(/Integrations\.hueplus\.resources\(HM_KINDS\)/g)].length, 1);
  assert.doesNotMatch(menu, /hmFetch/);
  // The pages that act at once read only their own kinds again; none of them reads on opening.
  assert.match(menu, /if \(HM_READY\) show\(\);/);
});

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
  for (const file of ["staticmaker.js", "livemaker.js", "areas.js", "lighteditor.js", "huemenu.js"]) assert.match(read(file), /guardUnsaved\(/, `${file} does not use guardUnsaved`);
  // The big Save buttons of those places are gone.
  const everything = readdirSync(APP).filter((f) => f.endsWith(".js") && f !== "strings.js").map(read).join("\n");
  for (const key of ["save_scene", "save_area", "hm_save_to_the_bridge", "hm_save", "hm_unsaved_note"]) assert.doesNotMatch(everything, new RegExp(`_T\\("${key}"\\)`), `${key} is still shown`);
  assert.doesNotMatch(menu, /hmSaveBar|hmLeave/);
});

test("a device of the menu asks when it is left with changes that are not saved, on its page and on the pages that choose its settings", () => {
  for (const [page, inner] of [["hmLight", false], ["hmSwitch", false], ["hmMotionArea", false], ["hmArea", false]])
    assert.match(menu, new RegExp(`function ${page}\\(b, id\\) \\{\\s*hmBox\\(b\\);\\s*hmGuard\\(hmdKey\\("[a-z]+", id\\)\\);`), `${page} is not a guarded device`);
  for (const page of ["hmButtonPage", "hmPress", "hmScenePick", "hmCycle", "hmTimePage", "hmCycleSlot", "hmTimeSlot", "hmEnd", "hmEndScene", "hmPerf"])
    assert.match(menu, new RegExp(`function ${page}\\(b, id\\) \\{\\s*hmBox\\(b\\);\\s*hmGuard\\([^;]*, true\\);`), `${page} is not an inner page of a device`);
  assert.match(menu, /var cfg = HM_PICKS\[kind\],\s*key = hmdKey\("light", id\);\s*hmGuard\(key, true\);/);
});

test("the draft code loads before the menu that uses it", () => {
  const files = JSON.parse(readFileSync(new URL("../version.json", APP), "utf8")).files;
  assert.ok(files.includes("app/hmdraft.js"));
  assert.ok(files.indexOf("app/hmdraft.js") < files.indexOf("app/huemenu.js"));
  assert.ok(files.indexOf("app/popups.js") < files.indexOf("app/huemenu.js"));
});

test("every function and variable of the menu and its drafts that is used is defined somewhere", () => {
  // The menu's own helpers (hm..., hp..., hmd..., HM...) are global; a helper that was removed while a page still calls it only fails when that page is opened.
  const files = readdirSync(APP).filter((f) => f.endsWith(".js") && f !== "strings.js");
  const all = files.map(read).join("\n");
  const defined = new Set([...all.matchAll(/(?:^|\n)\s*(?:function\s+([A-Za-z_]\w*)|var\s+([A-Za-z_]\w*)\s*=)/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
  const used = new Set();
  for (const file of ["huemenu.js", "hmdraft.js", "hueplus.js"])
    for (const m of read(file).replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/"(?:[^"\\\n]|\\.)*"/g, '""').matchAll(/(?<![.\w$])((?:hm|hp|hmd|HM|HP)[A-Za-z0-9_]*)\s*\(/g)) used.add(m[1]);
  assert.ok(used.size > 40);
  for (const name of used) assert.ok(defined.has(name), `${name} is called but defined nowhere`);
});
