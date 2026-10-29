/* Lighting scenes and light presets: saved colours and levels, running and editing them. */

function sceneIds(area) {
  var h = H();
  if (!h || !h.entities) return [];
  return Object.keys(h.states)
    .filter(function (id) {
      if (id.indexOf("scene.") !== 0) return false;
      var e = h.entities[id];
      if (!e) return false;
      var d = e.device_id && h.devices ? h.devices[e.device_id] : null;
      return (e.area_id || (d && d.area_id)) === area;
    })
    .sort(function (x, y) {
      return (A(x).friendly_name || x).localeCompare(A(y).friendly_name || y);
    })
    .map(function (id) {
      return [id];
    });
}

function secScenes(e) {
  return (e.scn || []).map(sceneById).filter(function (sc) {
    return sc && sceneAllowed(sc);
  });
}

function scnToggle(e, id) {
  var a = e.scn || (e.scn = []),
    i = a.indexOf(id);
  if (i >= 0) {
    a.splice(i, 1);
    return true;
  }
  if (a.length >= 40) {
    toast(_T("a_section_holds_up_to_40_scenes"));
    return false;
  }
  a.push(id);
  return true;
}

function pruneSceneRefs() {
  var ok = {};
  STORE.scenes.forEach(function (x) {
    ok[x.id] = 1;
  });
  allSectionLists().forEach(function (l) {
    l.forEach(function (s) {
      if (s.scn)
        s.scn = s.scn.filter(function (id) {
          return ok[id];
        });
      if (s.pins)
        s.pins = s.pins.filter(function (p) {
          return p.kind !== "cscene" || ok[p.sid];
        });
    });
  });
}

function scnPick(b, key) {
  var q = key.split(":"),
    scope = q[0],
    e = secById(scope, q[1]);
  if (!e) return;
  var box = mk("div");
  b.appendChild(box);
  box.appendChild(
    pill("plus", _T("new_scene"), {
      sub: function () {
        return _T("create_a_scene_and_add_it_here");
      },
      tap: function () {
        openEditor(scope, null, { scope: scope, sid: e.id });
      },
    })
  );
  box.appendChild(
    pill("palette", _T("new_live_scene"), {
      sub: function () {
        return _T("colours_that_move_across_the_lights_of_an_area");
      },
      tap: function () {
        liveOpenEditor(scope, null, { scope: scope, sid: e.id });
      },
    })
  );
  if (engineSensor() && hueLiveScenes().length)
    box.appendChild(
      pill("palette", _T("import_a_live_scene_from_hue"), {
        sub: function () {
          return _T("copies_its_colours_and_speed");
        },
        tap: function () {
          showPopup("live-import:" + scope + ":" + e.id, true);
        },
      })
    );
  var all = STORE.scenes.filter(sceneAllowed);
  if (all.length) box.appendChild(sep(_T("existing_scenes"), "scene"));
  all.forEach(function (sc) {
    box.appendChild(
      pill(sc.icon || "scene", sc.name, {
        on: function () {
          return (e.scn || []).indexOf(sc.id) >= 0;
        },
        sub: function () {
          return TITLES[sc.room] || "";
        },
        tap: function () {
          if (scnToggle(e, sc.id)) {
            uiChanged();
            refresh();
          }
        },
      })
    );
  });
}

/* presets */
function pkeyP(p) {
  if (p.z)
    return (
      "z" +
      p.z
        .map(function (c) {
          return c.x + "," + c.y;
        })
        .join(";")
    );
  return p.k ? "k" + p.k : "c" + p.h + "," + p.s;
}

function same(a, b) {
  if (!a || !b) return false;
  if (a.z || b.z)
    return (
      !!a.z &&
      !!b.z &&
      a.z.length === b.z.length &&
      a.z.every(function (c, i) {
        return Math.abs(c.x - b.z[i].x) <= 0.012 && Math.abs(c.y - b.z[i].y) <= 0.012;
      })
    );
  if (a.k || b.k) return !!a.k && !!b.k && Math.abs(a.k - b.k) <= 15;
  return Math.abs(a.h - b.h) <= 4 && Math.abs(a.s - b.s) <= 6;
}

