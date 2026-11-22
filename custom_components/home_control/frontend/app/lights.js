/* Lights: turn-on defaults, colour and text-contrast helpers, the light popup, light counts and tints. */

/* Turning a light on from the app uses its saved defaults, if any; otherwise the light comes back as it was. */
function lightDefault(id) {
  var o = UI && UI.on && UI.on[id];
  if (!o) return null;
  var d = {},
    a = A(id);
  /* A saved state (made in the light popup): brightness, colour or colour temperature, effect. */
  if (o.c) {
    if (o.c.bri) d.brightness_pct = o.c.bri;
    if (o.c.col) applyPresetData(d, o.c.col, id);
    if (o.c.fx) d.effect = o.c.fx;
    return Object.keys(d).length ? d : null;
  }
  if (o.b) d.brightness_pct = o.b;
  if (o.k && lightCaps(id).white)
    d.color_temp_kelvin = Math.max(
      a.min_color_temp_kelvin || 2000,
      Math.min(a.max_color_temp_kelvin || 6500, o.k)
    );
  return Object.keys(d).length ? d : null;
}

/* The saved turn-on state as words: "60 % · 2700 K", "40 % · colour", "effect Candle". */
function lightDefaultText(id) {
  var o = (UI && UI.on && UI.on[id]) || {},
    c = o.c || { bri: o.b, col: o.k ? { k: o.k } : null },
    out = [];
  if (c.bri) out.push(c.bri + " %");
  if (c.col) out.push(c.col.k ? c.col.k + " K" : _T("colour"));
  if (c.fx) out.push(c.fx);
  return out.join(" · ") || _T("last_used");
}

/* "Custom": the light popup opens for the light with its saved turn-on state shown, and the checkmark saves what it then shows. The light is put back as it was afterwards:
   this is a setting, not a command. */
function lightOnCustom(d, done) {
  var before = lightSnapshot([d.id]),
    saved = lightDefault(d.id);
  function open() {
    openLightEditor({
      id: d.id,
      name: d.name,
      icon: d.icon,
      onTick: function (acts) {
        var a = acts[0];
        if (!a || a.on === false) {
          toast(_T("turn_the_light_on_to_save_its_state"));
          return;
        }
        UI.on = UI.on || {};
        var c = {};
        if (a.bri) c.bri = a.bri;
        if (a.col) c.col = a.col;
        if (a.fx) c.fx = a.fx;
        UI.on[d.id] = { c: c };
        uiChanged();
      },
      after: function () {
        lightRestore(before);
        if (done) done();
      },
    });
  }
  if (saved) {
    var data = { entity_id: d.id };
    Object.keys(saved).forEach(function (k) {
      data[k] = saved[k];
    });
    call("light", "turn_on", data);
    setTimeout(open, 900);
  } else open();
}

function lightOn(id) {
  var d = lightDefault(id) || {};
  d.entity_id = id;
  call("light", "turn_on", d);
}

var LNAME = {};

