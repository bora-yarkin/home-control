/* More than one lights master in a section, moving and copying a master to another section, and the At a glance lights popup that lists the lights of the masters too.
   A lights master is a widget of a Section (app/widgetkinds.js, decision D-25): its settings (name `mn`, lights `ml`, power button `mpw`, scenes `scn`, `msrc`, `mf`, `mtop`, and so on) are the widget's, and a Section can hold
   several. The one made from the Section's own lights is `own`; every other is manual: the lights are chosen for it. Everything that works on a master by "page~id" (the popup, its settings, its scenes) finds it with masterById. */

/* The sections of a list with the lights masters they hold, for what is kept on both the same way (the scenes a master lists). */
function secsAndMasters(list) {
  var out = [];
  list.forEach(function (s) {
    out.push(s);
    masterWidgets(s).forEach(function (d) {
      out.push(masterView(s, d));
    });
  });
  return out;
}

/* The section that holds a master that is not the section's own (one chosen lights for, made on its own), or null when the master is the section's own. */
function masterHost(scope, id) {
  var f = masterFind(scope, id);
  return f && !f.widget.wx.own ? f.host : null;
}

/* Whether a lights section leaves a row out because one of its masters has the light, or the sync, and is set to keep it. */
function masterLeavesOut(s, d) {
  var pk = pluginDeviceKind(d.id);
  /* the section's own master leaves out every light row of the section; another only the lights it has */
  return masterWidgets(s).some(function (w) {
    var m = masterView(s, w);
    if (pk) return !!(pk.sync && m.mhs);
    return d.kind === "light" && !!m.mhl && (!!m.own || masterLightIds(m).indexOf(d.id) >= 0);
  });
}

/* An id for a master that no section or master of the page has. */
function masterNewId(scope) {
  var id;
  do id = "m" + Math.random().toString(36).slice(2, 7);
  while (secById(scope, id) || masterById(scope, id) || !/^[a-z][a-z0-9_]{1,14}$/.test(id));
  return id;
}

/* The pages and the lights sections on them, for choosing where a master goes. */
function masterTargets() {
  var out = [];
  [["home", TITLES.home]]
    .concat(
      UI.rooms.map(function (r) {
        return [r.id, r.name];
      })
    )
    .forEach(function (p) {
      secOrder(scopeKey(p[0])).forEach(function (s) {
        if (s.k === "devs") out.push({ scope: p[0], page: p[1] || p[0], sec: s });
      });
    });
  return out;
}

/* Every lights master of the visible pages: the section's own (when it has one) and the ones it holds, as { key: "page~id", scope, host, sec (the section or the holder), ids (its lights), own (it is the section's own) }. */
function allMasters() {
  var out = [],
    pages = [["home", TITLES.home]].concat(
      UI.rooms
        .filter(function (r) {
          return !r.hide && !roomHidden(r.id);
        })
        .map(function (r) {
          return [r.id, r.name];
        })
    );
  pages.forEach(function (p) {
    secOrder(scopeKey(p[0])).forEach(function (s) {
      if (s.k !== "devs" || s.hide) return;
      masterWidgets(s).forEach(function (w) {
        var m = masterView(s, w);
        out.push({ key: p[0] + "~" + w.wid, scope: p[0], page: p[1], host: s, sec: m, own: !!m.own, ids: masterLightIds(m) });
      });
    });
  });
  return out;
}

/* ---- making one ---- */

/* A lights master as a widget of a Section, with the id it is named by and the settings it starts with. */
function masterDevice0(id, wx) {
  return { kind: "widget", id: "", w: "lmaster", wid: id, name: _T("lights_master"), icon: "lights", wx: Object.assign({ id: id, master: 1 }, wx) };
}