function hsv2rgb(h, s) {
  s = s / 100;
  var hp = (((h % 360) + 360) % 360) / 60,
    x = s * (1 - Math.abs((hp % 2) - 1)),
    m = 1 - s,
    r = 0,
    g = 0,
    b = 0;
  if (hp < 1) {
    r = s;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = s;
  } else if (hp < 3) {
    g = s;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = s;
  } else if (hp < 5) {
    r = x;
    b = s;
  } else {
    r = s;
    b = x;
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function swFill(p) {
  if (p.z)
    return (
      "linear-gradient(90deg," +
      p.z
        .map(function (c) {
          return "rgb(" + hsv2rgb(c.h, c.s).map(Math.round).join(",") + ")";
        })
        .join(",") +
      ")"
    );
  var c = p.k ? kelvinRgb(p.k) : hsv2rgb(p.h, p.s);
  return "rgb(" + c.map(Math.round).join(",") + ")";
}

/* Presets saved for a light group are offered on the single lights of that group too. */
function presetsInherited(id) {
  var out = [],
    own = presetsFor(id);
  Object.keys(H().states).forEach(function (g) {
    if (dom(g) !== "light" || g === id) return;
    var m = A(g).entity_id;
    if (!Array.isArray(m) || m.indexOf(id) < 0) return;
    presetsFor(g).forEach(function (p) {
      if (!compat(id, p)) return;
      if (
        own.concat(out).some(function (x) {
          return same(x, p);
        })
      )
        return;
      out.push(p);
    });
  });
  return out;
}

function presetsFor(id) {
  var a = STORE.presets[id];
  return Array.isArray(a) ? a : [];
}

function compat(id, p) {
  if (p.z) return zoneMembers(id).length === p.z.length;
  var c = lightCaps(id);
  if (!c.known) return true;
  return p.k ? c.white || c.color : c.color;
}

function curPreset(id) {
  var a = A(id);
  if (V_(id) !== "on") return null;
  /* A light made of zones whose zones differ: the exact colour of each zone. */
  var zm = zoneMembers(id);
  if (zm.length > 1 && a.zone_colors && a.zone_colors.length === zm.length) {
    var spread = Math.max(
      Math.max.apply(null, a.zone_colors.map(function (c) { return c[0]; })) -
        Math.min.apply(null, a.zone_colors.map(function (c) { return c[0]; })),
      Math.max.apply(null, a.zone_colors.map(function (c) { return c[1]; })) -
        Math.min.apply(null, a.zone_colors.map(function (c) { return c[1]; }))
    );
    if (spread > 0.012)
      return {
        z: zm.map(function (m, i) {
          var hs = A(m).hs_color || [0, 0];
          return { x: a.zone_colors[i][0], y: a.zone_colors[i][1], h: Math.round(hs[0]), s: Math.round(hs[1]) };
        }),
      };
  }
  if (a.color_mode === "color_temp" && a.color_temp_kelvin)
    return { k: Math.round(a.color_temp_kelvin) };
  if (a.hs_color) return { h: Math.round(a.hs_color[0]), s: Math.round(a.hs_color[1]) };
  if (a.color_temp_kelvin) return { k: Math.round(a.color_temp_kelvin) };
  return null;
}

function addPreset(id, p) {
  var a = presetsFor(id).slice();
  if (
    a.some(function (x) {
      return same(x, p);
    })
  ) {
    toast(_T("already_a_preset"));
    return;
  }
  if (a.length >= 40) {
    toast(_T("preset_limit_reached"));
    return;
  }
  a.push(p);
  STORE.presets[id] = a;
  storeChanged();
}

function removePreset(id, p) {
  STORE.presets[id] = presetsFor(id).filter(function (x) {
    return pkeyP(x) !== pkeyP(p);
  });
  storeChanged();
}

function addCurrentPreset(id) {
  var c = curPreset(id);
  if (!c) {
    toast(_T("turn_the_light_on_to_save_its_colour"));
    return;
  }
  addPreset(id, c);
}

function applyPreset(id, p) {
  if (p.z) {
    zoneMembers(id).forEach(function (m, i) {
      if (p.z[i]) call("light", "turn_on", { entity_id: m, xy_color: [p.z[i].x, p.z[i].y] });
    });
    return;
  }
  var a = A(id),
    d = { entity_id: id };
  if (p.k) {
    d.color_temp_kelvin = Math.max(
      a.min_color_temp_kelvin || 0,
      Math.min(a.max_color_temp_kelvin || 99999, p.k)
    );
  } else d.hs_color = [p.h, p.s];
  call("light", "turn_on", d);
}

function swatch(p, o) {
  var e = mk(
      "div",
      "swc" + (o.act ? " act" : "") + (o.add ? " add" : ""),
      "<span class='sw'></span><span class='cap'></span>"
    ),
    sw = e.querySelector(".sw");
  if (o.add) sw.innerHTML = svg("plus");
  else sw.style.background = swFill(p);
  e.querySelector(".cap").textContent = p && p.k ? p.k + _T("k_2") : "";
  if (o.badge) {
    var bd = mk("span", "bdg", svg(o.badge));
    e.appendChild(bd);
  }
  e.addEventListener("click", function (ev) {
    if (o.onBadge && ev.target.closest && ev.target.closest(".bdg")) {
      ev.stopPropagation();
      o.onBadge();
      return;
    }
    if (o.tap) o.tap();
  });
  return e;
}

function withSlive(fn) {
  var prev = CUR;
  CUR = SLIVE;
  try {
    fn();
  } finally {
    CUR = prev;
  }
}

function presetsAll(b, id) {
  var box = mk("div"),
    key = null;
  b.appendChild(box);
  function build() {
    var own = presetsFor(id),
      cur = curPreset(id),
      seen = {},
      list = [];
    function add(p) {
      var k = pkeyP(p);
      if (seen[k]) return;
      seen[k] = 1;
      if (compat(id, p)) list.push(p);
    }
    own.forEach(add);
    Object.keys(STORE.presets).forEach(function (l) {
      presetsFor(l).forEach(add);
    });
    var k =
      STORE_VER +
      "|" +
      list.map(pkeyP).join(",") +
      "|" +
      (cur ? pkeyP(cur) : "") +
      "|" +
      own.length;
    if (k === key) return;
    key = k;
    withSlive(function () {
      box.innerHTML = "";
      var hint = mk("div", "hint");
      hint.textContent = ISADMIN
        ? _T("tap_a_preset_to_apply_it_to_this_lig")
        : _T("tap_a_preset_to_apply_it_to_this_lig_2");
      box.appendChild(hint);
      var row = mk("div", "pre");
      list.forEach(function (p) {
        var mine = own.some(function (x) {
          return same(x, p);
        });
        row.appendChild(
          swatch(p, {
            act: same(p, cur),
            badge: ISADMIN && !mine ? "plus" : null,
            onBadge: function () {
              addPreset(id, p);
            },
            tap: function () {
              applyPreset(id, p);
            },
          })
        );
      });
      if (!list.length) row.appendChild(pill("info", _T("no_presets_saved_yet"), {}));
      box.appendChild(row);
    });
  }
  reg(build);
  build();
}

/* scenes */
function sceneById(sid) {
  for (var i = 0; i < STORE.scenes.length; i++)
    if (STORE.scenes[i].id === sid) return STORE.scenes[i];
  return null;
}

function roomDevs(room) {
  if (room === "home") {
    var all = [];
    ORDER.forEach(function (r) {
      if (r === "home" || !UIROOM[r]) return;
      roomDevs(r).forEach(function (x) {
        x.name = TITLES[r] + " · " + x.name;
        all.push(x);
      });
    });
    return all;
  }
  var out = [];
  (UI.devs[room] || []).forEach(function (d) {
    if (d.hide || !d.id) return;
    if (["light", "media", "climate", "fan", "switch"].indexOf(d.kind) < 0) return;
    var tp = dom(d.id);
    out.push({
      id: d.id,
      name: d.name,
      icon: d.icon || "plug",
      type: tp,
      keep: !!d.keep || d.kind === "switch" || (d.kind === "media" && d.icon !== "tv"),
    });
  });
  return out;
}

function sceneSummary(sc) {
  if (sc.live) return liveSub(sc);
  var n = sc.acts.length;
  return (
    n +
    (n === 1 ? " device" : " devices") +
    (sc.others === "lights"
      ? _T("other_lights_off")
      : sc.others === "all"
        ? _T("everything_else_off")
        : "")
  );
}

function actionIds(acts) {
  var ids = [];
  acts.forEach(function (a) {
    var e = a.target && a.target.entity_id;
    if (Array.isArray(e)) ids = ids.concat(e);
    else if (e) ids.push(e);
  });
  return ids;
}

function filterActs(acts) {
  if (ISADMIN || !ACCESS_ME) return { acts: acts, dropped: false };
  var dropped = false,
    out = [];
  acts.forEach(function (a) {
    if (a.delay) {
      out.push(a);
      return;
    }
    var e = a.target && a.target.entity_id,
      list = Array.isArray(e) ? e : e ? [e] : [],
      keep = list.filter(function (id) {
        var m = modeOf(id).mode;
        return m !== "view" && m !== "hide";
      });
    if (keep.length !== list.length) dropped = true;
    if (!keep.length) return;
    var c = {};
    for (var k in a) c[k] = a[k];
    c.target = { entity_id: Array.isArray(e) ? keep : keep[0] };
    out.push(c);
  });
  return { acts: out, dropped: dropped };
}

function execActs(acts) {
  var t = 0;
  acts.forEach(function (a) {
    if (a.delay) {
      t += a.delay.milliseconds || 0;
      return;
    }
    var p = a.action.split("."),
      data = { entity_id: a.target && a.target.entity_id };
    for (var k in a.data || {}) data[k] = a.data[k];
    setTimeout(function () {
      callRaw(p[0], p[1], data);
    }, t);
  });
}

function runScene(sc) {
  if (!sceneAllowed(sc)) {
    toast(_T("this_is_view_only_for_you"));
    return;
  }
  if (sc.live) {
    liveToggle(sc);
    return;
  }
  var f = filterActs(compileScene(sc)),
    ids = actionIds(f.acts);
  if (!ids.length) {
    toast(_T("this_is_view_only_for_you"));
    return;
  }
  if (f.dropped) toast(_T("some_devices_are_view_only_and_were_"));
  gate(ids, function () {
    liveStopOn(ids);
    execActs(f.acts);
    toast(_T("running_2") + sc.name + "”");
  });
}

function applyPresetData(d, p, id) {
  if (p.k) {
    var a = A(id);
    d.color_temp_kelvin = Math.max(
      a.min_color_temp_kelvin || 0,
      Math.min(a.max_color_temp_kelvin || 99999, p.k)
    );
  } else d.hs_color = [p.h, p.s];
}

/* Hue scenes belong to a Home Assistant area, so their dashboard visibility belongs to the room that shows that area. */
function hueSceneHidden(room, id) {
  return !!room && (room.hscn || []).indexOf(id) >= 0;
}

function hueSceneSetHidden(room, id, hide) {
  if (!room || !/^scene\.[a-z0-9_]+$/.test(id)) return;
  var scenes = (room.hscn || []).filter(function (x) {
    return x !== id;
  });
  if (hide && scenes.length < 80) scenes.push(id);
  if (scenes.length) room.hscn = scenes;
  else delete room.hscn;
  uiChanged();
}

function hueScenePopupKey(id, room) {
  return "hscene:" + id + (room ? "~" + room.id : "");
}

/* The Home Assistant scene entities (Hue): one row for all places that list them. Hue scenes are live: the icon switches the scene on or off and the rest of the row opens its popup. Other scenes just run. */
function sceneEntRow(id, name, icon, sub, room) {
  var hue = Integrations.scenes.isHue(H(), id);
  return pill(icon || "palette", name, {
    on: function () {
      return Integrations.scenes.active(H(), id);
    },
    sub: sub || null,
    tap: function () {
      if (hue) showPopup(hueScenePopupKey(id, room), true);
      else {
        call("scene", "turn_on", { entity_id: id });
        toast(name);
      }
    },
    iconTap: hue
      ? function () {
          hueSceneToggle(id);
        }
      : null,
  });
}

/* Speed and brightness a Hue scene is started with, kept on this device. */
function hueSceneSet(id) {
  var s = null;
  try {
    s = JSON.parse(localStorage.getItem("db_hsc_" + id) || "null");
  } catch (e) {}
  s = s || {};
  return {
    speed: typeof s.speed === "number" ? s.speed : Math.round((A(id).speed || 0.5) * 100),
    bri: typeof s.bri === "number" ? s.bri : Math.round((A(id).brightness || 255) / 2.55),
  };
}

function hueSceneSave(id, st) {
  try {
    localStorage.setItem("db_hsc_" + id, JSON.stringify(st));
  } catch (e) {}
}

/* The room's Hue group light of the scene that was frozen last, so the Freeze button can show it. */
var HFROZEN = {};

/* Starts the scene live with the saved speed, keeping the brightness the room has now. */
function hueSceneStart(id) {
  var st = hueSceneSet(id),
    grp = Integrations.scenes.group(H(), id),
    bri = grp && V_(grp) === "on" ? (A(grp).brightness || 0) / 2.55 : st.bri;
  if (grp) {
    delete HFROZEN[grp];
    liveStopOn([grp]);
  }
  var c = Integrations.scenes.start(id, st.speed, Math.max(1, bri) * 2.55);
  call(c[0], c[1], c[2]);
}

/* Freezes the scene where it is: the lights keep the colours they show now. */
function hueSceneFreeze(id) {
  var grp = Integrations.scenes.group(H(), id);
  if (!grp || V_(grp) !== "on") return;
  Integrations.scenes.freeze(H(), grp).forEach(function (c) {
    call(c[0], c[1], c[2]);
  });
  HFROZEN[grp] = id;
}

function hueSceneToggle(id) {
  var grp = Integrations.scenes.group(H(), id);
  if (Integrations.scenes.active(H(), id)) {
    if (grp) call("light", "turn_off", { entity_id: grp });
  } else hueSceneStart(id);
}

/* The popup of a Hue scene: brightness (follows the room live), speed (starts the scene again at the new speed), play (live) and freeze (a still picture). */
function hueScenePopup(b, id, room) {
  var P = Integrations.scenes;
  function grp() {
    return P.group(H(), id);
  }
  function playing() {
    return P.active(H(), id) && P.playing(H(), grp());
  }
  function live() {
    var g = grp();
    return P.active(H(), id) && !!g && V_(g) === "on";
  }
  b.appendChild(
    sliderRow({
      icon: "bright",
      name: _T("brightness"),
      min: 1,
      max: 100,
      step: 1,
      get: function () {
        var g = grp();
        return g && V_(g) === "on" ? Math.max(1, Math.round((A(g).brightness || 0) / 2.55)) : hueSceneSet(id).bri;
      },
      fmt: function (v) {
        return v + "%";
      },
      on: function () {
        return P.active(H(), id);
      },
      live: function (v) {
        if (live()) callLive(grp(), "light", "turn_on", { entity_id: grp(), brightness_pct: v });
      },
      commit: function (v) {
        var st = hueSceneSet(id);
        st.bri = v;
        hueSceneSave(id, st);
        if (live()) call("light", "turn_on", { entity_id: grp(), brightness_pct: v });
      },
    })
  );
  b.appendChild(
    sliderRow({
      icon: "tune",
      name: _T("speed"),
      min: 1,
      max: P.speedSteps,
      step: 1,
      get: function () {
        return P.speedToStep(hueSceneSet(id).speed);
      },
      fmt: function (v) {
        return v + " / " + P.speedSteps;
      },
      on: function () {
        return P.active(H(), id);
      },
      commit: function (v) {
        var st = hueSceneSet(id);
        st.speed = P.stepToSpeed(v);
        hueSceneSave(id, st);
        if (playing()) hueSceneStart(id);
      },
    })
  );
  var g2 = mk("div", "gridl g2");
  g2.appendChild(
    pill("play", _T("play"), {
      on: playing,
      tap: function () {
        hueSceneStart(id);
      },
    })
  );
  g2.appendChild(
    pill("pause", _T("freeze"), {
      on: function () {
        var g = grp();
        return !!g && HFROZEN[g] === id && V_(g) === "on" && !P.playing(H(), g);
      },
      tap: function () {
        hueSceneFreeze(id);
      },
    })
  );
  b.appendChild(g2);
  if (ISADMIN && engineSensor())
    b.appendChild(
      pill("palette", _T("import_as_a_live_scene"), {
        sub: function () {
          return _T("a_copy_you_can_edit_and_place_on_your_lights");
        },
        tap: function () {
          liveImportHue(id, null, null);
        },
      })
    );
  if (editing() && room)
    b.appendChild(
      pill("eye", hueSceneHidden(room, id) ? _T("show_this_scene") : _T("hide_this_scene"), {
        sub: function () {
          return hueSceneHidden(room, id) ? _T("hidden") : _T("visible");
        },
        tap: function () {
          hueSceneSetHidden(room, id, !hueSceneHidden(room, id));
          closeSheet();
        },
      })
    );
}

/* A scene is active while everything it sets is as it sets it: lights on or off with the brightness and colour (within a small margin), climate in its mode and temperature, other devices on or off, and what it turns off is off. */
function sceneActive(sc) {
  if (sc.live) return !!liveRun(sc);
  var seen = false;
  var ok = compileScene(sc).every(function (a) {
    if (a.delay) return true;
    var e = a.target.entity_id,
      ids = Array.isArray(e) ? e : [e],
      d = a.data || {},
      verb = a.action.split(".")[1];
    seen = true;
    return ids.every(function (id) {
      var at = A(id);
      if (verb === "turn_off") return V_(id) === "off";
      if (a.action === "climate.set_temperature")
        return V_(id) === d.hvac_mode && Math.abs((at.temperature || 0) - d.temperature) <= 0.5;
      if (!isOn(id)) return false;
      if (d.brightness_pct && Math.abs((at.brightness || 0) / 2.55 - d.brightness_pct) > 4)
        return false;
      if (d.color_temp_kelvin && Math.abs((at.color_temp_kelvin || 0) - d.color_temp_kelvin) > 150)
        return false;
      if (d.hs_color) {
        var h = at.hs_color;
        if (!h) return false;
        var dh = Math.abs(h[0] - d.hs_color[0]);
        return Math.min(dh, 360 - dh) <= 10 && Math.abs(h[1] - d.hs_color[1]) <= 12;
      }
      return true;
    });
  });
  return seen && ok;
}

function sceneRow(sc) {
  if (sc.live) return liveRow(sc);
  return edMark(
    pill(sc.icon || "scene", sc.name, {
      on: function () {
        return sceneActive(sc);
      },
      sub: function () {
        return sceneSummary(sc);
      },
      tap: function () {
        runScene(sc);
      },
      pin: {
        kind: "cscene",
        sid: sc.id,
        name: sc.name,
        icon: sc.icon || "scene",
        room: TITLES[sc.room],
      },
    }),
    function () {
      openEditor(sc.room, sc);
    }
  );
}

function scenesSection(room, extra) {
  var e = CURSEC,
    scope = secKey(),
    lk = "~" + scope + "~" + e.id,
    s = section(secT("scenes", _T("scenes")), secI("scenes", "scene"), []),
    dyn = mk("div"),
    key = null;
  s.appendChild(dyn);
  function build() {
    var k = STORE_VER + "|" + ISADMIN + "|" + editing() + "|" + (e.lay || "");
    if (k === key) return;
    key = k;
    dyn.innerHTML = "";
    dyn.className = e.lay === "grid2" ? "gridl g2" : e.lay === "grid3" ? "gridl g3" : "";
    var mine = secScenes(e),
      rows = mine.map(function (sc) {
        return edDel(
          sceneRow(sc),
          function () {
            scnToggle(e, sc.id);
            uiChanged();
          },
          _T("remove_from_this_section")
        );
      });
    rows.forEach(function (r) {
      dyn.appendChild(r);
    });
    /* A scenes section can also hold devices, such as a switch that starts a lighting effect. */
    (e.devs || []).forEach(function (d) {
      if (!editing() && (d.hide || (d.id && modeOf(d.id).mode === "hide"))) return;
      var r = devRow(d);
      if (!r && editing()) r = pill(d.icon || "plug", d.name, {});
      if (r)
        dyn.appendChild(
          edDel(edMark(r, devEditor(lk, d), !!d.hide), function () {
            var i = e.devs.indexOf(d);
            if (i >= 0) {
              e.devs.splice(i, 1);
              devIndex(UI);
              uiChanged();
            }
          })
        );
    });
    if (editing())
      edSort(rows, function (f, t) {
        edReorder(
          e.scn,
          mine.map(function (x) {
            return x.id;
          }),
          f,
          t
        );
        uiChanged();
      });
    if (extra)
      extra().forEach(function (x) {
        dyn.appendChild(x);
      });
    if (editing())
      dyn.appendChild(
        edAdd(_T("add_a_scene"), function () {
          showPopup("pick-scene:" + scope + ":" + e.id, true);
        })
      );
    s.style.display = dyn.children.length ? "" : "none";
  }
  reg(build);
  build();
  return s;
}

function openEditor(room, sc, target) {
  SCD = {
    room: room,
    isNew: !sc,
    target: target || null,
    draft: sc
      ? JSON.parse(JSON.stringify(sc))
      : { id: "", name: "", room: room, others: "keep", acts: [] },
  };
  showPopup("scene-edit", true);
}

function seg(opts, val, fn) {
  var g = mk("div", "seg");
  g.style.gridTemplateColumns = "repeat(" + opts.length + ",1fr)";
  opts.forEach(function (o) {
    var b = mk("div", "rbtn pane" + (o[0] === val ? " act" : ""));
    b.textContent = o[1];
    b.addEventListener("click", function () {
      fn(o[0]);
    });
    g.appendChild(b);
  });
  return g;
}

function colourChoices(id) {
  var seen = {},
    list = [];
  function add(p) {
    var k = pkeyP(p);
    if (seen[k] || !compat(id, p)) return;
    seen[k] = 1;
    list.push(p);
  }
  presetsFor(id).forEach(add);
  Object.keys(STORE.presets).forEach(function (l) {
    presetsFor(l).forEach(add);
  });
  return list.slice(0, 18);
}

function actSummary(a) {
  var dm = dom(a.id);
  if (dm === "climate")
    return a.mode === "cool" || a.mode === "heat"
      ? cap(a.mode) + " " + (a.temp || defTemp(a.id)) + TEMPU()
      : "Off";
  if (a.on === false) return "Off";
  if (dm !== "light") return "On";
  var p = ["On"];
  if (a.bri) p.push(a.bri + "%");
  if (a.col) p.push(a.col.k ? a.col.k + " K" : _T("colour"));
  return p.join(" · ");
}

function devBlock(a, i, redraw) {
  var dm = dom(a.id),
    info = roomDevs(SCD.room).filter(function (x) {
      return x.id === a.id;
    })[0] || { name: a.id, icon: "plug" },
    w = mk("div", "dev"),
    body = mk("div", "dbody");
  var h = pill(info.icon, info.name, {
    sub: function () {
      return actSummary(a);
    },
    tap: function () {
      a._open = !a._open;
      body.style.display = a._open ? "" : "none";
      h.classList.toggle("openc", !!a._open);
    },
  });
  var x = mk("div", "rnd pane sm", svg("close"));
  x.addEventListener("click", function (e) {
    e.stopPropagation();
    SCD.draft.acts.splice(i, 1);
    redraw(true);
  });
  h.appendChild(x);
  h.appendChild(mk("span", "chv", svg("chev")));
  w.appendChild(h);
  w.appendChild(body);
  body.style.display = a._open ? "" : "none";
  h.classList.toggle("openc", !!a._open);
  if (dm === "climate") {
    body.appendChild(
      seg(
        [
          ["off", _T("off")],
          ["cool", _T("cool")],
          ["heat", _T("heat")],
        ],
        a.mode || "off",
        function (v) {
          a.mode = v;
          if (v !== "off" && !a.temp) a.temp = defTemp(a.id);
          redraw(true);
        }
      )
    );
    if (a.mode === "cool" || a.mode === "heat") {
      var a0 = A(a.id);
      body.appendChild(
        sliderRow({
          icon: "thermo",
          name: _T("temperature"),
          min: a0.min_temp || 16,
          max: a0.max_temp || 30,
          step: 1,
          get: function () {
            return a.temp || defTemp(a.id);
          },
          fmt: function (v) {
            return v + TEMPU();
          },
          commit: function (v) {
            a.temp = v;
          },
        })
      );
    }
    return w;
  }
  body.appendChild(
    seg(
      [
        ["on", _T("on_2")],
        ["off", _T("off")],
      ],
      a.on === false ? "off" : "on",
      function (v) {
        a.on = v === "on";
        redraw(true);
      }
    )
  );
  if (dm === "light" && a.on !== false) {
    body.appendChild(
      seg(
        [
          ["keep", _T("keep_brightness")],
          ["set", _T("set_brightness")],
        ],
        a.bri ? "set" : "keep",
        function (v) {
          a.bri = v === "set" ? a.bri || 100 : null;
          redraw(true);
        }
      )
    );
    if (a.bri)
      body.appendChild(
        sliderRow({
          icon: "bright",
          name: _T("brightness"),
          min: 1,
          max: 100,
          step: 1,
          get: function () {
            return a.bri || 100;
          },
          fmt: function (v) {
            return v + "%";
          },
          commit: function (v) {
            a.bri = v;
          },
        })
      );
    var cp = lightCaps(a.id);
    if (cp.color || cp.white || !cp.known) {
      var row = mk("div", "pre"),
        keep = mk("div", "rbtn pane keepc" + (a.col ? "" : " act"));
      keep.textContent = _T("keep_colour");
      keep.addEventListener("click", function () {
        a.col = null;
        redraw(true);
      });
      row.appendChild(keep);
      colourChoices(a.id).forEach(function (p) {
        row.appendChild(
          swatch(p, {
            act: same(a.col, p),
            tap: function () {
              a.col = same(a.col, p) ? null : JSON.parse(JSON.stringify(p));
              redraw(true);
            },
          })
        );
      });
      body.appendChild(row);
    }
  }
  return w;
}

function sceneEditor(b) {
  var d = SCD.draft,
    w = mk("div", "sqw pane", svg("scene")),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.maxLength = 40;
  inp.placeholder = SCD.room === "home" ? _T("quick_action_name") : _T("scene_name");
  inp.value = d.name;
  inp.addEventListener("input", function () {
    d.name = inp.value;
  });
  w.appendChild(inp);
  b.appendChild(w);
  var ir = iconPick(QAICONS, d.icon || "scene", function (n) {
    d.icon = n;
  });
  b.appendChild(ir);
  var box = mk("div");
  b.appendChild(box);
  function draw(live) {
    var prev = CUR;
    if (live) SLIVE.length = 0;
    CUR = SLIVE;
    box.innerHTML = "";
    box.appendChild(sep(_T("devices_2"), "plug"));
    d.acts.forEach(function (a, i) {
      box.appendChild(devBlock(a, i, draw));
    });
    box.appendChild(
      pill("plus", _T("add_device"), {
        tap: function () {
          showPopup("scene-pick", true);
        },
      })
    );
    box.appendChild(
      sep(
        SCD.room === "home"
          ? _T("everything_else_in_the_home")
          : _T("everything_else_in_this_room"),
        "power"
      )
    );
    box.appendChild(
      seg(
        [
          ["keep", _T("leave_as_is")],
          ["lights", _T("lights_off")],
          ["all", _T("all_off")],
        ],
        d.others,
        function (v) {
          d.others = v;
          draw(true);
        }
      )
    );
    var hint = mk("div", "hint");
    hint.textContent =
      d.others === "all"
        ? _T("turns_off_the_other_lights_tvs_fans_") +
          (SCD.room === "home" ? _T("in_the_home") : _T("in_this_room"))
        : d.others === "lights"
          ? _T("turns_off_every_other_light") +
            (SCD.room === "home" ? _T("in_the_home") : _T("in_this_room"))
          : _T("devices_not_listed_above_are_not_tou");
    box.appendChild(hint);
    box.appendChild(pill("check", _T("save_scene"), { tap: saveScene }));
    if (!SCD.isNew)
      box.appendChild(
        pill("trash", _T("delete_scene"), {
          tap: function () {
            confirmDlg(_T("delete") + d.name + "”?", deleteScene);
          },
        })
      );
    CUR = prev;
    if (live) refresh();
  }
  draw(false);
}

function saveScene() {
  var d = SCD.draft,
    name = String(d.name || "").trim();
  if (!name) {
    toast(_T("give_the_scene_a_name"));
    return;
  }
  if (!d.acts.length && d.others === "keep") {
    toast(_T("add_a_device_or_choose_what_else_to_"));
    return;
  }
  var sc = cleanScene({
    id: d.id || "s" + Date.now().toString(36),
    name: name,
    room: SCD.room,
    icon: d.icon,
    others: d.others,
    acts: d.acts,
  });
  if (!sc) {
    toast(_T("couldn_t_save_this_scene"));
    return;
  }
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== sc.id;
  });
  STORE.scenes.push(sc);
  if (SCD.isNew && SCD.target) {
    var te = secById(SCD.target.scope, SCD.target.sid);
    if (te) scnToggle(te, sc.id);
  }
  uiChanged();
  toast(_T("scene_saved"));
  closeSheet();
}

