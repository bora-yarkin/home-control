// SPDX-License-Identifier: GPL-3.0-or-later
// The Advanced settings buttons (decision D-38): one switch for the whole dashboard and one for a device, and every button goes through both. This broke once (0.19.0 removed the
// checks and left the switch); these tests are what keeps it from happening again. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const cut = (src, from, to) => {
  assert.ok(src.includes(from) && src.includes(to), `${from} … ${to}`);
  return src.slice(src.indexOf(from), src.indexOf(to));
};

function world(devs, over = {}) {
  const ctx = vm.createContext({
    ISADMIN: true,
    UI: { meta: {} },
    allSectionLists: () => [[{ devs: devs.slice(0, 1) }], [{ devs: devs.slice(1) }]],
    ...over,
  });
  vm.runInContext(cut(read("advanced.js"), "function advAllOff()", "function advList(id)"), ctx);
  ctx.advList = (id) => (id === "switch.nothing" ? [] : ["number.x"]);
  return ctx;
}

test("a button is there for an administrator when there is something behind it", () => {
  const w = world([]);
  assert.equal(w.advButton("light.a"), true);
  assert.equal(w.advButton("switch.nothing"), false);
  assert.equal(world([], { ISADMIN: false }).advButton("light.a"), false);
});

test("the whole dashboard's switch takes every button away, and gives them back", () => {
  const w = world([]);
  w.UI.meta.noadv = 1;
  assert.equal(w.advButton("climate.ac"), false);
  delete w.UI.meta.noadv;
  assert.equal(w.advButton("climate.ac"), true);
});

test("a device's switch is that device's only, wherever it is on the pages", () => {
  const w = world([{ id: "climate.ac" }, { id: "climate.ac", noadv: 1 }, { id: "media_player.tv" }]);
  assert.equal(w.advDevOff("climate.ac"), true, "off on its second page is off");
  assert.equal(w.advDevOff("media_player.tv"), false);
  assert.equal(w.advCopies("climate.ac").length, 2);
});

test("every file that opens Advanced settings asks the one check; a new button must be added here", () => {
  const sites = {
    "popups.js": /if \(advButton\(ent\) && !advDevOff\(ent\)\) \{/,
    "camera.js": /if \(advButton\(id\) && !advDevOff\(id\)\) \{/,
    "appliancevac.js": /if \(vacuum && !d\.noadv && advButton\(vacuum\)\)/,
    "remotemaster.js": /return [^\n]*!x\.noadv && !rmOpt\(x, id\)\.noadv && !rmAdvOffOnPage\(id\) && advButton\(id\);/,
  };
  const files = readdirSync(APP).filter((f) => f.endsWith(".js"));
  const opens = files.filter((f) => /showPopup\("adv:/.test(read(f)));
  assert.deepEqual(opens.sort(), Object.keys(sites).sort());
  for (const [file, check] of Object.entries(sites)) {
    assert.match(read(file), check, file);
    assert.equal((read(file).match(/showPopup\("adv:/g) || []).length, 1, file + ": one button, one check");
  }
});

test("both switches are on screen, and the dashboard's is kept when the dashboard is saved", () => {
  assert.match(read("settings.js"), /pill\("tune", _T\("advanced_settings_buttons_on_devices"\)[\s\S]{0,400}UI\.meta\.noadv = 1/);
  assert.doesNotMatch(read("settings.js"), /prefPill\([^)]*"adv"/, "not a person's preference: nothing reads those");
  assert.match(read("manage.js"), /sw\.appendChild\(advDevicePill\(d\)\)/);
  const model = read("model.js");
  const ctx = vm.createContext({ _T: (k) => k, cleanHdr: () => [] });
  vm.runInContext(cut(model, "function cleanMeta(", "function cleanHdr("), ctx);
  assert.equal(ctx.cleanMeta({ noadv: 1 }).noadv, 1);
  assert.equal("noadv" in ctx.cleanMeta({}), false, "shown by default");
});
