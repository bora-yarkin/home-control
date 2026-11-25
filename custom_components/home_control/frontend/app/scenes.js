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

/* Whether a scene has any of these tags. */
function sceneHasTag(sc, tags) {
  return (sc.tags || []).some(function (t) {
    return (tags || []).indexOf(t) >= 0;
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
    secsAndMasters(l).forEach(function (s) {
      if (s.scn)
        s.scn = s.scn.filter(function (id) {
          return ok[id];
        });
      (s.devs || []).forEach(function (d) {
        if (d.kind === "widget" && d.wx && d.wx.pins)
          d.wx.pins = d.wx.pins.filter(function (p) {
            return p.kind !== "cscene" || ok[p.sid];
          });
      });
    });
  });
}

/* Whether a section of some page lists the scene. A scene taken off every page is still saved (it is under "Existing scenes" when adding one). */
function sceneShown(id) {
  return allSectionLists().some(function (l) {
    return secsAndMasters(l).some(function (s) {
      return (s.scn || []).indexOf(id) >= 0;
    });
  });
}

/* The trash of a scene deletes it, from every page it is on and from the saved scenes (taking it off one section is what picking it again in the list does). A live scene is stopped and forgotten by the integration with the area made for it. */
function sceneDeleteEverywhere(sc) {
  confirmDlg(_T("delete") + sc.name + _T("from_every_page_it_cannot_be_undone"), function () {
    if (sc.live) {
      if (liveRun({ id: sc.id })) liveCall("stop", { scene_id: sc.id });
      liveForget(sc.id, sc.live.areas ? sc.live.area : null);
    }
    STORE.scenes = STORE.scenes.filter(function (x) {
      return x.id !== sc.id;
    });
    pruneSceneRefs();
    uiChanged();
    refresh();
    /* The list of scenes the trash was pressed in is drawn again without it. */
    if (SHEET && /^pick-scene/.test(CURRENT || "")) showPopup(CURRENT, false);
    toast(_T("scene_deleted"));
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

/* `page`: the page a scene is played from (the one open when not said). Only an auto scene needs it. */
function runScene(sc, page) {
  /* An auto scene has no room of its own: it gives the lights of the page it is played from its colours at random (a lights master plays it on its own lights), and that page is what must be allowed. */
  if (sc.auto) {
    var at = page || VIEW;
    if (!sceneAllowed({ room: at })) {
      toast(_T("this_is_view_only_for_you"));
      return;
    }
    return autoScenePlay(sc, autoPageLights(at));
  }
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

/* The scenes of a scenes section are the scenes of its source area (the room's own, or the one the section names) and the scene entities chosen for it. Which of a plugin's scenes are hidden is the section's choice: a
   section that has not made one yet uses the room's list (`hscn`, how it was kept before), and from its first change keeps its own, so hiding a scene in one section leaves the other sections of the page alone. */
function sceneSectionRoom(room, sec) {
  var ctx = Object.create(room);
  ctx.id = room.id + "." + sec.id;
  ctx.sec = sec;
  ctx.area = sec.sarea || room.area;
  return ctx;
}

function sceneEntHiddenList(room) {
  var sec = room && room.sec;
  if (sec && Array.isArray(sec.hscn)) return sec.hscn;
  return (room && room.hscn) || [];
}

/* A scene entity can be hidden from the scenes section that shows it (the administrator's choice). */
function sceneEntHidden(room, id) {
  return !!room && sceneEntHiddenList(room).indexOf(id) >= 0;
}

function sceneEntSetHidden(room, id, hide) {
  if (!room || !/^scene\.[a-z0-9_]+$/.test(id)) return;
  var scenes = sceneEntHiddenList(room).filter(function (x) {
    return x !== id;
  });
  if (hide && scenes.length < 80) scenes.push(id);
  if (room.sec) room.sec.hscn = scenes;
  else if (scenes.length) room.hscn = scenes;
  else delete room.hscn;
  uiChanged();
}

/* The popup of a scene a plugin owns: the page its kind names, with the room it is shown in. */
function sceneKindPopupKey(kind, id, room) {
  return kind.popup + ":" + id + (room ? "~" + room.id : "");
}

/* The Home Assistant scene entities: one row for all places that list them. A scene a plugin owns (Hue's) that plays by itself is live: the icon switches it on or off and the rest of the row opens its popup. One that does not (a static Hue scene), like the scenes made here, switches on or off from anywhere on the row. Other scenes just run. */
function sceneEntRow(id, name, icon, sub, room) {
  var kind = pluginSceneKind(id),
    live = !!kind && kind.dynamic(id) !== false;
  return pill(icon || kind && kind.icon || "scene", name, {
    on: function () {
      return kind ? !!kind.active(id) : false;
    },
    sub: sub || null,
    tap: function () {
      if (live) showPopup(sceneKindPopupKey(kind, id, room), true);
      else if (kind) kind.toggle(id);
      else {
        call("scene", "turn_on", { entity_id: id });
        toast(name);
      }
    },
    iconTap: live
      ? function () {
          kind.toggle(id);
        }
      : null,
  });
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
  /* the page the row is built on: where an auto scene plays from it */
  var page = secKey();
  if (sc.auto)
    return edMark(
      pill(sc.icon || "scene", sc.name, {
        sub: function () {
          return _T("auto_scene") + " · " + sc.auto.colors.length + " " + _T("auto_colours").toLowerCase();
        },
        tap: function () {
          runScene(sc, page);
        },
        pin: { kind: "cscene", sid: sc.id, name: sc.name, icon: sc.icon || "scene", room: "" },
      }),
      function () {
        autoSceneEdit(sc);
      }
    );
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

/* A scene put in a Section from the + : from a Section's new scene (the scene becomes a device of the Section) or from a lights master's scenes (it is one of the master's). */
function sceneTargetAdd(target, id) {
  var e = target.into === "section" ? secById(target.scope, target.sid) : masterById(target.scope, target.sid);
  if (!e) return;
  if (target.into === "section") {
    e.devs = e.devs || [];
    if (
      !e.devs.some(function (d) {
        return d.kind === "cscene" && d.sid === id;
      })
    )
      e.devs.push({ kind: "cscene", sid: id, id: "", name: "Scene", icon: "scene" });
  } else scnToggle(e, id);
}

/* The page a Section is on, as the scene rows want it: its name and area, for taking the area's name out of a scene's name. */
function sceneCtx() {
  var room = UIROOM[pageKey()] || { id: pageKey(), name: "", area: "" };
  return sceneSectionRoom(room, CURSEC || { id: "x" });
}

/* A scene entity put in a Section: a row that plays it (a plugin's scene opens its own popup). */
function sceneDeviceRow(d) {
  if (!H().states[d.id]) return null;
  var kind = pluginSceneKind(d.id),
    ctx = sceneCtx(),
    name = sceneShortName(A(d.id).friendly_name || d.name, ctx, {});
  return sceneEntRow(d.id, name, kind ? kind.icon : d.icon || "scene", null, ctx);
}

/* A scene made on the dashboard put in a Section: its row (while the page is edited, a plain one, so a tap opens the device's settings, where the scene can be edited). */
function sceneMadeRow(d) {
  var sc = sceneById(d.sid);
  if (!sc || !sceneAllowed(sc)) return null;
  if (editing()) return pill(sc.icon || "scene", sc.name, { sub: mscKindLabel({ kind: sc.auto ? "auto" : sc.live ? "live" : "classic" }) });
  return sceneRow(sc);
}

/* The scenes a collection takes in: those made for the pages it names, those with the tags it takes in (less the ones tagged to leave out), and the scene entities of its areas (none named: the page's own area). */
function sceneCollectionItems(d) {
  var room = UIROOM[pageKey()] || {},
    tokens = d.spage || [],
    rooms = tokens.filter(function (x) {
      return x.indexOf("page:") === 0 || x.indexOf("area:") === 0;
    }),
    pages = tokens
      .filter(function (x) {
        return x.indexOf("page:") === 0;
      })
      .map(function (x) {
        return x.slice(5);
      }),
    stored = STORE.scenes.filter(function (sc) {
      var wanted = pages.indexOf(sc.room) >= 0 || sceneHasTag(sc, d.stag);
      return wanted && !sceneHasTag(sc, d.xtag) && sceneAllowed(sc);
    }),
    ents = [];
  tokens.forEach(function (x) {
    if (x.indexOf("group:") === 0) {
      sceneGroupIds(x).forEach(function (id) {
        if (ents.indexOf(id) < 0) ents.push(id);
      });
      return;
    }
    if (x.indexOf("hue:") !== 0) return;
    var found =
      x === "hue:@rooms"
        ? (rooms.length
            ? rooms
            : scenePages().map(function (p) {
                return p.token;
              })
          ).reduce(function (acc, t) {
            return acc.concat(sceneRoomHueIds(t));
          }, [])
        : x === "hue:@lights"
          ? []
          : sceneIds(x === "hue:@page" ? room.area : x.slice(4)).map(function (s) {
              return s[0];
            });
    found.forEach(function (id) {
      if (ents.indexOf(id) < 0) ents.push(id);
    });
  });
  return { stored: stored, ents: ents };
}

/* A collection of scenes as a device: while the page is edited one row; otherwise the scenes it takes in, one under the other (or in the columns of the Section). */
function sceneCollectionRow(d) {
  var it = sceneCollectionItems(d);
  if (editing())
    return pill(d.icon || "scene", d.name, {
      sub: function () {
        return cntS(it.stored.length + it.ents.length, _T("scene_lc"), _T("scenes_lc"));
      },
    });
  var ctx = sceneCtx(),
    n = layCols(CURSEC && CURSEC.lay),
    box = mk("div", n > 1 ? "gridl g" + n : "");
  it.stored.forEach(function (sc) {
    box.appendChild(sceneRow(sc));
  });
  var words = sceneNameSuffixes(it.ents);
  it.ents.forEach(function (id) {
    var kind = pluginSceneKind(id),
      nm = (d.keepname ? A(id).friendly_name || id : sceneShortName(A(id).friendly_name || id, ctx, {})) + (words[id] || "");
    box.appendChild(sceneEntRow(id, nm, kind ? kind.icon : "scene", null, ctx));
  });
  /* Taken now: the page and Section being drawn are not known any more when the button is tapped. */
  if (ISADMIN && CURSEC) {
    var newKey = "scene-new:" + secKey() + ":" + CURSEC.id + ":s";
    box.appendChild(
      pill("plus", _T("new_scene"), {
        tap: function () {
          showPopup(newKey, true);
        },
      })
    );
  }
  if (!box.children.length) return null;
  box.style.gridColumn = "1 / -1";
  return box;
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
  if (d.kind === "widget") return widgetRow(d, false);
  if (d.kind === "scene") return sceneDeviceRow(d);
  if (d.kind === "cscene") return sceneMadeRow(d);
  if (d.kind === "scenes") return sceneCollectionRow(d);
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
      kind: "clean",
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
    var dk = pluginDeviceKind(d.id);
    if (dk) return dk.row(d);
    pk = devPop(d);
    var pw = powerSib(d.id);
    return pill(d.icon || "plug", d.name, {
      kind: iconKind(d.icon || "plug") === "other" ? "power" : "",
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
  if (d.kind === "remote") return remoteRow(d);
  if (d.kind === "appliance") return apRow(d);
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

/* A scene's name without the area's name in front of it ("Bathroom Dim" is "Dim"): the page's name, or the name of the area the section takes its scenes from. A section can keep the names whole. */
function sceneShortName(name, ctx, sec) {
  if (sec.keepname) return name;
  var areas = (H().areas || {})[ctx.area],
    heads = [ctx.name, areas && areas.name];
  for (var i = 0; i < heads.length; i++) {
    var h = heads[i];
    if (h && name.indexOf(h) === 0) {
      var rest = name.slice(h.length).replace(/^\s+/, "");
      if (rest) return rest;
    }
  }
  return name;
}

