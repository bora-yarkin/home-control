/* Live scenes: a palette that moves across the lights of an area, played by the Scene engine integration. The scene is saved here with the other scenes; the engine only holds it while it plays. */

var LIVE_SPREADS = [
  ["x", "left_to_right"],
  ["y", "back_to_front"],
  ["z", "low_to_high"],
  ["radial", "from_the_middle"],
];

/* The engine's sensor lists the running scenes; it is found through its integration, so renaming it changes nothing. It is remembered, and looked for again at most every 5 seconds when it is not found. */
var ENGINE = { id: null, at: 0 };

function engineSensor() {
  var h = H();
  if (!h || !h.entities) return null;
  if (ENGINE.id && h.states[ENGINE.id]) return ENGINE.id;
  if (Date.now() - ENGINE.at < 5000) return null;
  ENGINE.at = Date.now();
  hpSyncLibrary(true);
  ENGINE.id =
    Object.keys(h.states).filter(function (k) {
      var e = h.entities[k];
      return k.indexOf("sensor.") === 0 && e && e.platform === "hue_plus" && /_live_scenes$/.test(e.unique_id || "");
    })[0] || null;
  return ENGINE.id;
}

function liveRun(sc) {
  var id = engineSensor(),
    s = id ? A(id).sessions : null;
  return s && s[sc.id] ? s[sc.id] : null;
}

function eaById(id) {
  for (var i = 0; i < STORE.eareas.length; i++) if (STORE.eareas[i].id === id) return STORE.eareas[i];
  return null;
}

/* What this device changed about a scene (speed, range, brightness), read from its storage once. */
var LIVESET = {};

function liveOverrides(id) {
  if (!LIVESET[id]) {
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem("db_ls_" + id) || "null");
    } catch (e) {}
    LIVESET[id] = s || {};
  }
  return LIVESET[id];
}

/* Speed, range and brightness the scene is played with: its own, unless this device changed them. */
function liveSet(sc) {
  var s = liveOverrides(sc.id);
  return {
    speed: typeof s.speed === "number" ? s.speed : sc.live.speed,
    range: typeof s.range === "number" ? s.range : sc.live.range,
    bri: typeof s.bri === "number" ? s.bri : sc.live.bri,
  };
}

function liveSave(sc, st) {
  LIVESET[sc.id] = st;
  try {
    localStorage.setItem("db_ls_" + sc.id, JSON.stringify(st));
  } catch (e) {}
}

/* The parts of a live scene beyond the palette, in the words of Hue Plus's services. */
function liveParts(sc) {
  var l = sc.live,
    looks = {};
  Object.keys(l.looks || {}).forEach(function (id) {
    var k = l.looks[id],
      o = {};
    if (k.palette) o.palette = k.palette;
    if (typeof k.bri === "number") o.brightness = Math.max(1, Math.min(255, Math.round(k.bri * 2.55)));
    if (k.fx) o.effects = k.fx;
    if (k.native) o.native = k.native;
    if (Object.keys(o).length) looks[id] = o;
  });
  return {
    colour_source: l.src || "palette",
    effects: l.fx || [],
    looks: looks,
    actions: (l.also || []).map(function (a) {
      return { entity_id: a.id, do: a.on ? "on" : "off" };
    }),
  };
}

/* What the engine is told to start: the area's lights the user may control, the palette and the settings. */
function livePayload(sc) {
  var ar = eaById(sc.live.area);
  if (!ar) return null;
  var st = liveSet(sc),
    lights = [];
  /* A bar (a light made of zones) is sent as its zones, spread along its direction. */
  ar.lights.forEach(function (l) {
    if (!ISADMIN && ACCESS_ME) {
      var m = modeOf(l.id).mode;
      if (m === "view" || m === "hide") return;
    }
    (eaIsBar(l.id) ? eaZonePoints(l) : [l]).forEach(function (q) {
      lights.push({ id: q.id, x: q.x, y: q.y, z: q.z });
    });
  });
  var parts = liveParts(sc);
  return {
    ids: lights.map(function (l) {
      return l.id;
    }),
    data: {
      colour_source: parts.colour_source,
      effects: parts.effects,
      looks: parts.looks,
      actions: parts.actions,
      scene_id: sc.id,
      lights: lights.map(function (l) {
        return { entity_id: l.id, x: l.x, y: l.y, z: l.z };
      }),
      palette: sc.live.palette,
      speed: st.speed,
      range: st.range,
      brightness: Math.max(1, Math.min(255, Math.round(st.bri * 2.55))),
      spread: sc.live.spread,
      wake: true,
    },
  };
}

/* Hue Plus keeps the live scenes and areas (so an automation can start a scene by its id, and so it works without this dashboard).
   The dashboard writes what it saves, deletes what it deletes, and, when an administrator opens it, creates what Hue Plus lacks.
   It never deletes or overwrites anything it did not change: a scene made in Hue Plus stays there. */
var HPLIB = { t: 0, once: false };

function hpId(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 48);
}

