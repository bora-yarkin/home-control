/* Managing the home: rooms, devices and names, and entities created after the dashboard was set up. */

function namesPage(b) {
  var m = UI.meta,
    hint = mk("div", "hint");
  hint.textContent = _T("room_tabs_are_renamed_in_each_room_s");
  b.appendChild(
    textRow(
      "home",
      _T("home_tab_label"),
      m.homeTab,
      function (v) {
        if (v) {
          m.homeTab = v.slice(0, 16);
          uiChanged();
        }
      },
      16
    )
  );
  b.appendChild(
    textRow(
      "edit",
      _T("home_page_title"),
      m.homeTitle,
      function (v) {
        if (v) {
          m.homeTitle = v.slice(0, 40);
          uiChanged();
        }
      },
      40
    )
  );
  b.appendChild(
    textRow(
      "tune",
      _T("line_above_the_title_leave_empty_to_"),
      m.eyebrow,
      function (v) {
        m.eyebrow = v.slice(0, 30);
        uiChanged();
      },
      30
    )
  );
  b.appendChild(
    pill("clock", _T("show_the_clock_and_date"), {
      on: function () {
        return hdrClockShown(m, m.size);
      },
      sub: function () {
        return hdrClockShown(m, m.size) ? _T("shown_in_the_header") : _T("hidden");
      },
      tap: function () {
        if (m.size === "slim") m.clockSlim = !hdrClockShown(m, m.size);
        else m.clock = !hdrClockShown(m, m.size);
        uiChanged();
      },
    })
  );
  b.appendChild(hint);
  var hb = mk("div");
  b.appendChild(hb);
  hdrPage(hb, m);
}

var NEWDOMS =
    /^(light|switch|fan|climate|media_player|vacuum|camera|cover|lock|humidifier|water_heater|valve)\./,
  REG = null,
  REGAT = 0,
  NEWPICK = null;

function regLoad(force) {
  var h = H();
  if (!h || !ISADMIN) return Promise.resolve([]);
  if (REG && !force && Date.now() - REGAT < 60000) return Promise.resolve(REG);
  return HA.entityRegistry().then(
    function (l) {
      REG = Array.isArray(l) ? l : [];
      REGAT = Date.now();
      return REG;
    },
    function () {
      return REG || [];
    }
  );
}

/* Entities already represented on the dashboard: the devices themselves, members of light groups, and every other
 entity of the same Home Assistant device (those are reachable through Advanced settings). */
function onDash() {
  var have = {},
    devs = {};
  devsOf().forEach(function (d) {
    if (!d.id) return;
    have[d.id] = 1;
    var m = A(d.id).entity_id;
    if (Array.isArray(m))
      m.forEach(function (x) {
        have[x] = 1;
      });
    var dv = advDevice(d.id);
    if (dv) devs[dv] = 1;
  });
  have.__devs = devs;
  return have;
}

function newDevs(all) {
  if (!STORE_READY) return [];
  var have = onDash(),
    ign = UI.ignored || [],
    since = UI.newSince || 0,
    h = H();
  if (!h) return [];
  return (REG || [])
    .filter(function (e) {
      return (
        NEWDOMS.test(e.entity_id) &&
        !e.entity_category &&
        !e.hidden_by &&
        !e.disabled_by &&
        h.states[e.entity_id] &&
        !have[e.entity_id] &&
        !(e.device_id && have.__devs[e.device_id]) &&
        ign.indexOf(e.entity_id) < 0 &&
        (all || (e.created_at || 0) > since)
      );
    })
    .sort(function (a, b) {
      return (b.created_at || 0) - (a.created_at || 0);
    });
}

function newDevBadge() {
  var g = document.getElementById("gbtn");
  if (g) g.classList.toggle("badge", ISADMIN && !!REG && newDevs(false).length > 0);
}

function newDevBoot() {
  if (!ISADMIN) return;
  var tries = 0;
  (function wait() {
    if (!STORE_READY) {
      if (++tries < 120) setTimeout(wait, 1000);
      return;
    }
    regLoad(true).then(function () {
      /* First run: everything that exists now counts as already seen. */
      if (!UI.newSince) {
        UI.newSince = Math.floor(Date.now() / 1000);
        uiChanged();
      }
      newDevBadge();
      batsAutoAdd();
      notifyReconcileSoon();
    });
  })();
  setInterval(function () {
    if (!document.hidden)
      regLoad(false).then(function () {
        newDevBadge();
        batsAutoAdd();
      });
  }, 120000);
}

