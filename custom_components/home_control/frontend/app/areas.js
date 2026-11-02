/* Entertainment areas: where the lights of a room are, seen from above. A room can have several. Live scenes use the positions to spread their colours across the lights. */

/* What a dummy object can be: [kind, label key, icon]. They are only there to show where things are. */
var EA_DUMMIES = [
  ["tv", "tv", "tv"],
  ["sofa", "sofa", "sofa"],
  ["bed", "bed", "bed"],
  ["rug", "rug", "rug"],
  ["speaker", "speaker", "speaker"],
  ["door", "door", "leave"],
  ["window", "window", "bright"],
  ["other", "other", "plug"],
];

var EAD = null;

/* Where the next light is put when it is added: spread over the room so none hides another. */
var EA_SLOTS = [
  [-0.6, -0.5],
  [0.6, -0.5],
  [-0.6, 0.5],
  [0.6, 0.5],
  [0, -0.7],
  [0, 0.7],
  [-0.7, 0],
  [0.7, 0],
];

/* What can be placed in a room: a light made of zones (a gradient tube or strip) is ONE item, a bar with a direction, and its zones follow it; any other group (a Hue room light) is replaced by its members so each bulb can be placed on its own. */
function eaRoomLights(room) {
  var out = [],
    seen = {};
  roomDevs(room).forEach(function (d) {
    if (d.type !== "light") return;
    if (zoneMembers(d.id).length > 1) {
      if (!seen[d.id]) {
        seen[d.id] = 1;
        out.push({ id: d.id, name: d.name, icon: d.icon, bar: true });
      }
      return;
    }
    var all = lightIndividuals([d.id]);
    all.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, name: all.length > 1 ? entName(id) : d.name, icon: d.icon });
    });
  });
  return out;
}

/* The items behind some lights: a light made of zones stays one item, any other group becomes its members. */
function eaUnits(ids) {
  var out = [];
  ids.forEach(function (id) {
    (eaIsBar(id) ? [id] : lightIndividuals([id])).forEach(function (x) {
      if (out.indexOf(x) < 0) out.push(x);
    });
  });
  return out;
}

function eaIsBar(id) {
  return zoneMembers(id).length > 1;
}

function eaClamp(v) {
  return Math.max(-1, Math.min(1, v));
}

/* Where the zones of a bar are: spread along its direction around its centre, evenly, first to last. */
function eaZonePoints(l) {
  var members = zoneMembers(l.id),
    a = ((l.a || 0) * Math.PI) / 180,
    p = ((l.p || 0) * Math.PI) / 180,
    len = l.len || 0.6;
  return members.map(function (m, i) {
    var t = (members.length > 1 ? i / (members.length - 1) - 0.5 : 0) * len;
    return {
      id: m,
      x: eaRound(eaClamp(l.x + t * Math.cos(a) * Math.cos(p))),
      y: eaRound(eaClamp(l.y + t * Math.sin(a) * Math.cos(p))),
      z: eaRound(eaClamp(l.z + t * Math.sin(p))),
    };
  });
}

function eaRound(v) {
  return Math.round(v * 1000) / 1000;
}

function eaOpen(room, ar, seed) {
  EAD = {
    room: room,
    isNew: !ar,
    sel: null,
    draft: ar
      ? JSON.parse(JSON.stringify(ar))
      : seed || { id: "", name: "", room: room, lights: [], dummies: [] },
  };
  showPopup("area-edit", true);
}

