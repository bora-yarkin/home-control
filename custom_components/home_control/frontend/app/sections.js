/* Sections: the types a page is made of, how each one is built, linked sections, columns, and the chart section. */

/* Pinned items, quick actions and scenes belong to the section that shows them; a scene is stored once in the library and sections list its id. */
function secById(scope, sid) {
  return (
    secOrder(scopeKey(scope)).filter(function (x) {
      return x.id === sid;
    })[0] || null
  );
}

/* ---- Section types ----
 Every section on a page is one of these types. Nothing is built in: sections are added, changed to another type, reordered and
 deleted from the page editor, and device-owning types hold their own list of widgets. */
var SECTYPES = {
    devs: {
      t: _T("devices_2"),
      i: "plug",
      d: _T("any_mix_of_lights_media_climate_and_"),
      own: 1,
      noun: _T("widget"),
    },
    lights: {
      t: _T("lights"),
      i: "lights",
      d: _T("lights_with_one_button_to_turn_them_"),
      own: 1,
      noun: _T("light_2"),
      add: "lights",
    },
    media: {
      t: _T("media"),
      i: "tv",
      d: _T("tvs_speakers_and_remotes"),
      own: 1,
      noun: _T("media_player"),
      add: "media",
    },
    climate: {
      t: _T("climate"),
      i: "ac",
      d: _T("air_conditioners_and_fans"),
      own: 1,
      noun: _T("climate_device"),
      add: "climate",
    },
    controls: {
      t: _T("controls"),
      i: "tune",
      d: _T("numbers_selects_buttons_scripts_cove"),
      own: 1,
      noun: _T("control"),
      add: "controls",
    },
    sensors: {
      t: _T("sensors"),
      i: "thermo",
      d: _T("sensor_readings_and_states"),
      own: 1,
      noun: _T("sensor"),
      add: "sensors",
    },
    other: {
      t: _T("other_devices"),
      i: "plug",
      d: _T("switches_vacuums_and_anything_else"),
      own: 1,
      noun: _T("device_2"),
      add: "other",
    },
    camera: {
      t: _T("camera"),
      i: "cam",
      d: _T("live_view_with_controls"),
      own: 1,
      wide: 1,
      noun: _T("camera_2"),
      add: "camera",
    },
    read: {
      t: _T("readings"),
      i: "drop",
      d: _T("tiles_with_the_current_value_of_sens"),
      own: 1,
      noun: _T("reading"),
      add: "sensors",
    },
    chart: {
      t: _T("chart"),
      i: "thermo",
      d: _T("history_of_up_to_four_sensors"),
      own: 1,
      noun: _T("sensor"),
      add: "sensors",
    },
    note: { t: _T("note"), i: "info", d: _T("free_text") },
    security: { t: _T("security"), i: "lock", d: _T("locks_alarms_doors_and_windows") },
    energy: { t: _T("energy_and_usage"), i: "plug", d: _T("power_now_and_usage_over_the_week") },
    cameras: { t: _T("cameras"), i: "cam", d: _T("all_cameras_in_one_grid") },
    status: {
      t: _T("status_tiles"),
      i: "thermo",
      d: _T("readings_for_this_page_such_as_tempe"),
      one: 1,
      wide: 1,
    },
    scenes: {
      t: _T("scenes"),
      i: "scene",
      d: _T("scenes_for_this_page"),
      own: 1,
      noun: _T("device_2"),
      add: "controls",
    },
    alerts: {
      t: _T("attention"),
      i: "alert",
      d: _T("things_that_need_attention"),
      one: 1,
      wide: 1,
    },
    chips: {
      t: _T("climate_overview"),
      i: "thermo",
      d: _T("temperature_and_humidity_at_a_glance"),
      one: 1,
      wide: 1,
    },
    quick: {
      t: _T("quick_actions_2"),
      i: "scene",
      d: _T("one_tap_scenes"),
      wide: 1,
      own: 1,
      noun: _T("device_2"),
      add: "controls",
    },
    rooms: { t: _T("rooms"), i: "home", d: _T("links_to_every_page"), one: 1 },
    glance: {
      t: _T("at_a_glance"),
      i: "home",
      d: _T("counts_of_what_is_on_open_or_running"),
      one: 1,
    },
    pinned: { t: _T("pinned"), i: "pin", d: _T("your_favourite_devices"), wide: 1 },
    link: { t: _T("linked_section"), i: "swap", d: _T("shows_a_section_from_another_page") },
  },
  SEC_PICK = [
    "devs",
    "lights",
    "media",
    "climate",
    "controls",
    "sensors",
    "other",
    "camera",
    "read",
    "chart",
    "note",
    "security",
    "energy",
    "cameras",
    "status",
    "scenes",
    "alerts",
    "chips",
    "quick",
    "rooms",
    "glance",
    "pinned",
    "link",
  ],
  /* The sections a new page starts with (also what an old layout is converted from). */
  HOME_TPL = [
    ["alerts", "alerts"],
    ["climate", "chips"],
    ["quick", "quick"],
    ["rooms", "rooms"],
    ["glance", "glance"],
    ["pinned", "pinned"],
  ],
  ROOM_TPL = [
    "status",
    "camera",
    "lights",
    "scenes",
    "media",
    "climate",
    "controls",
    "sensors",
    "other",
  ];

