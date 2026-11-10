// SPDX-License-Identifier: GPL-3.0-or-later
// Extras bound to a device: what the layout keeps and when the intercom shows a call. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const plain = (value) => JSON.parse(JSON.stringify(value));
const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);

function model() {
  const context = vm.createContext({ Object, Array, ENTRE: /^[a-z_]+\.[a-z0-9_]+$/, iconOk: () => true, KINDS_PLACEHOLDER: 0 });
  vm.runInContext(readFileSync(new URL("model.js", APP), "utf8"), context);
  return context;
}

test("a vacuum keeps a map entity, room buttons with labels, modes and care values, only of kinds that fit", () => {
  const c = model();
  const d = plain(
    c.cleanDev({
      id: "vacuum.v",
      name: "Robot",
      icon: "vac",
      kind: "vacuum",
      vx: {
        map: "image.floor",
        rooms: [{ e: "button.clean_kitchen", l: "Kitchen" }, { e: "light.lamp" }, { e: "script.all", l: "x".repeat(40) }],
        modes: ["select.mode", "select.mode", "sensor.nope"],
        care: ["sensor.brush", "light.x"],
      },
    })
  );
  assert.equal(d.vx.map, "image.floor");
  assert.deepEqual(d.vx.rooms.map((r) => r.e), ["button.clean_kitchen", "script.all"]);
  assert.equal(d.vx.rooms[1].l.length, 24);
  assert.deepEqual(d.vx.modes, ["select.mode"]);
  assert.deepEqual(d.vx.care, ["sensor.brush"]);
  assert.equal(plain(c.cleanDev({ id: "vacuum.v", name: "R", icon: "vac", kind: "vacuum", vx: { map: "light.a" } })).vx, undefined);
});

test("a camera keeps push to talk and intercom entities that fit; a light keeps a scenes select", () => {
  const c = model();
  const cam = plain(c.cleanDev({ id: "camera.door", name: "Door", icon: "cam", kind: "camera", talk: 1, ix: { answer: "button.a", reject: "button.r", unlock: "lock.front", ring: "event.bell", bogus: "button.b" } }));
  assert.equal(cam.talk, 1);
  assert.deepEqual(cam.ix, { answer: "button.a", reject: "button.r", unlock: "lock.front", ring: "event.bell" });
  assert.equal(plain(c.cleanDev({ id: "camera.c", name: "C", icon: "cam", kind: "camera", ix: { unlock: "light.x" } })).ix, undefined);
  // The door's audio address: only an /api path of Home Assistant, never an outside address or a way out of /api.
  const listen = (value) => plain(c.cleanDev({ id: "camera.c", name: "C", icon: "cam", kind: "camera", ix: { listen: value } })).ix;
  assert.deepEqual(listen("/api/hikvision_intercom/listen/abc/def"), { listen: "/api/hikvision_intercom/listen/abc/def" });
  for (const bad of ["https://evil.example/api/x", "//evil.example/api/x", "/api/../auth/token", "/auth/token", "/api/a b", "", 5, null]) {
    assert.equal(listen(bad), undefined, String(bad));
  }
  assert.equal(plain(c.cleanDev({ id: "light.l", name: "L", icon: "light", kind: "light", sx: "select.scenes" })).sx, "select.scenes");
  assert.equal(plain(c.cleanDev({ id: "light.l", name: "L", icon: "light", kind: "light", sx: "sensor.scenes" })).sx, undefined);
  assert.equal(plain(c.cleanDev({ id: "switch.s", name: "S", icon: "plug", kind: "switch", talk: 1, vx: { map: "image.a" }, sx: "select.x" })).talk, undefined);
});

function intercom(states) {
  const context = vm.createContext({ H: () => ({ states }), dom: (id) => id.split(".")[0], Date, isFinite });
  vm.runInContext(readFileSync(new URL("profiles.js", APP), "utf8"), context);
  // The call state (idle, ringing, call) is read by doorcall.js.
  vm.runInContext(readFileSync(new URL("doorcall.js", APP), "utf8"), context);
  return context;
}

test("answer and reject show while it rings: a flag is on, an event is recent, a state is not idle; without an indicator they always show", () => {
  const recent = new Date(Date.now() - 5000).toISOString();
  const old = new Date(Date.now() - 600000).toISOString();
  const p = intercom({
    "binary_sensor.ring": { state: "on" },
    "binary_sensor.quiet": { state: "off" },
    "event.bell": { state: recent },
    "event.bell_old": { state: old },
    "sensor.call": { state: "ringing" },
    "sensor.idle": { state: "idle" },
  });
  assert.equal(p.ixRinging({}), true);
  assert.equal(p.ixRinging({ ring: "binary_sensor.ring" }), true);
  assert.equal(p.ixRinging({ ring: "binary_sensor.quiet" }), false);
  assert.equal(p.ixRinging({ ring: "event.bell" }), true);
  assert.equal(p.ixRinging({ ring: "event.bell_old" }), false);
  assert.equal(p.ixRinging({ ring: "sensor.call" }), true);
  assert.equal(p.ixRinging({ ring: "sensor.idle" }), false);
  assert.equal(p.ixRinging({ ring: "sensor.missing" }), false);
});