/* A battery sensor that Home Assistant gains after the dashboard was set up is tracked, unless it was taken off the list
   (UI.batsOff remembers those). Sensors from before that point are left to the list as it is. */
function batsAutoAdd() {
  var h = H();
  if (!h || !ISADMIN || !STORE_READY || !REG || !UI.newSince) return;
  var have = {},
    off = UI.batsOff || [],
    added = 0;
  UI.bats.forEach(function (x) {
    have[x[1]] = 1;
  });
  REG.forEach(function (e) {
    var id = e.entity_id;
    if (
      UI.bats.length >= 30 ||
      dom(id) !== "sensor" ||
      !h.states[id] ||
      A(id).device_class !== "battery" ||
      e.disabled_by ||
      e.hidden_by ||
      (e.created_at || 0) <= UI.newSince ||
      have[id] ||
      off.indexOf(id) >= 0
    )
      return;
    UI.bats.push([(A(id).friendly_name || id).replace(/\s*battery\s*$/i, "").slice(0, 40), id]);
    have[id] = 1;
    added++;
  });
  if (added) uiChanged();
}

function roomForEntity(id) {
  var ar = areaIdOf(id);
  if (!ar) return null;
  return (
    UI.rooms.filter(function (r) {
      return r.area === ar;
    })[0] || null
  );
}

function addDevTo(rid, id) {
  var nm = A(id).friendly_name || id,
    kind = DOMKIND[dom(id)],
    d = { id: id, name: nm, icon: defIcon(kind, nm, id), kind: kind };
  if (kind === "media" && d.icon === "tv") d.sub = 1;
  devList(rid).push(d);
  uiChanged();
  toast(_T("added") + nm + "”");
}

function newDevPage(b) {
  var all = false,
    box = mk("div");
  b.appendChild(box);
  function draw() {
    var l = newDevs(all),
      hint = mk("div", "hint");
    hint.textContent = all
      ? _T("every_controllable_device_in_home_as")
      : _T("devices_added_to_home_assistant_sinc");
    box.appendChild(hint);
    if (!l.length)
      box.appendChild(
        pill("check", all ? _T("everything_is_on_the_dashboard") : _T("no_new_devices"), {})
      );
    l.slice(0, 60).forEach(function (e) {
      var id = e.entity_id,
        nm = A(id).friendly_name || id,
        kind = DOMKIND[dom(id)];
      box.appendChild(
        pill(defIcon(kind, nm, id), nm, {
          sub: function () {
            return (areaName(id) ? areaName(id) + " · " : "") + id;
          },
          tap: function () {
            NEWPICK = id;
            showPopup("manage-new1", true);
          },
        })
      );
    });
    box.appendChild(
      pill(
        "search",
        all ? _T("show_only_new_devices") : _T("show_all_devices_not_on_the_dashboar"),
        {
          tap: function () {
            all = !all;
            redrawBox(box, draw);
          },
        }
      )
    );
    if (!all && l.length)
      box.appendChild(
        pill("check", _T("mark_all_as_seen"), {
          sub: function () {
            return _T("they_stay_in_home_assistant_and_in_t");
          },
          tap: function () {
            UI.newSince = Math.floor(Date.now() / 1000);
            uiChanged();
            newDevBadge();
            redrawBox(box, draw);
          },
        })
      );
  }
  regLoad(true).then(function () {
    redrawBox(box, draw);
    newDevBadge();
  });
}

function newDevOne(b) {
  var id = NEWPICK;
  if (!id || !H().states[id]) return;
  var sg = roomForEntity(id);
  b.appendChild(
    entRow(_T("entity"), function () {
      return id;
    })
  );
  b.appendChild(
    entRow(_T("now_3"), function () {
      return entVal(id) || V_(id);
    })
  );
  b.appendChild(sep(_T("add_to_a_room"), "home"));
  (sg
    ? [sg].concat(
        UI.rooms.filter(function (r) {
          return r !== sg;
        })
      )
    : UI.rooms
  ).forEach(function (r) {
    b.appendChild(
      pill(r.icon || "home", r.name, {
        sub: function () {
          return r === sg ? _T("same_area_in_home_assistant") : "";
        },
        tap: function () {
          addDevTo(r.id, id);
          newDevBadge();
          var pk = STACK.pop();
          CURRENT = null;
          showPopup(pk, false);
        },
      })
    );
  });
  b.appendChild(
    pill("close", _T("ignore_this_device"), {
      sub: function () {
        return _T("it_won_t_be_suggested_again");
      },
      tap: function () {
        UI.ignored = (UI.ignored || []).concat([id]);
        uiChanged();
        newDevBadge();
        var pk = STACK.pop();
        CURRENT = null;
        showPopup(pk, false);
      },
    })
  );
}