function hpAreaLights(ar) {
  var out = [];
  ar.lights.forEach(function (l) {
    (eaIsBar(l.id) ? eaZonePoints(l) : [l]).forEach(function (q) {
      out.push({ entity_id: q.id, x: q.x, y: q.y, z: q.z });
    });
  });
  return out.slice(0, 32);
}

function hpAreaPayload(ar) {
  var lights = hpAreaLights(ar);
  if (!lights.length) return null;
  return { id: hpId(ar.id), name: ar.name || ar.id, lights: lights, ui: { room: ar.room || "" } };
}

function hpScenePayload(sc) {
  var ar = sc.live ? eaById(sc.live.area) : null;
  if (!ar || !hpAreaPayload(ar)) return null; /* a scene whose area cannot be written could not start there */
  var parts = liveParts(sc);
  return {
    id: hpId(sc.id),
    name: sc.name || sc.id,
    colour_source: parts.colour_source,
    effects: parts.effects,
    looks: parts.looks,
    actions: parts.actions,
    palette: sc.live.palette,
    speed: sc.live.speed,
    range: sc.live.range,
    brightness: Math.max(1, Math.min(255, Math.round(sc.live.bri * 2.55))),
    spread: sc.live.spread,
    area: hpId(sc.live.area),
    ui: { room: sc.room || "" },
  };
}

/* Writes the scenes and areas the administrator just saved (the areas first: a scene names one). */
function hpPush(scenes, areas) {
  if (!ISADMIN || !engineSensor()) return;
  areas.forEach(function (ar) {
    var p = hpAreaPayload(ar);
    if (p) callRaw("hue_plus", "area_save", p);
  });
  scenes.forEach(function (sc) {
    var p = hpScenePayload(sc);
    if (p) callRaw("hue_plus", "scene_save", p);
  });
}

/* Deletes what the administrator just deleted. */
function hpForget(sceneId, areaId) {
  if (!ISADMIN || !engineSensor()) return;
  if (sceneId) callRaw("hue_plus", "scene_delete", { id: hpId(sceneId) });
  if (areaId) callRaw("hue_plus", "area_delete", { id: hpId(areaId) });
}

/* Creates in Hue Plus what it lacks (a new bridge, lost storage). What it already has is left alone. */
function hpSyncLibrary(first) {
  if (!ISADMIN || (first && HPLIB.once)) return;
  if (first) HPLIB.once = true;
  clearTimeout(HPLIB.t);
  HPLIB.t = setTimeout(function () {
    if (!engineSensor()) return;
    HA.serviceResponse("hue_plus", "get_library", {})
      .then(function (lib) {
        var haveAreas = {},
          haveScenes = {};
        (lib.areas || []).forEach(function (a) {
          haveAreas[a.id] = 1;
        });
        (lib.scenes || []).forEach(function (s) {
          haveScenes[s.id] = 1;
        });
        hpPush(
          STORE.scenes.filter(function (sc) {
            return !haveScenes[hpId(sc.id)];
          }),
          STORE.eareas.filter(function (ar) {
            return !haveAreas[hpId(ar.id)];
          })
        );
      })
      .catch(function () {});
  }, 1500);
}

function liveStart(sc) {
  if (!engineSensor()) {
    toast(_T("scene_engine_is_not_installed"));
    return;
  }
  var p = livePayload(sc);
  if (!p) {
    toast(_T("this_scene_has_no_area"));
    return;
  }
  if (!p.ids.length) {
    toast(_T("this_is_view_only_for_you"));
    return;
  }
  gate(p.ids, function () {
    callRaw("hue_plus", "scene_start", p.data);
  });
}

/* Something else is about to set these lights (a scene, a Hue scene): live scenes playing on any of them end, so the lights are left to what is set now. */
function liveStopOn(ids) {
  var sid = engineSensor(),
    running = sid ? A(sid).sessions || {} : {},
    mine = {};
  lightIndividuals(
    ids.filter(function (x) {
      return dom(x) === "light";
    })
  ).forEach(function (x) {
    mine[x] = 1;
  });
  Object.keys(running).forEach(function (scene) {
    if (
      (running[scene].lights || []).some(function (l) {
        return mine[l];
      })
    )
      callRaw("hue_plus", "scene_stop", { scene_id: scene });
  });
}

function liveToggle(sc) {
  if (liveRun(sc)) callRaw("hue_plus", "scene_stop", { scene_id: sc.id });
  else liveStart(sc);
}

function liveSub(sc) {
  var r = liveRun(sc),
    ar = eaById(sc.live.area);
  if (r) return r.state === "frozen" ? _T("frozen") : _T("playing");
  return ar ? ar.name : _T("this_scene_has_no_area");
}

function liveRow(sc) {
  return edMark(
    pill(sc.icon || "palette", sc.name, {
      on: function () {
        return !!liveRun(sc);
      },
      sub: function () {
        return liveSub(sc);
      },
      tap: function () {
        showPopup("lscene:" + sc.id, true);
      },
      iconTap: function () {
        liveToggle(sc);
      },
      pin: { kind: "cscene", sid: sc.id, name: sc.name, icon: sc.icon || "palette", room: TITLES[sc.room] },
    }),
    function () {
      liveOpenEditor(sc.room, sc);
    }
  );
}

/* ---- colours ---- */