function secName(s) {
  return s.t || (SECTYPES[s.k] || SECTYPES.devs).t;
}

function secIcon(s) {
  return s.i && iconOk(s.i) ? s.i : (SECTYPES[s.k] || SECTYPES.devs).i;
}

function seedSections(scope) {
  return scope === "home"
    ? HOME_TPL.map(function (x) {
        return { id: x[0], k: x[1], hide: false };
      })
    : ROOM_TPL.map(function (id) {
        var o = { id: id, k: id, hide: false };
        if (SECTYPES[id].own) o.devs = [];
        return o;
      });
}

function secOrder(scope) {
  var arr = scope === "home" ? UI.layout.home : UI.layout.rooms[scope.slice(5)];
  if (!arr) {
    arr = seedSections(scope);
    setSecOrder(scope, arr);
  }
  return arr;
}

function setSecOrder(scope, arr) {
  if (scope === "home") UI.layout.home = arr;
  else UI.layout.rooms[scope.slice(5)] = arr;
}

function secOf(d) {
  return (
    {
      light: "lights",
      media: "media",
      climate: "climate",
      fan: "climate",
      switch: "other",
      vacuum: "other",
      special: "other",
      sensor: "sensors",
      number: "controls",
      select: "controls",
      button: "controls",
      cover: "controls",
      lock: "controls",
    }[d.kind] || "other"
  );
}

var COLS = [];

/* Two columns only when the block has two or more sections; a half-width section with no partner spans the row. */
function pageCols(sc) {
  return (UI.layout.cols || {})[sc === "home" ? "home" : sc.slice(5)] || 0;
}

function colCount(h) {
  var w = window.innerWidth,
    pc = h._pc || 0,
    max = w >= 1100 ? 3 : w >= 760 ? 2 : 1,
    n = pc ? Math.min(pc, max) : Math.min(2, max);
  return Math.max(1, Math.min(n, h._items.length));
}

var CURSCOPE = "home";

function scopeKey(s) {
  return s === "home" ? "home" : "room:" + s;
}

function secEntry(id) {
  var arr = CURSCOPE === "home" ? UI.layout.home : UI.layout.rooms[CURSCOPE.slice(5)] || [];
  for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
  return null;
}

function secT(id, def) {
  var e = CURSEC || secEntry(id);
  return e && e.t ? e.t : def;
}

function secI(id, def) {
  var e = CURSEC || secEntry(id);
  return e && e.i && iconOk(e.i) ? e.i : def;
}

function secWide(s, def) {
  return s.w === "full" ? true : s.w === "half" ? false : def;
}

var SECICONS = [
  "lights",
  "tv",
  "ac",
  "fan",
  "plug",
  "thermo",
  "tune",
  "scene",
  "home",
  "cam",
  "speaker",
  "drop",
  "battery",
  "moon",
  "info",
  "clock",
];

var CURSEC = null;

function pageKey() {
  return CURSCOPE === "home" ? "home" : CURSCOPE.slice(5);
}

/* Builds one section of the page from its type. */
function secBuildEl(s) {
  var k = s.k || "devs",
    pk = pageKey();
  if (k === "link") return linkSection(s);
  if (k === "alerts") return alertsBox();
  if (k === "chips") return homeStatus();
  if (k === "quick" || (k === "scenes" && pk === "home")) return quickActions();
  if (k === "rooms") return secRooms();
  if (k === "glance") return secGlance();
  if (k === "pinned") return pinsSection();
  if (k === "status") return roomStatus(pk);
  if (k === "scenes") return scenesSection(pk, lightingScenesExtra(pk));
  return customSection(s);
}

