/* Widgets (decision D-25). A page is plain Sections, and what a Section holds is devices and widgets. A widget is a device of kind "widget" with a type (w) and the settings of that
   type (wx); the type, registered here, owns everything about it: its name and icon, the sizes it can take, how its settings are checked, how it is drawn and how it is edited.
   Sizes are as on a phone's home screen: a Section is a grid of four columns, xs is one column, s two, m and l the full width (l taller). A device that is not a widget is a row, and
   a few can take another size: a sensor a tile (xs, s), a camera its live picture (l). */

var WIDGETS = {},
  WSIZES = ["xs", "s", "m", "l"],
  WCOLS = { xs: 1, s: 2, m: 4, l: 4 },
  DEVSIZES = { sensor: ["xs", "s"], number: ["xs", "s"], select: ["xs", "s"], camera: ["l"] },
  WIDRE = /^[a-z][a-z0-9_]{1,14}$/;

/* Adds a widget type: { title, icon, desc, sizes, size, clean(wx) -> wx, draw(d, wx, editing) -> element or null, settings(box, d, save) }. */
function registerWidget(w, def) {
  /* A widget that is an overview built as a section of its own (def.section) is drawn, next to other things in a Section, as a sub-section. */
  if (def.section && !def.draw)
    def.draw = function (d) {
      var el = def.section(d);
      return el ? cardStack([{ el: el }]) : null;
    };
  WIDGETS[w] = def;
}

function widgetDef(w) {
  return typeof w === "string" && Object.prototype.hasOwnProperty.call(WIDGETS, w) ? WIDGETS[w] : null;
}

function widgetNewId(taken) {
  var id;
  do id = "w" + Math.random().toString(36).slice(2, 7);
  while (taken && taken.indexOf(id) >= 0);
  return id;
}

/* The sizes a device or widget can take, besides the row a device is by default. */
function sizesOf(d) {
  if (d.kind === "widget") {
    var f = widgetDef(d.w);
    return f ? f.sizes : [];
  }
  return DEVSIZES[d.kind] || [];
}

/* The size it is shown at: the one saved when its kind allows it, else the widget's own, else a row. */
function sizeOf(d) {
  var ok = sizesOf(d);
  if (ok.indexOf(d.sz) >= 0) return d.sz;
  return d.kind === "widget" ? widgetDef(d.w).size : "row";
}

/* A device with its checked fields so far in c: a widget's type, settings and id, then the size (only when it is not the default). */
function cleanWidgetDev(d, c) {
  var f = widgetDef(d.w);
  if (c.kind === "widget") {
    if (!f || c.id) return false;
    c.w = d.w;
    c.wid = typeof d.wid === "string" && WIDRE.test(d.wid) ? d.wid : widgetNewId();
    c.wx = f.clean(d.wx && typeof d.wx === "object" ? d.wx : {}) || {};
    if (f.sizes.indexOf(d.sz) >= 0 && d.sz !== f.size) c.sz = d.sz;
  } else if (c.id && sizesOf(c).indexOf(d.sz) >= 0) c.sz = d.sz;
  return true;
}

/* A new widget of a type, with the settings that type starts with. */
function newWidgetDev(w) {
  var f = widgetDef(w);
  return { kind: "widget", id: "", w: w, wid: widgetNewId(), name: f.title.slice(0, 40), icon: f.icon, wx: f.clean({}) };
}

function widgetRow(d, ed) {
  var f = widgetDef(d.w),
    el = f && f.draw(d, d.wx || {}, !!ed);
  if (!el) return null;
  el.classList.add("wgt", "w-" + sizeOf(d));
  return el;
}

/* Whether a Section needs the full width of the page: it holds a widget or a live camera that is as wide as the page. */
function secIsWide(s) {
  return (s.devs || []).some(function (d) {
    var f = d.kind === "widget" ? widgetDef(d.w) : null,
      z = sizeOf(d);
    return !d.hide && (f && f.wide ? f.wide(d) : z === "m" || z === "l");
  });
}