/* What the + of a Lights section asks first when "Lights master" is chosen: an automatic master (the section's own, made from the section's lights and named All lights) or a manual one (the lights are chosen for it). `key` is "page:section". */
function masterAddPage(b, key) {
  var p = key.split(":"),
    host = secById(p[0], p[1]);
  if (!host || host.k !== "devs") return;
  var hasOwn = !!ownMasterWidget(host);
  b.appendChild(
    pill("restart", _T("master_auto"), {
      sub: function () {
        return hasOwn ? _T("lm_add_auto_taken") : _T("lm_add_auto_sub");
      },
      tap: function () {
        if (ownMasterWidget(host)) return toast(_T("lm_add_auto_taken"));
        host.devs = [masterDevice0(masterNewId(p[0]), { own: 1, mn: _T("all_lights") })].concat(host.devs || []);
        uiChanged();
        toast(_T("lm_made"));
        closeSheet();
      },
    })
  );
  b.appendChild(
    pill("plus", _T("master_manual"), {
      sub: function () {
        return _T("lm_add_manual_sub");
      },
      tap: function () {
        showPopup("lmaster-new:" + key, true);
      },
    })
  );
}

/* A lights master made from a lights section's settings or from the master row of the page: it asks for a name and for the lights, and the section is not touched. `key` is "page:section". */
function masterNewPage(b, key) {
  var p = key.split(":"),
    host = secById(p[0], p[1]);
  if (!host || host.k !== "devs") return;
  var draft = { ml: [], mn: "" };
  b.appendChild(
    textRow("edit", _T("lm_name"), "", function (v) {
      draft.mn = v.slice(0, 40);
    }, 40)
  );
  var go = pill("check", _T("lm_create"), {
    sub: function () {
      return _T("n_lights", { n: draft.ml.length });
    },
    tap: function () {
      if (draft.ml.length < 2) return toast(_T("lm_choose_at_least_two_lights"));
      var h = { mm: 1, ml: draft.ml };
      if (draft.mn) h.mn = draft.mn;
      host.devs = (host.devs || []).concat([masterDevice0(masterNewId(p[0]), h)]);
      uiChanged();
      toast(_T("lm_made"));
      popBack();
    },
  });
  b.appendChild(go);
  b.appendChild(hintRow(_T("lm_new_hint")));
  masterLightsChooser(b, draft, function () {
    go.refresh();
    refresh();
  });
}

/* ---- moving and copying ---- */

/* Gives a master to another section: a copy of its settings as a widget of `target.sec`, and, when it is moved, takes it out of where it was. A master that was automatic is saved as manual with the lights it had, so it still has them in the other section; the target's own lights are not touched. Returns the new master's settings. */
function masterTransfer(scope, id, target, copy) {
  var f = masterFind(scope, id);
  if (!f) return null;
  var src = f.view,
    h = { mm: 1 };
  LM_KEYS.forEach(function (k) {
    if (src[k] !== undefined && src[k] !== null) h[k] = JSON.parse(JSON.stringify(src[k]));
  });
  /* Automatic: the lights of the section, as chosen lights with their names and icons. */
  if (!src.mm) {
    h.ml = (src.devs || [])
      .filter(function (d) {
        return d.id && d.kind === "light";
      })
      .map(function (d) {
        return JSON.parse(JSON.stringify(d));
      });
  }
  h.mm = 1;
  /* The scenes of another section of the page it came from are not there on another page. */
  if (target.scope !== scope && h.msrc)
    h.msrc = h.msrc.filter(function (x) {
      return x.indexOf("sec:") !== 0 || !!secById(target.scope, x.slice(4));
    });
  var nd = masterDevice0(masterNewId(target.scope), h);
  target.sec.devs = (target.sec.devs || []).concat([nd]);
  if (!copy)
    f.host.devs = f.host.devs.filter(function (d) {
      return d !== f.widget;
    });
  uiChanged();
  return nd.wx;
}

/* A master a section holds becomes the section's own master: the section's own master is gone (its settings with it), and the section's own lights are as they were before: automatic masters can be chosen again. */
function masterMakeOwn(host, id) {
  var w = masterWidgets(host).filter(function (d) {
    return d.wid === id;
  })[0];
  if (!w) return;
  var old = ownMasterWidget(host);
  if (old)
    host.devs = host.devs.filter(function (d) {
      return d !== old;
    });
  w.wx.own = 1;
  uiChanged();
}