/* A linked section shows another page's section, so one section is edited once and appears wherever it is linked. */
function secKindOf(s) {
  if (s.k === "link" && s.ref) {
    var q = s.ref.split(":"),
      r = secById(q[0], q[1]);
    if (r && r.k !== "link") return r.k;
  }
  return s.k;
}

function linkSection(s) {
  var q = (s.ref || "").split(":"),
    src = s.ref ? secById(q[0], q[1]) : null,
    ed = editing(),
    host = secKey();
  if (!src || src.k === "link") {
    return ed
      ? section(secT("link", _T("linked_section")), secI("link", "swap"), [
          pill("swap", _T("choose_a_section_to_show_here"), {
            sub: function () {
              return _T("the_linked_section_is_missing_or_not");
            },
            tap: function () {
              showPopup("sec-link:" + host + ":" + s.id, true);
            },
          }),
        ])
      : null;
  }
  if (!ruleOk(src) && !ed) return null;
  var pc = CURSCOPE,
    pe = CURSEC;
  CURSCOPE = scopeKey(q[0]);
  CURSEC = src;
  try {
    return secBuildEl(src);
  } finally {
    CURSCOPE = pc;
    CURSEC = pe;
  }
}

function secLinkPage(b, key) {
  var p = key.split(":"),
    host = p[0],
    e = secById(host, p[1]);
  if (!e) return;
  ["home"]
    .concat(
      UI.rooms.map(function (r) {
        return r.id;
      })
    )
    .forEach(function (pid) {
      if (pid === host) return;
      var list = secOrder(scopeKey(pid)).filter(function (s) {
        return s.k !== "link";
      });
      if (!list.length) return;
      b.appendChild(sep(TITLES[pid] || pid, pid === "home" ? "home" : "bed"));
      list.forEach(function (s) {
        b.appendChild(
          pill(secIcon(s), secName(s), {
            on: function () {
              return e.ref === pid + ":" + s.id;
            },
            sub: function () {
              return (SECTYPES[s.k] || SECTYPES.devs).t;
            },
            tap: function () {
              e.ref = pid + ":" + s.id;
              setSecOrder(scopeKey(host), secOrder(scopeKey(host)));
              uiChanged();
              STACK.pop();
              CURRENT = null;
              showPopup("manage-sec:" + key, false);
            },
          })
        );
      });
    });
}

/* The live updates of one section, kept together so that taking the section out of the page takes them out too. */
function liveOf(el) {
  var f = function () {
    if (el._dead) return;
    runUpdates(el._live, "section update");
  };
  f._el = el;
  return f;
}

function secList(scope) {
  var list = [];
  RULESIG[scope] = ruleSig(scope);
  secOrder(scope).forEach(function (s) {
    if (s.hide && !editing()) return;
    var ok = ruleOk(s);
    if (!ok && !editing()) return;
    CURSEC = s;
    var el,
      mine = [],
      outer = CUR;
    CUR = mine;
    try {
      el = secBuildEl(s);
    } finally {
      CURSEC = null;
      CUR = outer;
    }
    if (!el) return;
    el._live = mine;
    outer.push(liveOf(el));
    if (!ok) ruleMark(el);
    if (s.hide) hideMark(el);
    list.push({ el: el, wide: secWide(s, !!(SECTYPES[secKindOf(s)] || {}).wide), id: s.id });
  });
  return list;
}

function newSecId(l) {
  var id = "c" + Date.now().toString(36).slice(-6);
  while (
    l.some(function (x) {
      return x.id === id;
    })
  )
    id += "x";
  return id;
}

function areaRow(ph, val, onChange, max) {
  var w = mk("div", "sqw pane area"),
    t = document.createElement("textarea");
  t.className = "sq";
  t.rows = 5;
  t.maxLength = max || 600;
  t.placeholder = ph;
  t.value = val || "";
  t.addEventListener("change", function () {
    onChange(t.value);
  });
  w.appendChild(t);
  return w;
}

/* Readings: a tile per entity with its current value. */
function readText(id) {
  var s = V_(id);
  if (s === "unavailable" || s === "unknown" || s === undefined) return "–";
  var n = Number(s);
  if (s !== "" && isFinite(n)) {
    var u = A(id).unit_of_measurement || "";
    return Math.round(n * 10) / 10 + (u ? (/^[%°]/.test(u) ? "" : " ") + u : "");
  }
  return cap(String(s).replace(/_/g, " "));
}