/* ---- manage home: rooms, devices (admin) ---- */
var KINDLAB = {
  light: _T("light"),
  media: _T("media"),
  climate: _T("climate"),
  fan: _T("fan"),
  switch: _T("switch"),
  vacuum: _T("vacuum"),
  camera: _T("camera"),
  special: _T("other"),
  sensor: _T("sensor_2"),
  number: _T("number"),
  select: _T("choice"),
  button: _T("button"),
  cover: _T("cover"),
  lock: _T("lock_2"),
};

var ROOMICONS = [
  "sofa",
  "bed",
  "bedking",
  "bedsingle",
  "home",
  "tv",
  "cam",
  "ac",
  "lights",
  "plug",
  "fan",
  "printer",
  "moon",
  "drop",
];

var DEVICONS = [
  "light",
  "lamp",
  "floor",
  "ceiling",
  "strip",
  "lights",
  "tv",
  "apple",
  "speaker",
  "media",
  "ac",
  "fan",
  "purifier",
  "vac",
  "cam",
  "printer",
  "plug",
];

var ADDDOMS = [
  [_T("lights"), ["light"]],
  [_T("switches"), ["switch", "input_boolean"]],
  [_T("fans"), ["fan"]],
  [_T("climate"), ["climate"]],
  [_T("media"), ["media_player"]],
  [_T("vacuum"), ["vacuum"]],
  [_T("cameras"), ["camera"]],
  [_T("sensors"), ["sensor", "binary_sensor"]],
  [
    _T("controls"),
    [
      "number",
      "input_number",
      "select",
      "input_select",
      "button",
      "input_button",
      "script",
      "scene",
      "cover",
      "lock",
    ],
  ],
  [_T("helpers"), ["input_text", "input_datetime", "counter", "timer"]],
  [_T("all_entities"), ["*"]],
];

var DOMKIND = {
  light: "light",
  switch: "switch",
  input_boolean: "switch",
  fan: "fan",
  climate: "climate",
  media_player: "media",
  vacuum: "vacuum",
  camera: "camera",
  sensor: "sensor",
  binary_sensor: "sensor",
  counter: "sensor",
  timer: "sensor",
  input_text: "sensor",
  input_datetime: "sensor",
  number: "number",
  input_number: "number",
  select: "select",
  input_select: "select",
  button: "button",
  input_button: "button",
  script: "button",
  scene: "button",
  cover: "cover",
  lock: "lock",
};

function roomById(id) {
  for (var i = 0; i < UI.rooms.length; i++) if (UI.rooms[i].id === id) return UI.rooms[i];
  return null;
}

function devAt(key) {
  var p = key.split(":");
  return devList(p[0])[+p[1]] || null;
}

function devList(rid) {
  if (rid.charAt(0) === "~") {
    var p = rid.split("~"),
      arr = p[1] === "home" ? UI.layout.home : UI.layout.rooms[p[1]] || [];
    for (var i = 0; i < arr.length; i++)
      if (arr[i].id === p[2]) return (arr[i].devs = arr[i].devs || []);
    return [];
  }
  return UI.devs[rid] || [];
}

/* Rebuilding the page empties it, which throws the scroll position back to the top. The position is put back once the new layout has settled. */
var RVIEW = "";

function scrollHold() {
  var m = document.querySelector("main"),
    b = document.getElementById("body"),
    st = m.scrollTop;
  if (!st) return null;
  b.style.minHeight = b.offsetHeight + "px";
  return function () {
    [0, 60, 160].forEach(function (d) {
      setTimeout(function () {
        m.scrollTop = st;
      }, d);
    });
    m.scrollTop = st;
    setTimeout(function () {
      b.style.minHeight = "";
    }, 260);
  };
}

function rerender() {
  var keep = scrollHold();
  stopStreams("page");
  LIVE.length = 0;
  var pc = CUR;
  CUR = LIVE;
  document.getElementById("tt").textContent = TITLES[VIEW] || TITLES.home;
  var b = document.getElementById("body");
  b.innerHTML = "";
  b.appendChild(buildPage(VIEW, LIVE).el);
  CUR = pc;
  if (keep) keep();
}