/* The widget a Section holds when it holds nothing else: such a Section is drawn as the widget's own section (the overviews), so a page looks as it always did. */
function widgetAlone(s) {
  var d = s.devs || [],
    f = d.length === 1 && d[0].kind === "widget" ? widgetDef(d[0].w) : null;
  return f && f.section && !s.master && !(s.masters || []).length ? d[0] : null;
}

/* A plain Section holding one new widget, named and iconned as the widget is. */
function widgetSection(id, w) {
  var f = widgetDef(w);
  return { id: id, k: "devs", hide: false, t: f.title.slice(0, 40), i: f.icon, devs: [newWidgetDev(w)] };
}

/* The widget with this id in a section of a page. */
function widgetOfSection(scopeId, secId, wid) {
  var s = secById(scopeId, secId);
  return (
    ((s && s.devs) || []).filter(function (d) {
      return d.kind === "widget" && d.wid === wid;
    })[0] || null
  );
}

/* The settings every sized device or widget has: its size (a widget may have only one, and then none is offered). */
function sizeSettings(box, d, redraw) {
  var ok = sizesOf(d);
  if (d.kind === "widget" ? ok.length < 2 : !ok.length) return;
  var all = d.kind === "widget" ? ok : ["row"].concat(ok);
  box.appendChild(
    dropRow(
      _T("size"),
      all,
      function () {
        return sizeOf(d);
      },
      function (v) {
        if (v === "row" || (d.kind === "widget" && v === widgetDef(d.w).size)) delete d.sz;
        else d.sz = v;
        uiChanged();
        redraw();
      },
      "tune",
      function (v) {
        return _T("size_" + v);
      }
    )
  );
}

function widgetSettings(c) {
  var f = widgetDef(c.d.w);
  if (!f || !f.settings) return;
  c.box.appendChild(sep(f.title, f.icon));
  f.settings(c.box, c.d, function () {
    uiChanged();
    c.redraw();
  });
}

/* Note: free text. */
registerWidget("note", {
  title: _T("note"),
  icon: "info",
  desc: _T("free_text"),
  sizes: ["s", "m", "l"],
  size: "m",
  clean: function (x) {
    return { txt: typeof x.txt === "string" ? x.txt.slice(0, 600) : "" };
  },
  draw: function (d, x, ed) {
    var txt = (x.txt || "").trim();
    if (!txt && !ed) return null;
    var c = mk("div", "notec pane");
    if (txt) c.textContent = x.txt;
    else {
      c.textContent = _T("empty_note_open_this_widget_s_setti");
      c.classList.add("dim");
    }
    return c;
  },
  settings: function (box, d, save) {
    box.appendChild(
      areaRow(
        _T("write_a_note"),
        d.wx.txt || "",
        function (v) {
          d.wx.txt = v.slice(0, 600);
          save();
        },
        600
      )
    );
  },
});

/* Chart: the history of up to four sensors, drawn from Home Assistant's recorder. */
registerWidget("chart", {
  title: _T("chart"),
  icon: "thermo",
  desc: _T("history_of_up_to_four_sensors"),
  sizes: ["m", "l"],
  size: "m",
  clean: function (x) {
    var ds = [];
    (Array.isArray(x.ds) ? x.ds : []).forEach(function (s) {
      if (
        ds.length < 4 &&
        s &&
        typeof s.id === "string" &&
        ENTRE.test(s.id) &&
        typeof s.name === "string" &&
        s.name &&
        s.name.length <= 40 &&
        ds.every(function (y) {
          return y.id !== s.id;
        })
      )
        ds.push({ id: s.id, name: s.name });
    });
    var o = { ds: ds };
    if (CHH[x.r]) o.r = x.r;
    return o;
  },
  draw: function (d, x, ed) {
    if (!x.ds.length) {
      if (!ed) return null;
      return pill("info", _T("no_sensors_yet"), {
        sub: function () {
          return _T("add_one_or_more_sensors_to_draw_a_ch");
        },
      });
    }
    return chartCard(d.wid, x.ds, x.r);
  },
  settings: function (box, d, save) {
    box.appendChild(
      seg(
        [
          ["6h", _T("6_hours")],
          ["24h", _T("24_hours")],
          ["7d", _T("7_days")],
          ["30d", _T("30_days")],
        ],
        d.wx.r || "24h",
        function (v) {
          d.wx.r = v;
          delete CHR[d.wid];
          save();
        }
      )
    );
    d.wx.ds.forEach(function (s, i) {
      box.appendChild(
        pill("sensor", s.name, {
          sub: function () {
            return s.id + " · " + _T("tap_to_remove");
          },
          tap: function () {
            d.wx.ds.splice(i, 1);
            save();
          },
        })
      );
    });
    if (d.wx.ds.length < 4)
      box.appendChild(
        pill("plus", _T("add_a_sensor"), {
          tap: function () {
            pickEntity(
              _T("add_a_sensor"),
              ["sensor"],
              null,
              function (id) {
                d.wx.ds.push({ id: id, name: (A(id).friendly_name || id).slice(0, 40) });
                save();
              },
              d.wx.ds.map(function (s) {
                return s.id;
              })
            );
          },
        })
      );
  },
});

