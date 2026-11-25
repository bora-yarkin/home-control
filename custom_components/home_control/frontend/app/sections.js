/* Sections: the types a page is made of, how each one is built, linked sections, columns, and the chart section. */

/* Pinned items, quick actions and scenes belong to the section that shows them; a scene is stored once in the library and sections list its id. */
function secById(scope, sid) {
  var list = secOrder(scopeKey(scope));
  for (var i = 0; i < list.length; i++) if (list[i].id === sid) return list[i];
  return null;
}

/* ---- Section types ----
 Every section on a page is one of these types. Nothing is built in: sections are added, changed to another type, reordered and
 deleted from the page editor, and device-owning types hold their own list of widgets. */
var SECTYPES = {
    devs: {
      t: _T("section"),
      i: "tune",
      d: _T("section_d"),
      own: 1,
      noun: _T("device_2"),
      add: "devices",
    },
  },
  /* What the sections of layout 4 and earlier are called now: [name, icon, kind they become]. Quick actions are Scenes. */
  LEGACY_SECTYPES = {
    lights: [_T("lights"), "lights"],
    media: [_T("media"), "tv"],
    climate: [_T("climate"), "ac"],
    controls: [_T("controls"), "tune"],
    sensors: [_T("sensors"), "thermo"],
    other: [_T("other_devices"), "plug"],
    quick: [_T("quick_actions_2"), "scene"],
    scenes: [_T("scenes"), "scene"],
  };

function secName(s) {
  return s.t || (SECTYPES[s.k] || SECTYPES.devs).t;
}

function secIcon(s) {
  return s.i && iconOk(s.i) ? s.i : (SECTYPES[s.k] || SECTYPES.devs).i;
}

/* A new Home page starts with Attention, At a glance, Rooms and Scenes; a new room page with its status tiles and one empty Section (suggested sections are offered when a room is made, see suggestSections). */
function seedSections(scope) {
  return scope === "home"
    ? [
        widgetSection("alerts", "alerts"),
        widgetSection("glance", "glance"),
        widgetSection("rooms", "rooms"),
        { id: "scenes", k: "devs", t: _T("scenes"), i: "scene", hide: false, devs: [{ id: "scenes-home", kind: "scenes", name: _T("scenes"), icon: "scene", spage: ["page:home"] }] },
      ]
    : [statusSection([]), { id: "main", k: "devs", hide: false, devs: [] }];
}