/* Text on a lit light row is chosen from what is actually under it: the colour of the light where the fill reaches, the page background where it does not. */
function lumOf(c) {
  var a = c.map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastOf(a, b) {
  var x = lumOf(a),
    y = lumOf(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function bestInk(bg) {
  var W = [255, 255, 255],
    D = [10, 13, 20];
  return contrastOf(W, bg) >= contrastOf(D, bg) ? W : D;
}

function mixRgb(a, b, t) {
  return [a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t)];
}

function baseBg() {
  var c = (getComputedStyle(document.body).color.match(/[\d.]+/g) || [247, 243, 237])
    .slice(0, 3)
    .map(Number);
  return lumOf(c) > 0.4 ? [24, 26, 38] : [236, 239, 246];
}

function inkRow(r, rgb, p) {
  var els = [".nm", ".sb", ".vl", ".ic"].map(function (q) {
    return r.querySelector(q);
  });
  if (!rgb) {
    els.forEach(function (e) {
      if (e) e.style.color = "";
    });
    return;
  }
  /* Where each piece of text sits is assumed (name and icon at the left, the value at the right) instead of measured, so the colour is the same before and after the page has been laid out or slid into place. */
  var base = baseBg(),
    fill = mixRgb(rgb, base, 0.78),
    at = [22, 22, 90, 7];
  els.forEach(function (e, i) {
    if (!e) return;
    var under = i === 3 ? mixRgb(rgb, fill, 0.6) : at[i] < p ? fill : base,
      ink = bestInk(under);
    e.style.color =
      "rgba(" +
      ink.map(Math.round).join(",") +
      "," +
      (i === 0 ? ".96" : i === 3 ? "1" : ".82") +
      ")";
  });
}

/* The accent every device on a page uses when it is on. */
var PAGEFILL = "color-mix(in srgb,var(--acc) 45%,var(--f-card))";

/* A fill colour for a popup slider: the light's colour (rgb() says which) or the accent. */
function popFillOf(ids, rgb) {
  return function () {
    var c = rgb();
    return c ? cssRgb(c) : null;
  };
}

/* The colours of a light made of zones. Null when one colour tells it all. */
function lightStops(id) {
  var z = A(id).zone_colors;
  /* A light set to a white temperature is that one colour, the same as any other light at that temperature, not the (slightly different) colours its zones are reported in. */
  if (A(id).color_mode === "color_temp" && A(id).color_temp_kelvin) return null;
  if (Array.isArray(z) && z.length > 1)
    return z.map(function (c) {
      return liveXyRgb(c[0], c[1]);
    });
  return null;
}

/* The icon circle of a row shows those colours as a gradient. */
/* The lights behind a light (itself, the Hue light behind a zone light, or the members of a group) that are playing an effect. */
function lightEffectLights(id) {
  var own = lpFxLight(id),
    e = A(own).effect;
  if (e && e !== "off") return [own];
  var out = [];
  lightMembers(id).forEach(function (m) {
    out = out.concat(lightEffectLights(m));
  });
  return out;
}

function gradIcon(row, stops) {
  var i = row.querySelector(".ic");
  if (!i) return;
  i.style.background = stops
    ? "linear-gradient(135deg," +
      stops
        .map(function (c) {
          return "rgba(" + c.map(Math.round).join(",") + ",.62)";
        })
        .join(",") +
      ")"
    : "";
}

/* A light on a page: the bar is the normal accent and the icon circle shows the colour (or white temperature) the light runs. In a popup (inPopup) the whole row is tinted and the bar takes that colour. */
function lightRow(id, showRoom, inPopup) {
  /* inPopup: true (the Lights section of the light decides) or a function that says whether to fill with the light's colour. */
  var nm = LNAME[id],
    r = mk("div", "pill pane slide");
  r.innerHTML =
    "<div class='fill'></div>" +
    ic(nm[1]) +
    "<span class='tx'><span class='nm'></span><span class='sb'></span></span><span class='cd'></span><span class='vl'></span>";
  r.dataset.pin = JSON.stringify({ id: id, name: nm[0], icon: nm[1] });
  r.querySelector(".nm").textContent = nm[0];
  var fill = r.querySelector(".fill"),
    vl = r.querySelector(".vl"),
    sb = r.querySelector(".sb"),
    cd = r.querySelector(".cd");
  var drag = false,
    was = null,
    liveT = 0,
    liveAt = 0;
  /* While dragging the light follows: at most one command every 150 ms, and the last position always arrives. */
  function sendLive(p) {
    if (p <= 0) return;
    var wait = liveAt + 150 - Date.now();
    clearTimeout(liveT);
    function go() {
      liveAt = Date.now();
      lightPush(id, { entity_id: id, brightness_pct: p });
    }
    if (wait <= 0) go();
    else liveT = setTimeout(go, wait);
  }
  function pct() {
    if (V_(id) === "on") return Math.round(briNow(id) / 2.55);
    var syn = pluginPlays(id);
    return syn ? syn.pct() : 0;
  }
  attachSlide(r, {
    onMove: function (f) {
      drag = true;
      var p = Math.round(f * 100);
      fill.style.width = p + "%";
      vl.textContent = p + "%";
      inkRow(r, r._ink, p);
      sendLive(p);
    },
    onCommit: function (f) {
      var p = Math.round(f * 100);
      clearTimeout(liveT);
      if (p <= 0) call("light", "turn_off", { entity_id: id });
      else call("light", "turn_on", { entity_id: id, brightness_pct: p });
      setTimeout(function () {
        drag = false;
      }, 800);
    },
    onCancel: function () {
      drag = false;
    },
    onHold: function () {
      showPopup("light:" + id, true);
    },
    onTap: function (t) {
      drag = false;
      if (t && t.closest(".ic")) {
        /* While an effect or the Spotify sync plays the icon shows a stop button, and it stops that instead of turning the light off. */
        var syn = pluginPlays(id),
          fxl = V_(id) === "on" ? lightEffectLights(id) : [];
        if (syn) call("switch", "turn_off", { entity_id: syn.entity });
        else if (fxl.length) call("light", "turn_on", { entity_id: fxl, effect: "off" });
        else toggleEnt(id);
      } else showPopup("light:" + id, true);
    },
  });
  r.refresh = function () {
    var syn = pluginPlays(id),
      on = V_(id) === "on" || !!syn,
      icon = r.querySelector(".ic"),
      playing = on && (!!syn || lightEffectLights(id).length > 0);
    icon.classList.toggle("fx", playing);
    if (playing && !icon.querySelector(".ic-stop")) icon.appendChild(mk("span", "ic-stop", "<i></i>"));
    r.classList.toggle("on", on);
    if (was !== null && on !== was) pop(r);
    was = on;
    var rgb = lightRgb(id),
      la = A(id);
    r._lc = on ? rgb || WARMWHITE : null;
    var full = typeof inPopup === "function" ? inPopup() : !!inPopup;
    r._ink = full ? r._lc : on ? cssToRgb(PAGEFILL) : null;
    if (full) tintEl(r, r._lc);
    else tintIcon(r, r._lc);
    gradIcon(r, on && !full ? lightStops(id) : null);
    sb.textContent =
      (showRoom ? roomOf(id) + " · " : "") +
      (on && la.color_mode === "color_temp" && la.color_temp_kelvin
        ? Math.round(la.color_temp_kelvin) + _T("k")
        : "") +
      (syn && V_(id) !== "on" ? syn.label : stAgo(id));
    cd.style.display = rgb && full ? "" : "none";
    var cc = full ? rgb && cssRgb(rgb) : on && PAGEFILL;
    if (cc) {
      if (full) cd.style.background = cc;
      fill.style.background =
        "linear-gradient(180deg,color-mix(in srgb," +
        cc +
        " 88%,transparent),color-mix(in srgb," +
        cc +
        " 64%,transparent))";
      fill.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,.35)";
    } else {
      fill.style.background = "";
      fill.style.boxShadow = "";
    }
    if (drag) return;
    fill.style.width = pct() + "%";
    vl.textContent = on ? pct() + "%" : V_(id) === "unavailable" ? _T("unavailable") : _T("off");
    inkRow(r, r._ink, pct());
  };
  reg(r.refresh);
  return r;
}

function lightPush(id, data) {
  callLive(id, "light", "turn_on", data);
}

/* The colour a saved colour or white temperature shows. */
function presetCss(p) {
  return p.k ? cssRgb(kelvinRgb(p.k)) : cssRgb(hsv2rgb(p.h, p.s));
}

/* Lights made of zones (the Hue gradient zones integration) report their zone colours in zone_colors and list the zones in entity_id. */
function zoneMembers(id) {
  return Array.isArray(A(id).zone_colors) ? lightMembers(id) : [];
}

/* A smooth curve through the points as an SVG path: a centripetal Catmull-Rom spline turned into Bezier curves. The spacing of the points is taken into account, so the curve does not kink or overshoot where two points are far apart. */
function smoothPath(pts) {
  var n = pts.length;
  if (n < 3) {
    return pts
      .map(function (p, i) {
        return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      })
      .join("");
  }
  function dist(a, b) {
    return Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  }
  var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
  for (var i = 0; i + 1 < n; i++) {
    var p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2,
      d1 = i ? dist(p0, p1) : dist(p1, p2),
      d2 = dist(p1, p2),
      d3 = i + 2 < n ? dist(p2, p3) : dist(p1, p2),
      c1 = [0, 0],
      c2 = [0, 0];
    for (var k = 0; k < 2; k++) {
      c1[k] =
        (d1 * d1 * p2[k] - d2 * d2 * p0[k] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[k]) /
        (3 * d1 * (d1 + d2));
      c2[k] =
        (d3 * d3 * p1[k] - d2 * d2 * p3[k] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[k]) /
        (3 * d3 * (d3 + d2));
    }
    d +=
      "C" +
      c1[0].toFixed(1) +
      " " +
      c1[1].toFixed(1) +
      " " +
      c2[0].toFixed(1) +
      " " +
      c2[1].toFixed(1) +
      " " +
      p2[0].toFixed(1) +
      " " +
      p2[1].toFixed(1);
  }
  return d;
}

/* The points of the line through the markers of a zoned light, as the Hue app draws it: the markers, and between each two of them the colour half way on the wheel (the hue turns, the saturation changes evenly). The hue turns the way the first stretch turns the short way round and keeps turning that way, so the line can go the long way round and cross the middle of the wheel. These are the points the tube is given too (see the Hue gradient zones integration); the line is a smooth curve through them. 'marks' are the pixel positions [x, y] of the markers on a circle of radius R. */
function blendLine(R, marks) {
  function hsOf(m) {
    var dx = m[0] - R,
      dy = m[1] - R;
    return [((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, Math.min(100, (Math.hypot(dx, dy) / R) * 100)];
  }
  function px(h, s) {
    var a = (h * Math.PI) / 180,
      r = (s / 100) * R;
    return [R + r * Math.sin(a), R - r * Math.cos(a)];
  }
  var out = [marks[0]],
    dir = 0;
  for (var q = 0; q + 1 < marks.length; q++) {
    var a = hsOf(marks[q]),
      b = hsOf(marks[q + 1]),
      ha = a[0],
      hb = b[0];
    if (a[1] < 3) ha = hb;
    if (b[1] < 3) hb = ha;
    var turn = (hb - ha + 360) % 360;
    if (!dir) dir = turn <= 180 ? 1 : -1;
    if (dir < 0 && turn > 0) turn -= 360;
    out.push(px(ha + turn / 2, (a[1] + b[1]) / 2), marks[q + 1]);
  }
  return out;
}

/* The single lights behind a list of lights: a light group is replaced by its members. */
function lightIndividuals(ids, depth) {
  var out = [];
  ids.forEach(function (id) {
    var m = (depth || 0) < 3 ? lightMembers(id) : [];
    (m.length ? lightIndividuals(m, (depth || 0) + 1) : [id]).forEach(function (x) {
      if (out.indexOf(x) < 0) out.push(x);
    });
  });
  return out;
}

/* The lights master of a Lights section: one light that stands for every light in the section. The section's lights are kept here for its popup. */
/* Keyed by "page~section": the same section id is on every page. */
var LMASTER = {};
/* What the section called its lights master (its row, its popup and its panel), by section; empty when it was not renamed. */
var LMASTER_NAME = {};
/* Sections whose lights master changes the whole room (every light) instead of only the lights that are on. */
var LMASTER_ALL = {};
/* The order the owner gave the lights of a section's lights master, by section (entity ids); absent when they are shown by name. */
var LMASTER_ORDER = {};
/* The names and icons a manual master shows for its lights, by section. */
var LMASTER_META = {};
/* The lights an editor lets be added and taken out (see lightsEditDef). */
var LMASTER_MEMBERS = {};

/* The lights a master slider changes: the ones that are on, or all of them when none is. */
function lightTargets(ids, all) {
  var units = lightUnits(ids),
    on = units.filter(isOn);
  return all ? units : on.length ? on : units;
}

function lightsMasterPct(ids) {
  var on = lightUnits(ids).filter(isOn);
  if (!on.length) return 0;
  return Math.round(
    on.reduce(function (sum, i) {
      return sum + briNow(i) / 2.55;
    }, 0) / on.length
  );
}

/* Switches all of them off if any is on, otherwise on, each light with its own turn-on defaults. */
function lightsMasterToggle(ids) {
  var u = lightUnits(ids);
  if (countOn(u) > 0) {
    call("light", "turn_off", { entity_id: u });
    return;
  }
  var plain = u.filter(function (i) {
    return !lightDefault(i);
  });
  u.forEach(function (i) {
    if (lightDefault(i)) lightOn(i);
  });
  if (plain.length) call("light", "turn_on", { entity_id: plain });
}

function lightsMasterRow(sid, ids, name, all, order, meta) {
  LMASTER[sid] = ids;
  LMASTER_META[sid] = meta || {};
  LMASTER_NAME[sid] = name || "";
  LMASTER_ALL[sid] = !!all;
  LMASTER_ORDER[sid] = order || null;
  var r = sliderRow({
    icon: "lights",
    name: name || _T("all_lights"),
    min: 0,
    max: 100,
    step: 1,
    fillColor: function () {
      return countOn(lightUnits(ids)) ? PAGEFILL : null;
    },
    get: function () {
      return lightsMasterPct(ids);
    },
    fmt: function (v) {
      return countOn(lightUnits(ids)) ? v + "%" : _T("off");
    },
    sub: function () {
      return countOn(lightUnits(ids)) + " / " + lightUnits(ids).length;
    },
    on: function () {
      return countOn(lightUnits(ids)) > 0;
    },
    live: function (v) {
      if (v > 0 && !pluginSceneDim(ids, v, false)) callLive("m:" + sid, "light", "turn_on", { entity_id: lightTargets(ids, all), brightness_pct: v });
    },
    commit: function (v) {
      if (v <= 0) call("light", "turn_off", { entity_id: lightTargets(ids, all) });
      else if (!pluginSceneDim(ids, v, true)) call("light", "turn_on", { entity_id: lightTargets(ids, all), brightness_pct: v });
    },
    onHold: function () {
      showPopup("lmaster:" + sid, true);
    },
    onTap: function (t) {
      if (t && t.closest(".ic")) lightsMasterToggle(ids);
      else showPopup("lmaster:" + sid, true);
    },
  });
  function tint() {
    tintIcon(r, avgLight(lightUnits(ids).filter(isOn)));
  }
  reg(tint);
  tint();
  r.style.gridColumn = "1 / -1";
  return r;
}

/* The settings of a section's lights master, opened from the page editor ("scope:section", as for a section): its name, whether it changes the whole room, and the order of the lights in its row. */
/* The settings of a lights master: a short page with one row for each part of it (`part` empty), and a page of its own for each part. */
function lightsMasterSettings(b, key, part) {
  var p = key.split(":"),
    sec = secById(p[0], p[1]);
  if (!sec) return;
  var box = mk("div");
  b.appendChild(box);
  function lightIds() {
    return masterLightIds(sec);
  }
  function part_(name, icon, sub) {
    return pill(icon, _T("lm_part_" + name), {
      sub: function () {
        return typeof sub === "function" ? sub() : _T("lm_part_" + name + "_sub");
      },
      tap: function () {
        showPopup("lmaster-part:" + name + ":" + key, true);
      },
    });
  }
  function draw() {
    box.innerHTML = "";
    if (!part) {
      box.appendChild(
        textRow("edit", _T("all_lights"), sec.mn || "", function (v) {
          if (v) sec.mn = v.slice(0, 40);
          else delete sec.mn;
          uiChanged();
        }, 40)
      );
      box.appendChild(
        part_("lights", "lights", function () {
          return lightIds().length + " " + _T("lights").toLowerCase() + " · " + (sec.mm ? _T("master_manual") : _T("master_auto"));
        })
      );
      box.appendChild(part_("popup", "tune"));
      box.appendChild(part_("scenes", "scene"));
      box.appendChild(part_("where", "home"));
      masterActionRows(box, sec, p[0]);
      return;
    }
    if (part === "popup") return masterPopupRows(box, sec, p[0], draw);
    if (part === "scenes") return mscSourceRows(box, sec, p[0], draw);
    if (part === "where") {
      masterSectionRows(box, sec);
      masterGlanceRows(box, sec, draw);
      return;
    }
    box.appendChild(
      flagPill("lights", _T("master_changes_the_whole_room"), sec, "mall", function (on) {
        return on ? _T("every_light_of_the_section_even_those_") : _T("only_the_lights_that_are_on_or_all_if_none_is");
      })
    );
    masterModeRows(box, sec, p[0], draw);
  }
  draw();
}

/* The popup of a light or a light group: the light panel (app/lightpanel.js). */
function lightPopup(b, id, o) {
  var cp = lightCaps(id);
  if (!cp.bright) {
    b.appendChild(
      pill("power", _T("power"), {
        on: function () {
          return isOn(id);
        },
        tap: function () {
          toggleEnt(id);
        },
      })
    );
    return;
  }
  lightScenesRow(b, id);
  lightPanel(b, lpNodeOf(id, null), {
    id: id,
    room: cp.color || cp.white ? savedRoomOf([id]) : null,
    ready: o && o.ready,
  });
}

/* Brightness, colour and white temperature for every light of the section at once. */
function lightsMasterPopup(b, sid) {
  var ids = LMASTER[sid] || [];
  lightPanel(b, lpMasterNode(sid, ids), {
    room: savedRoomOf(lightIndividuals(ids)),
    members: LMASTER_MEMBERS[sid] || null,
    /* The lights row follows the circle: a group is one tile until it is separated (the master's choice). */
    groups: !!(masterSec(sid) || {}).mgl,
  });
  /* When the master's sync starts, the lights of the master that it does not play on go off: they are not in its area. */
  var sync = masterSyncOf(masterSec(sid)),
    was = sync ? V_(sync) === "on" : false;
  if (sync)
    SLIVE.push(function () {
      var on = V_(sync) === "on";
      if (on && !was)
        setTimeout(function () {
          var off = lightIndividuals(LMASTER[sid] || []).filter(function (e) {
            return V_(e) === "on" && !pluginPlays(e);
          });
          if (off.length) call("light", "turn_off", { entity_id: off });
        }, 2000);
      was = on;
    });
}

/* The lights a light group is made of. */
function lightMembers(id) {
  var m = A(id).entity_id;
  return Array.isArray(m)
    ? m.filter(function (x) {
        return x !== id && dom(x) === "light";
      })
    : [];
}

var ROOMLIGHTS = {};

/* A lit tile is tinted with the colour (or colour temperature) its lights are running. */
/* Only the icon circle of a lit row takes the colour. */
function tintIcon(el, rgb) {
  if (rgb) {
    el.style.setProperty("--lc", Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]));
    el.classList.add("lci");
  } else {
    el.classList.remove("lci");
    el.style.removeProperty("--lc");
  }
}

function tintEl(el, rgb) {
  if (rgb) {
    el.style.setProperty(
      "--lc",
      Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2])
    );
    el.classList.add("lc");
  } else {
    el.classList.remove("lc");
    el.style.removeProperty("--lc");
  }
}

