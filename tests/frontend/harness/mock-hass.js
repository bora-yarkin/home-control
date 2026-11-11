/* A pretend Home Assistant for the panel: states, registries, services and the websocket commands the adapter uses.
   All names and ids are invented. Nothing leaves the page; saved settings live in memory. */

const BRIDGE = "bridgeuid00000000000000000000000000";
const BOX = "boxuid0000000000000000000000000000";

function state(entity_id, value, attributes = {}) {
  const now = new Date().toISOString();
  return [entity_id, { entity_id, state: String(value), attributes, last_changed: now, last_updated: now, context: {} }];
}

function reg(entity_id, platform, unique_id, device_id, extra = {}) {
  return { entity_id, platform, unique_id, device_id, area_id: null, disabled_by: null, entity_category: null, ...extra };
}

/* The effects catalogues Home Control would offer: Hue Plus's (from its real declaration) and, once "imported", a file. `?effects=0` has none. */
let imported = null;
function effectSources() {
  if (new URLSearchParams(location.search).get("effects") === "0") return Promise.resolve([]);
  return fetch(new URL("effects-fixture.json", import.meta.url)).then((r) => r.json()).then((f) => (imported ? [f.hue, imported] : [f.hue]));
}
function importEffects(content) {
  let data;
  try {
    data = typeof content === "string" ? JSON.parse(content) : content;
  } catch (err) {
    return Promise.resolve({ ok: false, problems: ["the file is not valid JSON: " + err.message] });
  }
  if (!data || data.schema !== 1) return Promise.resolve({ ok: false, problems: ["schema: must be 1", "effects[0].speeed: is not a field of this syntax (check the spelling)"] });
  return fetch(new URL("effects-fixture.json", import.meta.url)).then((r) => r.json()).then((f) => {
    imported = f.file;
    return { ok: true, id: f.file.id, name: f.file.name, effects: f.file.effects.length };
  });
}