/* Sections for a list of devices, one for each of what they are (lights, media, climate, controls, sensors, other devices; cameras as a camera section), named and iconned for it. Only the ones that have devices. */
function groupSections(list) {
  var G = [
      ["lights", "lights", "lights", ["light"]],
      ["media", "media", "tv", ["media"]],
      ["climate", "climate", "ac", ["climate", "fan"]],
      ["controls", "controls", "tune", ["number", "select", "button", "cover", "lock"]],
      ["sensors", "sensors", "thermo", ["sensor"]],
      ["other", "other_devices", "plug", ["switch", "vacuum", "special"]],
    ],
    out = [];
  G.forEach(function (g) {
    var devs = list.filter(function (d) {
      return g[3].indexOf(d.kind) >= 0;
    });
    if (devs.length) out.push({ id: g[0], k: "devs", t: _T(g[1]), i: g[2], hide: false, devs: devs });
  });
  var cams = list.filter(function (d) {
    return d.kind === "camera";
  });
  if (cams.length)
    out.push({
      id: "camera",
      k: "devs",
      t: _T("camera"),
      i: "cam",
      hide: false,
      devs: cams.map(function (d) {
        return Object.assign({}, d, { sz: "l" });
      }),
    });
  return out;
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

var COLS = [];

/* Two columns only when the block has two or more sections; a half-width section with no partner spans the row. */
function pageCols(sc) {
  return (UI.layout.cols || {})[sc === "home" ? "home" : sc.slice(5)] || 0;
}

function colCount(h) {
  var w = window.innerWidth,
    pc = h._pc || 0,
    max = w >= 1500 ? 4 : w >= 1100 ? 3 : w >= 760 ? 2 : 1,
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

/* How many columns of items a section's layout says (list is one); 0 when the section decides. */
function layCols(lay) {
  return { list: 1, grid2: 2, grid3: 3, grid4: 4 }[lay] || 0;
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

/* Builds one section of the page. */
function secBuildEl(s) {
  return customSection(s);
}

/* The temperature of a room for its tile on the Home page: the first of the header's status tiles that is one, else the first sensor of the page that is a temperature. */
function roomTempId(k) {
  var isTemp = function (id) {
    return typeof id === "string" && dom(id) === "sensor" && A(id).device_class === "temperature";
  };
  var tile = (UI.stat[k] || []).filter(function (s) {
    return !s.text && isTemp(s.id);
  })[0];
  if (tile) return tile.id;
  var d = ((UI.devs || {})[k] || []).filter(function (x) {
    return x.kind === "sensor" && isTemp(x.id);
  })[0];
  return d ? d.id : "";
}

/* The section a linked section shows, or null. */
function linkTarget(d) {
  var q = ((d.wx && d.wx.ref) || "").split(":");
  return q[1] ? secById(q[0], q[1]) : null;
}

/* The Section of the current page that holds a widget. */
function hostSection(d) {
  return (
    secOrder(CURSCOPE).filter(function (s) {
      return (s.devs || []).indexOf(d) >= 0;
    })[0] || null
  );
}

/* How deep linked sections show linked sections: a link to a section that links back would never end. */
var LINKDEPTH = 0;

function linkSection(d) {
  var src = linkTarget(d),
    ed = editing(),
    host = hostSection(d),
    q = ((d.wx && d.wx.ref) || "").split(":");
  if (!src || src === host || LINKDEPTH > 3) {
    return ed
      ? section(secT("link", _T("linked_section")), secI("link", "swap"), [
          pill("swap", _T("choose_a_section_to_show_here"), {
            sub: function () {
              return _T("the_linked_section_is_missing_or_not");
            },
            tap: function () {
              showPopup("sec-link:" + secKey() + ":" + host.id + ":" + d.wid, true);
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
  LINKDEPTH++;
  try {
    return secBuildEl(src);
  } finally {
    LINKDEPTH--;
    CURSCOPE = pc;
    CURSEC = pe;
  }
}

function secLinkPage(b, key) {
  var p = key.split(":"),
    host = p[0],
    w = widgetOfSection(host, p[1], p[2]);
  if (!w) return;
  ["home"]
    .concat(
      UI.rooms.map(function (r) {
        return r.id;
      })
    )
    .forEach(function (pid) {
      var list = secOrder(scopeKey(pid)).filter(function (s) {
        return !(pid === host && s.id === p[1]);
      });
      if (!list.length) return;
      b.appendChild(sep(TITLES[pid] || pid, pid === "home" ? "home" : "bed"));
      list.forEach(function (s) {
        b.appendChild(
          pill(secIcon(s), secName(s), {
            on: function () {
              return w.wx.ref === pid + ":" + s.id;
            },
            sub: function () {
              return (SECTYPES[s.k] || SECTYPES.devs).t;
            },
            tap: function () {
              w.wx.ref = pid + ":" + s.id;
              setSecOrder(scopeKey(host), secOrder(scopeKey(host)));
              uiChanged();
              popBack();
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
  CAMN = 0;
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
    list.push({ el: el, wide: secIsWide(s), span: s.span || 0, id: s.id });
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
  var t = mk("div", "gb pane wgt w-" + sizeOf(d), "<b></b><span></span>"),
    b = t.firstChild;
  t.lastChild.textContent = d.name || d.id;
  function up() {
    b.textContent = readText(d.id);
  }
  up();
  reg(up);
  return t;
}

/* What a device is on a page: a widget by its type, a camera at size l by its live picture (a row while the page is edited), a sized sensor a tile, any other a row. */
function deviceItem(d, ed) {
  var z = sizeOf(d);
  if (d.kind === "widget") return widgetRow(d, ed);
  if (d.kind === "camera" && z === "l" && d.id) return ed ? null : cameraLive(d);
  if (z !== "row" && d.id) return readTile(d);
  return devRow(d);
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
  var k = s.k || "devs",
    only = widgetAlone(s);
  if (only) return only.hide && !editing() ? null : widgetDef(only.w).section(only, s);
  var ed = editing(),
    lk = "~" + secKey() + "~" + s.id,
    src = [],
    rows = [],
    ty = SECTYPES[k] || SECTYPES.devs,
    ttl = s.t || ty.t,
    ico = secIcon(s);
  (s.devs || []).forEach(function (d) {
    if (!ed && (d.hide || (d.id && modeOf(d.id).mode === "hide"))) return;
    /* A lights master can leave its lights and the sync out of the section; it keeps them itself. */
    if (!ed && k === "devs" && d.id && masterLeavesOut(s, d)) return;
    var r = deviceItem(d, ed);
    if (!r && ed) r = pill(d.icon || "plug", d.name, {});
    if (!r) return;
    var wf = d.kind === "widget" ? widgetDef(d.w) : null;
    rows.push(
      edMark(r, wf && wf.edit ? function () { wf.edit(d); } : devEditor(lk, d), !!d.hide)
    );
    src.push(d);
  });
  var add = null;
  if (ed) {
    edSort(rows, function (f, t) {
      edReorder(s.devs, src, f, t);
      uiChanged();
    });
    add = edAdd(
      widgetAddLabel(k),
      function () {
        widgetAdd(lk, k);
      },
      null,
      rows.length > 0
    );
  }
  if (!rows.length && !ed) return null;
  var body = rows;
  if (
    rows.some(function (r) {
      return r.classList.contains("wgt");
    })
  ) {
    /* Widgets and sized devices: the Section is a grid of four columns; a row takes all four. */
    var wg = mk("div", "wgrid");
    rows.forEach(function (r) {
      wg.appendChild(r);
    });
    body = [wg];
  } else if (layCols(s.lay) > 1) {
    var gl = mk("div", "gridl g" + layCols(s.lay));
    rows.forEach(function (r) {
      gl.appendChild(r);
    });
    body = [gl];
  }
  if (add) body.push(add);
  var sx = section(ttl, ico, body);
  return sx;
}

/* A camera at size l: its live picture with the controls on it. The first of a page is the one the page starts and stops with the page (owner "page"). */
var CAMN = 0;

function cameraLive(d) {
  var box = mk("div", "vidbox"),
    owner = CAMN++ ? "page" + CAMN : "page";
  function startPage() {
    box.innerHTML = "";
    stream(box, d.id, owner, false);
    camControls(box, d.id);
  }
  box.dataset.cam = d.id;
  box._start = startPage;
  if (!PATCH_BUILD) startPage();
  return box;
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
    box.appendChild(hintRow(_T("no_numeric_history_for_these_sensors")));
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

function chartCard(sid, ds, r0) {
  var card = mk("div", "chartc pane"),
    rg = mk("div", "rg"),
    plot = mk("div", "pl"),
    lg = mk("div", "lg"),
    legs = [];
  function rng() {
    return CHR[sid] || r0 || "24h";
  }
  ["6h", "24h", "7d", "30d"].forEach(function (r) {
    var b = mk("div", "rbtn pane" + (r === rng() ? " act" : ""));
    b.textContent = r;
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      CHR[sid] = r;
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
    plot.appendChild(hintRow(_T("loading")));
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
          plot.appendChild(hintRow(_T("couldn_t_load_the_history_2")));
          return;
        }
        chartDraw(plot, ds, data, r, sid);
      }
    );
  }
  load();
  card.appendChild(rg);
  card.appendChild(plot);
  card.appendChild(lg);
  return card;
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
    var tt = roomTempId(k),
      temp = function () {
        if (!tt) return "";
        var v = readText(tt);
        return v === "–" ? "" : " · " + v;
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
    /* A room's own icon is not a kind of device: every room is the accent. */
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
    rt.dataset.k = "other";
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

/* What is running right now, wherever it is: a row for every player, air conditioner and fan that is on, with the room it is in, and one row for the lights that names the rooms they are on in. Each row is the device's own row, so it opens the device's own popup. The section is hidden while nothing is on. */
function secNow() {
  var box = mk("div", "nowbox"),
    key = null;
  function running(d) {
    var st = V_(d.id);
    if (d.kind === "media") return !(UIDEV[d.id] || {}).nonp && mediaOn(d.id);
    if (d.kind === "climate") return !!st && ["off", "unknown", "unavailable"].indexOf(st) < 0;
    if (d.kind === "fan") return isOn(d.id);
    return false;
  }
  function litRooms() {
    var by = {};
    devsOf("light").forEach(function (d) {
      if (isOn(d.id)) by[d.room] = (by[d.room] || 0) + 1;
    });
    return UI.rooms
      .filter(function (r) {
        return by[r.id];
      })
      .map(function (r) {
        return r.name + " " + by[r.id];
      });
  }
  function build() {
    var devs = devsOf().filter(running),
      lit = litRooms(),
      k = devs
        .map(function (d) {
          return d.room + d.id;
        })
        .join("|") +
        "#" +
        lit.join("|") +
        "#" +
        editing();
    if (k === key) return;
    key = k;
    box.innerHTML = "";
    var empty = !devs.length && !lit.length;
    box.style.display = empty && !editing() ? "none" : "";
    if (empty && !editing()) return;
    var sec = section(secT("now", _T("on_now")), secI("now", "power"), []);
    if (lit.length) {
      var ids = devsOf("light")
          .filter(function (d) {
            return isOn(d.id);
          })
          .map(function (d) {
            return d.id;
          }),
        lr = pill("lights", _T("lights"), {
          on: function () {
            return true;
          },
          sub: function () {
            return lit.join(" · ");
          },
          tap: function () {
            showPopup("g-lights", false);
          },
        });
      reg(function () {
        tintIcon(lr, avgLight(lightUnits(ids).filter(isOn)));
      });
      sec.appendChild(lr);
    }
    devs.forEach(function (d) {
      var row = devRow(d);
      if (!row) return;
      var where = mk("span", "where");
      where.textContent = (roomById(d.room) || {}).name || "";
      row.querySelector(".nm").appendChild(where);
      sec.appendChild(row);
    });
    if (empty)
      sec.appendChild(
        pill("info", _T("nothing_is_on"), {
          sub: function () {
            return _T("lights_players_air_conditioners_and");
          },
        })
      );
    box.appendChild(sec);
    if (box._attach) box._attach();
  }
  reg(build);
  build();
  return box;
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
          ? cntS(UI.bats.length, _T("device_2"), _T("devices"))
          : BATLIST.filter(function (x) {
              return batInfo(x).low === true;
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