function readTile(d) {
  var t = mk("div", "gb pane", "<b></b><span></span>"),
    b = t.firstChild;
  t.lastChild.textContent = d.name || d.id;
  function up() {
    b.textContent = readText(d.id);
  }
  up();
  reg(up);
  return t;
}

function secKey() {
  return CURSCOPE === "home" ? "home" : CURSCOPE.slice(5);
}

function widgetAddLabel(k) {
  return _T("add") + " " + (SECTYPES[k] || SECTYPES.devs).noun;
}

function widgetAdd(lk, k) {
  var ty = SECTYPES[k] || SECTYPES.devs;
  if (ty.add) ADDPRE = ty.add;
  showPopup("manage-add:" + lk, true);
}

function customSection(s) {
  var k = s.k || "devs";
  if (k === "note") return noteSection(s);
  if (k === "security") return cardSection(s, securityList(), _T("security"), "lock");
  if (k === "energy") return cardSection(s, energyList(s), _T("energy_and_usage"), "plug");
  if (k === "cameras") return cardSection(s, cameraList(), _T("cameras"), "cam");
  if (k === "chart") return chartSection(s);
  if (k === "camera") return cameraSection(s);
  var ed = editing(),
    lk = "~" + secKey() + "~" + s.id,
    src = [],
    rows = [],
    ty = SECTYPES[k] || SECTYPES.devs,
    ttl = s.t || ty.t,
    ico = secIcon(s);
  (s.devs || []).forEach(function (d) {
    if (k === "lights" && d.id) LWHEEL[d.id] = !s.nowheel;
    if (!ed && (d.hide || (d.id && modeOf(d.id).mode === "hide"))) return;
    var r = k === "read" ? (d.id ? readTile(d) : null) : devRow(d);
    if (!r && ed) r = k === "read" ? readTile(d) : pill(d.icon || "plug", d.name, {});
    if (!r) return;
    rows.push(
      edMark(r, devEditor(lk, d), !!d.hide)
    );
    src.push(d);
  });
  var add = null;
  if (ed) {
    edSort(rows, function (f, t) {
      edReorder(s.devs, src, f, t);
      uiChanged();
    });
    add = edAdd(widgetAddLabel(k), function () {
      widgetAdd(lk, k);
    });
  }
  if (!rows.length && !ed) return null;
  /* Lights master: one light at the top that controls every light of the section; off unless the section turns it on. */
  if (k === "lights" && s.master && !ed) {
    var mids = src
      .filter(function (d) {
        return d.id && d.kind === "light";
      })
      .map(function (d) {
        return d.id;
      });
    if (mids.length > 1) rows.unshift(lightsMasterRow(s.id, mids, !s.nowheel, s.mn));
  }
  var body = rows;
  if (k === "read") {
    var g = mk("div", "glance");
    g.style.gridTemplateColumns = "repeat(auto-fill,minmax(124px,1fr))";
    rows.forEach(function (r) {
      g.appendChild(r);
    });
    body = [g];
  } else if (s.lay === "grid2" || s.lay === "grid3") {
    var gl = mk("div", "gridl " + (s.lay === "grid2" ? "g2" : "g3"));
    rows.forEach(function (r) {
      gl.appendChild(r);
    });
    body = [gl];
  }
  if (add) body.push(add);
  var sx = section(ttl, ico, body);
  /* Lights: one tap turns off every light in the section, or, when all of them are off, turns them on as they were. */
  if (k === "lights" && !ed && !s.noall) {
    var ids = src
        .filter(function (d) {
          return d.id && dom(d.id) === "light";
        })
        .map(function (d) {
          return d.id;
        }),
      ao = mk("div", "rnd pane sm secact", svg("power"));
    ao.setAttribute("role", "button");
    ao.addEventListener("click", function () {
      if (countOn(lightUnits(ids)) > 0) {
        call("light", "turn_off", { entity_id: ids });
        toast(_T("turning_the_lights_off"));
        return;
      }
      lightsBack(lightUnits(ids));
      toast(_T("turning_the_lights_on"));
    });
    sx.firstChild.appendChild(ao);
    reg(function () {
      var on = countOn(lightUnits(ids)) > 0,
        label = on ? _T("turn_all_lights_off") : _T("turn_all_lights_on");
      ao.classList.toggle("on", on);
      ao.title = label;
      ao.setAttribute("aria-label", label);
    });
  }
  return sx;
}

