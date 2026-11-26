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
  roku: ["8a".repeat(16), "Showcase Roku TV"],
  lg: ["ba".repeat(16), "Showcase LG TV"],
  avr: ["7a".repeat(16), "Showcase receiver"],
  tv: ["ca".repeat(16), "Showcase TV"],
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
    // The default device of the Showcase remote master: a Samsung TV on the input the Apple TV is plugged into.
    s("media_player.showcase_tv", "on", { friendly_name: "Showcase TV", source: "HDMI 1", source_list: ["TV", "HDMI 1", "HDMI 2", "Netflix"], volume_level: 0.2, supported_features: 24509 }),
    s("remote.showcase_tv", "on", { friendly_name: "Showcase TV remote" }),
    s("number.showcase_tv_backlight", "30", { friendly_name: "Showcase TV Backlight", min: 0, max: 50, step: 1 }),
    s("media_player.showcase_apple_tv", "playing", { friendly_name: "Showcase Apple TV", media_title: "Film night", media_artist: "", app_name: "Movies", source_list: ["Movies", "Music"], supported_features: 152463, volume_level: 0.3 }),
    s("remote.showcase_apple_tv", "on", { friendly_name: "Showcase Apple TV remote" }),
    s("media_player.showcase_speaker", "playing", { friendly_name: "Showcase speaker", media_title: "A song", media_artist: "An artist", entity_picture: "/tests/frontend/harness/audio-wave.svg", media_album_name: "An album", volume_level: 0.4, is_volume_muted: false, media_duration: 210, media_position: 70, media_position_updated_at: new Date().toISOString(), supported_features: 152461 }),
    s("media_player.showcase_receiver", "on", { friendly_name: "Showcase receiver", source: "HDMI 1", source_list: ["HDMI 1", "HDMI 2", "Radio"], volume_level: 0.25, supported_features: 152461 }),
    s("remote.showcase_receiver_ir", "on", { friendly_name: "Showcase receiver infrared" }),
    s("select.showcase_receiver_sound_mode", "Movie", { friendly_name: "Showcase receiver Sound mode", options: ["Movie", "Music", "Pure"] }),
    s("camera.showcase_garden", "idle", { friendly_name: "Showcase garden camera", entity_picture: "/tests/frontend/harness/door-cam.svg" }),
    s("button.showcase_garden_move_left", "unknown", { friendly_name: "Showcase garden camera Move left" }),
    s("button.showcase_garden_move_right", "unknown", { friendly_name: "Showcase garden camera Move right" }),
    s("switch.showcase_garden_privacy", "off", { friendly_name: "Showcase garden camera Privacy" }),
    s("binary_sensor.showcase_garden_motion", "off", { friendly_name: "Showcase garden camera Motion", device_class: "motion" }),
    s("switch.showcase_plug", "on", { friendly_name: "Showcase plug" }),
    s("cover.showcase_blind", "open", { friendly_name: "Showcase blind", current_position: 70, supported_features: 15 }),
    s("cover.showcase_venetian", "open", { friendly_name: "Showcase venetian blind", current_position: 100, current_tilt_position: 40, supported_features: 255 }),
    s("cover.showcase_garage", "closed", { friendly_name: "Showcase garage door", device_class: "garage", supported_features: 3 }),
    s("media_player.showcase_roku", "on", { friendly_name: "Showcase Roku TV", source: "HDMI 1", source_list: ["HDMI 1", "HDMI 2", "Netflix"], volume_level: 0.3, supported_features: 152461 }),
    s("remote.showcase_roku", "on", { friendly_name: "Showcase Roku TV remote" }),
    s("media_player.showcase_lg", "on", { friendly_name: "Showcase LG TV", source: "HDMI 2", source_list: ["HDMI 1", "HDMI 2", "Live TV"], volume_level: 0.2, supported_features: 152461 }),
    s("switch.showcase_projector_power", "on", { friendly_name: "Showcase projector Power" }),
    s("select.showcase_projector_source", "HDMI 1", { friendly_name: "Showcase projector Source", options: ["HDMI 1", "HDMI 2", "USB", "Screen mirroring"] }),
    s("select.showcase_projector_picture", "Cinema", { friendly_name: "Showcase projector Picture mode", options: ["Cinema", "Bright", "Game", "Eco"] }),
    s("number.showcase_projector_keystone", "0", { friendly_name: "Showcase projector Keystone", min: -30, max: 30, step: 1 }),
    s("number.showcase_projector_lamp", "1840", { friendly_name: "Showcase projector Lamp hours", min: 0, max: 5000, step: 1, unit_of_measurement: "h" }),
    s("sensor.showcase_projector_temp", "46", { friendly_name: "Showcase projector Temperature", unit_of_measurement: "°C", device_class: "temperature" }),
    s("switch.showcase_projector_freeze", "off", { friendly_name: "Showcase projector Freeze" }),
    s("remote.showcase_projector_ir", "on", { friendly_name: "Showcase projector infrared" }),
    s("sensor.showcase_coffee_state", "ready", { friendly_name: "Showcase coffee machine State" }),
    s("select.showcase_coffee_drink", "Espresso", { friendly_name: "Showcase coffee machine Drink", options: ["Espresso", "Lungo", "Cappuccino", "Latte macchiato", "Hot water"] }),
    s("select.showcase_coffee_strength", "Medium", { friendly_name: "Showcase coffee machine Strength", options: ["Mild", "Medium", "Strong"] }),
    s("number.showcase_coffee_amount", "40", { friendly_name: "Showcase coffee machine Amount", min: 20, max: 250, step: 5, unit_of_measurement: "ml" }),
    s("switch.showcase_coffee_milk", "off", { friendly_name: "Showcase coffee machine Milk" }),
    s("button.showcase_coffee_start", "unknown", { friendly_name: "Showcase coffee machine Start" }),
    s("binary_sensor.showcase_coffee_tank", "off", { friendly_name: "Showcase coffee machine Water tank empty", device_class: "problem" }),
    s("sensor.showcase_coffee_cups", "1280", { friendly_name: "Showcase coffee machine Cups made" }),
    s("number.showcase_fridge_temp", "4", { friendly_name: "Showcase fridge Fridge temperature", min: 1, max: 8, step: 1, unit_of_measurement: "°C" }),
    s("number.showcase_fridge_freezer", "-18", { friendly_name: "Showcase fridge Freezer temperature", min: -24, max: -14, step: 1, unit_of_measurement: "°C" }),
    s("sensor.showcase_fridge_now", "5", { friendly_name: "Showcase fridge Temperature now", unit_of_measurement: "°C", device_class: "temperature" }),
    s("binary_sensor.showcase_fridge_door", "off", { friendly_name: "Showcase fridge Door", device_class: "door" }),
    s("switch.showcase_fridge_supercool", "off", { friendly_name: "Showcase fridge Super cool" }),
    s("switch.showcase_fridge_supercool_freezer", "off", { friendly_name: "Showcase fridge Super freeze" }),
    s("switch.showcase_fridge_eco", "on", { friendly_name: "Showcase fridge Eco mode" }),
    s("lock.showcase_front", "locked", { friendly_name: "Showcase front door lock" }),
    s("weather.showcase_home", "partlycloudy", { friendly_name: "Showcase weather", temperature: 17.4, temperature_unit: "°C" }),
    s("calendar.showcase_family", "off", { friendly_name: "Showcase family calendar" }),
    s("todo.showcase_shopping", "3", { friendly_name: "Showcase shopping list" }),
    s("sensor.showcase_power", "1840", { friendly_name: "Showcase power", unit_of_measurement: "W", device_class: "power" }),
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
  const add = (device, ids, platform = "showcase") => ids.forEach((id) => rows.push(reg(id, platform, "sc-" + id, D[device][0], { area_id: null })));
  add("ac", ["climate.showcase_ac", "input_boolean.showcase_ac_eco", "sensor.showcase_ac_power"]);
  add("fan", ["fan.showcase_ceiling"]);
  add("purifier", ["fan.showcase_purifier", "sensor.showcase_purifier_pm25", "sensor.showcase_purifier_filter", "switch.showcase_purifier_alarm"]);
  add("apple", ["media_player.showcase_apple_tv", "remote.showcase_apple_tv"], "apple_tv");
  add("speaker", ["media_player.showcase_speaker"]);
  add("tv", ["media_player.showcase_tv", "remote.showcase_tv", "number.showcase_tv_backlight"], "samsungtv_smart");
  add("avr", ["media_player.showcase_receiver", "select.showcase_receiver_sound_mode", "remote.showcase_receiver_ir"]);
  add("roku", ["media_player.showcase_roku", "remote.showcase_roku"], "roku");
  add("lg", ["media_player.showcase_lg"], "webostv");
  add("cam", ["camera.showcase_garden", "button.showcase_garden_move_left", "button.showcase_garden_move_right", "switch.showcase_garden_privacy", "binary_sensor.showcase_garden_motion"]);
  ["switch.showcase_projector_power", "select.showcase_projector_source", "select.showcase_projector_picture", "number.showcase_projector_keystone", "number.showcase_projector_lamp", "sensor.showcase_projector_temp", "switch.showcase_projector_freeze", "remote.showcase_projector_ir", "sensor.showcase_coffee_state", "select.showcase_coffee_drink", "select.showcase_coffee_strength", "number.showcase_coffee_amount", "switch.showcase_coffee_milk", "button.showcase_coffee_start", "binary_sensor.showcase_coffee_tank", "sensor.showcase_coffee_cups", "number.showcase_fridge_temp", "number.showcase_fridge_freezer", "sensor.showcase_fridge_now", "binary_sensor.showcase_fridge_door", "switch.showcase_fridge_supercool", "switch.showcase_fridge_supercool_freezer", "switch.showcase_fridge_eco", "switch.showcase_plug", "cover.showcase_venetian", "cover.showcase_garage", "cover.showcase_blind", "lock.showcase_front", "sensor.showcase_temperature", "sensor.showcase_humidity", "binary_sensor.showcase_window", "number.showcase_volume", "select.showcase_mode", "button.showcase_reboot", "script.showcase_goodnight", "scene.showcase_relax", "scene.showcase_focus", "light.showcase_lamp", "light.showcase_plain"].forEach((id) =>
    rows.push(reg(id, "showcase", "sc-" + id, "9a".repeat(16), { area_id: null })),
  );
  return rows;
}