function uiChanged() {
  if (!ISADMIN) return;
  STORE.ui = UI;
  applyUI();
  buildDock();
  rerender();
  storeChanged();
  notifyReconcileSoon();
}

function redrawBox(box, draw) {
  var prev = CUR;
  SLIVE.length = 0;
  CUR = SLIVE;
  box.innerHTML = "";
  try {
    draw();
  } finally {
    CUR = prev;
  }
  refresh();
}

function textRow(icon, ph, val, onChange, max) {
  var w = mk("div", "sqw pane", svg(icon)),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.maxLength = max || 40;
  inp.placeholder = ph;
  inp.value = val || "";
  inp.addEventListener("change", function () {
    onChange(inp.value.trim());
  });
  w.appendChild(inp);
  return w;
}

function areaName(id) {
  var h = H(),
    e = h.entities && h.entities[id],
    a =
      e &&
      (e.area_id ||
        (e.device_id && h.devices && h.devices[e.device_id]
          ? h.devices[e.device_id].area_id
          : null));
  return a && h.areas && h.areas[a] ? h.areas[a].name : "";
}

function candidates(doms, roomId, q) {
  var h = H(),
    have = pageDevIds(roomId),
    out = [],
    any = doms[0] === "*",
    tk = norm(q || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  Object.keys(h.states).forEach(function (id) {
    if (have[id]) return;
    if (!any && doms.indexOf(Integrations.huesync.isSync(h, id) || Integrations.huesyncbox.isBox(h, id) ? "light" : dom(id)) < 0)
      return;
    var e = h.entities && h.entities[id];
    if (e && (e.entity_category || e.hidden)) return;
    var nm = A(id).friendly_name || id,
      hay = norm(nm + " " + id + " " + areaName(id));
    if (
      !tk.every(function (x) {
        return hay.indexOf(x) >= 0;
      })
    )
      return;
    out.push({ id: id, name: nm, area: areaName(id) });
  });
  out.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  return out;
}

function defIcon(kind, name, id) {
  if (id && (Integrations.huesync.isSync(H(), id) || Integrations.huesyncbox.isBox(H(), id)))
    return "syncring";
  return kind === "sensor"
    ? id
      ? sensorIcon(id)
      : "info"
    : kind === "number" || kind === "select"
      ? "tune"
      : kind === "button"
        ? "play"
        : kind === "cover"
          ? "swap"
          : kind === "lock"
            ? "lock"
            : kind === "light"
              ? "light"
              : kind === "media"
                ? /tv/i.test(name)
                  ? "tv"
                  : "media"
                : kind === "climate"
                  ? "ac"
                  : kind === "fan"
                    ? "fan"
                    : kind === "switch"
                      ? "plug"
                      : kind === "vacuum"
                        ? "vac"
                        : kind === "camera"
                          ? "cam"
                          : "plug";
}

function roomDetails(b, rid) {
  var r = roomById(rid);
  if (!r) return;
  b.appendChild(
    textRow(
      "home",
      _T("room_name"),
      r.name,
      function (v) {
        if (v) {
          r.name = v;
          uiChanged();
        }
      },
      40
    )
  );
  b.appendChild(
    textRow(
      "pin",
      _T("short_name_for_the_bottom_bar"),
      r.short,
      function (v) {
        r.short = v.slice(0, 16);
        uiChanged();
      },
      16
    )
  );
  b.appendChild(
    iconPick(ROOMICONS, r.icon, function (n) {
      r.icon = n;
      uiChanged();
    })
  );
  b.appendChild(sep(_T("room_picture"), "media"));
  {
    var fi = document.createElement("input");
    fi.type = "file";
    fi.accept = "image/*";
    fi.style.display = "none";
    b.appendChild(fi);
    fi.addEventListener("change", function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      toast(_T("processing"));
      resizeImage(f, function (u) {
        if (!u || !imgOk(u)) {
          toast(_T("that_picture_couldn_t_be_used"));
          return;
        }
        r.img = u;
        uiChanged();
        render();
        showPopup("manage-details:" + r.id, false);
      });
    });
    b.appendChild(
      pill("media", r.img ? _T("change_picture") : _T("upload_a_picture"), {
        sub: function () {
          return r.img
            ? _T("shown_behind_this_room_and_on_its_ho")
            : _T("choose_an_image_from_this_device");
        },
        tap: function () {
          fi.click();
        },
      })
    );
    if (r.img)
      b.appendChild(
        pill("trash", _T("remove_picture"), {
          tap: function () {
            r.img = "";
            uiChanged();
            render();
            showPopup("manage-details:" + r.id, false);
          },
        })
      );
    if (!/^data:/.test(r.img || ""))
      b.appendChild(
        textRow(
          "edit",
          _T("or_paste_an_https_or_local_address"),
          r.img || "",
          function (v) {
            if (!v) {
              r.img = "";
              uiChanged();
              return;
            }
            if (!imgOk(v)) {
              toast(_T("use_an_https_or_local_address"));
              return;
            }
            r.img = v;
            uiChanged();
          },
          300
        )
      );
  }
  var areas = H().areas || {},
    names = [_T("none")].concat(
      Object.keys(areas).map(function (k) {
        return areas[k].name;
      })
    );
  var g = mk("div", "grid2");
  g.appendChild(
    selectTile(
      _T("home_assistant_area"),
      function () {
        return names;
      },
      function () {
        return r.area && areas[r.area] ? areas[r.area].name : _T("none");
      },
      function (v) {
        var id = "";
        Object.keys(areas).forEach(function (k) {
          if (areas[k].name === v) id = k;
        });
        r.area = id;
        uiChanged();
      },
      "pin"
    )
  );
  b.appendChild(g);
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(
      pill("lock", _T("hide_room"), {
        on: function () {
          return !!r.hide;
        },
        sub: function () {
          return r.hide ? _T("hidden_from_the_app") : _T("visible");
        },
        tap: function () {
          r.hide = !r.hide;
          uiChanged();
        },
      })
    );
    box.appendChild(
      pill("trash", _T("delete_room"), {
        tap: function () {
          confirmDlg(
            _T("delete") + r.name + _T("from_the_app_the_devices_stay_in_hom"),
            function () {
              UI.rooms = UI.rooms.filter(function (x) {
                return x.id !== rid;
              });
              delete UI.layout.rooms[rid];
              delete UI.stat[rid];
              STORE.scenes = STORE.scenes.filter(function (s) {
                return s.room !== rid;
              });
              STORE.eareas = STORE.eareas.filter(function (a) {
                return a.room !== rid;
              });
              pruneSceneRefs();
              if (VIEW === rid) VIEW = "home";
              uiChanged();
              closeSheet();
              render();
            }
          );
        },
      })
    );
  }
  redrawBox(box, draw);
}

