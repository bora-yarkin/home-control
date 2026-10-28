/* Settings: the category list, the about page, data settings and the layout check. */

/* about */
/* Layout check: measures the open page and the open sheet for controls that overlap, spill out or are clipped, so a visual slip is found without anyone having to spot it. */
function lcBox(e) {
  var r = e.getBoundingClientRect(),
    cs = getComputedStyle(e);
  return r.width > 6 && r.height > 6 && cs.visibility !== "hidden" && cs.display !== "none"
    ? r
    : null;
}

function lcFixed(e) {
  for (var p = e; p && p !== document.body; p = p.parentElement) {
    var pos = getComputedStyle(p).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
}

function lcAudit(root, label) {
  var out = [],
    sel = ".pane,.pill,.qa,.rnd,.sqw,.seg",
    vw = window.innerWidth,
    els = [].slice.call(root.querySelectorAll(sel)).filter(function (e) {
      return !e.parentElement.closest(sel) && lcBox(e);
    }),
    rs = els.map(function (e) {
      return { e: e, r: e.getBoundingClientRect() };
    });
  function nm(e) {
    return e.textContent.trim().replace(/\s+/g, " ").slice(0, 26);
  }
  rs.forEach(function (x) {
    if (x.r.right > vw + 1 || x.r.left < -1)
      out.push(label + ": " + nm(x.e) + " " + _T("goes_past_the_screen_edge"));
  });
  for (var i = 0; i < rs.length; i++)
    for (var j = i + 1; j < rs.length; j++) {
      var a = rs[i].r,
        b = rs[j].r,
        ox = Math.min(a.right, b.right) - Math.max(a.left, b.left),
        oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 6 && oy > 6 && !lcFixed(rs[i].e) && !lcFixed(rs[j].e))
        out.push(label + ": " + nm(rs[i].e) + " " + _T("overlaps") + " " + nm(rs[j].e));
    }
  [].forEach.call(root.querySelectorAll(".nm,.sb,.vl"), function (e) {
    if (
      lcBox(e) &&
      e.scrollWidth > e.clientWidth + 2 &&
      getComputedStyle(e).textOverflow !== "ellipsis"
    )
      out.push(label + ": " + nm(e) + " " + _T("is_cut_off"));
  });
  return out;
}

function lcRun() {
  var res = lcAudit(document.getElementById("body"), _T("page")),
    sh = document.querySelector(".sheet");
  if (sh) res = res.concat(lcAudit(sh, _T("open_sheet")));
  if (document.documentElement.scrollWidth > window.innerWidth + 2)
    res.push(_T("the_page_scrolls_sideways"));
  return res;
}

function checkPage(b) {
  var res = lcRun();
  if (!res.length) {
    b.appendChild(
      pill("check", _T("no_layout_problems_found"), {
        sub: function () {
          return _T("checked_the_page_and_the_open_sheet");
        },
      })
    );
    return;
  }
  res.slice(0, 30).forEach(function (t) {
    b.appendChild(pill("alert", t, {}));
  });
}