var WARMWHITE = [255, 224, 186];

function lightRgbOr(id) {
  return lightRgb(id) || (V_(id) === "on" ? WARMWHITE : null);
}

function avgLight(ids) {
  var sum = [0, 0, 0],
    w = 0;
  ids.forEach(function (id) {
    var c = lightRgbOr(id);
    if (!c) return;
    var br = Math.max(0.25, (A(id).brightness || 160) / 255);
    sum[0] += c[0] * br;
    sum[1] += c[1] * br;
    sum[2] += c[2] * br;
    w += br;
  });
  return w ? [sum[0] / w, sum[1] / w, sum[2] / w] : null;
}

/* A light group (several bulbs combined in Home Assistant) is one light: members of a listed group are not counted again. */
function lightUnits(ids) {
  var members = {},
    seen = {},
    out = [];
  ids.forEach(function (id) {
    var m = A(id).entity_id;
    if (Array.isArray(m))
      m.forEach(function (x) {
        if (x !== id) members[x] = 1;
      });
  });
  ids.forEach(function (id) {
    if (members[id] || seen[id]) return;
    seen[id] = 1;
    out.push(id);
  });
  return out;
}

function lightsAll(room) {
  return lightUnits(ROOMLIGHTS[room] || []);
}

/* Every light of the visible rooms, and of the lights masters of the pages (a light taken out of a room's section but kept by a master is still a light of the house), each once. */
function allLights() {
  var out = [];
  Object.keys(ROOMLIGHTS).forEach(function (r) {
    lightsAll(r).forEach(function (x) {
      if (out.indexOf(x) < 0) out.push(x);
    });
  });
  allMasters().forEach(function (m) {
    lightUnits(m.ids).forEach(function (x) {
      if (out.indexOf(x) < 0) out.push(x);
    });
  });
  return out;
}