/* The areas of a room. */
function eaManager(b, room) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var mine = STORE.eareas.filter(function (a) {
      return a.room === room;
    });
    mine.forEach(function (a) {
      box.appendChild(
        pill("target", a.name, {
          sub: function () {
            return cntS(a.lights.length, _T("light"), _T("lights"));
          },
          tap: function () {
            eaOpen(room, a);
          },
        })
      );
    });
    if (!mine.length) box.appendChild(pill("info", _T("no_areas_yet"), {}));
    hpAreaImport(box, room);
    box.appendChild(
      pill("plus", _T("new_area"), {
        sub: function () {
          return _T("place_the_lights_of_this_room");
        },
        tap: function () {
          if (STORE.eareas.length >= 24) {
            toast(_T("up_to_24_areas"));
            return;
          }
          eaOpen(room, null);
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* ---- finding a light in the room ---- */

var EA_KEEP = { id: null, timer: 0, watch: 0 };

/* The light being placed shows red (dims if it has no colour); it is put back when another is chosen, when the screen closes, and by the engine itself after 30 seconds. */
function eaIdentify(id) {
  if (EA_KEEP.id === id) return;
  eaIdentifyOff();
  if (!id || !engineSensor()) return;
  EA_KEEP.id = id;
  callRaw("hue_plus", "locate_light", { entity_id: id, active: true });
  EA_KEEP.timer = setInterval(function () {
    callRaw("hue_plus", "locate_light", { entity_id: id, active: true });
  }, 20000);
}

function eaIdentifyOff() {
  clearInterval(EA_KEEP.timer);
  if (EA_KEEP.id) callRaw("hue_plus", "locate_light", { entity_id: EA_KEEP.id, active: false });
  EA_KEEP.id = null;
}

/* ---- the editor ---- */

/* The room is drawn in isometric view like the Hue app's light placement: a floor and two walls, each light a dot on a pole.
 The floor is a diamond with its back corner at the top; x runs from the back corner down-right, y down-left, height straight up. */
var EA_V = { w: 860, h: 650, cx: 430, ty: 300, fw: 390, fh: 170, wall: 250 };

/* How tall each kind of thing is (0 to 1 of the wall height). */
var EA_THICK = { tv: 0.42, sofa: 0.3, bed: 0.22, rug: 0.02, speaker: 0.4, door: 0.85, window: 0.5, other: 0.3 };

function eaIso(x, y, zn) {
  var u = (x + 1) / 2,
    v = (y + 1) / 2;
  return [EA_V.cx + (u - v) * EA_V.fw, EA_V.ty + (u + v) * EA_V.fh - zn * EA_V.wall];
}

/* The place on the floor under a point of the picture seen at a height. */
function eaFloor(sx, sy, zn) {
  var a = (sx - EA_V.cx) / EA_V.fw,
    b = (sy + zn * EA_V.wall - EA_V.ty) / EA_V.fh,
    u = (a + b) / 2,
    v = (b - a) / 2;
  return [Math.max(-1, Math.min(1, eaRound(2 * u - 1))), Math.max(-1, Math.min(1, eaRound(2 * v - 1)))];
}

/* A light on its first placement: a ceiling light up high, a floor lamp low. */
function eaStartHeight(icon) {
  return icon === "ceiling" ? 0.9 : icon === "floor" || icon === "lamp" ? -0.3 : 0;
}

function eaSvg(tag, attrs, parent) {
  var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach(function (k) {
    el.setAttribute(k, attrs[k]);
  });
  if (parent) parent.appendChild(el);
  return el;
}

function eaPts(list) {
  return list
    .map(function (p) {
      return p[0] + "," + p[1];
    })
    .join(" ");
}

/* The room: floor, back-left wall, back-right wall. */
function eaRoom() {
  var V = EA_V,
    root = eaSvg("svg", { viewBox: "0 0 " + V.w + " " + V.h, class: "ae-room" }),
    T = [V.cx, V.ty],
    R = [V.cx + V.fw, V.ty + V.fh],
    B = [V.cx, V.ty + 2 * V.fh],
    L = [V.cx - V.fw, V.ty + V.fh];
  function up(p) {
    return [p[0], p[1] - V.wall];
  }
  eaSvg("polygon", { class: "ae-wl", points: eaPts([T, L, up(L), up(T)]) }, root);
  eaSvg("polygon", { class: "ae-wr", points: eaPts([T, R, up(R), up(T)]) }, root);
  eaSvg("polygon", { class: "ae-fl", points: eaPts([T, R, B, L]) }, root);
  eaSvg("polyline", { class: "ae-ed", points: eaPts([L, T, R]) }, root);
  return root;
}

/* Where a press is in the picture of the room (view units). */
function eaPoint(e) {
  var r = EAD.v.root.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * EA_V.w, ((e.clientY - r.top) / r.height) * EA_V.h];
}

function eaLightOf(key) {
  return EAD.draft.lights.filter(function (l) {
    return l.id === key;
  })[0];
}

function eaDummyOf(key) {
  return EAD.draft.dummies[Number(key.slice(1))];
}

function eaIsDummy(key) {
  return !!key && key.charAt(0) === "d";
}

/* A thing is a box on the floor: its top and the two sides that face the viewer. */
function eaDrawDummy(key) {
  var m = eaDummyOf(key),
    g = EAD.v.els[key],
    hh = (EA_THICK[m.k] || 0.3) * 0.5,
    x0 = m.x - m.w / 2,
    x1 = m.x + m.w / 2,
    y0 = m.y - m.h / 2,
    y1 = m.y + m.h / 2;
  function c(x, y, zn) {
    return eaIso(eaClamp(x), eaClamp(y), zn);
  }
  g.top.setAttribute("points", eaPts([c(x0, y0, hh), c(x1, y0, hh), c(x1, y1, hh), c(x0, y1, hh)]));
  g.left.setAttribute("points", eaPts([c(x0, y1, 0), c(x1, y1, 0), c(x1, y1, hh), c(x0, y1, hh)]));
  g.right.setAttribute("points", eaPts([c(x1, y0, 0), c(x1, y1, 0), c(x1, y1, hh), c(x1, y0, hh)]));
  var mid = c(m.x, m.y, hh);
  g.label.setAttribute("x", mid[0]);
  g.label.setAttribute("y", mid[1] + 8);
}

function eaCenter(el, p) {
  el.setAttribute("cx", p[0]);
  el.setAttribute("cy", p[1]);
}

/* A light is a dot on a pole; a bar (a light made of zones) also shows its zones along its direction. */
function eaDrawLight(key) {
  var l = eaLightOf(key),
    g = EAD.v.els[key],
    foot = eaIso(l.x, l.y, 0),
    head = eaIso(l.x, l.y, (l.z + 1) / 2);
  eaCenter(g.shadow, foot);
  g.pole.setAttribute("x1", foot[0]);
  g.pole.setAttribute("y1", foot[1]);
  g.pole.setAttribute("x2", head[0]);
  g.pole.setAttribute("y2", head[1]);
  eaCenter(g.dot, head);
  eaCenter(g.hit, head);
  if (!g.bar) return;
  var zp = eaZonePoints(l).map(function (q) {
      return eaIso(q.x, q.y, (q.z + 1) / 2);
    }),
    last = zp[zp.length - 1];
  g.bar.setAttribute("x1", zp[0][0]);
  g.bar.setAttribute("y1", zp[0][1]);
  g.bar.setAttribute("x2", last[0]);
  g.bar.setAttribute("y2", last[1]);
  g.zd.forEach(function (c, i) {
    eaCenter(c, zp[i]);
  });
  eaCenter(g.end, last);
}

/* The picked piece is marked in the room and among the cards. */
function eaMark() {
  var v = EAD.v;
  Object.keys(v.els).forEach(function (k) {
    var on = k === EAD.sel;
    if (v.els[k].dot) v.els[k].dot.classList.toggle("picked", on);
    else v.els[k].top.classList.toggle("picked", on);
    if (v.els[k].end) v.els[k].end.classList.toggle("on", on);
  });
  v.tray.querySelectorAll(".ae-card").forEach(function (c) {
    c.classList.toggle("picked", c.dataset.id === EAD.sel);
  });
}

function eaSelect(key) {
  EAD.sel = key;
  eaIdentify(key && !eaIsDummy(key) ? key : null);
  eaMark();
  eaInfo();
}

/* The parts of a thing, drawn on the floor. */
function eaBuildDummy(m, i, parent) {
  var key = "d" + i,
    g = eaSvg("g", { class: "ae-th" }, parent),
    kind = EA_DUMMIES.filter(function (k) {
      return k[0] === m.k;
    })[0],
    parts = {
      left: eaSvg("polygon", { class: "ae-f1" }, g),
      right: eaSvg("polygon", { class: "ae-f2" }, g),
      top: eaSvg("polygon", { class: "ae-f3" }, g),
      label: eaSvg("text", { class: "ae-tx", "text-anchor": "middle" }, g),
    };
  parts.label.textContent = _T(kind ? kind[1] : "other");
  EAD.v.els[key] = parts;
  ["top", "left", "right"].forEach(function (p) {
    eaAttach(parts[p], key);
  });
  eaDrawDummy(key);
}

/* The parts of a light: shadow, pole, dot, and for a bar its zones and the handle at its end. */
function eaBuildLight(l, parent) {
  var g = eaSvg("g", {}, parent),
    parts = {
      shadow: eaSvg("ellipse", { class: "ae-sh", rx: 16, ry: 7 }, g),
      pole: eaSvg("line", { class: "ae-pole" }, g),
    },
    bar = eaIsBar(l.id),
    col = lightRgb(l.id);
  if (bar) {
    var zc = A(l.id).zone_colors || [];
    parts.bar = eaSvg("line", { class: "ae-bar" }, g);
    parts.zd = zoneMembers(l.id).map(function (m, i) {
      var c = eaSvg("circle", { class: "ae-zd", r: 9 }, g);
      if (V_(l.id) === "on" && zc[i]) c.style.fill = cssRgb(liveXyRgb(zc[i][0], zc[i][1]));
      return c;
    });
  }
  parts.dot = eaSvg("circle", { class: "ae-dot", r: 17 }, g);
  parts.hit = eaSvg("circle", { class: "ae-hit", r: 34 }, g);
  if (bar) {
    parts.end = eaSvg("circle", { class: "ae-end", r: 14 }, g);
    eaAttachEnd(parts.end, l.id);
  }
  if (col) parts.dot.style.fill = cssRgb(col);
  EAD.v.els[l.id] = parts;
  eaAttach(parts.hit, l.id);
  eaDrawLight(l.id);
}

/* Everything in the room is made again from the draft (lights drawn back to front, so one in front hides one behind it). Dragging only moves pieces, so a drag is never cut off by this. */
function eaBuild() {
  var v = EAD.v,
    d = EAD.draft;
  v.things.innerHTML = "";
  v.lightsG.innerHTML = "";
  v.els = {};
  d.dummies.forEach(function (m, i) {
    eaBuildDummy(m, i, v.things);
  });
  d.lights
    .slice()
    .sort(function (p, q) {
      return p.x + p.y - (q.x + q.y);
    })
    .forEach(function (l) {
      eaBuildLight(l, v.lightsG);
    });
  eaMark();
}

/* A drag across the floor in Location, up and down in Height. */
function eaDragLight(key, p, start) {
  var l = eaLightOf(key);
  if (EAD.v.mode === "h") {
    var zn = Math.max(0, Math.min(1, (l.z + 1) / 2 + (start[1] - p[1]) / EA_V.wall));
    l.z = eaRound(zn * 2 - 1);
  } else {
    var f = eaFloor(p[0], p[1], (l.z + 1) / 2);
    l.x = f[0];
    l.y = f[1];
  }
  eaDrawLight(key);
}

/* Dragging a light or a thing. */
function eaAttach(el, key) {
  var down = false,
    start = null,
    isLight = !eaIsDummy(key);
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    down = true;
    start = eaPoint(e);
    dragging++;
    DRAGAT = Date.now();
    capturePointer(el, e);
    if (EAD.sel !== key) eaSelect(key);
  });
  el.addEventListener("pointermove", function (e) {
    if (!down) return;
    var p = eaPoint(e);
    if (isLight) {
      eaDragLight(key, p, start);
      if (EAD.v.mode === "h") start = p;
    } else {
      var m = eaDummyOf(key),
        g = eaFloor(p[0], p[1], 0);
      m.x = g[0];
      m.y = g[1];
      eaDrawDummy(key);
    }
  });
  function end() {
    if (!down) return;
    down = false;
    dragging = Math.max(0, dragging - 1);
    if (isLight && EAD.v.mode === "loc") eaBuild();
    eaMark();
    eaInfo();
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/* The end of a bar: dragging it turns the bar and sets its length (Location), on the floor at the bar's height. */
function eaAttachEnd(el, key) {
  var down = false;
  el.style.touchAction = "none";
  el.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    down = true;
    dragging++;
    DRAGAT = Date.now();
    capturePointer(el, e);
    if (EAD.sel !== key) eaSelect(key);
  });
  el.addEventListener("pointermove", function (e) {
    if (!down) return;
    var l = eaLightOf(key),
      p = eaPoint(e),
      f = eaFloor(p[0], p[1], (l.z + 1) / 2),
      dx = f[0] - l.x,
      dy = f[1] - l.y,
      run = Math.hypot(dx, dy);
    if (run < 0.03) return;
    var pitch = ((l.p || 0) * Math.PI) / 180;
    l.a = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
    l.len = Math.round(Math.max(0.2, Math.min(2, (2 * run) / Math.max(0.2, Math.cos(pitch)))) * 100) / 100;
    eaDrawLight(key);
  });
  function end() {
    if (!down) return;
    down = false;
    dragging = Math.max(0, dragging - 1);
    eaInfo();
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/* The lights of the room as cards, coloured like the lights: tap one to add it to the area or to pick it. */
function eaTray() {
  var v = EAD.v,
    d = EAD.draft;
  v.tray.innerHTML = "";
  Object.keys(v.byId).forEach(function (id) {
    var dev = v.byId[id],
      rgb = lightRgb(id),
      card = mk(
        "div",
        "ae-card" + (eaLightOf(id) ? " in" : "") + (EAD.sel === id ? " picked" : ""),
        svg(dev.icon || "light")
      );
    card.dataset.id = id;
    card.appendChild(mk("span", "ae-cn")).textContent = dev.name;
    if (rgb) {
      card.style.color = "#fff";
      card.style.background =
        "linear-gradient(160deg," +
        cssRgb(rgb) +
        "," +
        cssRgb(
          rgb.map(function (c) {
            return c * 0.55;
          })
        ) +
        ")";
    }
    card.addEventListener("click", function () {
      if (!eaLightOf(id)) {
        if (d.lights.length >= 32) {
          toast(_T("up_to_32_lights_in_an_area"));
          return;
        }
        var slot = EA_SLOTS[d.lights.length % EA_SLOTS.length],
          nl = { id: id, x: slot[0], y: slot[1], z: eaStartHeight(dev.icon) };
        if (dev.bar) {
          nl.a = 0;
          nl.p = 0;
          nl.len = 0.6;
        }
        d.lights.push(nl);
        eaBuild();
        eaTray();
      }
      eaSelect(id);
    });
    v.tray.appendChild(card);
  });
}

/* Things in the room (a TV, a speaker, ...) are added from their own row of cards; each can be added more than once, dragged anywhere on the floor and resized. */
function eaThings(b) {
  var d = EAD.draft,
    row = mk("div", "ae-tray ae-things");
  b.appendChild(sep(_T("things_in_the_room"), "home"));
  b.appendChild(row);
  EA_DUMMIES.forEach(function (k) {
    var card = mk("div", "ae-card thing in", svg(k[2]));
    card.appendChild(mk("span", "ae-cn")).textContent = _T(k[1]);
    card.addEventListener("click", function () {
      if (d.dummies.length >= 16) {
        toast(_T("up_to_16_things"));
        return;
      }
      /* Each new thing goes to a free place along the front, so none hides another. */
      var n = d.dummies.length;
      d.dummies.push({
        k: k[0],
        x: eaRound(-0.7 + 0.35 * (n % 5)),
        y: eaRound(0.75 - 0.35 * Math.floor(n / 5)),
        w: 0.5,
        h: 0.3,
      });
      eaBuild();
      eaSelect("d" + (d.dummies.length - 1));
    });
    row.appendChild(card);
  });
}

/* A slider for one number of the picked piece: f has field, label, min, max, step, def (shown when unset), fmt, round and after (what to redraw). */
function eaSlider(o, f) {
  return sliderRow({
    icon: "axis",
    name: _T(f.label),
    min: f.min,
    max: f.max,
    step: f.step,
    get: function () {
      return o[f.field] === undefined ? f.def : o[f.field];
    },
    fmt: f.fmt,
    commit: function (v) {
      o[f.field] = f.round(v);
      f.after();
    },
  });
}

function eaDeg(v) {
  return Math.round(v) + "°";
}

function eaPercent(v) {
  return Math.round(v * 50) + "%";
}

/* What can be set for the picked light: its height, and for a bar its direction, tilt and length. */
function eaLightInfo(info, lm) {
  var dev = EAD.v.byId[lm.id],
    redraw = function () {
      eaDrawLight(lm.id);
    },
    rows = [
      {
        field: "z",
        label: "height",
        min: -1,
        max: 1,
        step: 0.1,
        def: 0,
        round: eaRound,
        fmt: function (v) {
          return v <= -0.7 ? _T("floor") : v >= 0.7 ? _T("ceiling") : Math.round(((v + 1) / 2) * 100) + "%";
        },
      },
    ];
  if (eaIsBar(lm.id))
    rows.push(
      { field: "a", label: "direction", min: 0, max: 355, step: 5, def: 0, round: Math.round, fmt: eaDeg },
      { field: "p", label: "tilt", min: 0, max: 90, step: 5, def: 0, round: Math.round, fmt: eaDeg },
      {
        field: "len",
        label: "length",
        min: 0.2,
        max: 2,
        step: 0.1,
        def: 0.6,
        round: function (v) {
          return Math.round(v * 100) / 100;
        },
        fmt: eaPercent,
      }
    );
  info.appendChild(sep(dev ? dev.name : entName(lm.id), dev ? dev.icon : "light"));
  rows.forEach(function (f) {
    f.after = redraw;
    info.appendChild(eaSlider(lm, f));
  });
  info.appendChild(
    pill("trash", _T("remove_from_this_area"), {
      tap: function () {
        EAD.draft.lights = EAD.draft.lights.filter(function (l) {
          return l !== lm;
        });
        eaSelect(null);
        eaBuild();
        eaTray();
      },
    })
  );
}

/* What can be set for the picked thing: its width and depth. */
function eaDummyInfo(info, key, dm) {
  var kind = EA_DUMMIES.filter(function (k) {
    return k[0] === dm.k;
  })[0];
  info.appendChild(sep(_T(kind ? kind[1] : "other"), kind ? kind[2] : "plug"));
  [
    ["w", "width"],
    ["h", "depth"],
  ].forEach(function (f) {
    info.appendChild(
      eaSlider(dm, {
        field: f[0],
        label: f[1],
        min: 0.1,
        max: 2,
        step: 0.05,
        def: 0.4,
        round: eaRound,
        fmt: eaPercent,
        after: function () {
          eaDrawDummy(key);
        },
      })
    );
  });
  info.appendChild(
    pill("trash", _T("remove_from_the_room"), {
      tap: function () {
        EAD.draft.dummies.splice(Number(key.slice(1)), 1);
        eaSelect(null);
        eaBuild();
      },
    })
  );
}

/* The settings of the picked piece, under the room. */
function eaInfo() {
  var info = EAD.v.info;
  redrawBox(info, function () {
    var key = EAD.sel,
      lm = key && !eaIsDummy(key) ? eaLightOf(key) : null,
      dm = eaIsDummy(key) ? eaDummyOf(key) : null;
    if (lm) eaLightInfo(info, lm);
    else if (dm) eaDummyInfo(info, key, dm);
    else info.appendChild(pill("info", _T("tap_a_light_to_find_it_in_the_room"), {}));
  });
}

function eaActions() {
  var box = EAD.v.box;
  redrawBox(box, function () {
    box.appendChild(pill("check", _T("save_area"), { tap: eaSave }));
    hpAreaActions(box, EAD.draft);
    if (!EAD.isNew)
      box.appendChild(
        pill("trash", _T("delete_area"), {
          tap: function () {
            confirmDlg(_T("delete") + EAD.draft.name + "”?", eaDelete);
          },
        })
      );
  });
}

/* The Location | Height switch and the line that says what a drag does. */
function eaModeSwitch(b) {
  var hint = mk("div", "hint");
  hint.textContent = _T("drag_a_light_across_the_floor");
  b.appendChild(
    seg(
      [
        ["loc", _T("location")],
        ["h", _T("height")],
      ],
      EAD.v.mode,
      function (m) {
        EAD.v.mode = m;
        b.querySelectorAll(".seg .rbtn").forEach(function (r, i) {
          r.classList.toggle("act", i === (m === "loc" ? 0 : 1));
        });
        hint.textContent = m === "loc" ? _T("drag_a_light_across_the_floor") : _T("drag_a_light_up_or_down");
      }
    )
  );
  b.appendChild(hint);
}

function eaEditor(b) {
  var d = EAD.draft,
    w = mk("div", "sqw pane", svg("target")),
    inp = mk("input", "sq"),
    byId = {};
  inp.type = "text";
  inp.maxLength = 40;
  inp.placeholder = _T("area_name");
  inp.value = d.name;
  inp.addEventListener("input", function () {
    d.name = inp.value;
  });
  w.appendChild(inp);
  b.appendChild(w);
  eaRoomLights(EAD.room).forEach(function (l) {
    byId[l.id] = l;
  });
  d.lights.forEach(function (l) {
    if (!byId[l.id]) byId[l.id] = { id: l.id, name: entName(l.id), icon: "light" };
  });
  var cv = mk("div", "ae-c"),
    root = eaRoom();
  EAD.v = {
    mode: "loc",
    byId: byId,
    els: {},
    root: root,
    things: eaSvg("g", {}, root),
    lightsG: eaSvg("g", {}, root),
    tray: mk("div", "ae-tray"),
    info: mk("div"),
    box: mk("div"),
  };
  eaModeSwitch(b);
  cv.appendChild(root);
  b.appendChild(cv);
  root.addEventListener("pointerdown", function () {
    if (EAD.sel) eaSelect(null);
  });
  b.appendChild(EAD.v.tray);
  eaThings(b);
  b.appendChild(EAD.v.info);
  b.appendChild(EAD.v.box);
  eaBuild();
  eaTray();
  eaInfo();
  eaActions();
  /* The light is put back when this screen goes away. */
  clearInterval(EA_KEEP.watch);
  EA_KEEP.watch = setInterval(function () {
    if (!cv.isConnected) {
      clearInterval(EA_KEEP.watch);
      eaIdentifyOff();
    }
  }, 1000);
}

function eaSave() {
  var d = EAD.draft,
    name = String(d.name || "").trim();
  if (!name) {
    toast(_T("give_the_area_a_name"));
    return;
  }
  if (!d.lights.length) {
    toast(_T("add_at_least_one_light"));
    return;
  }
  var a = cleanArea({
    id: d.id || "a" + Date.now().toString(36),
    name: name,
    room: EAD.room,
    lights: d.lights,
    dummies: d.dummies,
  });
  if (!a) {
    toast(_T("couldn_t_save_this_area"));
    return;
  }
  eaIdentifyOff();
  STORE.eareas = STORE.eareas.filter(function (x) {
    return x.id !== a.id;
  });
  STORE.eareas.push(a);
  uiChanged();
  hpPush([], [a]);
  toast(_T("area_saved"));
  if (STACK.length) popBack();
  else closeSheet();
}

function eaDelete() {
  var id = EAD.draft.id,
    used = STORE.scenes.filter(function (s) {
      return s.live && s.live.area === id;
    });
  if (used.length) {
    toast(_T("scenes_use_this_area") + used[0].name);
    return;
  }
  eaIdentifyOff();
  STORE.eareas = STORE.eareas.filter(function (x) {
    return x.id !== id;
  });
  uiChanged();
  hpForget(null, id);
  toast(_T("area_deleted"));
  if (STACK.length) popBack();
  else closeSheet();
}
