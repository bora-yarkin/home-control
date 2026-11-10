/* The light popup as part of an editor: the same popup a light has on the dashboard, opened over a scene editor. The lights follow every change at once (a preview); the checkmark keeps what they show in the scene, and leaving after a change asks whether to keep it or put the lights back as they were. */

var LIT = null;

/* What each of the lights was doing, so a preview can be undone. */
function lightSnapshot(ids) {
  return lightIndividuals(ids).map(function (id) {
    var a = A(id);
    return {
      id: id,
      on: V_(id) === "on",
      brightness: a.brightness,
      hs: a.hs_color,
      k: a.color_mode === "color_temp" ? a.color_temp_kelvin : null,
    };
  });
}

function lightRestore(snap) {
  snap.forEach(function (s) {
    if (!s.on) {
      callRaw("light", "turn_off", { entity_id: s.id });
      return;
    }
    var d = { entity_id: s.id };
    if (s.brightness) d.brightness = s.brightness;
    if (s.k) d.color_temp_kelvin = s.k;
    else if (s.hs) d.hs_color = s.hs;
    callRaw("light", "turn_on", d);
  });
}

/* What the scene should make one light do: off, or on with the brightness and colour it shows now. */
function lightAct(id) {
  if (V_(id) !== "on") return { id: id, on: false };
  var a = A(id),
    act = { id: id, on: true };
  if (typeof a.brightness === "number") act.bri = Math.max(1, Math.min(100, Math.round(a.brightness / 2.55)));
  /* A light playing an effect is kept as that effect, not as the colour it passes through. */
  if (a.effect && a.effect !== "off") act.fx = a.effect;
  else if (a.color_mode === "color_temp" && a.color_temp_kelvin) act.col = { k: Math.round(a.color_temp_kelvin) };
  else {
    var hs = lpHs(id);
    if (hs) act.col = { h: Math.round(hs[0]), s: Math.round(hs[1]) };
  }
  return act;
}

/* The acts for what the popup shows: a group that was separated gives one act for each light, lights joined by hand give each of their lights the same. */
function lightActsOf(S, id) {
  var units = S ? lpVisible(S) : [{ key: id, cmd: [id] }],
    out = [],
    seen = {};
  units.forEach(function (u) {
    (u.virtual ? u.cmd : [u.key]).forEach(function (e) {
      if (!seen[e]) {
        seen[e] = 1;
        out.push(lightAct(e));
      }
    });
  });
  return out;
}

/* Opens the light popup for editing. o: { id, name, icon, onTick(acts) }. */
function openLightEditor(o) {
  LIT = { id: o.id, name: o.name, icon: o.icon, onTick: o.onTick, S: null };
  showPopup("light-edit", true, o.after || true);
}

function lightEditDef() {
  var lt = LIT;
  return {
    title: lt.name,
    icon: lt.icon || "light",
    build: function (b) {
      var snap = lightSnapshot([lt.id]);
      lightPopup(b, lt.id, {
        ready: function (S) {
          lt.S = S;
        },
      });
      /* The light shows what it is changed to while this is open. Closing after a change asks; the checkmark puts the light's settings into the scene. */
      guardUnsaved({
        dirty: function () {
          return JSON.stringify(lightSnapshot([lt.id])) !== JSON.stringify(snap);
        },
        save: function (leave) {
          lt.onTick(lightActsOf(lt.S, lt.id));
          POPGUARD = null;
          leave();
          return true;
        },
        discard: function () {
          lightRestore(snap);
        },
      });
    },
  };
}

/* The same for several lights at once (a room's, a scene's): the light popup of the group, opened over whatever asks for it. Every light may be switched on from it, the lights follow each change at once, and the checkmark keeps what they show: o.onSave(acts) gets one act for each light and answers true (or a promise of true) when it kept them, false when it did not (the popup stays open). Leaving after a change asks; discarding puts the lights back as they were. o: { name, icon, lights, onSave(acts), after }. */
var LIE = null;

function openLightsEditor(o) {
  LIE = { name: o.name, icon: o.icon, lights: o.lights.slice(), onSave: o.onSave };
  showPopup("lights-edit", true, o.after || true);
}

function lightsEditDef() {
  var le = LIE;
  return {
    title: le.name,
    icon: le.icon || "lights",
    build: function (b) {
      var snap = lightSnapshot(le.lights);
      LMASTER["edit"] = le.lights;
      LMASTER_NAME["edit"] = le.name;
      LMASTER_ALL["edit"] = true;
      LWHEEL["m:edit"] = undefined;
      lightsMasterPopup(b, "edit");
      guardUnsaved({
        dirty: function () {
          return JSON.stringify(lightSnapshot(le.lights)) !== JSON.stringify(snap);
        },
        save: function (leave) {
          return Promise.resolve(le.onSave(lightUnits(le.lights).map(lightAct))).then(function (ok) {
            if (ok === false) return false;
            POPGUARD = null;
            leave();
            return true;
          });
        },
        discard: function () {
          lightRestore(snap);
        },
      });
    },
  };
}