function liveXyRgb(x, y) {
  y = y || 1e-6;
  var X = x / y,
    Z = (1 - x - y) / y,
    rgb = [
      X * 1.656492 - 0.354851 - Z * 0.255038,
      -X * 0.707196 + 1.655397 + Z * 0.036152,
      X * 0.051713 - 0.121364 + Z * 1.01153,
    ],
    top = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  return rgb.map(function (v) {
    v = Math.max(0, v / top);
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(255 * Math.min(1, v));
  });
}

function liveXyHs(x, y) {
  return hsvOf(liveXyRgb(x, y));
}

function liveRgb(c) {
  if (c.hs) return hsv2rgb(c.hs[0], c.hs[1]);
  if (c.k) return kelvinRgb(c.k);
  return liveXyRgb(c.xy[0], c.xy[1]);
}

function liveCss(c) {
  return cssRgb(liveRgb(c));
}

/* ---- the popup of a live scene ---- */

function liveScenePopup(b, id) {
  var sc = sceneById(id);
  if (!sc || !sc.live) return;
  function run() {
    return liveRun(sc);
  }
  function upd(data) {
    if (run()) {
      data.scene_id = sc.id;
      callRaw("hue_plus", "scene_update", data);
    }
  }
  b.appendChild(
    sliderRow({
      icon: "bright",
      name: _T("brightness"),
      min: 1,
      max: 100,
      step: 1,
      get: function () {
        return liveSet(sc).bri;
      },
      fmt: function (v) {
        return v + "%";
      },
      on: function () {
        return !!run();
      },
      live: function (v) {
        upd({ brightness: Math.round(v * 2.55) });
      },
      commit: function (v) {
        var st = liveSet(sc);
        st.bri = v;
        liveSave(sc, st);
        upd({ brightness: Math.round(v * 2.55) });
      },
    })
  );
  b.appendChild(
    sliderRow({
      icon: "tune",
      name: _T("speed"),
      min: 1,
      max: Integrations.scenes.speedSteps,
      step: 1,
      get: function () {
        return liveSet(sc).speed;
      },
      fmt: function (v) {
        return v + " / " + Integrations.scenes.speedSteps;
      },
      on: function () {
        return !!run();
      },
      commit: function (v) {
        var st = liveSet(sc);
        st.speed = v;
        liveSave(sc, st);
        upd({ speed: v });
      },
    })
  );
  b.appendChild(
    sliderRow({
      icon: "palette",
      name: _T("colour_range"),
      min: 0,
      max: 100,
      step: 5,
      get: function () {
        return liveSet(sc).range;
      },
      fmt: function (v) {
        return v + "%";
      },
      on: function () {
        return !!run();
      },
      commit: function (v) {
        var st = liveSet(sc);
        st.range = v;
        liveSave(sc, st);
        upd({ range: v });
      },
    })
  );
  var g2 = mk("div", "gridl g2");
  g2.appendChild(
    pill("play", _T("play"), {
      on: function () {
        return !!run() && run().state === "running";
      },
      tap: function () {
        if (run()) callRaw("hue_plus", "scene_play", { scene_id: sc.id });
        else liveStart(sc);
      },
    })
  );
  g2.appendChild(
    pill("pause", _T("freeze"), {
      on: function () {
        return !!run() && run().state === "frozen";
      },
      tap: function () {
        if (run()) callRaw("hue_plus", "scene_freeze", { scene_id: sc.id });
      },
    })
  );
  b.appendChild(g2);
  if (ISADMIN)
    b.appendChild(
      pill("edit", _T("edit_scene"), {
        tap: function () {
          liveOpenEditor(sc.room, sc);
        },
      })
    );
}

/* ---- the editor ---- */

var LSD = null;

function liveEmptyDraft(room) {
  return {
    id: "",
    name: "",
    room: room,
    icon: "palette",
    live: {
      area: "",
      palette: [{ hs: [0, 100] }, { hs: [240, 100] }],
      speed: 6,
      range: 100,
      bri: 100,
      spread: "x",
      src: "palette",
      fx: [],
      looks: {},
      also: [],
    },
  };
}

function liveOpenEditor(room, sc, target, draft, pending) {
  LSD = {
    room: room,
    isNew: !sc,
    target: target || null,
    pending: pending || null,
    sel: 0,
    draft: sc ? JSON.parse(JSON.stringify(sc)) : draft || liveEmptyDraft(room),
  };
  if (!LSD.draft.live.area) {
    var mine = STORE.eareas.filter(function (a) {
      return a.room === room;
    });
    if (mine.length === 1) LSD.draft.live.area = mine[0].id;
  }
  showPopup("live-edit", true);
}

/* An area of this editor: the one an import is about to create or change is only here until the scene is saved. */
function liveAreaOf(id) {
  return LSD && LSD.pending && LSD.pending.id === id ? LSD.pending : eaById(id);
}

