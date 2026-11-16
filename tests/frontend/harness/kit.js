/* Invented household devices for looking at the device kinds that are built from slots (appliance, vacuum extras, remote). `?kit=1` adds them to the harness.
   They follow how Home Connect (oven, washer, dryer, dishwasher) and a Roborock-style vacuum name and type things, with invented names and ids. */

function s(entity_id, value, attributes = {}) {
  const now = new Date().toISOString();
  return [entity_id, { entity_id, state: String(value), attributes, last_changed: now, last_updated: now, context: {} }];
}

const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

/* [entity, platform, device, name]. A device id is 32 characters of hex in Home Assistant; these are invented. */
const DEVICES = {
  oven: ["a".repeat(32), "Oven"],
  washer: ["b".repeat(32), "Washer"],
  dryer: ["c".repeat(32), "Dryer"],
  dish: ["d".repeat(32), "Dishwasher"],
  vac: ["e".repeat(32), "Hallway vacuum"],
  scripts: ["f".repeat(32), "Scripts"],
};

export function kitStates() {
  return [
    // Oven: a state sensor that is an enum, a program select, a target temperature, a door, remote start allowed, start and stop buttons.
    s("sensor.oven_operation_state", "ready", { friendly_name: "Oven Operation state", device_class: "enum", options: ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"] }),
    s("select.oven_program", "Hot air", { friendly_name: "Oven Program", options: ["Hot air", "Top and bottom heat", "Pizza setting", "Defrost"] }),
    s("number.oven_setpoint_temperature", "180", { friendly_name: "Oven Target temperature", min: 30, max: 250, step: 5, unit_of_measurement: "°C", device_class: "temperature" }),
    s("number.oven_duration", "1800", { friendly_name: "Oven Duration", min: 60, max: 21600, step: 60, unit_of_measurement: "s", device_class: "duration" }),
    s("sensor.oven_remaining_program_time", "unknown", { friendly_name: "Oven Remaining program time", device_class: "timestamp" }),
    s("sensor.oven_program_progress", "unknown", { friendly_name: "Oven Program progress", unit_of_measurement: "%" }),
    s("binary_sensor.oven_door", "off", { friendly_name: "Oven Door", device_class: "door" }),
    s("binary_sensor.oven_remote_start_allowed", "on", { friendly_name: "Oven Remote start allowed" }),
    s("button.oven_start", "unknown", { friendly_name: "Oven Start" }),
    s("button.oven_stop", "unknown", { friendly_name: "Oven Stop" }),
    s("sensor.oven_current_temperature", "22", { friendly_name: "Oven Current temperature", unit_of_measurement: "°C", device_class: "temperature" }),
    // Washer: running, with time left and progress; remote start allowed.
    s("sensor.washer_operation_state", "run", { friendly_name: "Washer Operation state", device_class: "enum", options: ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"] }),
    s("select.washer_program", "Cotton", { friendly_name: "Washer Program", options: ["Cotton", "Eco 40-60", "Quick 15", "Wool"] }),
    s("sensor.washer_remaining_program_time", inMinutes(72), { friendly_name: "Washer Remaining program time", device_class: "timestamp" }),
    s("sensor.washer_program_progress", "40", { friendly_name: "Washer Program progress", unit_of_measurement: "%" }),
    s("binary_sensor.washer_door", "off", { friendly_name: "Washer Door", device_class: "door" }),
    s("binary_sensor.washer_remote_start_allowed", "on", { friendly_name: "Washer Remote start allowed" }),
    s("switch.washer_power", "on", { friendly_name: "Washer Power" }),
    s("button.washer_start", "unknown", { friendly_name: "Washer Start" }),
    s("button.washer_stop", "unknown", { friendly_name: "Washer Stop" }),
    // Dryer: finished, remote start is off on the appliance.
    s("sensor.dryer_operation_state", "finished", { friendly_name: "Dryer Operation state", device_class: "enum", options: ["inactive", "ready", "run", "pause", "finished", "error"] }),
    s("select.dryer_program", "Cotton", { friendly_name: "Dryer Program", options: ["Cotton", "Synthetics", "Delicates"] }),
    s("sensor.dryer_remaining_program_time", "0", { friendly_name: "Dryer Remaining program time", device_class: "duration", unit_of_measurement: "s" }),
    s("binary_sensor.dryer_remote_start_allowed", "off", { friendly_name: "Dryer Remote start allowed" }),
    s("button.dryer_start", "unknown", { friendly_name: "Dryer Start" }),
    // Dishwasher: the plainest, its power and start are switches, state is a plain sensor with a free-text value.
    s("sensor.dishwasher_status", "Rinsing", { friendly_name: "Dishwasher Status" }),
    s("switch.dishwasher_start", "off", { friendly_name: "Dishwasher Start" }),
    s("binary_sensor.dishwasher_door", "on", { friendly_name: "Dishwasher Door", device_class: "door" }),
    s("sensor.dishwasher_time_left", "35", { friendly_name: "Dishwasher Time left", device_class: "duration", unit_of_measurement: "min" }),
    s("sensor.dishwasher_progress", "130", { friendly_name: "Dishwasher Progress", unit_of_measurement: "%" }),
    // A vacuum from the vacuum domain with no map integration: map camera, room buttons, fan speed select, upkeep sensors.
    s("vacuum.hallway", "docked", { friendly_name: "Hallway vacuum", battery_level: 80, fan_speed: "balanced", fan_speed_list: ["quiet", "balanced", "turbo"], supported_features: 12316 }),
    s("camera.hallway_map", "idle", { friendly_name: "Hallway vacuum Map", entity_picture: "/tests/frontend/harness/door-cam.svg" }),
    s("button.hallway_clean_kitchen", "unknown", { friendly_name: "Clean kitchen" }),
    s("button.hallway_clean_bedroom", "unknown", { friendly_name: "Clean bedroom" }),
    s("script.hallway_clean_all", "off", { friendly_name: "Clean everything" }),
    s("select.hallway_mop_mode", "off", { friendly_name: "Hallway Mop mode", options: ["off", "low", "high"] }),
    s("number.hallway_suction", "2", { friendly_name: "Hallway Suction", min: 1, max: 4, step: 1 }),
    s("sensor.hallway_filter_left", "36", { friendly_name: "Hallway Filter left", unit_of_measurement: "h", device_class: "duration" }),
    s("sensor.hallway_main_brush_left", "210", { friendly_name: "Hallway Main brush left", unit_of_measurement: "h", device_class: "duration" }),
    s("binary_sensor.hallway_dust_bin_full", "off", { friendly_name: "Hallway Dust bin full" }),
    // Scripts and scenes for a custom remote.
    s("script.movie_mode", "off", { friendly_name: "Movie mode" }),
    s("script.good_night", "off", { friendly_name: "Good night" }),
    s("script.broken_script", "unavailable", { friendly_name: "Broken script" }),
    s("input_button.garage_door", "unknown", { friendly_name: "Garage door" }),
  ];
}

export function kitEntities(reg) {
  const rows = [];
  const add = (device, ids) => ids.forEach((id) => rows.push(reg(id, "kit", "kit-" + id, DEVICES[device][0], { area_id: "living" })));
  add("oven", ["sensor.oven_operation_state", "select.oven_program", "number.oven_setpoint_temperature", "number.oven_duration", "sensor.oven_remaining_program_time", "sensor.oven_program_progress", "binary_sensor.oven_door", "binary_sensor.oven_remote_start_allowed", "button.oven_start", "button.oven_stop", "sensor.oven_current_temperature"]);
  add("washer", ["sensor.washer_operation_state", "select.washer_program", "sensor.washer_remaining_program_time", "sensor.washer_program_progress", "binary_sensor.washer_door", "binary_sensor.washer_remote_start_allowed", "switch.washer_power", "button.washer_start", "button.washer_stop"]);
  add("dryer", ["sensor.dryer_operation_state", "select.dryer_program", "sensor.dryer_remaining_program_time", "binary_sensor.dryer_remote_start_allowed", "button.dryer_start"]);
  add("dish", ["sensor.dishwasher_status", "switch.dishwasher_start", "binary_sensor.dishwasher_door", "sensor.dishwasher_time_left", "sensor.dishwasher_progress"]);
  add("vac", ["vacuum.hallway", "camera.hallway_map", "button.hallway_clean_kitchen", "button.hallway_clean_bedroom", "script.hallway_clean_all", "select.hallway_mop_mode", "number.hallway_suction", "sensor.hallway_filter_left", "sensor.hallway_main_brush_left", "binary_sensor.hallway_dust_bin_full"]);
  add("scripts", ["script.movie_mode", "script.good_night", "script.broken_script", "input_button.garage_door"]);
  return rows;
}

export const kitDevices = Object.values(DEVICES).map(([id, name]) => ({ id, name, area_id: "living", manufacturer: "Invented", model: "Test" }));

/* What a command does to the pretend appliances, so a press can be seen to take effect (the way Home Connect answers a start). */
export function kitReact(states, domain, service, id, set) {
  if (domain === "button" && id === "button.oven_start") set("sensor.oven_operation_state", "run", { }), set("sensor.oven_remaining_program_time", inMinutes(30)), set("sensor.oven_program_progress", "5");
  if (domain === "button" && id === "button.oven_stop") set("sensor.oven_operation_state", "ready"), set("sensor.oven_remaining_program_time", "unknown");
  if (domain === "button" && id === "button.washer_stop") set("sensor.washer_operation_state", "ready");
  if (domain === "vacuum" && service === "start") set("vacuum.hallway", "cleaning");
  if (domain === "vacuum" && service === "return_to_base") set("vacuum.hallway", "returning");
}
