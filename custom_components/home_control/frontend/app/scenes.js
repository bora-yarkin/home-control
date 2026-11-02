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
        showPopup("scene-new:" + scope + ":" + e.id, true);
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
    if (a.delay || a.live) {
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
    if (a.live) {
      setTimeout(function () {
        var live = sceneById(a.live);
        if (live && live.live) liveStart(live);
      }, t);
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
  if (!ids.length && !f.acts.some(function (a) { return a.live; })) {
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
  var s = deviceGet("db_hsc_" + id, {});
  return {
    speed: typeof s.speed === "number" ? s.speed : Math.round((A(id).speed || 0.5) * 100),
    bri: typeof s.bri === "number" ? s.bri : Math.round((A(id).brightness || 255) / 2.55),
  };
}

function hueSceneSave(id, st) {
  deviceSet("db_hsc_" + id, st);
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
  var c = Integrations.scenes.start(H(), id, st.speed, Math.max(1, bri) * 2.55);
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
      staticOpen(sc.room, sc);
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
      ents = extra ? extra() : [];
    function sceneRows(list) {
      return list.map(function (sc) {
        return edDel(
          sceneRow(sc),
          function () {
            scnToggle(e, sc.id);
            uiChanged();
          },
          _T("remove_from_this_section")
        );
      });
    }
    /* Scenes made here and devices come first, then live scenes, then the scenes Hue made; a thin line divides the groups that are there. */
    var classic = mine.filter(function (sc) {
        return !sc.live;
      }),
      lives = mine.filter(function (sc) {
        return sc.live;
      }),
      classicRows = sceneRows(classic),
      liveRows = sceneRows(lives),
      hueItems = hueSceneOrder(e, ents.filter(function (x) {
        return x.hue;
      })),
      first = classicRows.slice();
    /* A scenes section can also hold devices, such as a switch that starts a lighting effect. */
    (e.devs || []).forEach(function (d) {
      if (!editing() && (d.hide || (d.id && modeOf(d.id).mode === "hide"))) return;
      var r = devRow(d);
      if (!r && editing()) r = pill(d.icon || "plug", d.name, {});
      if (r)
        first.push(
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
    ents.forEach(function (x) {
      if (!x.hue) first.push(x.row);
    });
    var hueRows = hueItems.map(function (x) {
      return x.row;
    });
    [first, liveRows, hueRows].forEach(function (g) {
      if (!g.length) return;
      if (dyn.children.length) dyn.appendChild(mk("div", "scn-div"));
      g.forEach(function (r) {
        dyn.appendChild(r);
      });
    });
    if (editing()) {
      edSort(classicRows, function (f, t) {
        edReorder(
          e.scn,
          classic.map(function (x) {
            return x.id;
          }),
          f,
          t
        );
        uiChanged();
      });
      edSort(liveRows, function (f, t) {
        edReorder(
          e.scn,
          lives.map(function (x) {
            return x.id;
          }),
          f,
          t
        );
        uiChanged();
      });
      edSort(hueRows, function (f, t) {
        var ids = hueItems.map(function (x) {
          return x.id;
        });
        ids.splice(t, 0, ids.splice(f, 1)[0]);
        e.hord = ids;
        uiChanged();
      });
    }
    if (editing())
      dyn.appendChild(
        edAdd(_T("add_a_scene"), function () {
          showPopup("pick-scene:" + scope + ":" + e.id, true);
        })
      );
    s.style.display = dyn.children.length || ISADMIN ? "" : "none";
  }
  if (ISADMIN && !editing()) s.firstChild.appendChild(sceneAddButton(scope, e));
  reg(build);
  build();
  return s;
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

/* The Hue scenes in the order the administrator gave them (the section's hord); the ones not in it follow, by name. */
function hueSceneOrder(e, items) {
  var pos = {};
  (e.hord || []).forEach(function (id, i) {
    pos[id] = i;
  });
  return items.slice().sort(function (x, y) {
    var px = x.id in pos ? pos[x.id] : 1e6,
      py = y.id in pos ? pos[y.id] : 1e6;
    return px - py;
  });
}

function lightingScenesExtra(key) {
  var r = UIROOM[key];
  if (!r || !r.area || !sceneIds(r.area).length) return null;
  if (!ISADMIN && ["view", "hide"].indexOf(modeOf("", key).mode) >= 0) return null;
  /* The scene entities of the room's area, each with whether Hue made it. */
  return function () {
    return sceneIds(r.area)
      .filter(function (s) {
        return editing() || !Integrations.scenes.isHue(H(), s[0]) || !hueSceneHidden(r, s[0]);
      })
      .map(function (s) {
        var nm = A(s[0]).friendly_name || s[0],
          hue = Integrations.scenes.isHue(H(), s[0]);
        if (nm.indexOf(r.name) === 0) nm = nm.slice(r.name.length).replace(/^\s+/, "") || nm;
        var row = sceneEntRow(s[0], nm, "palette", null, r);
        return {
          id: s[0],
          hue: hue,
          row: hue
            ? edMark(row, function () {
                showPopup(hueScenePopupKey(s[0], r), true);
              }, hueSceneHidden(r, s[0]))
            : row,
        };
      });
  };
}