function deleteScene() {
  var id = SCD.draft.id;
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== id;
  });
  pruneSceneRefs();
  uiChanged();
  toast(_T("scene_deleted"));
  closeSheet();
}

function scenePick(b) {
  var have = {};
  SCD.draft.acts.forEach(function (a) {
    have[a.id] = 1;
  });
  var list = roomDevs(SCD.room).filter(function (x) {
    return !have[x.id];
  });
  if (!list.length) b.appendChild(pill("info", _T("every_device_in_this_room_is_already"), {}));
  list.forEach(function (x) {
    b.appendChild(
      pill(x.icon, x.name, {
        tap: function () {
          var a = { id: x.id };
          if (x.type === "climate") a.mode = "off";
          else {
            a.on = true;
          }
          a._open = true;
          SCD.draft.acts.push(a);
          popBack();
        },
      })
    );
  });
}

function devRow(d) {
  var row = devRowRaw(d);
  if (row && d.id && !ISADMIN && modeOf(d.id).mode === "view") row.classList.add("ro");
  return row;
}

function devRowRaw(d) {
  var pk;
  if (d.kind === "light") return LNAME[d.id] ? lightRow(d.id) : null;
  if (d.kind === "media") return mediaRow(d.icon || "media", d.name, d.id, devPop(d), !!d.sub);
  if (d.kind === "climate") return acRow(d.id, devPop(d), d.name, d.icon);
  if (d.kind === "fan") {
    pk = devPop(d);
    if (d.pop)
      return pill(d.icon || "fan", d.name, {
        on: function () {
          return isOn(d.id);
        },
        tap: function () {
          showPopup(pk, true);
        },
        iconTap: function () {
          toggleEnt(d.id);
        },
        pin: pinPop(pk, d.id, d.name, d.icon || "fan"),
      });
    return fanRow(d.id, pk, d.name, d.icon);
  }
  if (d.kind === "vacuum") {
    pk = devPop(d);
    return pill(d.icon || "vac", d.name, {
      tap: function () {
        showPopup(pk, true);
      },
      iconTap: function () {
        toggleDevice(d);
      },
      pin: pinPop(pk, d.id, d.name, d.icon || "vac"),
    });
  }
  if (d.kind === "switch") {
    if (Integrations.huesync.isSync(H(), d.id)) return hsyncRow(d);
    if (Integrations.huesyncbox.isBox(H(), d.id)) return hsboxRow(d);
    pk = devPop(d);
    var pw = powerSib(d.id);
    return pill(d.icon || "plug", d.name, {
      on: function () {
        return isOn(d.id);
      },
      sub: function () {
        return stAgo(d.id);
      },
      val: function () {
        return pw && isOn(d.id) ? entVal(pw) : "";
      },
      tap: function () {
        showPopup(pk, true);
      },
      iconTap: function () {
        toggleEnt(d.id);
      },
      pin: pinPop(pk, d.id, d.name, d.icon || "plug"),
    });
  }
  if (d.kind === "sensor") return sensorRow(d);
  if (d.kind === "number") return numberRow(d);
  if (d.kind === "select") return selectRow(d);
  if (d.kind === "button") return buttonRow(d);
  if (d.kind === "cover") return coverRow(d);
  if (d.kind === "lock") return lockRow(d);
  if (d.kind === "special") {
    pk = devPop(d);
    if (!pk) return null;
    return pill(d.icon || "plug", d.name, {
      val: function () {
        return d.id ? entVal(d.id) : "";
      },
      tap: function () {
        showPopup(pk, true);
      },
      pin: pinPop(pk, d.id || "", d.name, d.icon || "plug"),
    });
  }
  return null;
}