function liveColourEditor(box, d, redraw) {
  var pal = d.live.palette,
    sel = Math.min(LSD.sel, pal.length - 1),
    cur = pal[sel],
    row = mk("div", "lv-pal");
  pal.forEach(function (c, i) {
    var s = mk("div", "lv-sw" + (i === sel ? " picked" : ""));
    s.style.background = liveCss(c);
    s.addEventListener("click", function () {
      LSD.sel = i;
      redraw(true);
    });
    row.appendChild(s);
  });
  if (pal.length < 16) {
    var add = mk("div", "lv-sw add", svg("plus"));
    add.addEventListener("click", function () {
      pal.push({ hs: [Math.round(Math.random() * 359), 100] });
      LSD.sel = pal.length - 1;
      redraw(true);
    });
    row.appendChild(add);
  }
  box.appendChild(row);
  var white = !!cur.k;
  box.appendChild(
    seg(
      [
        ["c", _T("colour")],
        ["w", _T("white")],
      ],
      white ? "w" : "c",
      function (v) {
        var rgb = liveRgb(cur),
          b = cur.b;
        if (v === "w") {
          pal[sel] = { k: 2700 };
        } else {
          var hs = hsvOf(rgb);
          pal[sel] = { hs: [hs[0], Math.max(hs[1], 60)] };
        }
        if (b) pal[sel].b = b;
        redraw(true);
      }
    )
  );
  if (white) {
    box.appendChild(
      sliderRow({
        icon: "thermo",
        name: _T("white_temperature"),
        track: "kel",
        trackBg: function () {
          var s = [];
          for (var i = 0; i <= 6; i++) s.push(cssRgb(kelvinRgb(2000 + ((6500 - 2000) * i) / 6)));
          return "linear-gradient(90deg," + s.join(",") + ")";
        },
        min: 2000,
        max: 6500,
        step: 50,
        get: function () {
          return cur.k;
        },
        fmt: function (v) {
          return Math.round(v) + " K";
        },
        commit: function (v) {
          cur.k = v;
          redraw(true);
        },
      })
    );
  } else {
    var hs = cur.hs || liveXyHs(cur.xy[0], cur.xy[1]);
    function setHs(h, s) {
      var b = cur.b;
      pal[sel] = { hs: [Math.round(h), Math.round(s)] };
      if (b) pal[sel].b = b;
      cur = pal[sel];
      redraw(true);
    }
    box.appendChild(
      sliderRow({
        icon: "palette",
        name: _T("colour"),
        track: "hue",
        trackBg: HUE_BG,
        min: 0,
        max: 360,
        step: 1,
        get: function () {
          return hs[0];
        },
        fmt: function (v) {
          return Math.round(v) + "°";
        },
        commit: function (v) {
          setHs(v, hs[1] || 100);
        },
      })
    );
    box.appendChild(
      sliderRow({
        icon: "drop",
        name: _T("saturation"),
        track: "kel",
        trackBg: "linear-gradient(90deg,#fff," + cssRgb(hsv2rgb(hs[0], 100)) + ")",
        min: 0,
        max: 100,
        step: 1,
        get: function () {
          return hs[1];
        },
        fmt: function (v) {
          return Math.round(v) + "%";
        },
        commit: function (v) {
          setHs(hs[0], v);
        },
      })
    );
  }
  box.appendChild(
    sliderRow({
      icon: "bright",
      name: _T("brightness"),
      min: 10,
      max: 100,
      step: 5,
      get: function () {
        return cur.b || 100;
      },
      fmt: function (v) {
        return v + "%";
      },
      commit: function (v) {
        if (v >= 100) delete cur.b;
        else cur.b = v;
        redraw(true);
      },
    })
  );
  if (pal.length > 1)
    box.appendChild(
      pill("trash", _T("remove_this_colour"), {
        tap: function () {
          pal.splice(sel, 1);
          LSD.sel = Math.max(0, sel - 1);
          redraw(true);
        },
      })
    );
}

/* A colour as [hue, saturation] from its rgb. */
function hsvOf(rgb) {
  var mx = Math.max(rgb[0], rgb[1], rgb[2]),
    mn = Math.min(rgb[0], rgb[1], rgb[2]),
    d = mx - mn,
    h = 0;
  if (d > 0) {
    if (mx === rgb[0]) h = ((rgb[1] - rgb[2]) / d + 6) % 6;
    else if (mx === rgb[1]) h = (rgb[2] - rgb[0]) / d + 2;
    else h = (rgb[0] - rgb[1]) / d + 4;
  }
  return [Math.round(h * 60) % 360, mx ? Math.round((d / mx) * 100) : 0];
}

/* The colours the lights of the area show now, as a palette. */
function livePaletteFromLights(ids) {
  var out = [];
  ids.forEach(function (id) {
    var a = A(id);
    if (V_(id) !== "on") return;
    if (a.color_mode === "color_temp" && a.color_temp_kelvin) out.push({ k: Math.round(a.color_temp_kelvin) });
    else if (a.hs_color) out.push({ hs: [Math.round(a.hs_color[0]), Math.round(a.hs_color[1])] });
  });
  return out.slice(0, 16);
}

