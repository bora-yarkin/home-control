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
    var z = sizeOf(d);
    return !d.hide && (z === "m" || z === "l");
  });
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
  if (!f) return;
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