/* Camera: a live view of each camera with its controls on the picture. */
function cameraSection(s) {
  var ed = editing(),
    lk = "~" + secKey() + "~" + s.id,
    cams = (s.devs || []).filter(function (d) {
      return d.id && (ed || (!d.hide && modeOf(d.id).mode !== "hide"));
    });
  if (!cams.length && !ed) return null;
  var items = [],
    rows = [];
  cams.forEach(function (d, i) {
    var box = mk("div", "vidbox"),
      owner = i ? "page" + i : "page";
    function startPage() {
      box.innerHTML = "";
      stream(box, d.id, owner, false);
      camControls(box, d.id);
    }
    box.dataset.cam = d.id;
    box._start = startPage;
    if (!PATCH_BUILD) startPage();
    if (i === 0) CAMPAGE = { box: box, start: startPage };
    items.push(box);
    if (ed) {
      var r = edMark(pill("axis", d.name, { tap: function () {} }), devEditor(lk, d), !!d.hide);
      rows.push(r);
      items.push(r);
    }
  });
  if (ed) {
    edSort(rows, function (f, t) {
      edReorder(s.devs, cams, f, t);
      uiChanged();
    });
    items.push(
      edAdd(widgetAddLabel("camera"), function () {
        widgetAdd(lk, "camera");
      })
    );
  }
  return section(secName(s), secIcon(s), items);
}

function noteSection(s) {
  var ed = editing(),
    txt = (s.txt || "").trim();
  if (!txt && !ed) return null;
  var c = mk("div", "notec pane");
  if (txt) c.textContent = s.txt;
  else {
    c.textContent = _T("empty_note_open_this_section_s_setti");
    c.classList.add("dim");
  }
  edMark(c, function () {
    showPopup("manage-sec:" + secKey() + ":" + s.id, false);
  });
  return section(s.t || _T("note"), s.i && iconOk(s.i) ? s.i : "info", [c]);
}

/* Chart: history of up to four sensors, drawn from Home Assistant's recorder. */
var CHC = {},
  CHR = {},
  CHCOL = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"],
  CHH = { "6h": 6, "24h": 24, "7d": 168, "30d": 720 };

function chartLoad(ids, rng, cb) {
  var key = ids.join(",") + rng,
    c = CHC[key];
  if (c && Date.now() - c.t < 120000) {
    cb(c.d);
    return;
  }
  var end = new Date(),
    start = new Date(end.getTime() - CHH[rng] * 3600000);
  /* A month of raw states is too much to fetch; the hourly averages Home Assistant keeps are enough for a curve. */
  if (rng === "30d") {
    HA.statistics({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period: "hour",
      types: ["mean"],
    })
      .then(function (r) {
        var d = {};
        ids.forEach(function (id) {
          d[id] = ((r && r[id]) || [])
            .filter(function (x) {
              return typeof x.mean === "number";
            })
            .map(function (x) {
              return [typeof x.start === "number" ? x.start : Date.parse(x.start), x.mean];
            });
        });
        CHC[key] = { t: Date.now(), d: d };
        cb(d);
      })
      .catch(function () {
        cb(null);
      });
    return;
  }
  HA.history({
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    entity_ids: ids,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  })
    .then(function (r) {
      var d = {};
      ids.forEach(function (id) {
        var pts = [];
        ((r && r[id]) || []).forEach(function (p) {
          var t = (p.lu || p.lc || 0) * 1000;
          if (!t && p.last_updated) t = Date.parse(p.last_updated);
          var v = Number(p.s !== undefined ? p.s : p.state);
          if (
            t &&
            isFinite(v) &&
            (p.s !== undefined ? p.s : p.state) !== "" &&
            (p.s || p.state) !== "unavailable" &&
            (p.s || p.state) !== "unknown"
          )
            pts.push([t, v]);
        });
        d[id] = pts;
      });
      CHC[key] = { t: Date.now(), d: d };
      cb(d);
    })
    .catch(function () {
      cb(null);
    });
}

