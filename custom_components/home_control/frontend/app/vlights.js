/* Lights that exist only in the dashboard. The live scene maker uses them for the colours of a scene: one light named Colors, made of up to 10 colour lights the way a gradient light is made of zones, so the light popup controls them like any other light. They answer for their own state and take commands (colour, white temperature, brightness) without Home Assistant knowing of them. */

var VCOL_MAX = 10;
var VCOL_GROUP = "light.lm_colors";

function vcolId(i) {
  return "light.lm_c" + (i + 1);
}

function vlightIs(id) {
  return typeof id === "string" && !!VLIGHT[id];
}

function vcolState(id, attrs) {
  return {
    entity_id: id,
    state: "on",
    attributes: Object.assign(
      { supported_color_modes: ["hs", "color_temp"], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 },
      attrs
    ),
    last_changed: new Date().toISOString(),
  };
}

/* The colour lights of a palette ({hs}, {k} or {xy}, and b when dimmer than full). A colour given as xy keeps its exact value until it is changed. */
function vcolLoad(palette) {
  VLIGHT = {};
  var ids = [];
  palette.slice(0, 16).forEach(function (c, i) {
    var id = vcolId(i),
      a = { friendly_name: _T("colour") + " " + (i + 1), brightness: Math.round((c.b || 100) * 2.55) };
    if (c.k) {
      a.color_mode = "color_temp";
      a.color_temp_kelvin = c.k;
    } else {
      var hs = c.hs || liveXyHs(c.xy[0], c.xy[1]);
      a.color_mode = "hs";
      a.hs_color = [hs[0], hs[1]];
    }
    VLIGHT[id] = vcolState(id, a);
    if (c.xy) VLIGHT[id].xy = { value: c.xy, hs: a.hs_color.slice() };
    ids.push(id);
  });
  VLIGHT[VCOL_GROUP] = vcolState(VCOL_GROUP, {
    friendly_name: _T("colours"),
    entity_id: ids,
    zone_colors: ids,
    zone_label: _T("colour"),
  });
  vcolSync();
}

function vcolIds() {
  return (VLIGHT[VCOL_GROUP] && VLIGHT[VCOL_GROUP].attributes.entity_id) || [];
}

/* The group shows what its colours show: the first one's colour and the mean brightness. */
function vcolSync() {
  var g = VLIGHT[VCOL_GROUP];
  if (!g) return;
  var kids = vcolIds().map(function (id) {
      return VLIGHT[id];
    }),
    first = kids[0];
  g.attributes.zone_colors = kids.map(function (k) {
    return k.attributes.hs_color || k.attributes.color_temp_kelvin;
  });
  g.attributes.brightness = Math.round(
    kids.reduce(function (s, k) {
      return s + k.attributes.brightness;
    }, 0) / Math.max(1, kids.length)
  );
  ["color_mode", "hs_color", "color_temp_kelvin"].forEach(function (key) {
    if (first && first.attributes[key] !== undefined) g.attributes[key] = first.attributes[key];
    else delete g.attributes[key];
  });
}

/* A colour added at the end, as the colour next to it, or white if there is none yet. */
function vcolAdd() {
  var ids = vcolIds();
  if (ids.length >= VCOL_MAX) return null;
  var id = vcolId(ids.length),
    last = ids.length ? VLIGHT[ids[ids.length - 1]] : null,
    a = last ? Object.assign({}, last.attributes) : { color_mode: "color_temp", color_temp_kelvin: 4000, brightness: 255 };
  a.friendly_name = _T("colour") + " " + (ids.length + 1);
  VLIGHT[id] = vcolState(id, a);
  VLIGHT[VCOL_GROUP].attributes.entity_id = ids.concat(id);
  vcolSync();
  return id;
}

function vcolRemove(id) {
  var ids = vcolIds();
  if (ids.length <= 1 || ids.indexOf(id) < 0) return false;
  var left = ids.filter(function (x) {
    return x !== id;
  });
  /* The colours keep their numbers in order. */
  var kept = left.map(function (x) {
    return VLIGHT[x];
  });
  VLIGHT = { };
  var out = [];
  kept.forEach(function (st, i) {
    var nid = vcolId(i);
    st.entity_id = nid;
    st.attributes.friendly_name = _T("colour") + " " + (i + 1);
    VLIGHT[nid] = st;
    out.push(nid);
  });
  VLIGHT[VCOL_GROUP] = vcolState(VCOL_GROUP, { friendly_name: _T("colours"), entity_id: out, zone_colors: out, zone_label: _T("colour") });
  vcolSync();
  return true;
}

/* The palette the colour lights show now, in the form a live scene keeps. */
function vcolPalette() {
  return vcolIds().map(function (id) {
    var st = VLIGHT[id],
      a = st.attributes,
      pct = Math.max(10, Math.min(100, Math.round(a.brightness / 2.55))),
      o;
    if (a.color_mode === "color_temp") o = { k: Math.round(a.color_temp_kelvin) };
    else if (st.xy && st.xy.hs[0] === a.hs_color[0] && st.xy.hs[1] === a.hs_color[1]) o = { xy: st.xy.value };
    else o = { hs: [Math.round(a.hs_color[0]), Math.round(a.hs_color[1])] };
    if (pct < 99.5) o.b = pct;
    return o;
  });
}

function vlightApply(id, s, data) {
  var st = VLIGHT[id],
    a = st.attributes;
  if (Array.isArray(a.entity_id)) {
    a.entity_id.forEach(function (k) {
      vlightApply(k, s, data);
    });
    vcolSync();
    return;
  }
  /* A colour of a scene is always there; it can be changed, not switched off. */
  if (s !== "turn_on") return;
  if (typeof data.brightness_pct === "number") a.brightness = Math.max(1, Math.min(255, Math.round(data.brightness_pct * 2.55)));
  if (typeof data.brightness === "number") a.brightness = Math.max(1, Math.min(255, Math.round(data.brightness)));
  if (Array.isArray(data.hs_color)) {
    a.color_mode = "hs";
    a.hs_color = [data.hs_color[0], data.hs_color[1]];
    delete a.color_temp_kelvin;
  } else if (typeof data.color_temp_kelvin === "number") {
    a.color_mode = "color_temp";
    a.color_temp_kelvin = data.color_temp_kelvin;
    delete a.hs_color;
  } else if (Array.isArray(data.xy_color)) {
    var hs = liveXyHs(data.xy_color[0], data.xy_color[1]);
    a.color_mode = "hs";
    a.hs_color = [hs[0], hs[1]];
    delete a.color_temp_kelvin;
  }
  st.last_changed = new Date().toISOString();
}

/* A command that names dashboard lights: they take theirs, and what is left for Home Assistant is returned (null when nothing is). */
function vlightDispatch(s, data) {
  var ids = data && data.entity_id,
    list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (!list.some(vlightIs)) return data;
  list.filter(vlightIs).forEach(function (id) {
    vlightApply(id, s, data);
  });
  var real = list.filter(function (id) {
    return !vlightIs(id);
  });
  if (!real.length) return null;
  return Object.assign({}, data, { entity_id: Array.isArray(ids) ? real : real[0] });
}
