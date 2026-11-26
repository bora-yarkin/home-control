// SPDX-License-Identifier: GPL-3.0-or-later
// The guided setup (app/setup.js, decision D-39): what is suggested, and that the dashboard holds only what was chosen. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (n) => readFileSync(new URL(n, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

const states = {
  "light.den_group": { attributes: { friendly_name: "Den lamps", entity_id: ["light.den_a", "light.den_b"] } },
  "light.den_a": { attributes: { friendly_name: "Den Floor" } },
  "light.den_b": { attributes: { friendly_name: "Den Shelf" } },
  "light.den_c": { attributes: { friendly_name: "Den Desk" } },
  "light.den_d": { attributes: { friendly_name: "Den Ceiling" } },
  "light.den_hidden": { attributes: {} },
  "media_player.den_tv": { attributes: { friendly_name: "Den TV" } },
  "media_player.den_tv_cast": { attributes: { friendly_name: "Den TV cast" } },
  "switch.den_childlock": { attributes: {} },
  "climate.den_ac": { attributes: {} },
  "scene.den_relax": { attributes: { friendly_name: "Den Relax" } },
  "sensor.den_t": { attributes: { device_class: "temperature" } },
  "sensor.den_signal": { attributes: { device_class: "signal_strength" } },
  "light.hall": { attributes: {} },
  "sensor.attic_t": { attributes: { device_class: "temperature" } },
};
const area = (id) => (id.includes("hall") ? "hall" : id.includes("attic") ? "attic" : "den");
const entities = Object.fromEntries(Object.keys(states).map((id) => [id, { platform: id.endsWith("_cast") ? "cast" : "x", hidden: id === "light.den_hidden" }]));

function world() {
  const ctx = vm.createContext({
    H: () => ({ states, entities, areas: { den: { name: "Den" }, hall: { name: "Hall" }, attic: { name: "Attic" } } }),
    dom: (id) => id.split(".")[0],
    areaIdOf: area,
    zoneLightIds: () => ({}),
    isVacuumMap: () => false,
    _T: (k) => k,
  });
  vm.runInContext(read("setup.js"), ctx);
  return ctx;
}

test("only what makes sense is suggested: groups rather than their lights, no cast copy, no switches, rooms with something to control", () => {
  const w = world();
  const src = w.setupSource();
  const c = w.setupDefaults(src);
  assert.equal(c.on["light.den_group"], true);
  assert.equal(c.on["light.den_a"], false);
  assert.equal(c.on["light.den_c"], true);
  assert.equal("light.den_hidden" in c.on, false);
  assert.equal(c.on["media_player.den_tv"], true);
  assert.equal(c.on["media_player.den_tv_cast"], false);
  assert.equal(c.on["switch.den_childlock"], false);
  assert.deepEqual(plain(c.rooms), { attic: false, den: true, hall: true });
  assert.equal(src.areas.find((a) => a.id === "den").items.light.find((x) => x.id === "light.den_a").name, "Floor", "the room's name is left off");
});

test("a room with enough lights has a master holding them, with only the ticked ones as rows; scenes go where chosen", () => {
  const w = world();
  const src = w.setupSource();
  const c = w.setupDefaults(src);
  c.row["light.den_d"] = true;
  assert.equal(c.scenes, "master", "scenes go in the masters unless chosen otherwise");
  c.scenes = "both";
  const ui = plain(w.setupBuild(src, c));
  assert.deepEqual(ui.rooms.map((r) => r.id), ["r_den", "r_hall"]);
  const den = ui.layout.rooms.r_den;
  assert.deepEqual(den.map((s) => s.id), ["lights", "scenes", "media", "climate"]);
  const [master, row] = den[0].devs;
  assert.equal(master.w, "lmaster");
  assert.deepEqual(master.wx.ml.map((d) => d.id).sort(), ["light.den_c", "light.den_d", "light.den_group"]);
  assert.deepEqual(master.wx.msrc, ["page", "ha:@page", "hue:@page"]);
  assert.equal(row.id, "light.den_d");
  assert.equal(den[0].devs.length, 2);
  assert.deepEqual(den[2].devs.map((d) => d.id), ["media_player.den_tv"]);
  assert.equal(ui.layout.rooms.r_hall[0].devs[0].id, "light.hall", "one light: no master");
  assert.deepEqual(ui.stat.r_den.map((t) => t.id), ["sensor.den_t"]);
  assert.equal(ui.meta.setup, undefined);
  assert.equal(JSON.stringify(ui).includes("switch.den_childlock"), false);
});

test("scenes only in the master leave no section, only in a section leave the master without them, and none leaves none", () => {
  const w = world();
  const src = w.setupSource();
  const build = (scenes, master = true) => {
    const c = w.setupDefaults(src);
    Object.assign(c, { scenes, master });
    return plain(w.setupBuild(src, c));
  };
  assert.deepEqual(build("master").layout.rooms.r_den.map((s) => s.id), ["lights", "media", "climate"]);
  assert.deepEqual(build("section").layout.rooms.r_den[0].devs[0].wx.msrc, []);
  assert.equal(JSON.stringify(build("none")).includes("scene.den_relax"), false);
  const flat = build("master", false);
  assert.deepEqual(flat.layout.rooms.r_den.map((s) => s.id).slice(0, 2), ["lights", "scenes"], "without a master the scenes still have a place");
  assert.equal(flat.layout.rooms.r_den[0].devs.every((d) => d.kind === "light"), true);
});

test("running it again keeps the header's names and a room's own name and icon", () => {
  const w = world();
  const src = w.setupSource();
  const old = { rooms: [{ id: "mine", area: "den", name: "Cave", short: "Cave", icon: "sofa" }], meta: { homeTitle: "Our home" }, ignored: ["switch.x"] };
  const ui = plain(w.setupBuild(src, w.setupDefaults(src), old));
  assert.deepEqual(ui.rooms[0], { id: "mine", area: "den", name: "Cave", short: "Cave", icon: "sofa", hide: false });
  assert.equal(ui.meta.homeTitle, "Our home");
  assert.deepEqual(ui.ignored, ["switch.x"]);
});

test("a new dashboard starts empty and asks to be set up, never with everything", () => {
  assert.match(read("store.js"), /n\.ui = cleanUI\(setupEmpty\(\)\);/);
  assert.doesNotMatch(read("model.js"), /function seedUI/);
  assert.match(read("main.js"), /if \(ISADMIN && UI\.meta && UI\.meta\.setup\) setupOpen\(\);/);
  assert.deepEqual(plain(world().setupEmpty()).rooms, []);
});