function fmtNum(v) {
  return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

function chartDraw(box, ds, data, rng, sid) {
  var W = 320,
    Hh = 132,
    PT = 14,
    PB = 14,
    t1 = Date.now(),
    t0 = t1 - CHH[rng] * 3600000,
    any = false,
    units = {},
    gmin = Infinity,
    gmax = -Infinity,
    ser = [];
  ds.forEach(function (d) {
    var pts = data[d.id] || [];
    if (pts.length) any = true;
    units[A(d.id).unit_of_measurement || ""] = 1;
    var lo = Infinity,
      hi = -Infinity;
    pts.forEach(function (p) {
      if (p[1] < lo) lo = p[1];
      if (p[1] > hi) hi = p[1];
    });
    ser.push({ d: d, pts: pts, lo: lo, hi: hi });
    if (lo < gmin) gmin = lo;
    if (hi > gmax) gmax = hi;
  });
  box.innerHTML = "";
  if (!any) {
    var m = mk("div", "hint");
    m.textContent = _T("no_numeric_history_for_these_sensors");
    box.appendChild(m);
    return;
  }
  var shared = Object.keys(units).length === 1,
    u0 = Object.keys(units)[0] || "",
    out =
      '<svg viewBox="0 0 ' +
      W +
      " " +
      Hh +
      '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="cg' +
      sid +
      '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".26"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>';
  [PT, (PT + Hh - PB) / 2, Hh - PB].forEach(function (y) {
    out +=
      '<line x1="0" x2="' +
      W +
      '" y1="' +
      y +
      '" y2="' +
      y +
      '" stroke="currentColor" stroke-opacity=".14" stroke-width="1" vector-effect="non-scaling-stroke"/>';
  });
  ser.forEach(function (s2, i) {
    if (!s2.pts.length) return;
    var lo = shared ? gmin : s2.lo,
      hi = shared ? gmax : s2.hi;
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    var bk = [],
      last = -1;
    s2.pts.forEach(function (p) {
      var x = Math.max(0, Math.min(W, ((p[0] - t0) / (t1 - t0)) * W)),
        b = Math.round((x / W) * 240),
        y = Hh - PB - ((p[1] - lo) / (hi - lo)) * (Hh - PT - PB);
      if (b === last) bk[bk.length - 1] = [x, y];
      else {
        bk.push([x, y]);
        last = b;
      }
    });
    bk.push([W, bk[bk.length - 1][1]]);
    var d =
      "M" +
      bk
        .map(function (p) {
          return p[0].toFixed(1) + " " + p[1].toFixed(1);
        })
        .join("L");
    if (i === 0)
      out +=
        '<path d="' +
        d +
        "L" +
        W +
        " " +
        (Hh - PB) +
        "L" +
        bk[0][0].toFixed(1) +
        " " +
        (Hh - PB) +
        'Z" fill="url(#cg' +
        sid +
        ')" />';
    out +=
      '<path d="' +
      d +
      '" fill="none" style="stroke:' +
      CHCOL[i] +
      '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
  });
  out += "</svg>";
  var wrap = mk("div", "plw", out);
  if (shared) {
    var a = mk("div", "ax");
    a.textContent = fmtNum(gmax) + (u0 ? " " + u0 : "");
    var b = mk("div", "ax lo");
    b.textContent = fmtNum(gmin) + (u0 ? " " + u0 : "");
    wrap.appendChild(a);
    wrap.appendChild(b);
  }
  box.appendChild(wrap);
  var tl = mk("div", "tl", "<span></span><span></span>"),
    f = new Date(t0);
  tl.firstChild.textContent =
    rng === "30d"
      ? f.toLocaleDateString(LOC(), { day: "numeric", month: "short" })
      : rng === "7d"
        ? f.toLocaleDateString(LOC(), { weekday: "short" })
        : tfmt(f, { hour: "2-digit", minute: "2-digit" });
  tl.lastChild.textContent = _T("now_2");
  box.appendChild(tl);
}

function chartSection(s) {
  var ed = editing(),
    lk = "~" + secKey() + "~" + s.id,
    ttl = s.t || _T("chart"),
    ico = s.i && iconOk(s.i) ? s.i : "thermo",
    ds = (s.devs || [])
      .filter(function (d) {
        return d.id && !d.hide;
      })
      .slice(0, 4);
  if (!ds.length) {
    if (!ed) return null;
    return section(ttl, ico, [
      pill("info", _T("no_sensors_yet"), {
        sub: function () {
          return _T("add_one_or_more_sensors_to_draw_a_ch");
        },
      }),
      edAdd(_T("add_device"), function () {
        ADDPRE = "sensors";
        showPopup("manage-add:" + lk, true);
      }),
    ]);
  }
  var card = mk("div", "chartc pane"),
    rg = mk("div", "rg"),
    plot = mk("div", "pl"),
    lg = mk("div", "lg"),
    legs = [];
  function rng() {
    return CHR[s.id] || s.r || "24h";
  }
  ["6h", "24h", "7d", "30d"].forEach(function (r) {
    var b = mk("div", "rbtn pane" + (r === rng() ? " act" : ""));
    b.textContent = r;
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      CHR[s.id] = r;
      [].forEach.call(rg.children, function (c) {
        c.classList.toggle("act", c === b);
      });
      load();
    });
    rg.appendChild(b);
  });
  ds.forEach(function (d, i) {
    var l = mk("span", "", "<i></i><span></span><b></b>");
    l.firstChild.style.background = CHCOL[i];
    l.children[1].textContent = d.name;
    lg.appendChild(l);
    legs.push(l);
  });
  function live() {
    ds.forEach(function (d, i) {
      legs[i].lastChild.textContent = readText(d.id);
    });
  }
  live();
  reg(live);
  function load() {
    plot.innerHTML = "";
    var m = mk("div", "hint");
    m.textContent = _T("loading");
    plot.appendChild(m);
    var r = rng();
    chartLoad(
      ds.map(function (d) {
        return d.id;
      }),
      r,
      function (data) {
        if (r !== rng()) return;
        if (!data) {
          plot.innerHTML = "";
          var e2 = mk("div", "hint");
          e2.textContent = _T("couldn_t_load_the_history_2");
          plot.appendChild(e2);
          return;
        }
        chartDraw(plot, ds, data, r, s.id);
      }
    );
  }
  load();
  card.appendChild(rg);
  card.appendChild(plot);
  card.appendChild(lg);
  edMark(card, function () {
    showPopup("manage-sec:" + secKey() + ":" + s.id, false);
  });
  return section(ttl, ico, [card]);
}

