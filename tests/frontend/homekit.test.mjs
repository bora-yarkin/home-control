// SPDX-License-Identifier: GPL-3.0-or-later
// The devices on the HomeKit Bridge (decision D-24): what each kind of device is shown as, the TV's Home key, and the pairing picture. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const frontend = (file) => readFileSync(new URL("../../custom_components/home_control/frontend/" + file, import.meta.url), "utf8");
const source = frontend("app/homekit.js");
const logic = source;
const json = (v) => JSON.parse(JSON.stringify(v));

function world({ states = {}, devices = [], bridge = { entry_id: "hk", exposed: {}, listed: [] }, tv = {}, entities = {}, devs = {}, siblings = [], homeCall = () => null } = {}) {
  const log = [];
  const toasts = [];
  const sandbox = {
    Object,
    Promise,
    String,
    SHARE: { bridge, tv, published: {} },
    S: (id) => states[id],
    A: (id) => (states[id] || {}).attributes || {},
    dom: (id) => id.split(".")[0],
    H: () => ({ entities, devices: devs }),
    devsOf: () => devices,
    shareItems: () => [],
    sibBy: (id, test) => (siblings.filter(test)[0] || {}).entity_id || null,
    Integrations: { media: { homeCall } },
    toast: (t) => toasts.push(t),
    shareFail: (e) => toasts.push("failed: " + e.message),
    _T: (k) => k,
    HA: {
      sharing: {
        expose: (entry, id, on, type) => {
          log.push(type === undefined ? ["expose", id, on] : ["expose", id, on, type]);
          return Promise.resolve({ changed: true });
        },
        setTvHome: (id, call) => {
          log.push(["setTvHome", id, call]);
          return Promise.resolve({ calls: call ? { [id]: call } : {} });
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(logic, sandbox);
  return { w: sandbox, log, toasts };
}

const on = (attributes = {}) => ({ state: "on", attributes });

test("each kind of device is shown to HomeKit as what it is: an air conditioner a heater cooler, an air purifier an air purifier, a fan a fan, a TV a TV", () => {
  const states = {
    "light.lamp": on(),
    "media_player.tv": on(),
    "media_player.sound": on(),
    "climate.ac": on(),
    "fan.purifier": on(),
    "fan.desk": on(),
    "cover.blind": on(),
    "lock.door": on(),
    "switch.kettle": on(),
    "sensor.temp": on({ device_class: "temperature" }),
    "sensor.power": on({ device_class: "power" }),
  };
  const { w } = world({ states });
  const classify = (d) => json(vm.runInContext("hkClassify", w)(d));
  const pick = (d) => {
    const it = classify(d);
    return it && [it.group, it.type, it.tv];
  };
  assert.deepEqual(pick({ id: "light.lamp", kind: "light" }), ["lights", "", false]);
  assert.deepEqual(pick({ id: "media_player.tv", kind: "media", dt: "tv" }), ["tvs", "", true]);
  assert.deepEqual(pick({ id: "media_player.sound", kind: "media", dt: "speaker" }), ["tvs", "", false]);
  assert.deepEqual(pick({ id: "climate.ac", kind: "climate" }), ["climate", "heater_cooler", false]);
  assert.deepEqual(pick({ id: "fan.purifier", kind: "fan", dt: "purifier" }), ["purifiers", "air_purifier", false]);
  assert.deepEqual(pick({ id: "fan.desk", kind: "fan", dt: "fan" }), ["fans", "fan", false]);
  assert.deepEqual(pick({ id: "cover.blind", kind: "cover" }), ["covers", "", false]);
  assert.deepEqual(pick({ id: "lock.door", kind: "lock" }), ["locks", "", false]);
  assert.deepEqual(pick({ id: "switch.kettle", kind: "switch" }), ["switches", "", false]);
  assert.deepEqual(pick({ id: "sensor.temp", kind: "sensor" }), ["sensors", "", false]);
  assert.equal(classify({ id: "sensor.power", kind: "sensor" }), null, "a power reading is not something HomeKit shows");
  assert.equal(classify({ id: "light.gone", kind: "light" }), null, "a device that does not exist is not offered");
  assert.equal(classify({ id: "camera.door", kind: "camera" }), null);
});

test("the page offers each device of the dashboard once and the entities added from the list, not scenes", () => {
  const states = { "light.lamp": on(), "switch.extra": on(), "scene.evening": on(), "sensor.pm": on({ device_class: "pm25" }) };
  const { w } = world({
    states,
    devices: [{ id: "light.lamp", kind: "light", name: "Lamp" }, { id: "light.lamp", kind: "light", name: "Lamp again" }],
    bridge: { entry_id: "hk", exposed: {}, listed: ["light.lamp", "switch.extra", "scene.evening", "sensor.pm", "light.missing"] },
  });
  const names = json(vm.runInContext("hkDevices()", w)).map((i) => [i.group, i.name]);
  assert.deepEqual(names.sort(), [["lights", "Lamp"], ["other", "switch.extra"], ["other", "sensor.pm"]].sort());
});

test("adding a TV puts it on the bridge and gives it its Home key; taking it off takes the key away; a TV with no Home key is still added", async () => {
  const call = ["remote", "send_command", { entity_id: "remote.tv", command: "HOME" }];
  const { w, log } = world({ homeCall: () => call });
  const tv = { entity: "media_player.tv", tv: true, type: "" };
  await new Promise((done) => vm.runInContext("hkSetDevice", w)(tv, true, done));
  assert.deepEqual(json(log), [["expose", "media_player.tv", true], ["setTvHome", "media_player.tv", { domain: "remote", service: "send_command", data: { entity_id: "remote.tv", command: "HOME" } }]]);
  log.length = 0;
  await new Promise((done) => vm.runInContext("hkSetDevice", w)(tv, false, done));
  assert.deepEqual(json(log), [["expose", "media_player.tv", false], ["setTvHome", "media_player.tv", null]]);
  const none = world({ homeCall: () => null });
  await new Promise((done) => vm.runInContext("hkSetDevice", none.w)(tv, true, done));
  assert.deepEqual(json(none.log), [["expose", "media_player.tv", true]]);
});

test("a device that can be more than one accessory is added as the one the page says, and a plain device without a type", async () => {
  const { w, log } = world();
  await new Promise((done) => vm.runInContext("hkSetDevice", w)({ entity: "climate.ac", type: "heater_cooler" }, true, done));
  await new Promise((done) => vm.runInContext("hkSetDevice", w)({ entity: "light.lamp", type: "" }, true, done));
  assert.deepEqual(json(log), [["expose", "climate.ac", true, "heater_cooler"], ["expose", "light.lamp", true]]);
});

test("with no bridge nothing is added, and the person is told", () => {
  const { w, log, toasts } = world({ bridge: null });
  vm.runInContext("hkSetDevice", w)({ entity: "light.lamp" }, true, () => assert.fail("nothing to do"));
  assert.deepEqual(json(toasts), ["share_no_bridge_short"]);
  assert.deepEqual(log, []);
});

test("the Home key of a TV is the call its integration's remote has for Home, found from the media player's own remote", () => {
  const seen = [];
  const { w } = world({
    entities: { "media_player.tv": { platform: "samsungtv_smart", device_id: "d1" } },
    devs: { d1: { model: "QN90" } },
    siblings: [{ entity_id: "sensor.x" }, { entity_id: "remote.tv" }],
    homeCall: (platform, model, media, remote) => {
      seen.push([platform, model, media, remote]);
      return ["remote", "send_command", { entity_id: remote, command: "KEY_HOME" }];
    },
  });
  assert.deepEqual(json(vm.runInContext("hkHomeCall('media_player.tv')", w)), { domain: "remote", service: "send_command", data: { entity_id: "remote.tv", command: "KEY_HOME" } });
  assert.deepEqual(json(seen), [["samsungtv_smart", "QN90", "media_player.tv", "remote.tv"]]);
});

test("only the pairing picture of the bridge is shown, never another address", () => {
  const { w } = world();
  const ok = vm.runInContext("hkQrOk", w);
  assert.equal(ok("/api/homekit/pairingqr?01M87HRF6CFTK4DW-89ef01"), true, "an entry id is upper case letters and digits, the secret is hex");
  for (const bad of ["https://evil.example/qr.png", "//evil.example/x", "/api/homekit/pairingqr?x\"onerror=1", "/api/other?a-b", "javascript:alert(1)", "", null, 5]) assert.equal(ok(bad), false, String(bad));
});

test("Home Control's integrations file says which key is Home for the native TV remotes and the families", async () => {
  const sandbox = { window: {}, setTimeout, Promise, console };
  vm.createContext(sandbox);
  vm.runInContext(frontend("integrations.js"), sandbox);
  const { media } = sandbox.window.Integrations;
  assert.deepEqual(json(media.homeCall("samsungtv_smart", "", "media_player.tv", "remote.tv")), ["remote", "send_command", { entity_id: "remote.tv", command: "KEY_HOME" }]);
  assert.deepEqual(json(media.homeCall("androidtv_remote", "", "media_player.tv", "remote.tv")), ["remote", "send_command", { entity_id: "remote.tv", command: "HOME" }]);
  assert.deepEqual(json(media.homeCall("apple_tv", "Apple TV 4K", "media_player.tv", "remote.tv")), ["remote", "send_command", { entity_id: "remote.tv", command: "home" }]);
  assert.deepEqual(json(media.homeCall("webostv", "", "media_player.lg", "")), ["webostv", "button", { entity_id: "media_player.lg", button: "HOME" }]);
  assert.deepEqual(json(media.homeCall("roku", "", "media_player.roku", "remote.roku")), ["remote", "send_command", { entity_id: "remote.roku", command: "home" }]);
  assert.equal(media.homeCall("samsungtv_smart", "", "media_player.tv", ""), null, "no remote to send it to");
  assert.equal(media.homeCall("unknown_platform", "", "media_player.tv", "remote.tv"), null);
  assert.equal(media.homeCall("apple_tv", "HomePod mini", "media_player.pod", "remote.pod"), null, "a HomePod is not a TV");
});