function devManage(b, key) {
  var p = key.split(":"),
    rid = p[0],
    i = +p[1],
    list = devList(rid),
    d = list[i];
  if (!d) return;
  b.appendChild(
    textRow(
      "edit",
      _T("device_name"),
      d.name,
      function (v) {
        if (v) {
          d.name = v;
          uiChanged();
        }
      },
      40
    )
  );
  b.appendChild(
    iconPick(DEVICONS, d.icon, function (n) {
      d.icon = n;
      uiChanged();
    })
  );
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(
      entRow(_T("type"), function () {
        return KINDLAB[d.kind];
      })
    );
    if (d.id)
      box.appendChild(
        entRow(_T("entity"), function () {
          return d.id;
        })
      );
    if (d.kind === "climate" && d.id)
      box.appendChild(
        pill("thermo", _T("thermostat_dial"), {
          on: function () {
            return !!d.dial;
          },
          sub: function () {
            return _T("a_round_dial_instead_of_the_slider_i");
          },
          tap: function () {
            if (d.dial) delete d.dial;
            else d.dial = 1;
            uiChanged();
          },
        })
      );
    if (d.kind === "vacuum" && d.id && vacMapEnt(d.id)) {
      var mp = (d.map = d.map || {}),
        mset = function (k, v) {
          if (v === undefined || v === "") delete mp[k];
          else mp[k] = v;
          if (!Object.keys(mp).length) delete d.map;
          uiChanged();
          redrawBox(box, draw);
        };
      box.appendChild(sep(_T("map"), "target"));
      box.appendChild(
        pill("palette", _T("minimal_map_style"), {
          on: function () {
            return !!mp.m;
          },
          sub: function () {
            return mp.m
              ? _T("the_map_is_drawn_as_outlines_with_so")
              : _T("the_map_is_shown_in_the_colours_it_c");
          },
          tap: function () {
            mset("m", mp.m ? undefined : 1);
          },
        })
      );
      var h1 = mk("div", "hint");
      h1.textContent = _T("room_names");
      box.appendChild(h1);
      box.appendChild(
        seg(
          [
            ["11", _T("small")],
            ["", _T("medium")],
            ["16", _T("large")],
            ["19", _T("extra_large")],
          ],
          mp.ls ? String(mp.ls) : "",
          function (v) {
            mset("ls", v ? +v : undefined);
          }
        )
      );
      if (mp.m) {
        var h2 = mk("div", "hint");
        h2.textContent = _T("room_fill");
        box.appendChild(h2);
        box.appendChild(
          seg(
            [
              ["0", _T("none")],
              ["30", _T("soft")],
              ["", _T("medium")],
              ["130", _T("strong")],
            ],
            mp.fa === undefined ? "" : String(mp.fa),
            function (v) {
              mset("fa", v === "" ? undefined : +v);
            }
          )
        );
        var h3 = mk("div", "hint");
        h3.textContent = _T("fill_colour");
        box.appendChild(h3);
        box.appendChild(
          seg(
            [
              ["", _T("each_room_s_own_colour")],
              ["acc", _T("accent_colour")],
            ],
            mp.fc || "",
            function (v) {
              mset("fc", v);
            }
          )
        );
        var h4 = mk("div", "hint");
        h4.textContent = _T("outline_colour");
        box.appendChild(h4);
        box.appendChild(
          seg(
            [
              ["", _T("text_colour")],
              ["acc", _T("accent_colour")],
              ["room", _T("room_colour")],
            ],
            mp.lc || "",
            function (v) {
              mset("lc", v);
            }
          )
        );
      }
      box.appendChild(
        pill("target", _T("show_the_robot_s_trail"), {
          on: function () {
            return !!mp.tr;
          },
          sub: function () {
            return mp.tr ? _T("the_path_of_the_current_or_last_clea") : _T("no_trail_is_drawn");
          },
          tap: function () {
            mset("tr", mp.tr ? undefined : 1);
          },
        })
      );
      box.appendChild(
        pill("lock", _T("no_go_zones"), {
          on: function () {
            return !!mp.nz;
          },
          sub: function () {
            return mp.nz
              ? _T("the_robot_s_forbidden_areas_and_virt")
              : _T("no_go_zones_are_not_drawn");
          },
          tap: function () {
            mset("nz", mp.nz ? undefined : 1);
          },
        })
      );
      if (mp.tr) {
        var h5 = mk("div", "hint");
        h5.textContent = _T("trail_colour");
        box.appendChild(h5);
        box.appendChild(
          seg(
            [
              ["", _T("accent_colour")],
              ["ink", _T("text_colour")],
            ],
            mp.tc || "",
            function (v) {
              mset("tc", v);
            }
          )
        );
        var h6 = mk("div", "hint");
        h6.textContent = _T("trail_thickness");
        box.appendChild(h6);
        box.appendChild(
          seg(
            [
              ["2", _T("thin")],
              ["", _T("normal")],
              ["5", _T("thick")],
            ],
            mp.tw ? String(mp.tw) : "",
            function (v) {
              mset("tw", v ? +v : undefined);
            }
          )
        );
      }
    }
    if (d.kind === "media" && d.id)
      box.appendChild(
        pill("media", _T("artwork_card"), {
          on: function () {
            return !!d.art;
          },
          sub: function () {
            return _T("a_large_now_playing_card_with_cover__2");
          },
          tap: function () {
            if (d.art) delete d.art;
            else d.art = 1;
            uiChanged();
          },
        })
      );
    if (d.kind === "light" && d.id) {
      if (lightRaw(d.id).color && lightRaw(d.id).white)
        box.appendChild(
          pill("palette", _T("separate_colour_and_white"), {
            on: function () {
              return !!d.split;
            },
            sub: function () {
              return d.split
                ? _T("colour_back_and_white_front_are_sepa")
                : _T("one_set_of_controls_the_light_follow");
            },
            tap: function () {
              if (d.split) delete d.split;
              else d.split = 1;
              uiChanged();
            },
          })
        );
      box.appendChild(sep(_T("light_features"), "light"));
      var ch = mk("div", "hint");
      ch.textContent = _T("hide_controls_this_light_doesn_t_rea");
      box.appendChild(ch);
      [
        ["nb", _T("brightness"), "bright", "bright"],
        ["nw", _T("white_temperature"), "thermo", "white"],
        ["nc", _T("colour"), "palette", "color"],
      ].forEach(function (x) {
        box.appendChild(
          pill(x[2], x[1], {
            on: function () {
              return lightCaps(d.id)[x[3]];
            },
            sub: function () {
              var raw = lightRaw(d.id)[x[3]],
                on = !(UI.caps && UI.caps[d.id] && UI.caps[d.id][x[0]]);
              return (
                (raw ? _T("reported_by_the_device") : _T("not_reported_by_the_device")) +
                " · " +
                (raw && on ? _T("shown") : _T("hidden"))
              );
            },
            tap: function () {
              if (!lightRaw(d.id)[x[3]]) {
                toast(_T("the_device_doesn_t_report_this_so_it"));
                return;
              }
              UI.caps = UI.caps || {};
              var o = (UI.caps[d.id] = UI.caps[d.id] || {});
              if (o[x[0]]) delete o[x[0]];
              else o[x[0]] = 1;
              if (!Object.keys(o).length) delete UI.caps[d.id];
              uiChanged();
              refresh();
            },
          })
        );
      });
      box.appendChild(sep(_T("when_turned_on_from_the_app"), "power"));
      var dh = mk("div", "hint");
      dh.textContent = _T("used_when_someone_taps_this_light_on");
      box.appendChild(dh);
      var lo = function () {
          return (UI.on && UI.on[d.id]) || {};
        },
        setOn = function (k, v) {
          UI.on = UI.on || {};
          var o = (UI.on[d.id] = UI.on[d.id] || {});
          if (v === null) delete o[k];
          else o[k] = v;
          if (!Object.keys(o).length) delete UI.on[d.id];
          uiChanged();
          redrawBox(box, draw);
        };
      if (lightCaps(d.id).bright)
        box.appendChild(
          seg(
            [
              ["", _T("last_used")],
              ["25", "25%"],
              ["50", "50%"],
              ["75", "75%"],
              ["100", "100%"],
            ],
            lo().b ? String(lo().b) : "",
            function (v) {
              setOn("b", v ? +v : null);
            }
          )
        );
      if (lightCaps(d.id).white) {
        var ak = A(d.id),
          kmin = ak.min_color_temp_kelvin || 2000,
          kmax = ak.max_color_temp_kelvin || 6500;
        box.appendChild(
          seg(
            [
              ["", _T("last_used")],
              ["2400", _T("warm")],
              ["3500", _T("neutral")],
              ["5000", _T("cool")],
            ],
            lo().k && [2400, 3500, 5000].indexOf(lo().k) >= 0 ? String(lo().k) : lo().k ? "x" : "",
            function (v) {
              setOn("k", v ? +v : null);
            }
          )
        );
        box.appendChild(
          numRow(
            "palette",
            _T("exact_colour_in_kelvin") + " (" + kmin + "–" + kmax + ")",
            lo().k || null,
            function (v) {
              setOn("k", v === null ? null : Math.round(Math.max(kmin, Math.min(kmax, v))));
            },
            2000,
            6500
          )
        );
      }
    }
    if (devSetupKind(d))
      box.appendChild(
        pill("tune", _T("set_up_this_device"), {
          sub: function () {
            return (d.links || []).length ? _T("linked_entities") + ": " + d.links.length : _T("nothing_linked_yet");
          },
          tap: function () {
            showPopup("kwiz:" + key, true);
          },
        })
      );
    box.appendChild(
      pill("swap", _T("move_to_another_section"), {
        tap: function () {
          showPopup("manage-move:" + key, true);
        },
      })
    );
    if (d.id && advList(d.id).length)
      box.appendChild(
        pill("tune", _T("advanced_settings_button"), {
          on: function () {
            return !d.noadv;
          },
          sub: function () {
            return d.noadv ? _T("hidden") : _T("shown_at_the_bottom_of_its_popup");
          },
          tap: function () {
            if (d.noadv) delete d.noadv;
            else d.noadv = 1;
            uiChanged();
          },
        })
      );
    if (d.kind === "lock")
      box.appendChild(
        pill("right", _T("unlock_with_a_slider"), {
          on: function () {
            return !d.noslide;
          },
          sub: function () {
            return d.noslide ? _T("asks_with_confirm") : _T("asks_with_a_slider");
          },
          tap: function () {
            if (d.noslide) delete d.noslide;
            else d.noslide = 1;
            uiChanged();
          },
        })
      );
    box.appendChild(
      pill("lock", _T("hide_in_the_app"), {
        on: function () {
          return !!d.hide;
        },
        sub: function () {
          return d.hide ? _T("hidden") : _T("visible");
        },
        tap: function () {
          d.hide = d.hide ? 0 : 1;
          if (!d.hide) delete d.hide;
          uiChanged();
        },
      })
    );
    box.appendChild(
      pill("trash", _T("remove_from_the_room"), {
        tap: function () {
          confirmDlg(
            _T("remove") + d.name + _T("from_this_room_it_stays_in_home_assi"),
            function () {
              list.splice(i, 1);
              uiChanged();
              popBack();
            }
          );
        },
      })
    );
  }
  redrawBox(box, draw);
}

