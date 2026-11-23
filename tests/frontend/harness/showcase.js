/* Invented devices of every kind the dashboard supports, for looking at their popups. `?showcase=1` adds them (and the kit of kit.js); `await buildShowcase()` then makes a page "Showcase"
   and puts one of each kind on it through the same code the Add popup and the appliance and remote builders use. Names and ids are invented. */

function s(entity_id, value, attributes = {}) {
  const now = new Date().toISOString();
  return [entity_id, { entity_id, state: String(value), attributes, last_changed: now, last_updated: now, context: {} }];
}

const D = {
  ac: ["1a".repeat(16), "Showcase AC"],
  fan: ["2a".repeat(16), "Showcase ceiling fan"],
  purifier: ["3a".repeat(16), "Showcase air purifier"],
  apple: ["4a".repeat(16), "Showcase Apple TV"],
  speaker: ["5a".repeat(16), "Showcase speaker"],
  cam: ["6a".repeat(16), "Showcase garden camera"],
  avr: ["7a".repeat(16), "Showcase receiver"],
};

export function showcaseStates() {
  return [
    s("climate.showcase_ac", "cool", { friendly_name: "Showcase AC", hvac_modes: ["off", "cool", "heat", "dry", "fan_only", "auto"], hvac_action: "cooling", current_temperature: 26, temperature: 23, min_temp: 16, max_temp: 30, target_temp_step: 1, fan_mode: "auto", fan_modes: ["auto", "low", "medium", "high"], swing_mode: "off", swing_modes: ["off", "vertical", "horizontal", "both"], supported_features: 441 }),
    s("input_boolean.showcase_ac_eco", "off", { friendly_name: "Showcase AC Eco" }),
    s("sensor.showcase_ac_power", "640", { friendly_name: "Showcase AC Power", unit_of_measurement: "W", device_class: "power" }),
    s("fan.showcase_ceiling", "on", { friendly_name: "Showcase ceiling fan", percentage: 66, percentage_step: 33.3, preset_modes: ["breeze", "sleep"], preset_mode: null, direction: "forward", oscillating: false, supported_features: 57 }),
    s("fan.showcase_purifier", "on", { friendly_name: "Showcase air purifier", percentage: 40, preset_modes: ["auto", "silent", "favorite"], preset_mode: "auto", supported_features: 56 }),
    s("sensor.showcase_purifier_pm25", "12", { friendly_name: "Showcase air purifier PM2.5", unit_of_measurement: "µg/m³", device_class: "pm25" }),
    s("sensor.showcase_purifier_filter", "74", { friendly_name: "Showcase air purifier Filter life", unit_of_measurement: "%" }),
    s("switch.showcase_purifier_alarm", "on", { friendly_name: "Showcase air purifier Alarm" }),
    s("media_player.showcase_apple_tv", "playing", { friendly_name: "Showcase Apple TV", media_title: "Film night", media_artist: "", app_name: "Movies", source_list: ["Movies", "Music"], supported_features: 152463, volume_level: 0.3 }),
    s("remote.showcase_apple_tv", "on", { friendly_name: "Showcase Apple TV remote" }),
    s("media_player.showcase_speaker", "playing", { friendly_name: "Showcase speaker", media_title: "A song", media_artist: "An artist", media_album_name: "An album", volume_level: 0.4, is_volume_muted: false, media_duration: 210, media_position: 70, media_position_updated_at: new Date().toISOString(), supported_features: 152461 }),
    s("media_player.showcase_receiver", "on", { friendly_name: "Showcase receiver", source: "HDMI 1", source_list: ["HDMI 1", "HDMI 2", "Radio"], volume_level: 0.25, supported_features: 152461 }),
    s("select.showcase_receiver_sound_mode", "Movie", { friendly_name: "Showcase receiver Sound mode", options: ["Movie", "Music", "Pure"] }),
    s("camera.showcase_garden", "idle", { friendly_name: "Showcase garden camera", entity_picture: "/tests/frontend/harness/door-cam.svg" }),
    s("button.showcase_garden_move_left", "unknown", { friendly_name: "Showcase garden camera Move left" }),
    s("button.showcase_garden_move_right", "unknown", { friendly_name: "Showcase garden camera Move right" }),
    s("switch.showcase_garden_privacy", "off", { friendly_name: "Showcase garden camera Privacy" }),
    s("binary_sensor.showcase_garden_motion", "off", { friendly_name: "Showcase garden camera Motion", device_class: "motion" }),
    s("switch.showcase_plug", "on", { friendly_name: "Showcase plug" }),
    s("cover.showcase_blind", "open", { friendly_name: "Showcase blind", current_position: 70, supported_features: 15 }),
    s("lock.showcase_front", "locked", { friendly_name: "Showcase front door lock" }),
    s("sensor.showcase_temperature", "21.4", { friendly_name: "Showcase temperature", unit_of_measurement: "°C", device_class: "temperature" }),
    s("sensor.showcase_humidity", "48", { friendly_name: "Showcase humidity", unit_of_measurement: "%", device_class: "humidity" }),
    s("binary_sensor.showcase_window", "on", { friendly_name: "Showcase window", device_class: "window" }),
    s("number.showcase_volume", "35", { friendly_name: "Showcase volume", min: 0, max: 100, step: 5, unit_of_measurement: "%" }),
    s("select.showcase_mode", "Eco", { friendly_name: "Showcase mode", options: ["Eco", "Comfort", "Boost"] }),
    s("button.showcase_reboot", "unknown", { friendly_name: "Showcase reboot" }),
    s("script.showcase_goodnight", "off", { friendly_name: "Showcase good night" }),
    s("scene.showcase_relax", "unknown", { friendly_name: "Showcase Relax" }),
    s("scene.showcase_focus", "unknown", { friendly_name: "Showcase Focus" }),
    s("light.showcase_lamp", "on", { friendly_name: "Showcase lamp", brightness: 200, supported_color_modes: ["xy", "color_temp"], color_mode: "color_temp", color_temp_kelvin: 3000, min_color_temp_kelvin: 2202, max_color_temp_kelvin: 6535 }),
    s("light.showcase_plain", "off", { friendly_name: "Showcase plain light", supported_color_modes: ["onoff"] }),
  ];
}