function aboutPage(b) {
  var h = H(),
    n = function (f) {
      return function () {
        return String(f());
      };
    };
  b.appendChild(
    entRow(_T("page"), function () {
      return BUILD;
    })
  );
  b.appendChild(
    entRow(_T("home_assistant"), function () {
      return (h.config && h.config.version) || "?";
    })
  );
  b.appendChild(
    entRow(_T("signed_in_as"), function () {
      return (h.user ? h.user.name : "?") + (ISADMIN ? _T("admin") : "");
    })
  );
  b.appendChild(
    entRow(_T("data_store"), function () {
      return STORE_KEY + " · " + Math.round(JSON.stringify(STORE).length / 102.4) / 10 + " KB";
    })
  );
  b.appendChild(sep(_T("contents"), "info"));
  b.appendChild(
    entRow(
      _T("rooms"),
      n(function () {
        return UI.rooms.length;
      })
    )
  );
  b.appendChild(
    entRow(
      _T("devices_2"),
      n(function () {
        var c = 0;
        allSectionLists().forEach(function (l) {
          l.forEach(function (s) {
            c += (s.devs || []).length;
          });
        });
        return c;
      })
    )
  );
  b.appendChild(
    entRow(
      _T("scenes_and_quick_actions"),
      n(function () {
        return STORE.scenes.length;
      })
    )
  );
  b.appendChild(
    entRow(
      _T("light_presets"),
      n(function () {
        var c = 0;
        Object.keys(STORE.presets).forEach(function (k) {
          c += STORE.presets[k].length;
        });
        return c;
      })
    )
  );
  b.appendChild(sep(_T("actions"), "restart"));
  b.appendChild(
    pill("tune", _T("check_the_layout"), {
      sub: function () {
        return _T("looks_for_overlapping_or_cut_off_con");
      },
      tap: function () {
        showPopup("manage-check", true);
      },
    })
  );
  b.appendChild(
    pill("restart", _T("reload_from_home_assistant"), {
      sub: function () {
        return _T("fetches_the_saved_settings_again");
      },
      tap: function () {
        STORE_SAVED = 0;
        storeLoad();
        toast(_T("reloaded"));
      },
    })
  );
}

/* ---- fullscreen settings (admin) ---- */

var CATS = [
  ["appearance", _T("appearance"), "appearance", "palette"],
  ["dev", _T("devices_2"), "stg-dev", "plug"],
  ["areas", _T("areas"), "stg-areas", "target"],
  ["access", _T("users_and_access"), "stg-access", "lock"],
  ["hist", _T("history"), "stg-hist", "clock"],
  ["notify", _T("notifications"), "stg-notify", "bell"],
  ["wall", _T("wall_mode"), "stg-wall", "tv"],
  ["data", _T("backup_and_about"), "stg-data", "sd"],
];

/* A line under each settings category: what is inside, or its current state. */
function stgNavSub(id) {
  if (id === "appearance") return themeLight() ? _T("light") : _T("dark");
  if (id === "wall")
    return PREFS.wall ? _T("on_2") + " · " + Math.round(PREFS.wallIdle / 60) + " min" : _T("off");
  if (id === "dev") return _T("new_devices_and_devices_that_are_not");
  if (id === "areas") return _T("where_the_lights_are_for_live_scenes");
  if (id === "access") return _T("who_can_do_what");
  if (id === "hist") return _T("recent_activity");
  if (id === "notify") {
    var a = Object.keys(NRULES).filter(function (k) {
      return nrule(k).on;
    }).length;
    return a ? a + " " + _T("active_2") : _T("nothing_sent_yet");
  }
  return _T("backups_and_change_log");
}

var STG_INDEX = [
  [_T("appearance"), _T("appearance_look_theme_accent_colour"), "appearance", null],
  [_T("wall_mode"), _T("wall_mode_screensaver_clock_photos_d"), "wall", null],
  [_T("devices_2"), _T("devices_new_add_lights"), "dev", null],
  [_T("areas"), "areas rooms lights placement live scenes entertainment", "areas", null],
  [_T("users_and_access"), "access users permissions confirm hide read only", "access", null],
  [_T("history"), "history log changes undo", "hist", null],
  [_T("notifications"), "notifications alerts battery offline", "notify", null],
  [_T("backup_and_about"), "backup about diagnostics", "data", null],
  [_T("automatic_backups"), "snapshots restore automatic", "data", "manage-autobackup"],
  [_T("change_log"), "changes undo who", "data", "manage-log"],
  [_T("backup_and_restore"), "download export import restore", "data", "manage-backup"],
];