function devMove(b, key) {
  var p = key.split(":"),
    rid = p[0],
    i = +p[1],
    list = devList(rid),
    d = list[i];
  if (!d) return;
  b.appendChild(mkHint(_T("choose_the_section_it_moves_to")));
  [["home", TITLES.home || _T("home")]]
    .concat(
      UI.rooms.map(function (r) {
        return [r.id, r.name];
      })
    )
    .forEach(function (pg) {
      var sc = pg[0] === "home" ? "home" : "room:" + pg[0],
        secs = secOrder(sc).filter(function (s) {
          return (SECTYPES[s.k] || {}).own && "~" + pg[0] + "~" + s.id !== rid;
        });
      if (!secs.length) return;
      b.appendChild(sep(pg[1], pg[0] === "home" ? "home" : (roomById(pg[0]) || {}).icon || "home"));
      secs.forEach(function (s) {
        b.appendChild(
          pill(secIcon(s), secName(s), {
            sub: function () {
              return cntS((s.devs || []).length, _T("device_2"), _T("devices"));
            },
            tap: function () {
              list.splice(i, 1);
              (s.devs = s.devs || []).push(d);
              uiChanged();
              toast(_T("moved_to_2") + " " + secName(s));
              STACK = [];
              CURRENT = null;
              closeSheet();
            },
          })
        );
      });
    });
}