export function showcaseEntities(reg) {
  const rows = [];
  const add = (device, ids) => ids.forEach((id) => rows.push(reg(id, "showcase", "sc-" + id, D[device][0], { area_id: null })));
  add("ac", ["climate.showcase_ac", "input_boolean.showcase_ac_eco", "sensor.showcase_ac_power"]);
  add("fan", ["fan.showcase_ceiling"]);
  add("purifier", ["fan.showcase_purifier", "sensor.showcase_purifier_pm25", "sensor.showcase_purifier_filter", "switch.showcase_purifier_alarm"]);
  add("apple", ["media_player.showcase_apple_tv", "remote.showcase_apple_tv"]);
  add("speaker", ["media_player.showcase_speaker"]);
  add("avr", ["media_player.showcase_receiver", "select.showcase_receiver_sound_mode"]);
  add("cam", ["camera.showcase_garden", "button.showcase_garden_move_left", "button.showcase_garden_move_right", "switch.showcase_garden_privacy", "binary_sensor.showcase_garden_motion"]);
  ["switch.showcase_plug", "cover.showcase_blind", "lock.showcase_front", "sensor.showcase_temperature", "sensor.showcase_humidity", "binary_sensor.showcase_window", "number.showcase_volume", "select.showcase_mode", "button.showcase_reboot", "script.showcase_goodnight", "scene.showcase_relax", "scene.showcase_focus", "light.showcase_lamp", "light.showcase_plain"].forEach((id) =>
    rows.push(reg(id, "showcase", "sc-" + id, "9a".repeat(16), { area_id: null })),
  );
  return rows;
}

