/* Settings: the category list, the about page, data settings and the layout check. */

/* about */
function aboutPage(b) {
  var h = H(),
    n = function (f) {
      return function () {
        return String(f());
      };
    };
  b.appendChild(
    entRow(_T("page"), function () {
      return appVersion();
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
      _T("saved_colours"),
      n(function () {
        var c = 0;
        Object.keys(STORE.saved || {}).forEach(function (k) {
          c += STORE.saved[k].length;
        });
        return c;
      })
    )
  );
  b.appendChild(sep(_T("actions"), "restart"));
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
  ["wall", _T("wall_mode"), "stg-wall", "tv"],
  ["dev", _T("devices_2"), "stg-dev", "plug"],
  ["lgroups", _T("lgs_title"), "lgroups", "lights"],
  ["areas", _T("areas"), "stg-areas", "target"],
  ["effects", _T("effects"), "stg-effects", "sparkle"],
  ["access", _T("users_and_access"), "stg-access", "lock"],
  ["notify", _T("notifications"), "stg-notify", "bell"],
  ["hist", _T("history"), "stg-hist", "clock"],
  ["data", _T("backup_and_about"), "stg-data", "sd"],
];

/* The five groups Settings is in: what a category belongs to. A category a plugin adds is under Plugins. */
var CAT_GROUPS = [
  ["display", "stg_group_display", ["appearance", "wall"]],
  ["dashboard", "stg_group_dashboard", ["dev", "lgroups", "areas", "effects"]],
  ["people", "stg_group_people", ["access", "notify"]],
  ["data", "stg_group_data", ["hist", "data"]],
  ["plugins", "stg_group_plugins", null],
];

function catGroup(id) {
  var g = CAT_GROUPS.filter(function (x) {
    return x[2] && x[2].indexOf(id) >= 0;
  })[0];
  return g ? g[0] : "plugins";
}

/* A line under each settings category: what is inside, or its current state. */
function stgNavSub(id) {
  if (PLUGIN_SETTINGS[id]) return PLUGIN_SETTINGS[id].sub ? PLUGIN_SETTINGS[id].sub() : "";
  if (id === "appearance") return themeLight() ? _T("light") : _T("dark");
  if (id === "wall")
    return PREFS.wall ? _T("on_2") + " · " + Math.round(PREFS.wallIdle / 60) + " min" : _T("off");
  if (id === "dev") return _T("new_devices_and_devices_that_are_not");
  if (id === "lgroups") return _T("lgs_sub");
  if (id === "areas") return _T("where_the_lights_are_for_live_scenes");
  if (id === "effects") return _T("the_effects_of_your_lights_and_files_to_ad");
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
  [_T("lgs_title"), "light groups helper group lights combine make new", "lgroups", null],
  [_T("areas"), "areas rooms lights placement live scenes entertainment", "areas", null],
  [_T("effects"), "effects catalogue import file json groups calibration brands", "effects", null],
  [_T("users_and_access"), "access users permissions confirm hide read only", "access", null],
  [_T("history"), "history log changes undo", "hist", null],
  [_T("notifications"), "notifications alerts battery offline", "notify", null],
  [_T("backup_and_about"), "backup about diagnostics", "data", null],
  [_T("change_log"), "changes undo who edit history", "data", "manage-log"],
  [_T("backup_and_restore"), "download export import restore", "data", "manage-backup"],
  [_T("stg_idx_header"), "header clock greeting weather people names page", "dev", "manage-names"],
  [_T("stg_idx_batteries"), "batteries battery low tracked", "notify", "manage-bats"],
  [_T("stg_idx_alerts"), "alerts any entity notification rule washer door", "notify", "stg-notify"],
  [_T("stg_idx_photos"), "wall photos screensaver gallery night dim idle", "wall", "stg-wall"],
  [_T("stg_idx_effects_file"), "effects file import json example syntax", "effects", "stg-effects"],
  [_T("stg_idx_users"), "standard users rooms devices rules pin display size", "access", "stg-access"],
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
  CAT_GROUPS.forEach(function (g) {
    var cats = CATS.filter(function (c) {
      return catGroup(c[0]) === g[0] && (!c[4] || c[4]());
    });
    if (g[0] === "dashboard") {
      list.appendChild(sep(_T(g[1]), "home"));
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
    } else if (cats.length) list.appendChild(sep(_T(g[1]), "home"));
    cats.forEach(function (c) {
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
        if (PLUGIN_SETTINGS[x[2]] && PLUGIN_SETTINGS[x[2]].visible && !PLUGIN_SETTINGS[x[2]].visible()) return false;
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
        kind: "other",
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
      "info",
      _T("about_and_diagnostics"),
      function () {
        return (appVersion() ? appVersion() + " · " : "") + "Home Assistant " + ((H().config && H().config.version) || "");
      },
      "manage-about",
    ],
  ]);
}