/* Where to move or copy a master: "page:master". */
function masterMovePage(b, key) {
  var p = key.split(":"),
    src = masterById(p[0], p[1]),
    host = (masterFind(p[0], p[1]) || {}).host;
  if (!src) return;
  var copy = false,
    box = mk("div");
  function draw() {
    box.innerHTML = "";
    box.appendChild(
      seg(
        [
          ["move", _T("lm_move")],
          ["copy", _T("lm_copy")],
        ],
        copy ? "copy" : "move",
        function (v) {
          copy = v === "copy";
          draw();
        }
      )
    );
    box.appendChild(hintRow(copy ? _T("lm_copy_hint") : _T("lm_move_hint")));
    if (!src.mm) box.appendChild(hintRow(_T("lm_auto_saved_hint")));
    var page = null;
    masterTargets().forEach(function (t) {
      if (!copy && t.sec === host) return;
      if (page !== t.scope) {
        page = t.scope;
        box.appendChild(sep(t.page, "home"));
      }
      box.appendChild(
        pill("lights", secName(t.sec), {
          sub: function () {
            return cntS(lightUnits((t.sec.devs || []).filter(function (d) { return d.id && d.kind === "light"; }).map(function (d) { return d.id; })).length, _T("light_2"), _T("lights").toLocaleLowerCase(globalThis.HC_LANG));
          },
          tap: function () {
            confirmDlg((copy ? _T("lm_copy_to") : _T("lm_move_to")) + " " + t.page + " · " + secName(t.sec) + "?", function () {
              masterTransfer(p[0], p[1], t, copy);
              toast(copy ? _T("lm_copied") : _T("lm_moved"));
              closeSheet();
            });
          },
        })
      );
    });
  }
  b.appendChild(box);
  draw();
}

/* Where the master is listed in At a glance. */
function masterGlanceRows(box, sec, redraw) {
  box.appendChild(sep(_T("lm_in_at_a_glance"), "lights"));
  box.appendChild(
    seg(
      [
        ["page", _T("lm_room_of_the_page")],
        ["ha", _T("lm_room_in_home_assistant")],
      ],
      sec.mgr === "ha" ? "ha" : "page",
      function (v) {
        if (v === "ha") sec.mgr = "ha";
        else delete sec.mgr;
        uiChanged();
        redraw();
      }
    )
  );
  box.appendChild(hintRow(sec.mgr === "ha" ? _T("lm_room_in_home_assistant_hint") : _T("lm_room_of_the_page_hint")));
}

/* Moving, copying and (for one a section holds) making it the section's own master or deleting it. */
function masterActionRows(box, sec, scope) {
  var host = masterHost(scope, sec.id), /* the section that holds it, unless it is the section's own master */
    acts = [],
    bad = [];
  function add(row, danger) {
    acts.push(row);
    if (danger) bad.push(row);
  }
  add(
    pill("swap", _T("lm_move_or_copy"), {
      sub: function () {
        return _T("lm_move_or_copy_sub");
      },
      tap: function () {
        showPopup("lmaster-move:" + scope + ":" + sec.id, true);
      },
    })
  );
  if (host)
    add(
      pill("restart", _T("lm_make_own"), {
        sub: function () {
          return _T("lm_make_own_sub");
        },
        tap: function () {
          confirmDlg(
            _T("lm_make_own_confirm"),
            function () {
              masterMakeOwn(host, sec.id);
              closeSheet();
            },
            _T("lm_make_own")
          );
        },
      })
    );
  add(
    pill("trash", _T("lm_delete"), {
      sub: function () {
        return host ? "" : _T("lm_delete_own_sub");
      },
      tap: function () {
        confirmDlg(
          _T("lm_delete_this_master"),
          function () {
            var f = masterFind(scope, sec.id);
            if (f)
              f.host.devs = f.host.devs.filter(function (d) {
                return d !== f.widget;
              });
            uiChanged();
            closeSheet();
          },
          _T("delete_word")
        );
      },
    }),
    true
  );
  stgActions(box, acts, bad);
}

/* ---- At a glance ---- */