function roomFloors(keys) {
  var h = H(),
    fl = (h && h.floors) || {},
    groups = {},
    order = [];
  keys.forEach(function (k) {
    var r = roomById(k),
      a = r && r.area && h.areas && h.areas[r.area],
      fid = a && a.floor_id && fl[a.floor_id] ? a.floor_id : "";
    if (!groups[fid]) {
      groups[fid] = [];
      order.push(fid);
    }
    groups[fid].push(k);
  });
  if (order.length < 2) return null;
  order.sort(function (x, y) {
    if (!x) return 1;
    if (!y) return -1;
    var lx = fl[x].level,
      ly = fl[y].level;
    return (typeof lx === "number" ? lx : 99) - (typeof ly === "number" ? ly : 99);
  });
  return order.map(function (fid) {
    return { name: fid ? fl[fid].name : _T("other_rooms"), keys: groups[fid] };
  });
}

function secRooms() {
  var rooms = mk("div", "grid2 rm"),
    byKey = {},
    ed = editing(),
    list = ed
      ? UI.rooms.map(function (r) {
          return r.id;
        })
      : ORDER.filter(function (k) {
          return k !== "home" && !!UIROOM[k];
        });
  list.forEach(function (k) {
    var r = roomById(k),
      ls = ROOMLIGHTS[k] || [],
      ds = visDevs(k),
      cams = ds.filter(function (d) {
        return d.kind === "camera";
      }).length;
    var tt = (UI.stat[k] || []).filter(function (s) {
        return !s.text && /°/.test(s.u || "");
      })[0],
      temp = function () {
        if (!tt) return "";
        var v = sv(tt.id, tt.u || "", tt.dp === undefined ? 1 : tt.dp);
        return v === "Offline" || v === "–" ? "" : " · " + v;
      };
    var label = ls.length
      ? function () {
          return lightsLabel(lightUnits(ROOMLIGHTS[k] || []))() + temp();
        }
      : function () {
          return (
            (cams
              ? cntS(cams, _T("camera").toLowerCase(), _T("cameras").toLowerCase())
              : ds.length + (ds.length === 1 ? " device" : " devices")) + temp()
          );
        };
    var rt = tile(
      r.icon || "home",
      r.name,
      label,
      ls.length
        ? function () {
            return countOn(lightUnits(ROOMLIGHTS[k] || [])) > 0;
          }
        : null,
      function () {
        go(k);
      },
      ls.length
        ? function () {
            return avgLight(lightUnits(ROOMLIGHTS[k] || []));
          }
        : null
    );
    edMark(
      rt,
      function () {
        showPopup("manage-details:" + k, true);
      },
      !UIROOM[k]
    );
    if (r.img) {
      rt.classList.add("hasimg");
      rt.insertBefore(rimgEl(r.img), rt.firstChild);
    }
    rooms.appendChild(rt);
    byKey[k] = rt;
  });
  var fl = roomFloors(list) || [{ name: "", keys: list }],
    nodes = [];
  fl.forEach(function (f) {
    if (f.name) {
      var lab = mk("div", "flr");
      lab.textContent = f.name;
      nodes.push(lab);
    }
    var g = mk("div", "grid2 rm"),
      els = f.keys.map(function (k) {
        return byKey[k];
      });
    els.forEach(function (e) {
      g.appendChild(e);
    });
    nodes.push(g);
    if (ed) {
      var objs = f.keys.map(roomById);
      edSort(els, function (a, b) {
        edReorder(UI.rooms, objs, a, b);
        uiChanged();
      });
    }
  });
  if (ed) nodes.push(edAdd(_T("add_room"), addRoom));
  return section(secT("rooms", _T("rooms")), secI("rooms", "home"), nodes);
}

