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
        return hdrClockShown(m);
      },
      sub: function () {
        return hdrClockShown(m) ? _T("shown_in_the_header") : _T("hidden");
      },
      tap: function () {
        m.clock = !hdrClockShown(m);
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
  var zones = zoneLightIds(h.states, h.entities);
  return (REG || [])
    .filter(function (e) {
      return (
        NEWDOMS.test(e.entity_id) &&
        !zones[e.entity_id] &&
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
      roomOffReconcileSoon();
    });
  })();
  setInterval(function () {
    if (!document.hidden)
      regLoad(false).then(function () {
        newDevBadge();
        batsAutoAdd();
        /* What a notification rule watches follows the devices, the batteries and the remotes Home Assistant has now; this reads each automation and writes only one that differs. */
        notifyReconcileSoon();
      });
  }, 120000);
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
  toast(_T("added", { x: nm }));
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
    /* Devices Home Assistant has put in no room come first, under their own heading: a room is chosen for them here, and only the dashboard is changed. */
    var homeless = l.filter(function (e) {
        return !areaName(e.entity_id);
      }),
      placed = l.filter(function (e) {
        return !!areaName(e.entity_id);
      });
    if (homeless.length && placed.length) box.appendChild(sep(_T("no_room_in_home_assistant"), "home"));
    homeless.concat(placed).slice(0, 60).forEach(function (e, n) {
      var id = e.entity_id,
        nm = A(id).friendly_name || id,
        kind = DOMKIND[dom(id)];
      if (n === homeless.length && homeless.length && placed.length) box.appendChild(sep(_T("in_a_room_in_home_assistant"), "home"));
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
  if (!sg && !areaName(id)) {
    b.appendChild(hintRow(_T("this_device_is_in_no_room_in_home_assistant_choose")));
  }
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
        kind: "other",
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
  remote: _T("remote"),
  appliance: _T("ap_appliance"),
  sensor: _T("sensor_2"),
  number: _T("number"),
  select: _T("choice"),
  button: _T("button"),
  cover: _T("cover"),
  lock: _T("lock_2"),
  scene: _T("scene_kind"),
  cscene: _T("scene_kind"),
  scenes: _T("scene_collection"),
  widget: _T("widget"),
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
      "cover",
      "lock",
    ],
  ],
  [_T("scenes"), ["scene"]],
  [_T("helpers"), ["input_text", "input_datetime", "counter", "timer"]],
  [_T("more_devices"), ["humidifier", "water_heater", "alarm_control_panel", "valve", "lawn_mower", "siren", "update", "automation", "weather", "event", "person", "device_tracker", "notify", "text", "date", "time", "datetime", "group", "remote"]],
  [_T("all_entities"), ["*"]],
  [_T("remote"), ["__remote"]],
  [_T("ap_appliance"), ["__appliance"]],
  [_T("widgets"), ["__widget"]],
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
  input_text: "entity",
  input_datetime: "sensor",
  number: "number",
  input_number: "number",
  select: "select",
  input_select: "select",
  button: "button",
  input_button: "button",
  script: "button",
  scene: "scene",
  cover: "cover",
  lock: "lock",
  humidifier: "entity",
  water_heater: "entity",
  alarm_control_panel: "entity",
  valve: "entity",
  lawn_mower: "entity",
  siren: "entity",
  update: "entity",
  automation: "entity",
  text: "entity",
  date: "entity",
  time: "entity",
  datetime: "entity",
  notify: "entity",
  weather: "entity",
  event: "entity",
  person: "entity",
  device_tracker: "entity",
  group: "entity",
  remote: "entity",
};

/* A room by its id. "room.section" is the room as one of its scenes sections shows it: the room with that section (`sec`, which has its own hidden scenes and its own source of scenes). */
function roomById(id) {
  var at = String(id).split("."),
    room = null;
  for (var i = 0; i < UI.rooms.length; i++) if (UI.rooms[i].id === at[0]) room = UI.rooms[i];
  if (!room || at.length < 2) return room;
  var sec = ((UI.layout.rooms || {})[room.id] || []).filter(function (x) {
    return x.id === at[1];
  })[0];
  return sec ? sceneSectionRoom(room, sec) : null;
}

function devAt(key) {
  var p = key.split(":");
  return devList(p[0])[+p[1]] || null;
}

