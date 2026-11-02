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

/* The icons of the kinds of scene: a classic scene keeps its own (the scene icon unless one was chosen), a live scene the sparkle (unless one was chosen; the palette was the old default and counts as none), a Hue scene the palette. */
var SCENE_ICON_HUE = "palette",
  SCENE_ICON_LIVE = "sparkle";

function liveIcon(sc) {
  return sc && sc.icon && sc.icon !== "palette" ? sc.icon : SCENE_ICON_LIVE;
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
    LIVESET[id] = deviceGet("db_ls_" + id, {});
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
  deviceSet("db_ls_" + sc.id, st);
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
  var ar = liveSceneArea(sc);
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
  var ar = sc.live ? liveSceneArea(sc) : null;
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
    area: hpId(ar.id),
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
    ar = liveSceneArea(sc);
  if (r) return r.state === "frozen" ? _T("frozen") : _T("playing");
  return ar ? ar.name : _T("this_scene_has_no_area");
}

function liveRow(sc) {
  return edMark(
    pill(liveIcon(sc), sc.name, {
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
      pin: { kind: "cscene", sid: sc.id, name: sc.name, icon: liveIcon(sc), room: TITLES[sc.room] },
    }),
    function () {
      liveMakerEdit(sc);
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

function liveXyHs(x, y) {
  return hsvOf(liveXyRgb(x, y));
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
          liveMakerEdit(sc);
        },
      })
    );
}

/* ---- the editor ---- */

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
        draft = { name: "", icon: "palette", live: { speed: 6, range: 100, bri: 100, spread: "x", src: "palette", fx: [], looks: {}, also: [], palette: [] } };
      draft.name = r.name || A(sceneId).name || "";
      draft.live.palette = r.palette.slice(0, 16).map(function (c) {
        var o = c.k ? { k: Math.round(c.k) } : { xy: c.xy };
        if (c.b && c.b < 99) o.b = Math.round(c.b);
        return o;
      });
      if (typeof r.speed === "number")
        draft.live.speed = Integrations.scenes.speedToStep(Math.round(r.speed * 100));
      draft.live.bri = Math.max(1, Math.min(100, Math.round(r.brightness / 2.55)));
      if (!target) {
        var secs = secOrder(scopeKey(rm)).filter(function (s) {
          return s.k === "scenes";
        });
        if (secs.length) target = { scope: rm, sid: secs[0].id };
      }
      if (!ar) {
        toast(_T("choose_an_area"));
        return;
      }
      liveMakerOpen(rm, null, target, [ar.id], draft, found.save ? ar : null);
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
