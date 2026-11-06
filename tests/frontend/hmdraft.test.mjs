// SPDX-License-Identifier: GPL-3.0-or-later
// The edits of the Hue Plus menu are a draft for each device until that device is saved (hmdraft.js), and a staged press reads back the way the bridge writes it.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function load(...names) {
  const context = vm.createContext({ Object, Array, JSON, Date, String, Number, HP_PAGES: {}, HP_ICON: "x" });
  for (const name of names) vm.runInContext(readFileSync(new URL(name, APP), "utf8"), context);
  return context;
}

test("a staged value shows instead of the one the device has, and equal to it is no change at all", () => {
  const d = load("hmdraft.js");
  const key = d.hmdKey("light", "light.a");
  assert.equal(d.hmdValue(key, "function", "mixed"), "mixed");
  d.hmdStage(key, "function", "decorative", "mixed");
  assert.equal(d.hmdValue(key, "function", "mixed"), "decorative");
  assert.ok(d.hmdDirty(key));
  d.hmdStage(key, "function", "mixed", "mixed");
  assert.ok(!d.hmdDirty(key), "putting the old value back leaves nothing to save");
  assert.deepEqual(plain(d.hmdDirtyKeys()), []);
});

test("every device has a draft of its own", () => {
  const d = load("hmdraft.js");
  d.hmdStage(d.hmdKey("light", "light.a"), "function", "functional", "mixed");
  d.hmdStage(d.hmdKey("acc", "acc-1"), "b1|short", { what: { action: "dim_up" } });
  assert.deepEqual(plain(d.hmdDirtyKeys()).sort(), ["acc:acc-1", "light:light.a"]);
  d.hmdDiscard(d.hmdKey("light", "light.a"));
  assert.deepEqual(plain(d.hmdDirtyKeys()), ["acc:acc-1"]);
  assert.equal(d.hmdValue(d.hmdKey("light", "light.a"), "function", "mixed"), "mixed", "a discarded draft shows what the device has");
  assert.deepEqual(plain(d.hmdChanges("acc:acc-1")), { "b1|short": { what: { action: "dim_up" } } });
});

test("a saved light keeps showing what was saved until it says so itself, or for fifteen seconds", () => {
  const d = load("hmdraft.js");
  const key = d.hmdKey("light", "light.a");
  d.hmdStage(key, "function", "decorative", "mixed");
  d.hmdSaved(key);
  assert.ok(!d.hmdDirty(key), "saved: no draft any more");
  assert.equal(d.hmdValue(key, "function", "mixed"), "decorative", "the light still says mixed, the page shows what was saved");
  assert.equal(d.hmdValue(key, "function", "decorative"), "decorative");
  assert.equal(d.hmdValue(key, "function", "mixed"), "mixed", "once the light has said it, the light is believed again");
  d.hmdStage(key, "function", "functional", "mixed");
  d.hmdSaved(key);
  d.HMD_SAVED[key].function.until = Date.now() - 1;
  assert.equal(d.hmdValue(key, "function", "mixed"), "mixed", "a light that never confirms is believed after the time is up");
});

test("clearing drops every draft and every saved value", () => {
  const d = load("hmdraft.js");
  d.hmdStage("light:a", "function", "x", "y");
  d.hmdStage("light:b", "function", "x", "y");
  d.hmdSaved("light:b");
  d.hmdClear();
  assert.deepEqual(plain(d.hmdDirtyKeys()), []);
  assert.equal(d.hmdValue("light:b", "function", "y"), "y");
});

// What the Hue Plus menu reads from a press, with the way the bridge writes each kind (as the harness's dimmer has them).
const recall = (rid) => ({ action: { recall: { rid, rtype: "scene" } } });

test("a staged press has the shape the bridge writes, for every kind the menu offers", () => {
  const d = load("hmdraft.js");
  assert.deepEqual(plain(d.hmSpecFrom({ action: "dim_up" })), { action: "dim_up" });
  assert.deepEqual(plain(d.hmSpecFrom({ action: "dim_down" })), { action: "dim_down" });
  assert.deepEqual(plain(d.hmSpecFrom({ action: "all_off" })), { action: "all_off" });
  assert.deepEqual(plain(d.hmSpecFrom({ action: "home_off" })), { action: "home_off" });
  assert.deepEqual(plain(d.hmSpecFrom({ action: "do_nothing" })), { action: "do_nothing" });
  assert.deepEqual(plain(d.hmSpecFrom({ action: "scene", scene: "scene-1", with_off: true })), {
    recall_single_extended: { actions: [recall("scene-1")], with_off: { enabled: true } },
  });
  assert.deepEqual(plain(d.hmSpecFrom({ action: "scene_cycle", scenes: ["s1", "s2", "s3"], with_off: false, repeat_timeout: 5 })), {
    scene_cycle_extended: { repeat_timeout: { seconds: 5 }, slots: [[recall("s1")], [recall("s2")], [recall("s3")]], with_off: { enabled: false } },
  });
  assert.deepEqual(
    plain(d.hmSpecFrom({ action: "time_based", slots: [{ time: "07:05", scene: "s1" }, { time: "23:00", scene: "s2" }], with_off: true, repeat_timeout: 3 })),
    {
      time_based_extended: {
        repeat_timeout: { seconds: 3 },
        slots: [
          { actions: [recall("s1")], start_time: { hour: 7, minute: 5 } },
          { actions: [recall("s2")], start_time: { hour: 23, minute: 0 } },
        ],
        with_off: { enabled: true },
      },
    }
  );
});

test("the menu reads a staged press the same way as a press from the bridge", () => {
  const m = load("hmdraft.js", "huemenu.js");
  const cases = [
    [{ action: "dim_up" }, "brighten", [], false],
    [{ action: "dim_down" }, "dim", [], false],
    [{ action: "all_off" }, "off", [], false],
    [{ action: "home_off" }, "homeoff", [], false],
    [{ action: "do_nothing" }, "nothing", [], false],
    [{ action: "scene", scene: "s1", with_off: true }, "scene", ["s1"], true],
    [{ action: "scene_cycle", scenes: ["s1", "s2"], with_off: false, repeat_timeout: 2 }, "cycle", ["s1", "s2"], false],
    [{ action: "time_based", slots: [{ time: "07:00", scene: "s1" }, { time: "10:30", scene: "s2" }], with_off: true, repeat_timeout: 3 }, "time", ["s1", "s2"], true],
  ];
  for (const [what, kind, scenes, withOff] of cases) {
    const spec = m.hmSpecFrom(what);
    assert.equal(m.hmPressKind(spec), kind, kind);
    assert.deepEqual(plain(m.hmPressScenes(spec)), scenes, kind);
    assert.equal(m.hmPressWithOff(spec), withOff, kind);
  }
  assert.deepEqual(plain(m.hmTimeSlots(m.hmSpecFrom(cases[7][0]))), [{ time: "07:00", scene: "s1" }, { time: "10:30", scene: "s2" }]);
});
