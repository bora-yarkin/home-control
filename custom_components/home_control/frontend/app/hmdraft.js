/* The edits of the Hue Plus menu, kept as a draft for each device until they are saved to the bridge.
 A draft belongs to one device: a light, a switch (an accessory) or a MotionAware area. Changing a setting only changes its draft; Save on that device sends that device's
 changes to the bridge, and nothing else. Nothing in this file touches the page or the bridge: huemenu.js draws the drafts and sends them. */

/* key of a device -> {changes: {field: value}}. A key is "<kind>:<id>" (light, acc, marea). */
var HMD = {};

/* What a device was just saved with, key -> {field: {value, until}}. A light tells its new setting a moment after the bridge took it; until it does, the page keeps
 showing what was saved instead of going back to the old value. */
var HMD_SAVED = {};
var HMD_SAVED_MS = 15000;

function hmdKey(kind, id) {
  return kind + ":" + id;
}

/* Stages `value` for a field. A value equal to `actual` (when it is known) is the same as no change, so the draft is dropped when nothing is left in it. */
function hmdStage(key, field, value, actual) {
  var d = HMD[key] || (HMD[key] = { changes: {} });
  if (actual !== undefined && JSON.stringify(actual) === JSON.stringify(value)) delete d.changes[field];
  else d.changes[field] = value;
  if (!Object.keys(d.changes).length) delete HMD[key];
}

/* What a page shows for a field: the staged value, else what was just saved and is not confirmed yet, else `actual`. */
function hmdValue(key, field, actual) {
  var d = HMD[key];
  if (d && Object.prototype.hasOwnProperty.call(d.changes, field)) return d.changes[field];
  var s = (HMD_SAVED[key] || {})[field];
  if (s) {
    if (JSON.stringify(s.value) === JSON.stringify(actual) || Date.now() > s.until) {
      delete HMD_SAVED[key][field];
      return actual;
    }
    return s.value;
  }
  return actual;
}

function hmdStaged(key, field) {
  var d = HMD[key];
  return d && Object.prototype.hasOwnProperty.call(d.changes, field) ? d.changes[field] : undefined;
}

function hmdDirty(key) {
  return !!HMD[key];
}

function hmdChanges(key) {
  return Object.assign({}, (HMD[key] || {}).changes);
}

function hmdDiscard(key) {
  delete HMD[key];
}

/* The draft is saved: it goes, and what it held is remembered until the device shows it. */
function hmdSaved(key) {
  var d = HMD[key],
    seen = (HMD_SAVED[key] = HMD_SAVED[key] || {});
  Object.keys((d || {}).changes || {}).forEach(function (f) {
    seen[f] = { value: d.changes[f], until: Date.now() + HMD_SAVED_MS };
  });
  delete HMD[key];
}

function hmdClear() {
  HMD = {};
  HMD_SAVED = {};
}

/* A press the way the bridge writes it, from what configure_button is given: the shapes the page reads (hmPressKind, hmPressScenes, hmTimeSlots) work on both, so a staged press
 and a press read from the bridge are drawn by the same code. `what` is {action, scene, scenes, slots, with_off, repeat_timeout} as huemenu.js builds it. */
function hmSpecFrom(what) {
  var recall = function (id) {
      return { action: { recall: { rid: id, rtype: "scene" } } };
    },
    off = { enabled: !!what.with_off },
    timeout = { seconds: what.repeat_timeout || 3 };
  if (what.action === "scene") return { recall_single_extended: { actions: [recall(what.scene)], with_off: off } };
  if (what.action === "scene_cycle")
    return {
      scene_cycle_extended: {
        repeat_timeout: timeout,
        slots: (what.scenes || []).map(function (id) {
          return [recall(id)];
        }),
        with_off: off,
      },
    };
  if (what.action === "time_based")
    return {
      time_based_extended: {
        repeat_timeout: timeout,
        slots: (what.slots || []).map(function (s) {
          var t = String(s.time).split(":");
          return { actions: [recall(s.scene)], start_time: { hour: Number(t[0]), minute: Number(t[1]) } };
        }),
        with_off: off,
      },
    };
  return { action: { dim_up: "dim_up", dim_down: "dim_down", all_off: "all_off", home_off: "home_off" }[what.action] || "do_nothing" };
}