function devAdd(b, rid) {
  var pre = ADDPRE;
  ADDPRE = null;
  var st = { dom: ADDPRE_IX[pre] || 0, q: "" },
    chips = mk("div", "pre"),
    inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search")),
    box = mk("div");
  inp.type = "text";
  inp.placeholder = _T("search_devices");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  w.appendChild(inp);
  function drawChips() {
    chips.innerHTML = "";
    ADDDOMS.forEach(function (x, i) {
      var c = mk("div", "rbtn pane keepc" + (i === st.dom ? " act" : ""));
      c.textContent = x[0];
      c.addEventListener("click", function () {
        st.dom = i;
        drawChips();
        list();
      });
      chips.appendChild(c);
    });
  }
  function list() {
    redrawBox(box, function () {
      var items = candidates(ADDDOMS[st.dom][1], rid, st.q),
        shown = items.slice(0, 40);
      if (!items.length)
        box.appendChild(
          pill("info", _T("nothing_to_add_here"), {
            sub: function () {
              return _T("everything_of_this_type_is_already_i");
            },
          })
        );
      shown.forEach(function (c) {
        var kind = DOMKIND[dom(c.id)] || "sensor";
        box.appendChild(
          pill(defIcon(kind, c.name, c.id), c.name, {
            sub: function () {
              return (c.area ? c.area + " · " : "") + c.id;
            },
            tap: function () {
              var d = { id: c.id, name: c.name, icon: defIcon(kind, c.name, c.id), kind: kind };
              if (kind === "media" && d.icon === "tv") d.sub = 1;
              devList(rid).push(d);
              /* A TV or a camera has other entities that belong to it: link what is found, and offer the setup page. */
              var setupKind = devSetupKind(d),
                found = setupKind ? kAuto(d) : 0;
              uiChanged();
              toast(_T("added") + c.name + "”");
              if (setupKind && (found || devSetupAlways(setupKind))) showPopup("kwiz:" + rid + ":" + (devList(rid).length - 1), true);
              else list();
            },
          })
        );
      });
      if (items.length > shown.length) {
        var m = mk("div", "hint");
        m.textContent = items.length - shown.length + _T("more_type_to_narrow_the_list");
        box.appendChild(m);
      }
    });
  }
  inp.addEventListener("input", function () {
    st.q = inp.value;
    list();
  });
  b.appendChild(w);
  b.appendChild(chips);
  b.appendChild(box);
  drawChips();
  list();
}

/* groups: created as Home Assistant "Group" helpers, removed again when deleted here */
function viewFor(key) {
  return key !== "home" && UIROOM[key]
    ? function (b) {
        roomView(b, key);
      }
    : homeView;
}