function secGlance() {
  var glanceG = mk("div", "grid3"),
    GT = {};
  var LS = function () {
    return allLights().filter(function (i) {
      return !gxOff("lights", i);
    });
  };
  if (LS().length)
    GT.lights = tile(
      "lights",
      _T("lights"),
      function () {
        return countOn(lightUnits(LS())) + " on";
      },
      function () {
        return countOn(lightUnits(LS())) > 0;
      },
      function () {
        showPopup("g-lights", false);
      },
      function () {
        return avgLight(lightUnits(LS()));
      }
    );
  var acs = gxDevs("acs", devsOf("climate")).map(function (d) {
    return d.id;
  });
  if (acs.length)
    GT.acs = tile(
      "ac",
      _T("acs"),
      function () {
        return (
          countOn(acs, function (i) {
            var s = V_(i);
            return s && ["off", "unknown", "unavailable"].indexOf(s) < 0;
          }) + " on"
        );
      },
      null,
      function () {
        showPopup("g-acs", false);
      }
    );
  var fans = gxDevs(
    "fans",
    devsOf("fan").filter(function (d) {
      return !d.pop;
    })
  ).map(function (d) {
    return d.id;
  });
  if (fans.length)
    GT.fans = tile(
      "fan",
      _T("fans"),
      function () {
        return countOn(fans) + " on";
      },
      null,
      function () {
        showPopup("g-fans", false);
      }
    );
  if (BATLIST.length || editing())
    GT.batteries = tile(
      "battery",
      _T("batteries"),
      function () {
        return editing()
          ? cntS(UI.bats.length, _T("sensor"), _T("sensors_2"))
          : BATLIST.filter(function (x) {
              var r = batReading(x[1]);
              return r && r.low;
            }).length +
              " " +
              _T("below") +
              " " +
              batLow() +
              "%";
      },
      null,
      function () {
        showPopup("g-batteries", false);
      }
    );
  var meds = gxDevs("media", devsOf("media"));
  if (meds.length)
    GT.media = tile(
      "media",
      _T("media"),
      function () {
        return (
          countOn(
            meds.map(function (d) {
              return d.id;
            }),
            function (i) {
              var s = V_(i);
              if (!s || ["off", "unknown", "unavailable"].indexOf(s) >= 0) return false;
              if ((UIDEV[i] || {}).icon === "speaker" && ["idle", "standby"].indexOf(s) >= 0)
                return false;
              return true;
            }
          ) + " on"
        );
      },
      null,
      function () {
        showPopup("g-tvs", false);
      }
    );
  var vacs = devsOf("vacuum");
  if (vacs.length)
    GT.robot = tile(
      "vac",
      _T("robot"),
      function () {
        var s = V_(vacs[0].id);
        return s === "unavailable" || s === "unknown" ? _T("unavailable") : cap(s);
      },
      null,
      function () {
        showPopup(devPop(vacs[0]), false);
      }
    );
  glanceFill(glanceG, GT);
  return glanceG.children.length || editing()
    ? section(
        secT("glance", _T("at_a_glance")),
        secI("glance", "home"),
        [glanceG].concat(editing() ? [edAdd(_T("add_tile"), glanceAdd)] : [])
      )
    : null;
}
