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

export function makeHass(query) {
  const withSync = query.get("sync") !== "0";
  const withBox = query.get("box") !== "0";
  const states = Object.fromEntries([
    state("light.desk_lamp", "on", { friendly_name: "Desk lamp", brightness: 180, supported_color_modes: ["xy", "color_temp"], color_mode: "xy", xy_color: [0.4, 0.4], effect_list: ["off", "candle", "prism"], hue_light_id: "light-1" }),
    state("light.shelf_strip", "off", { friendly_name: "Shelf strip", supported_color_modes: ["xy"], hue_light_id: "light-2" }),
    state("light.ceiling_plain", "on", { friendly_name: "Ceiling (not Hue)", brightness: 255, supported_color_modes: ["brightness"] }),
    ...(withSync
      ? [
          state("switch.hue_spotify_sync", "off", { friendly_name: "Hue Spotify sync" }),
          state("number.hue_spotify_sync_sync_brightness", "80", { friendly_name: "Brightness", min: 1, max: 100, step: 1 }),
          state("switch.bridge_automatic_updates", "on", { friendly_name: "Automatic updates" }),
          state("button.bridge_search_for_new_devices", "unknown", { friendly_name: "Search for new devices" }),
          state("sensor.bridge_zigbee_channel", "25", { friendly_name: "Zigbee channel", extended_pan_id: "fake-pan" }),
          state("sensor.bridge_matter_fabrics", "1", { friendly_name: "Matter fabrics", max_fabrics: 16, has_qr_code: true, fabrics: [{ id: "f1", label: "Home", vendor: "Apple", status: "paired" }] }),
          state("sensor.bridge_authorized_apps", "2", { friendly_name: "Authorized apps", apps: [{ id: "a1", name: "Hue app" }, { id: "a2", name: "Home Assistant" }] }),
          state("sensor.bridge_home_and_away", "configured", { friendly_name: "Home and Away" }),
          state("sensor.bridge_firmware", "1976154040", { friendly_name: "Firmware" }),
          state("update.bridge_firmware", "off", { friendly_name: "Bridge firmware", installed_version: "1976154040", latest_version: "1976154040" }),
          state("update.desk_lamp_firmware", "on", { friendly_name: "Desk lamp firmware", installed_version: "1.1", latest_version: "1.2" }),
          state("sensor.bridge_tv_area", "inactive", { friendly_name: "TV area", type: "screen", end_state: "last_state", area_id: "area-1", lights: [] }),
          state("sensor.bridge_live_scenes", "idle", { friendly_name: "Live scenes" }),
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
    ...(withSync
      ? [
          reg("switch.hue_spotify_sync", "hue_plus", `${BRIDGE}_sync_sync`, "dev-spotify"),
          reg("number.hue_spotify_sync_sync_brightness", "hue_plus", `${BRIDGE}_sync_brightness`, "dev-spotify"),
          reg("switch.bridge_automatic_updates", "hue_plus", `${BRIDGE}_auto_update`, "dev-bridge"),
          reg("button.bridge_search_for_new_devices", "hue_plus", `${BRIDGE}_search`, "dev-bridge"),
          reg("sensor.bridge_zigbee_channel", "hue_plus", `${BRIDGE}_zigbee_channel`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_matter_fabrics", "hue_plus", `${BRIDGE}_matter_fabrics`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_authorized_apps", "hue_plus", `${BRIDGE}_authorized_apps`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_home_and_away", "hue_plus", `${BRIDGE}_home_and_away`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("sensor.bridge_firmware", "hue_plus", `${BRIDGE}_firmware`, "dev-bridge", { entity_category: "diagnostic" }),
          reg("update.bridge_firmware", "hue_plus", `${BRIDGE}_bridge_update`, "dev-bridge"),
          reg("update.desk_lamp_firmware", "hue_plus", "lamp_update", "dev-lamp"),
          reg("sensor.bridge_tv_area", "hue_plus", `${BRIDGE}_area_area-1`, "dev-bridge"),
          reg("sensor.bridge_live_scenes", "hue_plus", `${BRIDGE}_live_scenes`, "dev-bridge"),
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
    ["dev-bridge", "Hue Bridge"], ["dev-spotify", "Hue Spotify sync"], ["dev-box", "Living room box"],
  ].map(([id, name]) => ({ id, name, area_id: null, manufacturer: "Invented", model: "Test" }));

  const stored = { user: {}, system: {} };
  const calls = [];
  window.__calls = calls;
  const listeners = {};
  const resources = {
    automations: [
      { id: "auto-1", name: "Wake up", enabled: true, script: "Basic wake up routine", status: "running" },
      { id: "auto-2", name: "Evening timer", enabled: false, script: "Timers", status: "disabled" },
    ],
    rooms: [{ id: "room-1", name: "Living room", children: [{ id: "dev-lamp", name: "Desk lamp" }] }],
    zones: [], scenes: [], smart_scenes: [], entertainment_areas: [{ id: "area-1", name: "TV", type: "screen", end_state: "last_state", lights: [] }],
    motion_areas: { candidates: [], areas: [] },
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
        case "call_service": {
          calls.push({ domain: msg.domain, service: msg.service, data: msg.service_data, response: true });
          if (msg.domain === "hue_plus" && msg.service === "get_resources") return Promise.resolve({ response: resources });
          if (msg.domain === "hue_plus" && msg.service === "get_library") return Promise.resolve({ response: { scenes: [], areas: [] } });
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
      number: { set_value: {} }, button: { press: {} }, scene: { turn_on: {} }, update: { install: {} },
      ...(withSync ? { hue_plus: Object.fromEntries(["get_resources", "get_library", "set_effect", "set_style", "configure_light", "timed_effect", "signal", "create_routine", "configure_button", "set_streaming_end_state", "stream_colors", "stop_streaming", "set_motion_area", "set_auto_update", "check_for_update", "install_bridge_update", "set_zigbee_channel", "search_for_devices", "remove_matter_fabric", "revoke_app", "update_entertainment_area", "scene_start", "scene_stop"].map((s) => [s, {}])) } : {}),
    },
    config: { unit_system: { temperature: "°C" }, time_zone: "UTC", language: "en", components: [] },
    user: { id: "u1", name: "Test user", is_admin: query.get("user") !== "guest", is_owner: true },
    locale: { language: "en", time_format: "24" },
    connected: true,
    connection,
    callService(domain, service, data) {
      calls.push({ domain, service, data });
      // The few states a click should visibly change, so a control can be checked.
      const id = data && data.entity_id;
      const target = typeof id === "string" ? states[id] : null;
      if (target && domain === "switch") target.state = service === "turn_on" ? "on" : service === "turn_off" ? "off" : target.state === "on" ? "off" : "on";
      if (target && domain === "select" && service === "select_option") target.state = data.option;
      if (target && domain === "number" && service === "set_value") target.state = String(data.value);
      hass.states = { ...states };
      document.querySelector("dashboard-panel") && (document.querySelector("dashboard-panel").hass = hass);
      return Promise.resolve();
    },
    callApi() { return Promise.resolve({}); },
  };
  return hass;
}