function liveEditor(b) {
  var d = LSD.draft,
    w = mk("div", "sqw pane", svg("palette")),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.maxLength = 40;
  inp.placeholder = _T("scene_name");
  inp.value = d.name;
  inp.addEventListener("input", function () {
    d.name = inp.value;
  });
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(
    iconPick(QAICONS.concat(["palette"]), d.icon || "palette", function (n) {
      d.icon = n;
    })
  );
  var box = mk("div");
  b.appendChild(box);
  function draw(live) {
    var prev = CUR;
    if (live) SLIVE.length = 0;
    CUR = SLIVE;
    box.innerHTML = "";
    box.appendChild(sep(_T("area"), "target"));
    var mine = STORE.eareas
      .filter(function (a) {
        return a.room === LSD.room && !(LSD.pending && LSD.pending.id === a.id);
      })
      .concat(LSD.pending ? [LSD.pending] : []);
    mine.forEach(function (a) {
      box.appendChild(
        pill("target", a.name, {
          on: function () {
            return d.live.area === a.id;
          },
          sub: function () {
            return cntS(a.lights.length, _T("light"), _T("lights"));
          },
          tap: function () {
            d.live.area = a.id;
            draw(true);
          },
        })
      );
    });
    box.appendChild(
      pill("edit", mine.length ? _T("edit_areas") : _T("create_an_area"), {
        sub: function () {
          return _T("place_the_lights_of_this_room");
        },
        tap: function () {
          showPopup("areas:" + LSD.room, true);
        },
      })
    );
    box.appendChild(sep(_T("colours"), "palette"));
    box.appendChild(
      seg(
        [
          ["palette", _T("palette")],
          ["rainbow", _T("rainbow")],
        ],
        d.live.src || "palette",
        function (v) {
          d.live.src = v;
          draw(true);
        }
      )
    );
    var rainbow = d.live.src === "rainbow";
    if (rainbow) {
      var rh = mk("div", "hint");
      rh.textContent = _T("the_colours_go_round_the_colour_wheel");
      box.appendChild(rh);
    } else liveColourEditor(box, d, draw);
    var ar = liveAreaOf(d.live.area);
    if (ar && !rainbow)
      box.appendChild(
        pill("light", _T("take_colours_from_the_lights"), {
          sub: function () {
            return _T("replaces_the_palette_with_what_the_lights_show_now");
          },
          tap: function () {
            var p = livePaletteFromLights(
              ar.lights.map(function (l) {
                return l.id;
              })
            );
            if (!p.length) {
              toast(_T("no_light_in_this_area_is_on"));
              return;
            }
            d.live.palette = p;
            LSD.sel = 0;
            draw(true);
          },
        })
      );
    box.appendChild(sep(_T("movement"), "tune"));
    box.appendChild(
      sliderRow({
        icon: "tune",
        name: _T("speed"),
        min: 1,
        max: Integrations.scenes.speedSteps,
        step: 1,
        get: function () {
          return d.live.speed;
        },
        fmt: function (v) {
          return v + " / " + Integrations.scenes.speedSteps;
        },
        commit: function (v) {
          d.live.speed = v;
        },
      })
    );
    box.appendChild(
      sliderRow({
        icon: "palette",
        name: _T("colour_range"),
        min: 0,
        max: 100,
        step: 5,
        get: function () {
          return d.live.range;
        },
        fmt: function (v) {
          return v + "%";
        },
        commit: function (v) {
          d.live.range = v;
        },
      })
    );
    box.appendChild(
      sliderRow({
        icon: "bright",
        name: _T("brightness"),
        min: 1,
        max: 100,
        step: 1,
        get: function () {
          return d.live.bri;
        },
        fmt: function (v) {
          return v + "%";
        },
        commit: function (v) {
          d.live.bri = v;
        },
      })
    );
    box.appendChild(sep(_T("direction"), "axis"));
    var sp = mk("div", "gridl g2");
    LIVE_SPREADS.forEach(function (o) {
      sp.appendChild(
        pill("axis", _T(o[1]), {
          on: function () {
            return d.live.spread === o[0];
          },
          tap: function () {
            d.live.spread = o[0];
            draw(true);
          },
        })
      );
    });
    box.appendChild(sp);
    box.appendChild(sep(_T("brightness_effects"), "tune"));
    liveFxEditor(box, d.live, "fx", draw);
    if (ar) {
      var singles = ar.lights.filter(function (l) {
        return !eaIsBar(l.id);
      });
      if (singles.length) {
        box.appendChild(sep(_T("single_lights"), "light"));
        singles.forEach(function (l) {
          box.appendChild(
            pill("light", entName(l.id), {
              on: function () {
                return !!(d.live.looks && d.live.looks[l.id] && Object.keys(d.live.looks[l.id]).length);
              },
              sub: function () {
                return liveLookSummary(d.live.looks && d.live.looks[l.id]);
              },
              tap: function () {
                LSD.sel = 0;
                showPopup("live-look:" + l.id, true);
              },
            })
          );
        });
      }
    }
    box.appendChild(sep(_T("also_switch"), "plug"));
    var ah = mk("div", "hint");
    ah.textContent = _T("also_switch_hint");
    box.appendChild(ah);
    (d.live.also || []).forEach(function (a, i) {
      box.appendChild(sep(entName(a.id), "plug"));
      box.appendChild(
        seg(
          [
            ["on", _T("switch_on")],
            ["off", _T("switch_off")],
            ["rm", _T("remove_from_list")],
          ],
          a.on ? "on" : "off",
          function (v) {
            if (v === "rm") d.live.also.splice(i, 1);
            else a.on = v === "on";
            draw(true);
          }
        )
      );
    });
    if (d.live.also.length < 12)
      box.appendChild(
        pill("plus", _T("add_device"), {
          tap: function () {
            showPopup("live-also", true);
          },
        })
      );
    box.appendChild(pill("check", _T("save_scene"), { tap: liveSaveScene }));
    if (!LSD.isNew)
      box.appendChild(
        pill("trash", _T("delete_scene"), {
          tap: function () {
            confirmDlg(_T("delete") + d.name + "”?", liveDeleteScene);
          },
        })
      );
    CUR = prev;
    if (live) refresh();
  }
  draw(false);
}