/* Security, Energy and Cameras: overviews built from the home's own entities (drawn in security.js and camera.js). */
registerWidget("security", {
  title: _T("security"),
  icon: "lock",
  desc: _T("locks_alarms_doors_and_windows"),
  sizes: ["m"],
  size: "m",
  clean: function () {
    return {};
  },
  draw: function () {
    return cardStack(securityList());
  },
});

registerWidget("cameras", {
  title: _T("cameras"),
  icon: "cam",
  desc: _T("all_cameras_in_one_grid"),
  sizes: ["m"],
  size: "m",
  clean: function () {
    return {};
  },
  draw: function () {
    return cardStack(cameraList());
  },
});

registerWidget("energy", {
  title: _T("energy_and_usage"),
  icon: "plug",
  desc: _T("power_now_and_usage_over_the_week"),
  sizes: ["m"],
  size: "m",
  clean: function (x) {
    var o = {},
      pr = Number(x.price);
    if (isFinite(pr) && pr > 0 && pr <= 1000) o.price = pr;
    if (typeof x.cur === "string" && x.cur && x.cur.length <= 4) o.cur = x.cur;
    return o;
  },
  draw: function (d, x) {
    return cardStack(energyList(x));
  },
  settings: function (box, d, save) {
    box.appendChild(
      numRow(
        "plug",
        _T("price_per_kwh_empty_hides_the_cost"),
        d.wx.price,
        function (v) {
          if (v && v > 0) d.wx.price = Math.round(v * 10000) / 10000;
          else delete d.wx.price;
          save();
        },
        0,
        1000
      )
    );
    box.appendChild(
      textRow(
        "edit",
        _T("currency_symbol"),
        d.wx.cur || "",
        function (v) {
          if (v) d.wx.cur = v.slice(0, 4);
          else delete d.wx.cur;
          save();
        },
        4
      )
    );
  },
});

/* The overviews: each is built as a section of its own (alerts, rooms, glance ...), and is the whole of a Section made for it. */
function overview(w, title, icon, desc, build, extra) {
  registerWidget(
    w,
    Object.assign(
      {
        title: title,
        icon: icon,
        desc: desc,
        sizes: ["s", "m"],
        size: "m",
        clean: function () {
          return {};
        },
        section: build,
      },
      extra || {}
    )
  );
}

overview("alerts", _T("attention"), "alert", _T("things_that_need_attention"), function () {
  return alertsBox();
}, {
  sizes: ["m"],
  settings: function (box) {
    [
      ["battery", _T("low_batteries"), "battery"],
      ["vacuum", _T("robot_vacuum_needs_attention"), "vac"],
      ["camera", _T("camera_offline"), "cam"],
      ["climate", _T("air_conditioner_offline"), "ac"],
      ["lights", _T("light_unavailable"), "lights"],
    ].forEach(function (a) {
      box.appendChild(
        pill(a[2], a[1], {
          on: function () {
            return alertOn(a[0]);
          },
          tap: function () {
            var off = ((STORE.cfg && STORE.cfg.alertOff) || []).slice(),
              i = off.indexOf(a[0]);
            if (i >= 0) off.splice(i, 1);
            else off.push(a[0]);
            STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { alertOff: off }));
            storeChanged();
            refresh();
          },
        })
      );
    });
  },
});