/* The section a "~page~section" list id names. */
function sectionOfList(rid) {
  var p = rid.split("~");
  /* also a lights master that a section holds (its lights are devices of its own) */
  return p[1] === "home" || UI.layout.rooms[p[1]] ? secById(p[1], p[2]) : null;
}

function devList(rid) {
  if (rid.charAt(0) === "~") {
    var s = sectionOfList(rid);
    if (!s) return [];
    /* "~page~section~ml" is the lights chosen for the section's lights master (they are devices too: the same popup edits them). */
    if (rid.split("~")[3] === "ml") return (s.ml = s.ml || []);
    /* "~page~section~lx" holds lights of the master that no list has, kept so their settings open from the master. */
    if (rid.split("~")[3] === "lx") return (s.lx = s.lx || []);
    return (s.devs = s.devs || []);
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
  roomOffReconcileSoon();
}

/* Changes what a box shows with a slide: its height moves to the new content's and the content comes in, so a popup's tabs do not jump. */
function swapContent(box, draw) {
  var h0 = box.offsetHeight;
  box.style.overflow = "hidden";
  box.style.height = h0 + "px";
  redrawBox(box, draw);
  var h1 = box.scrollHeight;
  box.classList.remove("tabin");
  void box.offsetWidth;
  box.classList.add("tabin");
  requestAnimationFrame(function () {
    box.style.transition = "height .26s cubic-bezier(.2,.9,.3,1)";
    box.style.height = h1 + "px";
  });
  setTimeout(function () {
    box.style.transition = "";
    box.style.height = "";
    box.style.overflow = "";
  }, 300);
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

/* A light that stands for other lights: a group made in Home Assistant (it lists its lights), or a Hue room or zone (which lists Hue lights and may list no entities). */
function isLightGroup(id) {
  var a = A(id);
  return dom(id) === "light" && (pluginIsGroup(id) || (Array.isArray(a.entity_id) && a.entity_id.length > 0));
}

function candidates(doms, roomId, q, areaId) {
  var h = H(),
    have = pageDevIds(roomId),
    zones = zoneLightIds(h.states, h.entities),
    out = [],
    any = doms[0] === "*",
    tk = norm(q || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  Object.keys(h.states).forEach(function (id) {
    /* A zone of a light is controlled from the popup of that light, so it is not offered as a light of its own. */
    if (have[id] || isVacuumMap(id) || zones[id]) return;
    if (!any && doms.indexOf(pluginDeviceKind(id) ? pluginDeviceKind(id).search : dom(id)) < 0)
      return;
    var e = h.entities && h.entities[id];
    if (e && (e.entity_category || e.hidden)) return;
    if (areaId && areaIdOf(id) !== areaId) return;
    var nm = A(id).friendly_name || id,
      hay = norm(nm + " " + id + " " + areaName(id));
    if (
      !tk.every(function (x) {
        return hay.indexOf(x) >= 0;
      })
    )
      return;
    out.push({ id: id, name: nm, area: areaName(id), group: isLightGroup(id) });
  });
  out.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  return out;
}

function defIcon(kind, name, id) {
  if (id && pluginDeviceKind(id)) return pluginDeviceKind(id).icon;
  if (kind === "entity" && id && domKnown(id)) return DOMAINS[dom(id)].icon;
  return kind === "sensor"
    ? id
      ? sensorIcon(id)
      : "info"
    : kind === "number" || kind === "select"
      ? "tune"
      : kind === "scene"
        ? "scene"
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
  stgIdentity(
    b,
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
    ),
    iconPick(ROOMICONS, r.icon, function (n) {
      r.icon = n;
      uiChanged();
    }),
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
  b.appendChild(sep(_T("room_area_block"), "pin"));
  var areas = H().areas || {},
    names = [_T("none")].concat(
      Object.keys(areas).map(function (k) {
        return areas[k].name;
      })
    );
  var g = mk("div", "ap-grid");
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
    var pics = [
      pill("media", r.img ? _T("change_picture") : _T("upload_a_picture"), {
        sub: function () {
          return r.img
            ? _T("shown_behind_this_room_and_on_its_ho")
            : _T("choose_an_image_from_this_device");
        },
        tap: function () {
          fi.click();
        },
      }),
    ];
    if (r.img) {
      var rmPic = pill("trash", _T("remove_picture"), {
        tap: function () {
          r.img = "";
          uiChanged();
          render();
          showPopup("manage-details:" + r.id, false);
        },
      });
      pics.push(rmPic);
      stgActions(b, pics, [rmPic]);
    } else stgActions(b, pics);
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
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(sep(_T("dp_in_the_app"), "home"));
    box.appendChild(
      visiblePill(
        function () {
          return !r.hide;
        },
        function () {
          r.hide = !r.hide;
          uiChanged();
        }
      )
    );
    var delRoom = pill("trash", _T("delete_room"), {
        tap: function () {
          confirmDlg(
            _T("delete_room_q", { x: r.name }),
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
      });
    stgActions(box, [delRoom], [delRoom]);
  }
  redrawBox(box, draw);
}

/* The tab last used in a device popup, by kind of device, for as long as the page is open. */

/* A few icons that fit the kind of device (and its name), shown before the whole list: a tap sets one. */
var KINDICONS = {
  light: ["light", "lamp", "floor", "ceiling", "strip", "bed", "lights"],
  switch: ["plug", "power", "light", "fan", "printer"],
  fan: ["fan", "purifier"],
  climate: ["ac", "thermo", "fan"],
  media: ["tv", "speaker", "media", "apple"],
  vacuum: ["vac", "broom"],
  camera: ["cam", "cctv", "camoff"],
  lock: ["lock", "padlock"],
  appliance: ["plug", "drop", "power"],
  remote: ["media", "tv", "play", "power"],
  sensor: ["thermo", "drop", "motion", "walk", "battery"],
  number: ["tune", "bright", "volup"],
  select: ["tune", "apps", "media"],
  button: ["play", "power", "restart"],
  cover: ["swap", "up", "down"],
};

/* The device as it will look on the page: the top of every popup that edits one, so a change to its name or icon is seen at once. It cannot be tapped. */
function devPreview(d) {
  var box = mk("div", "dprev"),
    row = pill(d.icon || "plug", d.name, {
      sub: function () {
        return (KINDLAB[d.kind] || "") + (d.id ? " · " + (V_(d.id) ? entVal(d.id) : d.id) : "");
      },
    });
  box.setAttribute("aria-hidden", "true");
  box.appendChild(row);
  if (row.refresh) row.refresh();
  return box;
}

function iconSuggestions(d) {
  var list = (KINDICONS[d.kind] || []).slice();
  if (d.icon && list.indexOf(d.icon) < 0 && iconOk(d.icon)) list.unshift(d.icon);
  return list.filter(function (n) {
    return iconOk(n);
  }).slice(0, 8);
}

/* The settings popup of a device on a page, one page in blocks: the device as it will look, who it is (devIdentity), how it is drawn (devLookOptions), what belongs to its kind (devBehaviourTab), where it sits (devPlaceRows). Every change is made at once (with Undo). Each builder is given a context `c`: { d: the device, key, list: the list it is in, i: its place, box: where it builds, redraw(): draws the page again, preview(): draws the device on top again }. */
function devManage(b, key) {
  var p = key.split(":"),
    list = devList(p[0]),
    d = list[+p[1]];
  if (!d) return;
  var previewBox = mk("div"),
    box = mk("div"),
    c = {
      d: d,
      key: key,
      list: list,
      i: +p[1],
      box: box,
      redraw: function () {
        redrawBox(box, draw);
      },
      preview: function () {
        previewBox.innerHTML = "";
        previewBox.appendChild(devPreview(d));
      },
    };
  b.appendChild(previewBox);
  b.appendChild(box);
  /* One page, in blocks that each say what they are for: who it is (name and icon, side by side), how it is drawn, what belongs to the kind of device, where it sits in the section, what it is. */
  function draw() {
    devIdentity(c);
    devLookOptions(c);
    var own = mk("div"),
      real = c.box;
    c.box = own;
    devBehaviourTab(c);
    c.box = real;
    /* A kind that opens with a heading of its own (Light features, Intercom, Where the scenes come from) needs no general one above it. */
    if (own.children.length) {
      if (own.firstChild.className !== "sep") real.appendChild(sep(_T("dp_settings"), "tune"));
      while (own.firstChild) real.appendChild(own.firstChild);
    }
    devPlaceRows(c);
  }
  c.preview();
  c.redraw();
}

/* Who it is: the name and the icon, side by side like the other pairs of choices. */
function devIdentity(c) {
  var d = c.d;
  function rename(v) {
    d.name = v;
    uiChanged();
    c.preview();
    c.redraw();
  }
  var grid = mk("div", "ap-grid");
  grid.appendChild(textRow("edit", _T("device_name"), d.name, function (v) { if (v) rename(v); }, 40));
  grid.appendChild(
    iconPick(DEVICONS, d.icon, function (n) {
      d.icon = n;
      uiChanged();
      c.preview();
    }, iconSuggestions(d))
  );
  c.box.appendChild(grid);
}

/* How it is drawn, for the kinds that have a choice; a block only when there is one. */
function devLookOptions(c) {
  var d = c.d,
    real = c.box,
    own = mk("div");
  c.box = own;
  if (d.kind === "climate" && d.id)
    own.appendChild(flagPill("thermo", _T("thermostat_dial"), d, "dial", function () { return _T("a_round_dial_instead_of_the_slider_i"); }));
  if (d.kind === "vacuum" && d.id && vacMapEnt(d.id)) devVacuumMapOptions(c);
  if (d.kind === "media" && d.id) devMediaOptions(c);
  if (d.kind === "media" && d.id && mediaRemoteKind(d.id)) c.box.appendChild(rbxPill(d.id));
  if (d.kind !== "widget")
    c.box.appendChild(
      pill("palette", _T("customize"), {
        sub: function () {
          return _T("customize_sub");
        },
        tap: function () {
          showPopup("cust:" + c.key, true);
        },
      })
    );
  c.box = real;
  sizeSettings(own, d, c.redraw);
  if (!own.children.length) return;
  real.appendChild(sep(_T("dp_how_it_looks"), "palette"));
  while (own.firstChild) real.appendChild(own.firstChild);
}

/* Behaviour: what belongs to the kind of device (its own settings, its set-up), whether it is shown, where it is, and what it is. */
function devBehaviourTab(c) {
  var d = c.d,
    box = c.box;
  if (d.kind === "scenes") sceneCollectionSettings(box, d);
  if (d.kind === "widget") widgetSettings(c);
  if (d.kind === "cscene") {
    var made = sceneById(d.sid);
    if (made)
      box.appendChild(
        pill("edit", _T("edit_scene"), {
          sub: function () {
            return made.name;
          },
          tap: function () {
            if (made.auto) autoSceneEdit(made);
            else if (made.live) liveMakerEdit(made);
            else staticOpen(made.room, made);
          },
        })
      );
  }
  if (DEVTYPES[d.kind] && d.id)
    box.appendChild(
      dropRow(
        _T("dp_device_type"),
        DEVTYPES[d.kind],
        function () {
          return d.dt || guessDevType(d);
        },
        function (v) {
          d.dt = v;
          uiChanged();
          c.redraw();
        },
        "tune",
        function (v) {
          return _T("dt_" + v);
        }
      )
    );
  profileSettings(box, d, c.key);
  if (d.kind === "appliance")
    box.appendChild(
      pill("tune", _T("set_up_this_device"), {
        sub: function () {
          return _T("kit_appliance_sub");
        },
        tap: function () {
          showPopup("ap-edit:" + d.aid, true);
        },
      })
    );
  if (d.kind === "remote")
    box.appendChild(
      pill("tune", _T("rm_buttons"), {
        sub: function () {
          return cntS(d.rm.btns.length + ((d.rm.img && d.rm.img.hs.length) || 0), _T("rm_button_lc"), _T("rm_buttons_lc"));
        },
        tap: function () {
          showPopup("remote-build:" + d.rid, true);
        },
      })
    );
  if (d.kind === "light" && d.id && lgMembers(d.id).length)
    box.appendChild(
      pill("lights", _T("lg_group_settings"), {
        sub: function () {
          return cntS(lgMembers(d.id).length, _T("light"), _T("lights"));
        },
        tap: function () {
          showPopup("lgroup:" + d.id, true);
        },
      })
    );
  if (d.kind === "light" && d.id) devLightOptions(c);
  if (devSetupKind(d))
    box.appendChild(
      pill("tune", _T("set_up_this_device"), {
        sub: function () {
          return (d.links || []).length ? _T("linked_entities") + ": " + d.links.length : _T("nothing_linked_yet");
        },
        tap: function () {
          showPopup("kwiz:" + c.key, true);
        },
      })
    );
  if (d.kind === "lock")
    box.appendChild(
      flagPill("right", _T("unlock_with_a_slider"), d, "noslide", function (on) {
        return on ? _T("asks_with_a_slider") : _T("asks_with_confirm");
      }, true)
    );
}

/* How a vacuum's map is drawn. The choices are kept in d.map and the key is dropped when it is back to its default. */
function devVacuumMapOptions(c) {
  /* also a robot vacuum appliance's map: its `d` keeps the same settings */
  var d = c.d,
    box = c.box,
    mp = (d.map = d.map || {});
  function mset(k, v) {
    if (v === undefined || v === "") delete mp[k];
    else mp[k] = v;
    if (!Object.keys(mp).length) delete d.map;
    uiChanged();
    c.redraw();
  }
  function flag(icon, title, key, subOn, subOff) {
    return pill(icon, title, {
      on: function () {
        return !!mp[key];
      },
      sub: function () {
        return mp[key] ? subOn : subOff;
      },
      tap: function () {
        mset(key, mp[key] ? undefined : 1);
      },
    });
  }
  box.appendChild(sep(_T("map"), "target"));
  box.appendChild(flag("palette", _T("minimal_map_style"), "m", _T("the_map_is_drawn_as_outlines_with_so"), _T("the_map_is_shown_in_the_colours_it_c")));
  segField(box, _T("room_names"), [["11", _T("small")], ["", _T("medium")], ["16", _T("large")], ["19", _T("extra_large")]], mp.ls ? String(mp.ls) : "", function (v) {
    mset("ls", v ? +v : undefined);
  });
  box.appendChild(flag("target", _T("show_the_robot_s_trail"), "tr", _T("the_path_of_the_current_or_last_clea"), _T("no_trail_is_drawn")));
  /* The rest of how the map is drawn is under one row, so the map has three settings to begin with. */
  var open = c.mapMore === true;
  box.appendChild(
    pill("tune", _T("advanced_map_style"), {
      sub: function () {
        return open ? _T("on_cap") : _T("off");
      },
      on: function () {
        return open;
      },
      tap: function () {
        c.mapMore = !open;
        c.redraw();
      },
    })
  );
  if (!open) return;
  if (mp.m) {
    segField(box, _T("room_fill"), [["0", _T("none")], ["30", _T("soft")], ["", _T("medium")], ["130", _T("strong")]], mp.fa === undefined ? "" : String(mp.fa), function (v) {
      mset("fa", v === "" ? undefined : +v);
    });
    segField(box, _T("fill_colour"), [["", _T("each_room_s_own_colour")], ["acc", _T("accent_colour")]], mp.fc || "", function (v) {
      mset("fc", v);
    });
    segField(box, _T("outline_colour"), [["", _T("text_colour")], ["acc", _T("accent_colour")], ["room", _T("room_colour")]], mp.lc || "", function (v) {
      mset("lc", v);
    });
  }
  box.appendChild(flag("lock", _T("no_go_zones"), "nz", _T("the_robot_s_forbidden_areas_and_virt"), _T("no_go_zones_are_not_drawn")));
  if (mp.tr) {
    segField(box, _T("trail_colour"), [["", _T("accent_colour")], ["ink", _T("text_colour")]], mp.tc || "", function (v) {
      mset("tc", v);
    });
    segField(box, _T("trail_thickness"), [["2", _T("thin")], ["", _T("normal")], ["5", _T("thick")]], mp.tw ? String(mp.tw) : "", function (v) {
      mset("tw", v ? +v : undefined);
    });
  }
}

/* What a media player's card on the page shows while something plays. */
function devMediaOptions(c) {
  var d = c.d;
  c.box.appendChild(
    dropRow(
      _T("now_playing"),
      ["off", "on", "art"],
      function () {
        return d.art ? "art" : d.nonp ? "off" : "on";
      },
      function (v) {
        delete d.art;
        delete d.nonp;
        if (v === "art") d.art = 1;
        else if (v === "off") d.nonp = 1;
        uiChanged();
      },
      "media",
      function (v) {
        return { off: _T("off"), on: _T("on_2"), art: _T("artwork_card") }[v];
      }
    )
  );
}

/* A light's own settings: which controls it shows, and what it does when it is turned on from the app. */
function devLightOptions(c) {
  var d = c.d,
    box = c.box;
  box.appendChild(sep(_T("light_features"), "light"));
  box.appendChild(hintRow(_T("hide_controls_this_light_doesn_t_rea")));
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
          return (raw ? _T("reported_by_the_device") : _T("not_reported_by_the_device")) + " · " + (raw && on ? _T("shown") : _T("hidden"));
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
  box.appendChild(hintRow(_T("used_when_someone_taps_this_light_on")));
  var onSet = (UI.on && UI.on[d.id]) || {},
    custom = !!(onSet.c || onSet.b || onSet.k);
  box.appendChild(
    seg([["last", _T("last_used")], ["custom", _T("custom")]], custom ? "custom" : "last", function (v) {
      if (v === "last") {
        if (UI.on) delete UI.on[d.id];
        uiChanged();
        c.redraw();
      } else lightOnCustom(d, c.redraw);
    })
  );
  if (custom) box.appendChild(hintRow(_T("saved_turn_on_state") + ": " + lightDefaultText(d.id)));
}

/* A device's own Advanced settings switch. A device with an entity is switched on every page it is on, so the answer is the same wherever it is asked. */
function advDevicePill(d) {
  function off() {
    return d.id ? advDevOff(d.id) : !!d.noadv;
  }
  return pill("tune", _T("advanced_settings_button"), {
    on: function () {
      return !advAllOff() && !off();
    },
    sub: function () {
      return advAllOff() ? _T("adv_off_dashboard") : off() ? _T("off") : _T("on_cap");
    },
    tap: function () {
      var turnOff = !off();
      (d.id ? [d].concat(advCopies(d.id)) : [d]).forEach(function (c) {
        if (turnOff) c.noadv = 1;
        else delete c.noadv;
      });
      uiChanged();
    },
  });
}

/* Whether it is shown, which section it is in, and taking it off the page; and what it is. A light a lights master keeps (not a device of a section) has none of the first three. */
function devPlaceRows(c) {
  var d = c.d,
    held = c.key.split(":")[0].split("~")[3] === "lx",
    /* a robot vacuum appliance's Advanced settings are its vacuum's */
    advOf = d.id || (d.kind === "appliance" && d.ap && d.ap.type === "vacuum" && d.ap.slots.vacuum) || "",
    adv = advOf && advList(advOf).length;
  if (!held || adv) c.box.appendChild(sep(_T("dp_in_the_section"), "home"));
  /* Showing and the Advanced button are two switches, side by side. */
  var sw = mk("div", "ap-grid");
  if (!held)
    sw.appendChild(
      visiblePill(
        function () {
          return !d.hide;
        },
        function () {
          d.hide = !d.hide;
          uiChanged();
        }
      )
    );
  /* The device's popup ends with the Advanced settings button, unless it is switched off here. */
  if (adv)
    sw.appendChild(advDevicePill(d));
  if (sw.children.length) c.box.appendChild(sw);
  if (!held) {
    var act = mk("div", "ap-grid"),
      rm = pill("trash", _T("remove_from_the_section"), {
        tap: function () {
          confirmDlg(_T("remove_from_section_q", { x: d.name }), function () {
            c.list.splice(c.i, 1);
            uiChanged();
            popBack();
          });
        },
      });
    rm.classList.add("danger");
    act.appendChild(
      pill("swap", _T("move_to_another_section"), {
        tap: function () {
          showPopup("manage-move:" + c.key, true);
        },
      })
    );
    act.appendChild(rm);
    c.box.appendChild(act);
  }
  c.box.appendChild(sep(_T("dp_what_it_is"), "info"));
  c.box.appendChild(entRow(_T("type"), function () { return KINDLAB[d.kind]; }));
  if (d.id) c.box.appendChild(entRow(_T("entity"), function () { return d.id; }));
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
          return !s.of && (SECTYPES[s.k] || {}).own && "~" + pg[0] + "~" + s.id !== rid;
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
              popupFollow(d, pg[0]);
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

function viewFor(key) {
  return key !== "home" && UIROOM[key]
    ? function (b) {
        roomView(b, key);
      }
    : homeView;
}