export const showcaseDevices = [...Object.values(D), ["9a".repeat(16), "Showcase misc"]].map(([id, name]) => ({ id, name, area_id: null, manufacturer: "Invented", config_entries: id === D.apple[0] ? ["showcase-apple-tv"] : [], model: id === D.apple[0] ? "Apple TV 4K" : id === D.speaker[0] ? "HomePod mini" : "Test" }));


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The page "Showcase" with a device of every kind, put there the way the builders do it. Runs in the page (it uses the panel's own functions). */
export async function buildShowcase() {
  const w = window;
  /* With a real home the saved dashboard replaces the first layout once it has been read; the rooms are added after that. */
  while (!w.BOOTED || !w.UI || !w.addCandidate || (window.__home && !w.STORE_NET)) await sleep(200);
  await sleep(300);
  if (w.UI.rooms.some((r) => r.id === "showcase")) return;
  const sections = [
    ["lights", "Lights", "lights"],
    ["climate", "Climate and fans", "ac"],
    ["media", "Media", "tv"],
    ["cams", "Locks and robots", "lock"],
    ["controls", "Controls and sensors", "tune"],
    ["kit", "Appliances and remotes", "plug"],
    ["scenes", "Scenes", "scene"],
    ["wtiles", "Widgets: tiles", "tune"],
    ["wwide", "Widgets: wide", "tune"],
    ["wmore", "Widgets: folder and stack", "tune"],
  ];
  w.UI.rooms.push({ id: "showcase", name: "Showcase", short: "Showcase", icon: "home", area: "" });
  w.UI.layout.rooms.showcase = [w.statusSection([w.statusDevice({ l: "Temperature", id: "sensor.showcase_temperature" }), w.statusDevice({ l: "Humidity", id: "sensor.showcase_humidity" })]), { id: "camera", k: "devs", t: "Camera", i: "cam", hide: false, devs: [] }].concat(sections.map(([id, t, i]) => ({ id, k: "devs", t, i, hide: false, devs: [] })));
  /* The first invented room of the harness, the demo living room, is not made by the dashboard's seeding when a real home is loaded (its saved layout is used instead): it is made here. */
  if (window.__home && !w.UI.rooms.some((r) => r.id === "r_living")) {
    const h = w.H();
    const zones = w.zoneLightIds(h.states, h.entities);
    const list = Object.keys(h.states)
      .filter((id) => w.areaIdOf(id) === "living" && !zones[id] && !(h.entities[id] && (h.entities[id].entity_category || h.entities[id].hidden || h.entities[id].disabled_by)))
      .map((id) => w.areaDevice("living", id))
      .filter(Boolean);
    w.UI.rooms.push({ id: "r_living", name: "Demo living room", short: "Demo", icon: "home", area: "living" });
    w.UI.layout.rooms.r_living = [w.statusSection([])].concat(w.groupSections(list));
  }
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
  put("media", ["media_player.living_tv", "media_player.showcase_roku", "media_player.showcase_lg", "media_player.showcase_apple_tv", "media_player.showcase_receiver", "media_player.showcase_speaker"]);
  put("camera", ["camera.showcase_garden"]);
  /* A remote master at the head of the Media section: the TV, the Apple TV on its HDMI 1, and the speaker. */
  const master = w.newWidgetDev("rmaster");
  master.name = "Showcase remote master";
  master.wx = { def: "media_player.showcase_tv", subs: [{ id: "media_player.showcase_apple_tv", src: "HDMI 1" }], spk: ["media_player.showcase_speaker"] };
  w.secById("showcase", "media").devs.unshift(master);
  put("cams", ["lock.showcase_front", "vacuum.hallway"]);
  put("controls", ["switch.showcase_plug", "cover.showcase_venetian", "cover.showcase_garage", "cover.showcase_blind", "sensor.showcase_temperature", "sensor.showcase_humidity", "binary_sensor.showcase_window", "number.showcase_volume", "select.showcase_mode", "button.showcase_reboot", "script.showcase_goodnight"]);
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
  /* A projector (power, source and picture mode, a button grid with arrows and inputs), a coffee machine and a fridge, to see the appliance builder's rows, groups and buttons. */
  const proj = w.apNew("projector");
  proj.name = "Showcase projector";
  proj.aid = "scproj01";
  Object.assign(proj.ap.slots, { state: "sensor.showcase_projector_temp", program: "select.showcase_projector_source", level: "select.showcase_projector_picture", start: "switch.showcase_projector_power", temperature: "number.showcase_projector_keystone" });
  proj.ap.extra = [
    { e: "switch.showcase_projector_freeze", l: "Freeze", o: 1, g: "Screen" },
    { e: "number.showcase_projector_keystone", l: "Keystone", o: 1, g: "Screen" },
    { e: "number.showcase_projector_lamp", l: "Lamp hours", g: "Service" },
    { e: "sensor.showcase_projector_temp", l: "Temperature", g: "Service" },
  ];
  const irp = "remote.showcase_projector_ir";
  const pk = (c, extra = {}) => ({ t: "key", e: irp, c, ...extra });
  proj.rm = {
    cols: 6,
    btns: [
      { a: pk("INPUT_HDMI1"), i: "", l: "HDMI 1", s: 2, h: 1 }, { a: pk("INPUT_HDMI2"), i: "", l: "HDMI 2", s: 2, h: 1 }, { a: pk("INPUT_USB"), i: "", l: "USB", s: 2, h: 1 },
      { a: { t: "gap" }, i: "info", l: "", s: 1, h: 3 },
      { a: { t: "dpad", u: pk("UP", { r: 1 }), d: pk("DOWN", { r: 1 }), l: pk("LEFT", { r: 1 }), r: pk("RIGHT", { r: 1 }), o: pk("OK") }, i: "info", l: "", s: 4, h: 3 },
      { a: { t: "gap" }, i: "info", l: "", s: 1, h: 3 },
      { a: pk("MENU"), i: "cog", l: "Menu", s: 2, h: 1 }, { a: pk("BACK"), i: "back", l: "Back", s: 2, h: 1 }, { a: pk("KEYSTONE"), i: "tune", l: "Keystone", s: 2, h: 1 },
      { a: pk("FOCUS_PLUS", { r: 1 }), i: "plus", l: "Focus", s: 3, h: 1 }, { a: pk("FOCUS_MINUS", { r: 1 }), i: "minus", l: "Focus", s: 3, h: 1 },
      { a: pk("ZOOM_PLUS", { r: 1 }), i: "plus", l: "Zoom", s: 3, h: 1 }, { a: pk("ZOOM_MINUS", { r: 1 }), i: "minus", l: "Zoom", s: 3, h: 1 },
    ],
  };
  kit.devs.push(proj);
  const coffee = w.apNew("coffee");
  coffee.name = "Showcase coffee machine";
  coffee.aid = "sccoffee1";
  Object.assign(coffee.ap.slots, { state: "sensor.showcase_coffee_state", program: "select.showcase_coffee_drink", level: "select.showcase_coffee_strength", start: "button.showcase_coffee_start", door: "binary_sensor.showcase_coffee_tank" });
  coffee.ap.extra = [
    { e: "number.showcase_coffee_amount", l: "Amount", o: 1 },
    { e: "switch.showcase_coffee_milk", l: "Milk", o: 1 },
    { e: "sensor.showcase_coffee_cups", l: "Cups made", g: "Care" },
  ];
  kit.devs.push(coffee);
  /* A robot vacuum made as an appliance: rooms, settings and what Start does, with a room's own settings behind its gear. */
  const robo = w.apNew("vacuum");
  robo.name = "Showcase robot vacuum";
  robo.aid = "scvacuum1";
  Object.assign(robo.ap.slots, { vacuum: "vacuum.hallway", map: "camera.hallway_map" });
  robo.ap.vac = {
    rooms: [{ k: "10", l: "Living room" }, { k: "11", l: "Bedroom" }, { k: "12", l: "Kitchen" }, { k: "13", l: "Hall" }, { k: "14", l: "Study" }],
    sets: [
      { k: "cleaning_mode", l: "Mode", o: ["vacuum_only", "vacuum_and_mop", "vacuum_then_mop", "mop_only"] },
      { k: "vacuum_power", l: "Suction", o: ["quiet", "auto", "boost"] },
      { k: "hydration", l: "Water", o: ["low", "medium", "high"] },
      { k: "wash_repetitions", l: "Passes", o: ["1", "2"] },
    ],
    run: [{ action: "vacuum.send_command", data: { entity_id: "$vacuum", command: "rooms", params: { rooms: "$rooms", settings: "$room_settings" } } }],
  };
  robo.ap.extra = [
    { e: "sensor.hallway_filter_left", l: "Filter", o: 1 },
    { e: "sensor.hallway_main_brush_left", l: "Main brush", o: 1 },
  ];
  kit.devs.push(robo);
  const fridge = w.apNew("fridge");
  fridge.name = "Showcase fridge";
  fridge.aid = "scfridge1";
  Object.assign(fridge.ap.slots, { state: "sensor.showcase_fridge_now", temperature: "number.showcase_fridge_temp", door: "binary_sensor.showcase_fridge_door" });
  fridge.ap.extra = [
    { e: "number.showcase_fridge_freezer", l: "Freezer", o: 1, g: "Temperatures" },
    { e: "switch.showcase_fridge_supercool", l: "Super cool", o: 1, g: "Quick actions" },
    { e: "switch.showcase_fridge_supercool_freezer", l: "Super freeze", o: 1, g: "Quick actions" },
    { e: "switch.showcase_fridge_eco", l: "Eco mode", g: "Quick actions" },
  ];
  kit.devs.push(fridge);
  const rem = w.remoteNew();
  rem.rid = "screm01";
  rem.name = "Showcase remote";
  rem.rm.btns = [
    { a: { t: "ent", e: "script.movie_mode" }, l: "Movie", i: "media", s: 1 },
    { a: { t: "ent", e: "script.good_night" }, l: "Good night", i: "moon", s: 1 },
    { a: { t: "ent", e: "input_button.garage_door" }, l: "Garage", i: "info", s: 2, q: 1 },
  ];
  kit.devs.push(rem);
  const v = w.secById("showcase", "cams").devs.filter((d) => d.kind === "vacuum")[0];
  if (v) v.vx = { map: "camera.hallway_map", rooms: [{ e: "button.hallway_clean_kitchen", l: "Kitchen" }, { e: "button.hallway_clean_bedroom", l: "Bedroom" }], modes: ["select.hallway_mop_mode", "number.hallway_suction"], care: ["sensor.hallway_filter_left", "sensor.hallway_main_brush_left"] };
  await buildRemotes(w, kit);
  w.STORE.scenes.push({ id: "scshow1", name: "Showcase evening", room: "showcase", icon: "scene", acts: [{ id: "light.showcase_lamp", on: true, bri: 60 }, { id: "climate.showcase_ac", mode: "cool", temp: 23 }] });
  const sc = w.secById("showcase", "scenes");
  sc.devs.push({ id: "", sid: "scshow1", name: "Scene", icon: "scene", kind: "cscene" });
  put("scenes", ["scene.showcase_relax", "scene.showcase_focus"]);
  sc.devs.push({ id: "", name: "Showcase scene collection", icon: "scene", kind: "scenes", spage: ["page:showcase"] });
  /* The widgets of the registry, each at the sizes it can take, with entities of the page. */
  const wd = (type, wx, sz, name) => ({ kind: "widget", id: "", w: type, wid: "w" + type.slice(0, 4) + (sz || "d"), name: name || type, icon: "info", wx, ...(sz ? { sz } : {}) });
  const tiles = w.secById("showcase", "wtiles"),
    wide = w.secById("showcase", "wwide"),
    more = w.secById("showcase", "wmore");
  tiles.devs.push(
    wd("clock", { id: "weather.showcase_home" }, "s"),
    wd("ring", { id: "sensor.showcase_power", max: 3000 }, "xs", "ring1"),
    wd("ring", { id: "sensor.showcase_humidity", max: 100 }, "xs", "ring2"),
    wd("sparkline", { id: "sensor.showcase_temperature", r: "24h" }, "s"),
    wd("note", { txt: "A note at tile size." }, "s"),
    wd("snapshot", { id: "camera.showcase_garden" }, "s"),
    wd("folder", { ids: ["light.showcase_lamp", "scene.showcase_relax", "script.showcase_goodnight", "switch.showcase_plug"] }, "xs", "Folder"),
    { id: "sensor.showcase_temperature", name: "Temperature", icon: "thermo", kind: "sensor", sz: "xs" },
    { id: "sensor.showcase_humidity", name: "Humidity", icon: "drop", kind: "sensor", sz: "s" },
  );
  wide.devs.push(
    wd("nowplaying", { id: "media_player.showcase_speaker" }, undefined, "now"),
    wd("vacuum", { id: "vacuum.hallway" }, undefined, "vac"),
    wd("agenda", { id: "calendar.showcase_family" }, undefined, "Agenda"),
    wd("todo", { id: "todo.showcase_shopping" }, undefined, "To-do"),
    wd("chart", { ds: [{ id: "sensor.showcase_temperature", name: "Temperature" }, { id: "sensor.showcase_humidity", name: "Humidity" }], r: "24h" }, undefined, "chart"),
    wd("note", { txt: "A wide note across the whole section." }, "m", "note"),
    wd("snapshot", { id: "camera.showcase_garden" }, "m", "snap wide"),
    { id: "camera.showcase_garden", name: "Showcase garden camera", icon: "cam", kind: "camera", sz: "l" },
  );
  more.devs.push(
    wd("stack", { items: [wd("note", { txt: "First of a stack. Swipe, or tap the dots." }), wd("sparkline", { id: "sensor.showcase_temperature" }), wd("ring", { id: "sensor.showcase_power", max: 3000 })] }, "m", "stack"),
    wd("security", {}, undefined, "security"),
    wd("energy", { price: 0.25, cur: "€" }, undefined, "energy"),
  );
  [tiles, wide, more].forEach((sec) => (sec.devs = sec.devs.map((d) => w.cleanDev(d)).filter(Boolean)));
  w.uiChanged();
  w.refresh();
  await sleep(300);
  if (!window.__home) w.go("showcase");
}

/* Remotes made the way a person would with the builder, as a test of what it can build: a Samsung TV remote as a grid, and a common AV receiver remote as a grid and as a picture (the picture is kept out of the
   repository: put it at tests/frontend/harness/local/avr-remote.png). Every button is an action the builder offers; the grids use gaps, widths, heights and five-way pads. */
async function buildRemotes(w, kit) {
  const key = (e, c, extra = {}) => ({ t: "key", e, c, ...extra });
  const btn = (a, i, l, o = {}) => ({ a, i, l: l || "", s: 1, h: 1, ...o });
  const gap = (s = 1, h = 1) => ({ a: { t: "gap" }, i: "info", l: "", s, h });
  const R = (id) => w.remoteNew && Object.assign(w.remoteNew(), { rid: id });

  /* Samsung TV, as the remote the dashboard has for it (a now playing card, power and sources, settings, mute and keyboard, a touchpad, back, home and play/pause, volume, the screen's backlight and channels), made with the builder's parts in a grid of six columns. */
  const tv = "remote.living_tv",
    media = "media_player.living_tv";
  const sk = (c, extra) => key(tv, c, extra);
  const samsung = R("scsamsung");
  samsung.name = "Samsung remote (grid)";
  samsung.rm.cols = 6;
  samsung.rm.btns = [
    { a: { t: "now", e: media, m: "apps" }, i: "media", l: "", s: 6, h: 1 },
    btn(sk("KEY_POWER", { w: media }), "power", "", { s: 2 }), gap(4),
    btn(sk("KEY_MENU"), "cog", "", { s: 2 }), btn(sk("KEY_MUTE"), "mute", "", { s: 2 }), { a: { t: "text", e: media }, i: "keyboard", l: "", s: 2, h: 1 },
    { a: { t: "touch", u: sk("KEY_UP", { r: 1 }), d: sk("KEY_DOWN", { r: 1 }), l: sk("KEY_LEFT", { r: 1 }), r: sk("KEY_RIGHT", { r: 1 }), o: sk("KEY_ENTER"), h: sk("KEY_ENTER", { hs: 1 }) }, i: "info", l: "", s: 6, h: 5 },
    btn(sk("KEY_RETURN"), "back", "", { s: 2 }), btn(sk("KEY_HOME"), "home", "", { s: 2 }), btn({ t: "media", e: media, m: "play_pause" }, "playpause", "", { s: 2 }),
    btn(sk("KEY_VOLUP", { r: 1 }), "volup", "", { s: 2 }),
    { a: { t: "slider", e: "number.living_tv_backlight", m: "pop" }, i: "bright", l: "Backlight", s: 2, h: 2 },
    btn(sk("KEY_CHUP", { r: 1 }), "chup", "CH", { s: 2 }),
    btn(sk("KEY_VOLDOWN", { r: 1 }), "voldown", "", { s: 2 }),
    btn(sk("KEY_CHDOWN", { r: 1 }), "chdown", "CH", { s: 2 }),
  ];
  kit.devs.push(samsung);

  /* A common AV receiver remote (infrared, sent through a remote entity): the same buttons in a grid of four columns and as touch areas over its picture. */
  const ir = "remote.showcase_receiver_ir";
  const k = (c, extra) => key(ir, c, extra);
  const avrGrid = R("scavrgrid");
  avrGrid.name = "Receiver remote (grid)";
  avrGrid.rm.cols = 4;
  const lbl = (c, l, o) => btn(k(c), "", l, o);
  avrGrid.rm.btns = [
    btn(k("RECEIVER_POWER"), "power", "Receiver"), btn(k("INPUT_PREV"), "prev", "Input"), btn(k("INPUT_NEXT"), "next", "Select"), btn(k("SOURCE_POWER"), "power", "Source"),
    lbl("RECEIVER", "Receiver"), lbl("ZONE2", "Zone 2"), lbl("TV_INPUT", "TV input"), btn(k("TV_POWER"), "power", "TV"),
    lbl("BD", "BD"), lbl("TV", "TV"), lbl("DVR", "DVR"), btn(k("TV_CH_UP", { r: 1 }), "chup", "CH"),
    lbl("CD", "CD"), lbl("CD_R", "CD-R"), lbl("TUNER", "Tuner"), btn(k("TV_CH_DOWN", { r: 1 }), "chdown", "CH"),
    lbl("PORTABLE", "Portable"), lbl("MULTI_IN", "Multi in"), lbl("SIGNAL_SEL", "Signal sel"), btn(k("TV_VOL_UP", { r: 1 }), "volup", "Vol"),
    lbl("MIDNIGHT", "Midnight"), lbl("PHASE", "Phase"), lbl("S_RETRIEVER", "S.Retriever"), btn(k("TV_VOL_DOWN", { r: 1 }), "voldown", "Vol"),
    lbl("AUTO_DIRECT", "Auto/ direct"), lbl("STEREO_ALC", "Stereo/ A.L.C."), lbl("STANDARD", "Standard"), lbl("ADV_SURR", "Adv surr"),
    lbl("AUDIO_PARAMETER", "Audio param."), { a: { t: "dpad", u: k("TUNE_UP", { r: 1 }), d: k("TUNE_DOWN", { r: 1 }), l: k("PRESET_PREV"), r: k("PRESET_NEXT"), o: k("ENTER") }, i: "info", l: "", s: 2, h: 3 }, btn(k("TOOLS_MENU"), "cog", "Tools"),
    btn(k("MASTER_VOLUME_UP", { r: 1 }), "volup", "Master", { h: 1 }), btn(k("SETUP"), "home", "Setup"), btn(k("MASTER_VOLUME_DOWN", { r: 1 }), "voldown", "Master"),
    btn(k("RETURN"), "back", "Return"),
    btn(k("PAUSE"), "pause", ""), btn(k("STOP"), "stop", ""), btn(k("PLAY"), "play", ""), btn(k("MUTE"), "mute", "Mute"),
    btn(k("SKIP_PREV"), "prev", ""), btn(k("SKIP_NEXT"), "next", ""), btn(k("REWIND"), "prev", ""), btn(k("FORWARD"), "next", ""),
    btn(k("1"), "", "1"), btn(k("2"), "", "2"), btn(k("3"), "", "3"), lbl("DISPLAY", "Display"),
    btn(k("4"), "", "4"), btn(k("5"), "", "5"), btn(k("6"), "", "6"), btn(k("CH_UP", { r: 1 }), "chup", "CH"),
    btn(k("7"), "", "7"), btn(k("8"), "", "8"), btn(k("9"), "", "9"), btn(k("CH_DOWN", { r: 1 }), "chdown", "CH"),
    lbl("CLR", "Clear"), btn(k("0"), "", "0"), lbl("ENTER_KEY", "Enter"), lbl("SHIFT", "Shift"),
  ];
  kit.devs.push(avrGrid);

  const have = await fetch("/local/avr-remote.png", { method: "HEAD" }).then((r) => r.ok, () => false);
  if (!have) return;
  const avrPic = R("scavrpic");
  avrPic.name = "Receiver remote (picture)";
  avrPic.rm.v = "i";
  const W = 207,
    H = 832;
  /* [command, centre x, centre y, width, height, shape] in pixels of the 207 by 832 picture. */
  const spots = [
    ["RECEIVER_POWER", 40, 51, 30, 14], ["INPUT_PREV", 82, 51, 30, 14], ["INPUT_NEXT", 123, 51, 30, 14], ["SOURCE_POWER", 165, 51, 30, 14],
    ["RECEIVER", 40, 89, 30, 14], ["ZONE2", 82, 89, 30, 14], ["TV_INPUT", 123, 89, 30, 14], ["TV_POWER", 165, 89, 30, 14],
    ["BD", 40, 130, 25, 25, "e"], ["TV", 82, 130, 25, 25, "e"], ["DVR", 123, 130, 25, 25, "e"], ["TV_CH_UP", 166, 130, 22, 22, "e"],
    ["CD", 40, 170, 25, 25, "e"], ["CD_R", 82, 170, 25, 25, "e"], ["TUNER", 123, 170, 25, 25, "e"], ["TV_CH_DOWN", 166, 170, 22, 22, "e"],
    ["PORTABLE", 40, 211, 25, 25, "e"], ["MULTI_IN", 82, 211, 25, 25, "e"], ["SIGNAL_SEL", 123, 211, 25, 25, "e"], ["TV_VOL_UP", 166, 211, 22, 22, "e"],
    ["MIDNIGHT", 40, 252, 25, 25, "e"], ["PHASE", 82, 252, 25, 25, "e"], ["S_RETRIEVER", 123, 252, 25, 25, "e"], ["TV_VOL_DOWN", 166, 253, 22, 22, "e"],
    ["AUTO_DIRECT", 40, 312, 31, 14], ["STEREO_ALC", 82, 312, 31, 14], ["STANDARD", 124, 312, 31, 14], ["ADV_SURR", 167, 312, 31, 14],
    ["AUDIO_PARAMETER", 35, 361, 18, 18, "e"], ["TOOLS_MENU", 130, 364, 18, 18, "e"], ["MASTER_VOLUME_UP", 170, 377, 21, 40], ["MASTER_VOLUME_DOWN", 170, 443, 21, 46],
    ["TUNE_UP", 82, 379, 40, 16], ["PRESET_PREV", 48, 414, 20, 36], ["ENTER", 82, 413, 24, 24, "e"], ["PRESET_NEXT", 118, 414, 20, 36], ["TUNE_DOWN", 82, 447, 40, 16],
    ["SETUP", 35, 462, 18, 18, "e"], ["RETURN", 131, 462, 18, 18, "e"],
    ["PAUSE", 41, 511, 28, 22], ["STOP", 83, 511, 28, 22], ["PLAY", 125, 511, 28, 22], ["MUTE", 167, 511, 28, 22],
    ["SKIP_PREV", 45, 560, 34, 25], ["SKIP_NEXT", 80, 560, 34, 25], ["REWIND", 128, 560, 34, 25], ["FORWARD", 165, 560, 34, 25],
    ["DISPLAY", 168, 614, 30, 12], ["1", 41, 617, 28, 18], ["2", 82, 617, 28, 18], ["3", 124, 617, 28, 18],
    ["4", 41, 646, 28, 18], ["5", 83, 646, 28, 18], ["6", 125, 646, 28, 18], ["CH_UP", 168, 645, 30, 16],
    ["7", 41, 677, 28, 18], ["8", 83, 677, 28, 18], ["9", 125, 677, 28, 18], ["CH_DOWN", 168, 676, 30, 16],
    ["CLR", 42, 702, 28, 16], ["0", 83, 707, 28, 16], ["ENTER_KEY", 125, 707, 28, 16], ["SHIFT", 168, 706, 30, 14],
  ];
  avrPic.rm.img = {
    u: "/local/avr-remote.png",
    hs: spots.map(([c, cx, cy, ww, hh, sh]) => ({ x: ((cx - ww / 2) / W) * 100, y: ((cy - hh / 2) / H) * 100, w: (ww / W) * 100, h: (hh / H) * 100, r: sh === "e" ? "ellipse" : "rect", a: k(c, /^(TV_CH|TV_VOL|TUNE_|MASTER|CH_)/.test(c) ? { r: 1 } : {}) })),
  };
  kit.devs.push(avrPic);
}