/* The Home Assistant room a master's lights are mostly in: its area id, or null. */
function masterAreaOf(ids) {
  var count = {},
    best = null;
  lightIndividuals(ids).forEach(function (i) {
    var a = areaIdOf(i);
    if (a) count[a] = (count[a] || 0) + 1;
  });
  Object.keys(count).forEach(function (a) {
    if (!best || count[a] > count[best]) best = a;
  });
  return best;
}

/* The lights popup of At a glance, as groups under a room's name: { key, name, masters (shown as rows), lights (one by one) }. The lights are those of the rooms' sections and of the lights masters, each once. A master that is shown is one row and its lights are not listed again; the others' lights are listed with the room the master is under: the page's room, or the Home Assistant room of its lights (the dashboard room that has that area, or the area itself). */
function glLightGroups() {
  var shownKeys = glanceCfg().lm || [],
    groups = [],
    by = {},
    taken = {},
    covered = {},
    masters = allMasters().filter(function (m) { return !m.sec.mhide; }).map(function (m) {
      m.shown = shownKeys.indexOf(m.key) >= 0 && m.ids.length > 1;
      if (m.shown)
        lightUnits(m.ids).forEach(function (i) {
          covered[i] = 1;
        });
      return m;
    });
  function group(key, name) {
    if (!by[key]) {
      by[key] = { key: key, name: name, masters: [], lights: [] };
      groups.push(by[key]);
    }
    return by[key];
  }
  function add(g, i) {
    if (covered[i] || taken[i] || gxOff("lights", i)) return;
    taken[i] = 1;
    g.lights.push(i);
  }
  UI.rooms.forEach(function (r) {
    if (r.hide || roomHidden(r.id)) return;
    var g = group("r:" + r.id, r.name);
    (ROOMLIGHTS[r.id] || []).forEach(function (i) {
      add(g, i);
    });
  });
  masters.forEach(function (m) {
    var g = null;
    if (m.sec.mgr === "ha") {
      var area = masterAreaOf(m.ids),
        room = area ? UI.rooms.filter(function (r) { return r.area === area && !r.hide && !roomHidden(r.id); })[0] : null;
      g = room ? group("r:" + room.id, room.name) : area ? group("a:" + area, (H().areas[area] || {}).name || area) : null;
    }
    if (!g) g = m.scope === "home" ? group("home", TITLES.home) : group("r:" + m.scope, TITLES[m.scope] || m.page);
    if (m.shown) g.masters.push(m);
    else m.ids.forEach(function (i) { add(g, i); });
  });
  return groups.filter(function (g) {
    return g.masters.length || g.lights.length;
  });
}

/* The masters the At a glance settings can show as rows: under the name of the page they are on. */
function glMasterPicks(b) {
  var list = allMasters().filter(function (m) {
    return m.ids.length > 1;
  });
  if (!list.length) return;
  b.appendChild(sep(_T("lm_masters_in_the_popup"), "lights"));
  b.appendChild(hintRow(_T("lm_masters_in_the_popup_hint")));
  list.forEach(function (m) {
    b.appendChild(
      pill("lights", m.sec.mn || _T("all_lights"), {
        sub: function () {
          return m.page + " · " + cntS(m.ids.length, _T("light_2"), _T("lights").toLocaleLowerCase(globalThis.HC_LANG));
        },
        check: function () {
          return (glanceCfg().lm || []).indexOf(m.key) >= 0;
        },
        tap: function () {
          glanceSave(function (x) {
            var l = x.lm || (x.lm = []),
              i = l.indexOf(m.key);
            if (i >= 0) l.splice(i, 1);
            else l.push(m.key);
            if (!l.length) delete x.lm;
          });
        },
      })
    );
  });
}

/* The lights popup of At a glance. */
function glLightsPage(b) {
  glLightGroups().forEach(function (g) {
    b.appendChild(sep(g.name, "lights"));
    g.masters.forEach(function (m) {
      b.appendChild(lightsMasterRow(m.key, m.ids, m.sec.mn, m.sec.mall, m.sec.mo, masterMeta(m.sec)));
    });
    g.lights.forEach(function (id) {
      b.appendChild(
        lightRow(id, false, true)
      );
    });
  });
}
