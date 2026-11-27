// The vacuum card's Start (app/vacuum.js) passes the permission gate once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../custom_components/home_control/frontend/app/vacuum.js", import.meta.url), "utf8");
const start = src.slice(src.indexOf("function rbStart()"), src.indexOf("function robotCard("));

test("Start goes through the gate once, at once or after a confirmation", async () => {
  for (const later of [false, true]) {
    let asked = 0,
      ran = 0,
      held;
    const ctx = vm.createContext({
      RBV: "vacuum.robot",
      gate: (ids, proceed) => {
        if (++asked > 1) throw new Error("asked again");
        if (later) held = proceed;
        else proceed();
        return !later;
      },
      rbResolve: () => ran++,
      rbTrack: () => {},
      H: () => null,
    });
    vm.runInContext(start, ctx);
    const settled = ctx.rbStart();
    assert.equal(typeof settled.then, "function", "the button waits on it");
    if (later) {
      assert.equal(ran, 0, "nothing runs before the confirmation");
      held();
    }
    assert.equal(asked, 1);
    assert.equal(ran, 1);
    await settled;
  }
});