export const showcaseDevices = [...Object.values(D), ["9a".repeat(16), "Showcase misc"]].map(([id, name]) => ({ id, name, area_id: null, manufacturer: "Invented", model: "Test" }));


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The page "Showcase" with a device of every kind, put there the way the builders do it. Runs in the page (it uses the panel's own functions). */
export async function buildShowcase() {
  const w = window;
  while (!w.BOOTED || !w.UI || !w.addCandidate) await sleep(200);
  if (w.UI.rooms.some((r) => r.id === "showcase")) return;
  const sections = [
    ["lights", "Lights", "lights"],
    ["climate", "Climate and fans", "ac"],
    ["media", "Media", "tv"],
    ["cams", "Locks and robots", "lock"],
    ["controls", "Controls and sensors", "tune"],
    ["kit", "Appliances and remotes", "plug"],
    ["scenes", "Scenes", "scene"],
  ];
  w.UI.rooms.push({ id: "showcase", name: "Showcase", short: "Showcase", icon: "home", area: "" });
  w.UI.layout.rooms.showcase = [{ id: "status", k: "status", hide: false }, { id: "camera", k: "camera", hide: false, devs: [] }].concat(sections.map(([id, t, i]) => ({ id, k: "devs", t, i, hide: false, devs: [] })));
  w.uiChanged();
  const put = (sec, ids) =>
    ids.forEach((id) => {
      const r = w.addCandidate("~showcase~" + sec, { id, name: w.A(id).friendly_name || id });
      if (id === "media_player.living_tv") {
        r.d.icon = "tv";
        r.d.dt = "tv";
        w.kAuto(r.d);
      }
    });
  put("lights", ["light.showcase_lamp", "light.showcase_plain"]);
  put("climate", ["climate.showcase_ac", "fan.showcase_ceiling", "fan.showcase_purifier"]);
  put("media", ["media_player.living_tv", "media_player.showcase_apple_tv", "media_player.showcase_receiver", "media_player.showcase_speaker"]);
  put("camera", ["camera.showcase_garden"]);
  put("cams", ["lock.showcase_front", "vacuum.hallway"]);
  put("controls", ["switch.showcase_plug", "cover.showcase_blind", "sensor.showcase_temperature", "sensor.showcase_humidity", "binary_sensor.showcase_window", "number.showcase_volume", "select.showcase_mode", "button.showcase_reboot", "script.showcase_goodnight"]);
  const kit = w.secById("showcase", "kit");
  const ap = (type, name, aid, slots) => {
    const d = w.apNew(type);
    d.name = name;
    d.aid = aid;
    Object.assign(d.ap.slots, slots);
    kit.devs.push(d);
  };
  ap("oven", "Showcase oven", "scoven01", { program: "select.oven_program", temperature: "number.oven_setpoint_temperature", current: "sensor.oven_current_temperature", duration: "number.oven_duration", start: "button.oven_start", stop: "button.oven_stop", state: "sensor.oven_operation_state", progress: "sensor.oven_program_progress", remaining: "sensor.oven_remaining_program_time", door: "binary_sensor.oven_door" });
  ap("washer", "Showcase washer", "scwash01", { program: "select.washer_program", state: "sensor.washer_operation_state", remaining: "sensor.washer_remaining_program_time", progress: "sensor.washer_program_progress", door: "binary_sensor.washer_door", start: "button.washer_start", stop: "button.washer_stop" });
  ap("dryer", "Showcase dryer", "scdry01", { program: "select.dryer_program", state: "sensor.dryer_operation_state", remaining: "sensor.dryer_remaining_program_time", start: "button.dryer_start", permission: "binary_sensor.dryer_remote_start_allowed" });
  ap("dishwasher", "Showcase dishwasher", "scdish01", { state: "sensor.dishwasher_status", start: "switch.dishwasher_start", door: "binary_sensor.dishwasher_door", remaining: "sensor.dishwasher_time_left", progress: "sensor.dishwasher_progress" });
  ap("other", "Showcase other appliance", "scother01", { state: "sensor.showcase_ac_power" });
  const rem = w.remoteNew();
  rem.rid = "screm01";
  rem.name = "Showcase remote";
  rem.rm.btns = [
    { e: "script.movie_mode", l: "Movie", i: "media", s: 1 },
    { e: "script.good_night", l: "Good night", i: "moon", s: 1 },
    { e: "input_button.garage_door", l: "Garage", i: "info", s: 2, q: 1 },
  ];
  kit.devs.push(rem);
  const v = w.secById("showcase", "cams").devs.filter((d) => d.kind === "vacuum")[0];
  if (v) v.vx = { map: "camera.hallway_map", rooms: [{ e: "button.hallway_clean_kitchen", l: "Kitchen" }, { e: "button.hallway_clean_bedroom", l: "Bedroom" }], modes: ["select.hallway_mop_mode", "number.hallway_suction"], care: ["sensor.hallway_filter_left", "sensor.hallway_main_brush_left"] };
  w.STORE.scenes.push({ id: "scshow1", name: "Showcase evening", room: "showcase", icon: "scene", acts: [{ id: "light.showcase_lamp", on: true, bri: 60 }, { id: "climate.showcase_ac", mode: "cool", temp: 23 }] });
  const sc = w.secById("showcase", "scenes");
  sc.devs.push({ id: "", sid: "scshow1", name: "Scene", icon: "scene", kind: "cscene" });
  put("scenes", ["scene.showcase_relax", "scene.showcase_focus"]);
  sc.devs.push({ id: "", name: "Showcase scene collection", icon: "scene", kind: "scenes", spage: ["page:showcase"] });
  w.uiChanged();
  w.refresh();
  await sleep(300);
  w.go("showcase");
}