/* quick actions */
function cssRgb(c) {
  return "rgb(" + c.map(Math.round).join(",") + ")";
}

function lightRgb(id) {
  if (V_(id) !== "on") return null;
  var a = A(id);
  if (a.color_mode === "color_temp" && a.color_temp_kelvin) return kelvinRgb(a.color_temp_kelvin);
  if (a.hs_color) return hsv2rgb(a.hs_color[0], a.hs_color[1]);
  if (a.rgb_color) return a.rgb_color.slice(0, 3);
  if (a.color_temp_kelvin) return kelvinRgb(a.color_temp_kelvin);
  return null;
}

function lightRaw(id) {
  var m = A(id).supported_color_modes || [];
  return {
    known: !!A(id).supported_color_modes,
    bright:
      m.length === 0 ||
      m.some(function (x) {
        return x !== "onoff";
      }),
    color: m.some(function (x) {
      return ["hs", "xy", "rgb", "rgbw", "rgbww"].indexOf(x) >= 0;
    }),
    white: m.indexOf("color_temp") >= 0,
  };
}

function lightCaps(id) {
  var r = lightRaw(id),
    o = (UI && UI.caps && UI.caps[id]) || {};
  return {
    known: r.known,
    bright: r.bright && !o.nb,
    color: r.color && !o.nc,
    white: r.white && !o.nw,
  };
}

function kelvinRgb(k) {
  var t = k / 100,
    r,
    g,
    b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  function c(x) {
    return Math.max(0, Math.min(255, Math.round(x)));
  }
  return [c(r), c(g), c(b)];
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  var c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2,
    r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
