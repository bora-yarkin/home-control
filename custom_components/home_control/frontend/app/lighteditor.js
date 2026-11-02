/* The light popup as part of an editor: the same popup a light has on the dashboard, opened over a scene editor with a tick in place of the close button. The lights follow every change at once (a preview); the tick keeps what they show in the scene, and leaving any other way puts the lights back as they were. */

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
  if (a.color_mode === "color_temp" && a.color_temp_kelvin) act.col = { k: Math.round(a.color_temp_kelvin) };
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
  LIT = { id: o.id, name: o.name, icon: o.icon, onTick: o.onTick, S: null, ticked: false };
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
      POPGUARD = function () {
        if (!lt.ticked) lightRestore(snap);
        return false;
      };
    },
    tick: function () {
      lt.ticked = true;
      lt.onTick(lightActsOf(lt.S, lt.id));
      closeLayer();
    },
  };
}