var LIVE_FX_NAMES = ["pulse", "flicker", "sparkle", "lightning"];

/* The brightness effects of a scene or of one light: each with its speed and strength, and the effects that can still be added. */
function liveFxEditor(box, holder, key, redraw) {
  var list = holder[key];
  list.forEach(function (f, i) {
    box.appendChild(sep(_T("fx_" + f.type), "tune"));
    box.appendChild(
      sliderRow({
        icon: "tune",
        name: _T("speed"),
        min: 1,
        max: Integrations.scenes.speedSteps,
        step: 1,
        get: function () {
          return f.speed;
        },
        fmt: function (v) {
          return v + " / " + Integrations.scenes.speedSteps;
        },
        commit: function (v) {
          f.speed = v;
        },
      })
    );
    box.appendChild(
      sliderRow({
        icon: "bright",
        name: _T("strength"),
        min: 1,
        max: 100,
        step: 1,
        get: function () {
          return f.strength;
        },
        fmt: function (v) {
          return v + "%";
        },
        commit: function (v) {
          f.strength = v;
        },
      })
    );
    box.appendChild(
      pill("trash", _T("remove_this_effect"), {
        tap: function () {
          list.splice(i, 1);
          redraw(true);
        },
      })
    );
  });
  if (list.length < 4) {
    var g = mk("div", "gridl g2");
    LIVE_FX_NAMES.forEach(function (name) {
      g.appendChild(
        pill("plus", _T("fx_" + name), {
          sub: function () {
            return _T("fx_" + name + "_sub");
          },
          tap: function () {
            list.push({ type: name, speed: 6, strength: 60 });
            redraw(true);
          },
        })
      );
    });
    box.appendChild(g);
  }
}

/* One line about what a single light does differently, for the list of lights. */
function liveLookSummary(k) {
  if (!k || !Object.keys(k).length) return _T("follows_the_scene");
  var parts = [];
  if (k.native) parts.push(k.native);
  if (k.palette) parts.push(_T("own_colours"));
  if (typeof k.bri === "number") parts.push(k.bri + "%");
  if (k.fx) parts.push(k.fx.length ? k.fx.map(function (f) { return _T("fx_" + f.type); }).join(", ") : _T("no_effects"));
  return parts.join(" · ") || _T("follows_the_scene");
}

/* The sheet of one light of a scene: what it does differently from the rest. Opened from the list of single lights. */
function liveLook(b, id) {
  var d = LSD.draft;
  d.live.looks = d.live.looks || {};
  /* Kept attached while the sheet is open, even when empty; an empty look is dropped when the scene is saved. */
  var k = d.live.looks[id] || (d.live.looks[id] = {}),
    box = mk("div");
  b.appendChild(box);
  function draw(live) {
    var prev = CUR;
    if (live) SLIVE.length = 0;
    CUR = SLIVE;
    box.innerHTML = "";
    var h = mk("div", "hint");
    h.textContent = entName(id) + " · " + _T("look_hint");
    box.appendChild(h);
    box.appendChild(sep(_T("colours"), "palette"));
    box.appendChild(
      seg(
        [
          ["scene", _T("scene_colours")],
          ["own", _T("own_colours")],
        ],
        k.palette ? "own" : "scene",
        function (v) {
          if (v === "own") k.palette = JSON.parse(JSON.stringify(d.live.palette));
          else delete k.palette;
          LSD.sel = 0;
          draw(true);
        }
      )
    );
    if (k.palette) liveColourEditor(box, { live: k }, draw);
    box.appendChild(sep(_T("brightness"), "bright"));
    box.appendChild(
      seg(
        [
          ["scene", _T("scene_brightness")],
          ["own", _T("own_brightness")],
        ],
        typeof k.bri === "number" ? "own" : "scene",
        function (v) {
          if (v === "own") k.bri = d.live.bri;
          else delete k.bri;
          draw(true);
        }
      )
    );
    if (typeof k.bri === "number")
      box.appendChild(
        sliderRow({
          icon: "bright",
          name: _T("brightness"),
          min: 1,
          max: 100,
          step: 1,
          get: function () {
            return k.bri;
          },
          fmt: function (v) {
            return v + "%";
          },
          commit: function (v) {
            k.bri = v;
          },
        })
      );
    box.appendChild(sep(_T("brightness_effects"), "tune"));
    box.appendChild(
      seg(
        [
          ["scene", _T("scene_effects")],
          ["own", _T("own_effects")],
          ["none", _T("no_effects")],
        ],
        !k.fx ? "scene" : k.fx.length ? "own" : "none",
        function (v) {
          if (v === "scene") delete k.fx;
          else if (v === "none") k.fx = [];
          else k.fx = (d.live.fx || []).map(function (f) { return { type: f.type, speed: f.speed, strength: f.strength }; });
          draw(true);
        }
      )
    );
    if (k.fx && k.fx.length) liveFxEditor(box, k, "fx", draw);
    var offered = (A(id).effect_list || []).filter(function (e) {
      return LIVE_NATIVE.indexOf(e) >= 0;
    });
    if (offered.length) {
      box.appendChild(sep(_T("the_lights_own_effect"), "light"));
      var g = mk("div", "gridl g2");
      [""].concat(offered).forEach(function (name) {
        g.appendChild(
          pill("light", name ? lpFxLabel(name) : _T("none"), {
            on: function () {
              return (k.native || "") === name;
            },
            tap: function () {
              if (name) k.native = name;
              else delete k.native;
              draw(true);
            },
          })
        );
      });
      box.appendChild(g);
      if (k.native) {
        var nh = mk("div", "hint");
        nh.textContent = _T("own_effect_hint");
        box.appendChild(nh);
      }
    }
    box.appendChild(
      pill("undo", _T("follow_the_scene"), {
        tap: function () {
          Object.keys(k).forEach(function (x) {
            delete k[x];
          });
          draw(true);
        },
      })
    );
    CUR = prev;
    if (live) refresh();
  }
  draw(false);
}