/* Settings: a list of categories, each opening as its own popup page. The search box finds a category or one of its pages. */
function settingsRoot(b) {
  var w = mk("div", "sqw pane", svg("search")),
    inp = mk("input", "sq"),
    res = mk("div"),
    list = mk("div");
  inp.type = "text";
  inp.placeholder = _T("search_settings");
  inp.setAttribute("aria-label", _T("search_settings"));
  inp.setAttribute("autocomplete", "off");
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(res);
  b.appendChild(list);
  list.appendChild(
    pill("edit", _T("edit_this_page"), {
      sub: function () {
        return _T("add_move_and_change_what_this_page_s");
      },
      tap: function () {
        EDIT = true;
        closeSheet();
        render();
      },
    })
  );
  CATS.forEach(function (c) {
    list.appendChild(
      pill(c[3], c[1], {
        sub: function () {
          return stgNavSub(c[0]);
        },
        tap: function () {
          showPopup(c[2], true);
        },
      })
    );
  });
  inp.addEventListener("input", function () {
    var q = inp.value.trim().toLowerCase(),
      prev = CUR;
    res.innerHTML = "";
    list.style.display = q ? "none" : "";
    if (!q) return;
    CUR = [];
    var toks = q.split(/\s+/),
      hits = STG_INDEX.filter(function (x) {
        var h = (x[0] + " " + x[1]).toLowerCase();
        return toks.every(function (k) {
          return h.indexOf(k) >= 0;
        });
      });
    if (!hits.length) res.appendChild(pill("info", _T("no_matching_settings"), {}));
    hits.forEach(function (x) {
      var c = CATS.filter(function (y) {
        return y[0] === x[2];
      })[0];
      res.appendChild(
        pill(c ? c[3] : "cog", x[0], {
          tap: function () {
            showPopup(x[3] || c[2], true);
          },
        })
      );
    });
    CUR = prev;
  });
}

function stgRows(b, rows) {
  rows.forEach(function (r) {
    b.appendChild(
      pill(r[0], r[1], {
        sub: r[2],
        tap: function () {
          showPopup(r[3], true);
        },
      })
    );
  });
}

function cntS(n, s, p) {
  return n + " " + (n === 1 ? s : p);
}

function stgDevices(b) {
  var n = newDevs(false).length;
  if (n)
    b.appendChild(
      pill("plus", _T("new_devices"), {
        sub: function () {
          return cntS(n, _T("device_to_review"), _T("devices_to_review"));
        },
        tap: function () {
          showPopup("manage-new", true);
        },
      })
    );
  b.appendChild(
    prefPill(
      "tune",
      _T("advanced_settings_buttons_on_devices"),
      "adv",
      _T("shows_advanced_settings_at_the_botto")
    )
  );
  stgRows(b, [
    [
      "search",
      _T("devices_not_on_the_dashboard"),
      function () {
        return _T("find_and_add_devices_from_home_assis");
      },
      "manage-new",
    ],
  ]);
}

/* Areas, from Settings: the rooms first; a room opens its areas, where they are added, changed and removed. */
function stgAreas(b) {
  UI.rooms.forEach(function (r) {
    var n = STORE.eareas.filter(function (a) {
      return a.room === r.id;
    }).length;
    b.appendChild(
      pill(r.icon || "home", r.name, {
        sub: function () {
          return n ? cntS(n, _T("area"), _T("areas")) : _T("no_areas_yet");
        },
        tap: function () {
          showPopup("areas:" + r.id, true);
        },
      })
    );
  });
}

function stgData(b) {
  stgRows(b, [
    [
      "restart",
      _T("change_log"),
      function () {
        return _T("what_changed_by_whom_and_undo");
      },
      "manage-log",
    ],
    [
      "sd",
      _T("backup_and_restore"),
      function () {
        return _T("download_copy_or_restore");
      },
      "manage-backup",
    ],
    [
      "sd",
      _T("automatic_backups"),
      function () {
        return bkOn()
          ? _T("on_cap") + " · " + bkCfg().keep + " " + _T("snapshots_lower")
          : _T("off");
      },
      "manage-autobackup",
    ],
    [
      "info",
      _T("about_and_diagnostics"),
      function () {
        return BUILD + " · Home Assistant " + ((H().config && H().config.version) || "");
      },
      "manage-about",
    ],
  ]);
}