overview("rooms", _T("rooms"), "home", _T("links_to_every_page"), function () {
  return secRooms();
}, { size: "s" });

overview("now", _T("on_now"), "power", _T("what_is_running_right_now_and_where"), function () {
  return secNow();
}, { size: "s" });

overview("status", _T("status_tiles"), "thermo", _T("readings_for_this_page_such_as_tempe"), function () {
  return roomStatus(pageKey());
}, { sizes: ["m"] });

overview("chips", _T("climate_overview"), "thermo", _T("temperature_and_humidity_at_a_glance"), function () {
  return homeStatus();
}, { sizes: ["m"] });

/* At a glance: which tiles, in what order, and the tiles made by hand; kept on the widget (app/glance.js reads them from the page's first one). */
overview(
  "glance",
  _T("at_a_glance"),
  "home",
  _T("counts_of_what_is_on_open_or_running"),
  function () {
    return secGlance();
  },
  {
    size: "s",
    clean: function (x) {
      var o = {},
        gl = cleanGlance(x.gl);
      if (gl) o.gl = gl;
      return o;
    },
  }
);

/* Pinned: the favourite devices and scenes (at most 12), and how many columns they take. */
overview(
  "pinned",
  _T("pinned"),
  "pin",
  _T("your_favourite_devices"),
  function (d) {
    return pinsSection(d);
  },
  {
    sizes: ["m"],
    clean: function (x) {
      var o = { pins: cleanPins(x.pins) };
      if (layCols(x.lay)) o.lay = x.lay;
      return o;
    },
    settings: function (box, d, save) {
      box.appendChild(
        pill("pin", _T("pinned_items"), {
          sub: function () {
            return d.wx.pins.length + " / 12";
          },
          tap: function () {
            var s = hostSection(d);
            showPopup("pick-pin:" + secKey() + ":" + s.id + ":" + d.wid, true);
          },
        })
      );
      box.appendChild(
        dropRow(
          _T("columns"),
          ["auto", "list", "grid2", "grid3", "grid4"],
          function () {
            return d.wx.lay || "auto";
          },
          function (v) {
            if (v === "auto") delete d.wx.lay;
            else d.wx.lay = v;
            save();
          },
          "tune",
          function (v) {
            return v === "auto" ? _T("automatic") : String(layCols(v));
          }
        )
      );
    },
  }
);

/* Linked section: shows a section of another page, so it is edited once and appears wherever it is linked. */
overview(
  "link",
  _T("linked_section"),
  "swap",
  _T("shows_a_section_from_another_page"),
  function (d) {
    return linkSection(d);
  },
  {
    sizes: ["m"],
    wide: function (d) {
      var r = linkTarget(d);
      return !!r && secIsWide(r);
    },
    clean: function (x) {
      return typeof x.ref === "string" && /^[a-z0-9_-]{1,24}:[a-z][a-z0-9_]{1,14}$/.test(x.ref) ? { ref: x.ref } : {};
    },
    settings: function (box, d, save) {
      var q = (d.wx.ref || "").split(":"),
        ls = d.wx.ref ? secById(q[0], q[1]) : null,
        host = hostSection(d);
      box.appendChild(
        pill("swap", ls ? secName(ls) : _T("no_section_chosen"), {
          sub: function () {
            return ls ? (TITLES[q[0]] || q[0]) + " · " + _T("tap_to_choose_another_2") : _T("tap_to_choose");
          },
          tap: function () {
            showPopup("sec-link:" + secKey() + ":" + host.id + ":" + d.wid, true);
          },
        })
      );
      if (ls)
        box.appendChild(
          pill("plus", _T("make_an_independent_copy"), {
            sub: function () {
              return _T("stops_following_the_original_section");
            },
            tap: function () {
              var c = JSON.parse(JSON.stringify(ls)),
                order = secOrder(CURSCOPE);
              c.id = newSecId(order);
              (c.devs || []).forEach(function (x) {
                if (x.kind === "widget") x.wid = widgetNewId();
              });
              order[order.indexOf(host)] = c;
              setSecOrder(CURSCOPE, order);
              uiChanged();
              popBack();
            },
          })
        );
    },
  }
);