/* The devices of this room that a scene can switch when it starts, not yet listed. */
function liveAlsoPick(b) {
  var d = LSD.draft,
    have = {};
  (d.live.also || []).forEach(function (a) {
    have[a.id] = 1;
  });
  var inScene = {};
  var ar = liveAreaOf(d.live.area);
  if (ar)
    ar.lights.forEach(function (l) {
      inScene[l.id] = 1;
    });
  var list = roomDevs(LSD.room).filter(function (x) {
    return x.id && !have[x.id] && !inScene[x.id] && LIVE_ALSO.indexOf(x.id.split(".")[0]) >= 0;
  });
  if (!list.length) b.appendChild(pill("info", _T("every_suitable_device_is_listed"), {}));
  list.forEach(function (x) {
    b.appendChild(
      pill(x.icon, x.name, {
        tap: function () {
          d.live.also.push({ id: x.id, on: false });
          popBack();
        },
      })
    );
  });
}

/* The first question of a new scene: fixed settings (lights, AC, TV at set levels) or colours and effects. */
function sceneKindPage(b, key) {
  var q = key.split(":"),
    scope = q[0],
    e = secById(scope, q[1]);
  if (!e) return;
  b.appendChild(
    pill("scene", _T("fixed_settings"), {
      sub: function () {
        return _T("fixed_settings_sub");
      },
      tap: function () {
        openEditor(scope, null, { scope: scope, sid: e.id });
      },
    })
  );
  b.appendChild(
    pill("palette", _T("colours_and_effects"), {
      sub: function () {
        return _T("colours_and_effects_sub");
      },
      tap: function () {
        liveOpenEditor(scope, null, { scope: scope, sid: e.id });
      },
    })
  );
}

function liveSaveScene() {
  var d = LSD.draft,
    name = String(d.name || "").trim();
  if (!name) {
    toast(_T("give_the_scene_a_name"));
    return;
  }
  if (!liveAreaOf(d.live.area)) {
    toast(_T("choose_an_area"));
    return;
  }
  var sc = cleanScene({
    id: d.id || "s" + Date.now().toString(36),
    name: name,
    room: LSD.room,
    icon: d.icon,
    others: "keep",
    acts: [],
    live: d.live,
  });
  if (!sc || !sc.live) {
    toast(_T("couldn_t_save_this_scene"));
    return;
  }
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== sc.id;
  });
  STORE.scenes.push(sc);
  /* An area made for an import is stored together with the scene that uses it. */
  if (LSD.pending && d.live.area === LSD.pending.id) {
    var pa = cleanArea(LSD.pending);
    if (pa) {
      STORE.eareas = STORE.eareas.filter(function (x) {
        return x.id !== pa.id;
      });
      STORE.eareas.push(pa);
    }
  }
  if (LSD.isNew && LSD.target) {
    var te = secById(LSD.target.scope, LSD.target.sid);
    if (te) scnToggle(te, sc.id);
  }
  /* A scene that is playing takes the new colours and settings at once. */
  if (liveRun(sc)) liveStart(sc);
  uiChanged();
  hpPush([sc], [eaById(sc.live.area)].filter(Boolean));
  toast(_T("scene_saved"));
  closeSheet();
}

function liveDeleteScene() {
  var id = LSD.draft.id;
  if (liveRun({ id: id })) callRaw("hue_plus", "scene_stop", { scene_id: id });
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== id;
  });
  pruneSceneRefs();
  uiChanged();
  hpForget(id, null);
  toast(_T("scene_deleted"));
  closeSheet();
}

