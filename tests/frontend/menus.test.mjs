// SPDX-License-Identifier: GPL-3.0-or-later
// A dropdown closes on a second tap of what opened it, and the Media popup lists the remotes (app/widgets.js, app/media.js). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (n) => readFileSync(new URL("../../custom_components/home_control/frontend/app/" + n, import.meta.url), "utf8");
const cut = (src, from, to) => {
  assert.ok(src.includes(from) && src.includes(to), from);
  return src.slice(src.indexOf(from), src.indexOf(to));
};

test("a tap on what opened a menu closes it and takes the click that would open it again, whatever it is", () => {
  const listeners = [];
  let closed = 0;
  const anchor = { contains: (t) => t === "inside" };
  const ctx = vm.createContext({
    MENU: { contains: () => false },
    MENU_ANCHOR: anchor,
    closeMenu: () => closed++,
    setTimeout: () => 1,
    clearTimeout() {},
    document: { addEventListener: (n, f) => listeners.push(f), removeEventListener: (n, f) => listeners.splice(listeners.indexOf(f), 1) },
  });
  vm.runInContext(cut(read("widgets.js"), "function menuAway(", "function closeMenu("), ctx);
  ctx.menuAway({ target: "inside" });
  assert.equal(closed, 1);
  let taken = 0;
  listeners[0]({ target: "inside", stopPropagation: () => taken++, preventDefault() {} });
  assert.equal(taken, 1);
  assert.equal(listeners.length, 0, "only the one click");
  ctx.menuAway({ target: "elsewhere" });
  assert.equal(listeners.length, 0, "a tap elsewhere takes nothing");
  for (const f of ["widgets.js", "icons.js"]) assert.doesNotMatch(read(f), /_noopen/);
});

test("the Media popup's remotes: masters and built remotes of visible rooms and sections", () => {
  const master = { kind: "widget", w: "rmaster", wid: "w1", wx: { def: "media_player.tv" } };
  const ctx = vm.createContext({
    UIROOM: { den: {} },
    UI: { layout: { home: [], rooms: { den: [{ id: "media", devs: [master, { kind: "remote", rid: "r1" }, { ...master, wid: "w2", hide: 1 }, { kind: "widget", w: "rmaster", wid: "w3", wx: {} }] }, { id: "off", hide: true, devs: [master] }], gone: [{ id: "m", devs: [master] }] } } },
    rmExists: () => true,
    rmVisible: () => true,
    remoteRow: (d) => "remote " + d.rid,
    remoteMasterRow: (d, key) => "master " + key,
  });
  vm.runInContext(cut(read("media.js"), "function hubRemotes()", "function mediaHub("), ctx);
  assert.deepEqual(Array.from(ctx.hubRemotes(), (r) => r.room + ": " + r.row()), ["den: master den:media:w1", "den: remote r1"]);
});