function lightingScenesExtra(key) {
  var r = UIROOM[key];
  if (!r || !r.area || !sceneIds(r.area).length) return null;
  if (!ISADMIN && ["view", "hide"].indexOf(modeOf("", key).mode) >= 0) return null;
  return function () {
    return sceneIds(r.area)
      .filter(function (s) {
        return editing() || !Integrations.scenes.isHue(H(), s[0]) || !hueSceneHidden(r, s[0]);
      })
      .map(function (s) {
        var nm = A(s[0]).friendly_name || s[0];
        if (nm.indexOf(r.name) === 0) nm = nm.slice(r.name.length).replace(/^\s+/, "") || nm;
        var row = sceneEntRow(s[0], nm, "palette", null, r);
        return Integrations.scenes.isHue(H(), s[0])
          ? edMark(row, function () {
              showPopup(hueScenePopupKey(s[0], r), true);
            }, hueSceneHidden(r, s[0]))
          : row;
      });
  };
}

/* scenes and presets overview */
function presetsOverview(b, rid) {
  (UI.devs[rid] || [])
    .filter(function (d) {
      return d.kind === "light" && !d.hide;
    })
    .forEach(function (d) {
      b.appendChild(
        pill(d.icon || "light", d.name, {
          sub: function () {
            var n = presetsFor(d.id).length;
            return n + (n === 1 ? _T("preset") : _T("presets_2"));
          },
          tap: function () {
            showPopup("light:" + d.id, true);
          },
        })
      );
    });
}