/* ---- import from Hue ---- */

/* The Hue live scenes of the home, by room. */
function hueLiveScenes() {
  var h = H();
  return Object.keys(h.states)
    .filter(function (id) {
      return Integrations.scenes.isHue(h, id) && A(id).is_dynamic !== false;
    })
    .sort(function (x, y) {
      return (
        String(A(x).group_name || "").localeCompare(String(A(y).group_name || "")) ||
        String(A(x).name || x).localeCompare(String(A(y).name || y))
      );
    });
}

/* The page a Hue scene belongs on: the open room, or else the room that has most of its lights. */
function liveRoomFor(lights) {
  if (VIEW !== "home" && UIROOM[VIEW]) return VIEW;
  var best = null,
    n = 0;
  Object.keys(UIROOM).forEach(function (r) {
    var c = lights.filter(function (id) {
      return (UI.devs[r] || []).some(function (d) {
        return d.id === id;
      });
    }).length;
    if (c > n) {
      n = c;
      best = r;
    }
  });
  return best || "home";
}

/* The area to use for these lights: one of the room that holds all of them, or the room's imported-lights area with the missing ones added in a row. Returns { area, save }: save is true when the area is new or changed, and is then only a copy: it is stored when the scene is saved. */
function liveAreaFor(room, lights) {
  var mine = STORE.eareas.filter(function (a) {
    return a.room === room;
  });
  var all = mine.filter(function (a) {
    return lights.every(function (id) {
      return a.lights.some(function (l) {
        return l.id === id;
      });
    });
  })[0];
  if (all) return { area: all, save: false };
  var auto = eaById("imp-" + room);
  if (!auto) {
    if (STORE.eareas.length >= 24) return { area: mine[0] || null, save: false };
    auto = {
      id: "imp-" + room,
      name: (TITLES[room] || room) + " · " + _T("imported"),
      room: room,
      lights: [],
      dummies: [],
    };
  } else auto = JSON.parse(JSON.stringify(auto));
  var add = lights.filter(function (id) {
    return !auto.lights.some(function (l) {
      return l.id === id;
    });
  });
  var total = auto.lights.length + add.length;
  add.forEach(function (id, i) {
    if (auto.lights.length >= 32) return;
    var k = auto.lights.length;
    var nl = { id: id, x: total > 1 ? -0.8 + (1.6 * k) / (total - 1) : 0, y: 0, z: 0 };
    if (eaIsBar(id)) {
      nl.a = 0;
      nl.p = 0;
      nl.len = 0.6;
    }
    auto.lights.push(nl);
  });
  return { area: auto, save: true };
}

/* Reads a Hue scene from the bridge and opens the editor with it. */
function liveImportHue(sceneId, room, target) {
  if (!engineSensor()) {
    toast(_T("scene_engine_is_not_installed"));
    return;
  }
  HA.serviceResponse("hue_plus", "import_hue_scene", { entity_id: sceneId })
    .then(function (r) {
      if (!r || !r.palette || !r.palette.length) throw new Error("empty");
      var lights = eaUnits(
        (r.lights || []).filter(function (id) {
          return H().states[id];
        })
      );
      var rm = room || liveRoomFor(lights),
        found = lights.length ? liveAreaFor(rm, lights) : { area: null, save: false },
        ar = found.area,
        draft = liveEmptyDraft(rm);
      draft.name = r.name || A(sceneId).name || "";
      draft.live.palette = r.palette.slice(0, 16).map(function (c) {
        var o = c.k ? { k: Math.round(c.k) } : { xy: c.xy };
        if (c.b && c.b < 99) o.b = Math.round(c.b);
        return o;
      });
      if (typeof r.speed === "number")
        draft.live.speed = Integrations.scenes.speedToStep(Math.round(r.speed * 100));
      draft.live.bri = Math.max(1, Math.min(100, Math.round(r.brightness / 2.55)));
      if (ar) draft.live.area = ar.id;
      if (!target) {
        var secs = secOrder(scopeKey(rm)).filter(function (s) {
          return s.k === "scenes";
        });
        if (secs.length) target = { scope: rm, sid: secs[0].id };
      }
      liveOpenEditor(rm, null, target, draft, found.save ? ar : null);
    })
    .catch(function () {
      toast(_T("couldn_t_read_that_scene_from_the_hue_bridge"));
    });
}

/* The list of Hue scenes to import from. */
function liveImportPage(b, key) {
  var q = key.split(":"),
    target = q.length >= 2 ? { scope: q[0], sid: q[1] } : null,
    room = target && target.scope !== "home" ? target.scope : null,
    list = hueLiveScenes();
  if (!list.length) b.appendChild(pill("info", _T("no_hue_scenes_found"), {}));
  var last = null;
  list.forEach(function (id) {
    var g = A(id).group_name || "";
    if (g !== last) {
      b.appendChild(sep(g, "home"));
      last = g;
    }
    b.appendChild(
      pill("palette", A(id).name || id, {
        tap: function () {
          liveImportHue(id, room, target);
        },
      })
    );
  });
}
