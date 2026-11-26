// SPDX-License-Identifier: GPL-3.0-or-later
// A player's remote entity (app/media.js): a linked one first, and its integration gives the layout when the player's has none (a cast player with its box's remote). Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const media = readFileSync(new URL("app/media.js", root), "utf8");
const cut = (from, to) => media.slice(media.indexOf(from), media.indexOf(to));

function world(links) {
  const ctx = vm.createContext({
    window: {},
    dom: (id) => id.split(".")[0],
    H: () => ({ states: { "remote.box": {} }, devices: {}, entities: { "media_player.cast": { platform: "cast" }, "remote.box": { platform: "androidtv_remote" } } }),
    advCopies: () => [{ links }],
    rmLinks: () => [],
    sibBy: () => null,
  });
  vm.runInContext(readFileSync(new URL("integrations.js", root), "utf8"), ctx);
  ctx.Integrations = ctx.window.Integrations;
  vm.runInContext(cut("function mediaKind(", "/* Apple TV has no mute") + cut("function mediaRemoteKind(", "function mediaPopup(") + cut("function tvFamily(", "/* A remote for a TV the dashboard"), ctx);
  return ctx;
}

test("a player with no remote of its own has none until one is linked, then it is that remote's layout", () => {
  assert.equal(world([]).mediaRemoteKind("media_player.cast"), "");
  const w = world(["remote.box"]);
  assert.equal(w.tvRemoteOf("media_player.cast"), "remote.box");
  assert.equal(w.mediaRemoteKind("media_player.cast"), "android");
});