export function makeHass(query) {
  const withSync = query.get("sync") !== "0";
  const withBox = query.get("box") !== "0";
  // ?many=1: nine white lights of one room at different temperatures, for the wheel that opens a group as a circle of its lights.
  const manyKelvin = query.get("many") === "1" ? [2403, 2702, 3558, 2403, 2702, 3558, 2403, 2702, 3558] : [];
  const states = Object.fromEntries([
    state("light.desk_lamp", "on", { friendly_name: "Desk lamp", brightness: 180, supported_color_modes: ["xy", "color_temp"], color_mode: "xy", xy_color: [0.4, 0.4], effect_list: ["off", "candle", "prism"], hue_light_id: "light-1", hue_function: "mixed", hue_min_brightness: 0.2, hue_gamut: "C" }),
    state("light.shelf_strip", "off", { friendly_name: "Shelf strip", supported_color_modes: ["xy"], hue_light_id: "light-2", hue_function: "decorative", hue_gradient_orientation: "horizontal", hue_gradient_orientation_configurable: true, hue_gradient_order: "forward", hue_gradient_order_configurable: true }),
    state("light.ceiling_plain", "on", { friendly_name: "Ceiling (not Hue)", brightness: 255, supported_color_modes: ["brightness"] }),
    // The Hue lights of a room: the room's own group light (its scenes play on it), a zoned gradient light, and the room's Hue scenes. The "Scene" select says which is on.
    state("light.living_room", "on", { friendly_name: "Living room", brightness: 150, is_hue_group: true, hue_type: "room", entity_id: ["light.desk_lamp", "light.shelf_strip"], color_mode: "xy", xy_color: [0.3, 0.3] }),
    state("light.gradient_tube", "on", {
      friendly_name: "Gradient tube", supported_color_modes: ["xy"], color_mode: "xy", brightness: 200, xy_color: [0.2, 0.3], hue_light_id: "light-3",
      entity_id: ["light.gradient_tube_zone_1", "light.gradient_tube_zone_2", "light.gradient_tube_zone_3"], zone_colors: [[0.6, 0.35], [0.3, 0.5], [0.15, 0.1]],
      gradient_mode: "interpolated_palette", gradient_modes: ["interpolated_palette", "interpolated_palette_mirrored", "random_pixelated", "segmented_palette"],
    }),
    ...manyKelvin.map((k, i) => state(`light.many_${i + 1}`, "on", { friendly_name: `White ${i + 1}`, brightness: 200, supported_color_modes: ["color_temp"], color_mode: "color_temp", color_temp_kelvin: k, min_color_temp_kelvin: 2202, max_color_temp_kelvin: 6535 })),
    ...[1, 2, 3].map((n) => state(`light.gradient_tube_zone_${n}`, "on", { friendly_name: `Gradient tube zone ${n}`, supported_color_modes: ["xy"], color_mode: "xy", brightness: 200, xy_color: [0.2, 0.3] })),
    // A Samsung TV (samsungtv_smart): its sources are apps and inputs; the remote entity belongs to the same device.
    state("media_player.living_tv", "on", { friendly_name: "Living TV", source: "YouTube", source_list: ["TV", "HDMI", "YouTube", "Netflix", "Spotify - Music and Podcasts"], supported_features: 24509 }),
    state("remote.living_tv", "on", { friendly_name: "Living TV" }),
    // The TV's screen brightness is its Backlight (a Samsung's Brightness number is the black level); the remote's brightness button sets it, never the room's lights.
    state("number.living_tv_backlight", "25", { friendly_name: "Living TV Backlight", min: 0, max: 50, step: 1 }),
    state("number.living_tv_brightness", "0", { friendly_name: "Living TV Brightness", min: -50, max: 50, step: 1 }),
    // A door station with an intercom: the call indicator says idle, ringing or call in progress and names where its audio is.
    state("camera.door_station", "idle", { friendly_name: "Door station", entity_picture: "/none" }),
    state("sensor.door_call_status", "idle", { friendly_name: "Call status", options: ["idle", "ringing", "call in progress"], listen_path: "/api/test_intercom/listen/e/s", talk_path: "/api/test_intercom/talk/e/s" }),
    state("button.door_answer", "unknown", { friendly_name: "Answer call" }),
    state("button.door_hang_up", "unknown", { friendly_name: "Hang up call" }),
    state("lock.door_front", "locked", { friendly_name: "Front door" }),
    state("scene.living_room_arctic_aurora", "unknown", { friendly_name: "Living room Arctic aurora", name: "Arctic aurora", is_dynamic: true, group_name: "Living room", speed: 0.5, brightness: 200 }),
    state("scene.living_room_reading", "unknown", { friendly_name: "Living room Reading", name: "Reading", is_dynamic: false, group_name: "Living room" }),
    state("select.living_room_scene", "Reading", { friendly_name: "Scene", options: ["Arctic aurora", "Reading"] }),
    // Home Control's own integration plays live scenes for every light; its sensor lists what is running.
    state("sensor.home_control_live_scenes", "0", { friendly_name: "Live scenes", sessions: {}, saved_scenes: 0, saved_areas: 0 }),
    ...(withSync
      ? [
          state("switch.hue_spotify_sync", "off", { friendly_name: "Hue Spotify sync" }),
          state("number.hue_spotify_sync_sync_brightness", "80", { friendly_name: "Brightness", min: 1, max: 100, step: 1 }),
          state("switch.bridge_automatic_updates", "on", { friendly_name: "Automatic updates" }),
          state("select.desk_lamp_power_on", "powerfail", { friendly_name: "Power-on behavior", options: ["safety", "powerfail", "last_on_state"] }),
          state("button.desk_lamp_identify", "unknown", { friendly_name: "Identify" }),
          state("button.bridge_search_for_new_devices", "unknown", { friendly_name: "Search for new devices" }),
          state("sensor.bridge_zigbee_channel", "25", { friendly_name: "Zigbee channel", extended_pan_id: "fake-pan" }),
          state("sensor.bridge_matter_fabrics", "1", { friendly_name: "Matter fabrics", max_fabrics: 16, has_qr_code: true, fabrics: [{ id: "f1", label: "Home", vendor: "Apple", status: "paired" }] }),
          state("sensor.bridge_authorized_apps", "2", { friendly_name: "Authorized apps", apps: [{ id: "a1", name: "Hue app" }, { id: "a2", name: "Home Assistant" }] }),
          state("sensor.bridge_home_and_away", "configured", { friendly_name: "Home and Away" }),
          state("sensor.bridge_firmware", "1976154040", { friendly_name: "Firmware" }),
          state("update.bridge_firmware", "off", { friendly_name: "Bridge firmware", installed_version: "1976154040", latest_version: "1976154040" }),
          state("update.desk_lamp_firmware", "on", { friendly_name: "Desk lamp firmware", installed_version: "1.1", latest_version: "1.2" }),
          state("sensor.bridge_tv_area", "inactive", { friendly_name: "TV area", type: "screen", end_state: "last_state", area_id: "area-1", lights: [] }),
        ]
      : []),
    ...(withBox
      ? [
          state("switch.living_room_box_sync", "on", { friendly_name: "Living room box" }),
          state("select.living_room_box_mode", "video", { friendly_name: "Mode", options: ["video", "game", "music", "passthrough", "powersave"] }),
          state("select.living_room_box_hdmi_input", "Console", { friendly_name: "HDMI input", options: ["Console", "TV box", "input3", "input4"] }),
          state("select.living_room_box_intensity", "high", { friendly_name: "Intensity", options: ["subtle", "moderate", "high", "intense"] }),
          state("number.living_room_box_brightness", "120", { friendly_name: "Brightness", min: 0, max: 200, step: 1 }),
          state("binary_sensor.living_room_box_hdmi_signal", "on", { friendly_name: "HDMI signal" }),
        ]
      : []),
  ]);

  const entities = [
    reg("light.desk_lamp", "hue_plus", "light-1", "dev-lamp"),
    reg("light.shelf_strip", "hue_plus", "light-2", "dev-strip"),
    reg("light.ceiling_plain", "other", "plain-1", "dev-plain"),
    reg("sensor.home_control_live_scenes", "home_control", "entry1_live_scenes", "dev-home-control"),
    reg("light.living_room", "hue_plus", "group-1", "dev-living-group", { area_id: "living" }),
    reg("light.gradient_tube", "hue_plus", "light-3", "dev-tube", { area_id: "living" }),
    ...manyKelvin.map((_, i) => reg(`light.many_${i + 1}`, "other", `many-${i + 1}`, `dev-many-${i + 1}`, { area_id: "living" })),
    ...[1, 2, 3].map((n) => reg(`light.gradient_tube_zone_${n}`, "hue_plus", `light-3_zone_${n}`, "dev-tube", { area_id: "living" })),
    reg("media_player.living_tv", "samsungtv_smart", "tv-1", "dev-tv", { area_id: "living" }),
    reg("remote.living_tv", "samsungtv_smart", "tv-1-remote", "dev-tv", { area_id: "living" }),
    reg("number.living_tv_backlight", "samsungtv_smart", "tv-1-backlight", "dev-tv", { area_id: "living", original_name: "Backlight" }),
    reg("number.living_tv_brightness", "samsungtv_smart", "tv-1-brightness", "dev-tv", { area_id: "living", original_name: "Brightness" }),
    reg("camera.door_station", "test_intercom", "door-cam", "dev-door", { area_id: "living" }),
    reg("sensor.door_call_status", "test_intercom", "door-call", "dev-door", { area_id: "living" }),
    reg("button.door_answer", "test_intercom", "door-answer", "dev-door", { area_id: "living" }),
    reg("button.door_hang_up", "test_intercom", "door-hangup", "dev-door", { area_id: "living" }),
    reg("lock.door_front", "test_intercom", "door-lock", "dev-door", { area_id: "living" }),
    reg("scene.living_room_arctic_aurora", "hue_plus", "scene-1", "dev-living-group", { area_id: "living" }),
    reg("scene.living_room_reading", "hue", "scene-2", "dev-living-group", { area_id: "living" }),
    reg("select.living_room_scene", "hue_plus", "group-1_scene", "dev-living-group", { area_id: "living" }),
    ...(withSync
      ? [
          reg("switch.hue_spotify_sync", "hue_plus", `${BRIDGE}_sync_sync`, "dev-spotify"),
          reg("number.hue_spotify_sync_sync_brightness", "hue_plus", `${BRIDGE}_sync_brightness`, "dev-spotify"),
          reg("switch.bridge_automatic_updates", "hue_plus", `${BRIDGE}_auto_update`, "dev-bridge"),
          reg("button.bridge_search_for_new_devices", "hue_plus", `${BRIDGE}_search`, "dev-bridge"),
          reg("select.desk_lamp_power_on", "hue_plus", `${BRIDGE}_powerup_light-1`, "dev-lamp"),
          reg("button.desk_lamp_identify", "hue_plus", `${BRIDGE}_identify_light-1`, "dev-lamp"),
          reg("sensor.bridge_zigbee_channel", "hue_plus", `${BRIDGE}_zigbee_channel`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_matter_fabrics", "hue_plus", `${BRIDGE}_matter_fabrics`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_authorized_apps", "hue_plus", `${BRIDGE}_authorized_apps`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_home_and_away", "hue_plus", `${BRIDGE}_home_and_away`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_firmware", "hue_plus", `${BRIDGE}_firmware`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("update.bridge_firmware", "hue_plus", `${BRIDGE}_bridge_update`, "dev-bridge"),
          reg("update.desk_lamp_firmware", "hue_plus", "lamp_update", "dev-lamp"),
          reg("sensor.bridge_tv_area", "hue_plus", `${BRIDGE}_area_area-1`, "dev-bridge"),
        ]
      : []),
    ...(withBox
      ? [
          reg("switch.living_room_box_sync", "hue_plus", `${BOX}_syncbox_sync`, "dev-box"),
          reg("select.living_room_box_mode", "hue_plus", `${BOX}_syncbox_mode`, "dev-box"),
          reg("select.living_room_box_hdmi_input", "hue_plus", `${BOX}_syncbox_source`, "dev-box"),
          reg("select.living_room_box_intensity", "hue_plus", `${BOX}_syncbox_intensity`, "dev-box"),
          reg("number.living_room_box_brightness", "hue_plus", `${BOX}_syncbox_brightness`, "dev-box"),
          reg("binary_sensor.living_room_box_hdmi_signal", "hue_plus", `${BOX}_syncbox_hdmi_signal`, "dev-box"),
        ]
      : []),
  ];
  const devices = [
    ["dev-lamp", "Desk lamp"], ["dev-strip", "Shelf strip"], ["dev-plain", "Ceiling (not Hue)"],
    ["dev-bridge", "Hue Bridge"], ["dev-living-group", "Living room"], ["dev-tube", "Gradient tube"], ["dev-spotify", "Hue Spotify sync"], ["dev-box", "Living room box"], ["dev-tv", "Living TV"], ["dev-door", "Door station"],
  ].map(([id, name]) => ({ id, name, area_id: null, manufacturer: "Invented", model: "Test" }));

  const stored = { user: {}, system: {} };
  const calls = [];
  window.__calls = calls;
  const listeners = {};
  const resources = {
    automations: [
      { id: "auto-1", name: "Wake up", enabled: true, script: "Basic wake up routine", status: "running" },
      { id: "auto-2", name: "Evening timer", enabled: false, script: "Timers", status: "disabled" },
      { id: "auto-3", name: "Hallway lights", enabled: true, script: "Motion Sensor", status: "running", configuration: { source: { rid: "ma-1", rtype: "motion_area_configuration" }, where: [{ group: { rid: "room-1", rtype: "room" } }], when: { timeslots: [{ start_time: { type: "time", time: { hour: 7, minute: 0 } }, on_motion: { recall_single: [{ action: { recall: { rid: "scene-4", rtype: "scene" } } }] }, on_no_motion: { after: { minutes: 10 }, recall_single: [{ action: "all_off" }] } }, { start_time: { type: "time", time: { hour: 23, minute: 0 } }, on_motion: { recall_single: [{ action: { recall: { rid: "scene-3", rtype: "scene" } } }] } }] } } },
    ],
    rooms: [{ id: "room-1", name: "Living room", children: [{ id: "dev-lamp", name: "Desk lamp" }, { id: "dev-strip", name: "Shelf strip" }, { id: "dev-floor", name: "Floor lamp" }, { id: "dev-ceiling", name: "Ceiling light" }], lights: ["light-1", "light-2", "light-3", "light-4"] }],
    devices: [["dev-lamp", "Desk lamp"], ["dev-strip", "Shelf strip"], ["dev-floor", "Floor lamp"], ["dev-ceiling", "Ceiling light"]].map(([id, name]) => ({ id, name, model: "Hue color lamp", services: ["light", "motion_area_candidate"] })),
    zones: [{ id: "zone-1", name: "Desk area", children: [], lights: ["light-1"] }], smart_scenes: [], scenes: [{ id: "scene-1", name: "Movie", group_id: "room-1", group_type: "room", lights: ["light-1", "light-2"] }, { id: "scene-2", name: "Relax", group_id: "room-1", group_type: "room", lights: ["light-1", "light-2", "light-3"] }, { id: "scene-3", name: "Nightlight", group_id: "room-1", group_type: "room", lights: ["light-2"] }, { id: "scene-4", name: "Concentrate", group_id: "room-1", group_type: "room", lights: ["light-1"] }, { id: "scene-5", name: "Read", group_id: "room-1", group_type: "room", lights: ["light-1"] }],
    entertainment_areas: [
      {
        id: "area-1", name: "TV", type: "screen", end_state: "last_state", performance: "auto", performance_light: null,
        lights: [
          { light_id: "light-1", name: "Desk lamp", x: -0.6, y: -1, z: 0.4, balance: 1 },
          { light_id: "light-2", name: "Shelf strip", x: 0.5, y: 0.9, z: -0.2, balance: 1.5 },
        ],
      },
    ],
    motion_areas: {
      candidates: ["dev-lamp", "dev-strip", "dev-floor", "dev-ceiling"].map((owner, i) => ({ id: "cand-" + i, owner: { rid: owner, rtype: "device" }, capabilities: ["sensor", "collector", "sync"] })),
      areas: [{ id: "ma-1", name: "Hallway", group: { rid: "room-1", rtype: "room" }, participants: ["cand-0", "cand-1", "cand-2"].map((rid) => ({ resource: { rid, rtype: "motion_area_candidate" } })), services: [{ rid: "cv-1", rtype: "convenience_area_motion" }, { rid: "sec-1", rtype: "security_area_motion" }], health: "healthy", enabled: true }],
      services: [{ id: "cv-1", enabled: true, sensitivity: { sensitivity: 1, sensitivity_max: 2 } }],
    },
    apps: [{ id: "a1", name: "Hue app", last_used: "2026-11-04T21:00:00" }, { id: "a2", name: "Home Assistant", last_used: "2026-11-05T01:12:00" }],
    accessories: [
      {
        id: "acc-1", name: "Desk dimmer", dials: 0, automation_id: "auto-1",
        buttons: [{ id: "b1", number: 1, last_event: "short_release" }, { id: "b2", number: 2, last_event: null }, { id: "b3", number: 3, last_event: null }, { id: "b4", number: 4, last_event: "long_release" }],
        actions: {
          b1: { on_short_release: { action: "dim_up" }, on_long_press: { action: "dim_up" } },
          b2: {
            on_short_release: { recall_single_extended: { actions: [{ action: { recall: { rid: "scene-1", rtype: "scene" } } }], with_off: { enabled: true } } },
            on_long_press: { action: "do_nothing" },
          },
          b3: { on_short_release: { action: "dim_down" }, on_long_press: { action: "home_off" } },
          b4: {
            on_short_release: {
              scene_cycle_extended: {
                repeat_timeout: { seconds: 3 },
                slots: ["scene-1", "scene-2", "scene-3"].map((rid) => [{ action: { recall: { rid, rtype: "scene" } } }]),
                with_off: { enabled: true },
              },
            },
            on_long_press: {
              time_based_extended: {
                repeat_timeout: { seconds: 3 },
                slots: [["scene-1", 7, 0], ["scene-2", 20, 0], ["scene-3", 23, 0]].map(([rid, hour, minute]) => ({ actions: [{ action: { recall: { rid, rtype: "scene" } } }], start_time: { hour, minute } })),
                with_off: { enabled: false },
              },
            },
          },
        },
        targets: { b1: ["room-1"], b2: ["room-1"], b3: ["room-1"], b4: ["room-1"] },
      },
      { id: "acc-2", name: "Door tap switch", dials: 1, automation_id: null, buttons: [{ id: "b5", number: 1, last_event: null }], actions: {}, targets: {} },
    ],
    bridge: { name: "Hue Bridge Pro", time_zone: "Europe/Istanbul", internet: "connected" },
  };

  const connection = {
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    subscribeEvents() { return Promise.resolve(() => {}); },
    subscribeMessage(callback, msg) {
      if (msg.type.startsWith("frontend/subscribe_")) callback({ value: stored[msg.type.includes("system") ? "system" : "user"][msg.key] });
      return Promise.resolve(() => {});
    },
    sendMessagePromise(msg) {
      switch (msg.type) {
        case "config/entity_registry/list": return Promise.resolve(entities);
        case "config/device_registry/list": return Promise.resolve(devices);
        case "config/area_registry/list": return Promise.resolve([{ area_id: "living", name: "Living room", floor_id: null }]);
        case "config/floor_registry/list": return Promise.resolve([]);
        case "frontend/get_user_data": return Promise.resolve({ value: stored.user[msg.key] ?? null });
        case "frontend/get_system_data": return Promise.resolve({ value: stored.system[msg.key] ?? null });
        case "frontend/set_user_data": stored.user[msg.key] = msg.value; return Promise.resolve();
        case "frontend/set_system_data": stored.system[msg.key] = msg.value; return Promise.resolve();
        case "config/auth/list": return Promise.resolve([]);
        case "history/history_during_period": return Promise.resolve({});
        case "logbook/get_events": return Promise.resolve([]);
        case "home_control/effects": return effectSources().then((sources) => ({ sources }));
        case "home_control/plugins": return Promise.resolve({ plugins: withSync ? [{ id: "hue_plus", name: "Hue Plus", menu: "/hue_plus_static/menu.js", version: "harness" }] : [] });
        case "home_control/effects_import": return importEffects(msg.content);
        case "home_control/effects_delete": imported = null; return Promise.resolve({ ok: true });
        case "call_service": {
          calls.push({ domain: msg.domain, service: msg.service, data: msg.service_data, response: true });
          if (msg.domain === "hue_plus" && msg.service === "get_resources") return Promise.resolve({ response: resources });

          if (msg.domain === "hue_plus" && msg.service === "import_hue_scene")
            return Promise.resolve({
              response: {
                name: "Arctic aurora", live: true, speed: 0.55, brightness: 200, lights: ["light.desk_lamp", "light.shelf_strip"],
                palette: [{ xy: [0.2072, 0.4525], b: 100 }, { xy: [0.1868, 0.3328], b: 100 }, { xy: [0.1541, 0.0844], b: 100 }],
                states: [{ entity_id: "light.desk_lamp", on: true, brightness: 143, k: 2237 }, { entity_id: "light.shelf_strip", on: false }],
              },
            });
          if (msg.domain === "home_control" && msg.service === "get_library") return Promise.resolve({ response: { scenes: [], areas: [], presets: [] } });
          return Promise.resolve({ response: {} });
        }
        default: return Promise.resolve(null);
      }
    },
  };

  const hass = {
    states,
    services: {
      light: { turn_on: {}, turn_off: {} }, switch: { turn_on: {}, turn_off: {} }, select: { select_option: {} },
      number: { set_value: {} }, button: { press: {} }, scene: { turn_on: {} },  update: { install: {} },
      ...(withSync ? { hue_plus: Object.fromEntries(["get_resources", "set_effect", "set_style", "configure_light", "timed_effect", "signal", "create_routine", "configure_button", "set_streaming_end_state", "stream_colors", "stop_streaming", "set_motion_area", "create_motion_area", "set_motion_area_lights", "delete_motion_area", "update_routine", "update_automation", "delete_automation", "set_auto_update", "check_for_update", "install_bridge_update", "set_zigbee_channel", "search_for_devices", "remove_matter_fabric", "revoke_app", "update_entertainment_area", "import_hue_scene", "create_scene", "update_scene", "delete_scene", "create_daily_smart_scene", "set_name"].map((s) => [s, {}])) } : {}),
      home_control: Object.fromEntries(["scene_start", "scene_update", "scene_freeze", "scene_play", "scene_stop", "scene_save", "scene_delete", "area_save", "area_delete", "locate_light", "get_library"].map((s) => [s, {}])),
    },
    config: { unit_system: { temperature: "°C" }, time_zone: "UTC", language: "en", components: [] },
    user: { id: "u1", name: "Test user", is_admin: query.get("user") !== "guest", is_owner: true },
    locale: { language: "en", time_format: "24" },
    connected: true,
    connection,
    callService(domain, service, data) {
      calls.push({ domain, service, data });
      if (domain === "hue_plus" && service === "set_motion_area" && data.enabled === true) {
        const area = resources.motion_areas.areas.filter((x) => x.id === data.area)[0];
        if (area) area.health = "healthy";
      }
      if (domain === "hue_plus" && service === "create_motion_area")
        resources.motion_areas.areas.push({ id: "ma-" + (resources.motion_areas.areas.length + 1), name: data.name, group: { rid: data.group, rtype: "room" }, participants: [], services: [], health: "not_running", enabled: true });
      // The few states a click should visibly change, so a control can be checked.
      const id = data && data.entity_id;
      const target = typeof id === "string" ? states[id] : null;
      if (target && domain === "switch") target.state = service === "turn_on" ? "on" : service === "turn_off" ? "off" : target.state === "on" ? "off" : "on";
      if (domain === "button" && id === "button.door_answer") states["sensor.door_call_status"] = { ...states["sensor.door_call_status"], state: "call in progress" };
      if (domain === "button" && id === "button.door_hang_up") states["sensor.door_call_status"] = { ...states["sensor.door_call_status"], state: "idle" };
      // A lock follows its commands (a moment later, and it locks itself again after a few seconds), so a slide to unlock can be seen to finish.
      if (target && domain === "lock" && (service === "unlock" || service === "lock")) {
        const set = (state) => () => {
          states[id] = { ...states[id], state };
          hass.states = { ...states };
          document.querySelector("dashboard-panel") && (document.querySelector("dashboard-panel").hass = hass);
        };
        setTimeout(set(service === "unlock" ? "unlocked" : "locked"), 400);
        if (service === "unlock") setTimeout(set("locked"), 7000);
      }
      if (target && domain === "media_player" && service === "select_source") target.attributes = { ...target.attributes, source: data.source };
      // `?lag=300` makes each light answer a light command 300 ms after the one before it, the way separate integrations do.
      const lag = Number(new URLSearchParams(location.search).get("lag"));
      if (domain === "light" && (service === "turn_on" || service === "turn_off")) {
        [].concat(id || []).forEach((lid, i) => {
          if (!states[lid]) return;
          setTimeout(() => {
            states[lid] = { ...states[lid], state: service === "turn_on" ? "on" : "off", attributes: { ...states[lid].attributes, ...(service === "turn_on" ? { brightness: data.brightness_pct ? Math.round(data.brightness_pct * 2.55) : 255 } : {}) } };
            hass.states = { ...states };
            document.querySelector("dashboard-panel") && (document.querySelector("dashboard-panel").hass = hass);
          }, lag * (i + 1));
        });
      }
      if (target && domain === "select" && service === "select_option") target.state = data.option;
      if (target && domain === "number" && service === "set_value") target.state = String(data.value);
      hass.states = { ...states };
      document.querySelector("dashboard-panel") && (document.querySelector("dashboard-panel").hass = hass);
      return Promise.resolve();
    },
    callApi() { return Promise.resolve({}); },
    // Sets a state (and merges attributes) in the harness's own states, so a later service call does not put the old one back.
    setState(id, state, attributes = {}) {
      states[id] = { ...states[id], ...(state === null ? {} : { state }), attributes: { ...states[id].attributes, ...attributes } };
      hass.states = { ...states };
      document.querySelector("dashboard-panel") && (document.querySelector("dashboard-panel").hass = hass);
    },
  };
  return hass;
}
