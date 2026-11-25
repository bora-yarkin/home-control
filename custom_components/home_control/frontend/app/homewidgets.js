/* Widgets for a home screen (decision D-25): clock and weather, now playing, camera snapshot, vacuum, energy ring, sensor sparkline, agenda, to-do, folder and stack. They are registered in the same registry as the
   others (app/widgetkinds.js); each says which entity it shows (checked here: the right kind of entity, nothing else), the sizes it can take, and how it is drawn. A widget only changes something when it has a control
   of its own (the play button, the check of a to-do item, the folder's rows). */

/* The entity a widget is about, when it is one of those domains. */
function wxEntity(x, doms) {
  return typeof x.id === "string" && ENTRE.test(x.id) && doms.indexOf(x.id.split(".")[0]) >= 0 ? x.id : "";
}

/* Whether the person may see an entity at all (the dashboard's access settings): administrators always; the others not when it is hidden from them. Taps go through call(), which keeps the rest of those settings (view only, ask). */
function wxVisible(id) {
  return ISADMIN || modeOf(id).mode !== "hide";
}

/* A settings row that names the entity of a widget and picks another. */
function wxPick(box, d, label, icon, doms, save) {
  box.appendChild(
    pill(icon, label, {
      sub: function () {
        return d.wx.id ? entName(d.wx.id) : _T("tap_to_choose");
      },
      tap: function () {
        pickEntity(label, doms, null, function (id) {
          d.wx.id = id;
          save();
        });
      },
    })
  );
}

/* A card of a widget: its name over a body, optionally opening a popup when tapped (not while the page is edited, where a tap opens the widget's settings). */
function wxCard(cls, open) {
  var c = mk("div", "wc pane " + cls);
  if (open) c.addEventListener("click", open);
  return c;
}

/* Keeps something on a widget up to date as long as the widget is on the page. */
function wxEvery(el, ms, fn) {
  var t = setInterval(function () {
    if (!el.isConnected) clearInterval(t);
    else fn();
  }, ms);
}

/* ---- Clock and weather ---- */
registerWidget("clock", {
  title: _T("clock_and_weather"),
  icon: "clock",
  desc: _T("the_time_and_date_and_the_weather"),
  sizes: ["s", "m"],
  size: "s",
  clean: function (x) {
    var o = {},
      w = wxEntity(x, ["weather"]);
    if (w) o.id = w;
    return o;
  },
  draw: function (d, x) {
    var c = wxCard("clk", null),
      tm = mk("b"),
      dt = mk("span"),
      wx = mk("i");
    c.appendChild(tm);
    c.appendChild(dt);
    c.appendChild(wx);
    function weatherId() {
      return x.id || Object.keys(H().states).filter(function (k) { return k.indexOf("weather.") === 0; })[0] || "";
    }
    function up() {
      var n = new Date();
      tm.textContent = n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      dt.textContent = n.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
      var w = weatherId(),
        t = w && A(w).temperature;
      if (w && !wxVisible(w)) w = "";
      wx.textContent = w && S(w) ? (typeof t === "number" ? Math.round(t) + "° · " : "") + cap(String(V_(w)).replace(/-/g, " ")) : "";
    }
    up();
    reg(up);
    wxEvery(c, 15000, up);
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("weather"), "bright", ["weather"], save);
  },
});

/* ---- Now playing ---- */
registerWidget("nowplaying", {
  title: _T("now_playing"),
  icon: "media",
  desc: _T("artwork_title_and_play_pause_of_a_player"),
  sizes: ["m"],
  size: "m",
  clean: function (x) {
    var id = wxEntity(x, ["media_player"]);
    return id ? { id: id } : {};
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("media", _T("choose_a_player"), {}) : null;
    var id = x.id,
      c = wxCard("np", function () {
        showPopup(devPop({ kind: "media", id: id, name: entName(id), icon: "media" }), true);
      }),
      art = mk("div", "art"),
      tx = mk("div", "tx", "<b></b><span></span>"),
      bt = mk("div", "rnd pane", svg("play"));
    c.appendChild(art);
    c.appendChild(tx);
    c.appendChild(bt);
    bt.addEventListener("click", function (e) {
      e.stopPropagation();
      call("media_player", "media_play_pause", { entity_id: id });
    });
    function up() {
      var a = A(id),
        pic = a.entity_picture_local || a.entity_picture || "";
      art.style.backgroundImage = pic && /^(\/|https?:)/.test(pic) ? "url(" + JSON.stringify(pic) + ")" : "";
      tx.firstChild.textContent = a.media_title || entName(id);
      tx.lastChild.textContent = a.media_artist || (V_(id) === "playing" ? _T("playing") : cap(String(V_(id) || "")));
      bt.innerHTML = svg(V_(id) === "playing" ? "pause" : "play");
    }
    up();
    reg(up);
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("media_player"), "media", ["media_player"], save);
  },
});

/* ---- Camera snapshot ---- */
registerWidget("snapshot", {
  title: _T("camera_snapshot"),
  icon: "cam",
  desc: _T("a_still_picture_that_opens_the_live_view"),
  sizes: ["s", "m"],
  size: "s",
  clean: function (x) {
    var id = wxEntity(x, ["camera"]);
    return id ? { id: id } : {};
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("cam", _T("choose_a_camera"), {}) : null;
    var id = x.id,
      c = wxCard("snap", function () {
        showPopup(devPop({ kind: "camera", id: id, name: entName(id), icon: "cam" }), true);
      }),
      im = mk("img"),
      nm = mk("span");
    im.alt = "";
    nm.textContent = entName(id);
    c.appendChild(im);
    c.appendChild(nm);
    function up() {
      var tok = A(id).access_token,
        pic = A(id).entity_picture || "";
      if (tok) im.src = HA.camera.snapshotUrl(id, tok) + "&t=" + Date.now();
      else if (/^\/[A-Za-z0-9_./?=&%-]*$/.test(pic)) im.src = pic;
    }
    up();
    wxEvery(c, 20000, up);
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("camera"), "cam", ["camera"], save);
  },
});

/* ---- Vacuum ---- */
registerWidget("vacuum", {
  title: _T("vacuum"),
  icon: "vac",
  desc: _T("state_battery_and_start_of_a_robot_vacuum"),
  sizes: ["m"],
  size: "m",
  clean: function (x) {
    var id = wxEntity(x, ["vacuum"]);
    return id ? { id: id } : {};
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("vac", _T("choose_a_vacuum"), {}) : null;
    var id = x.id,
      c = wxCard("vacw", function () {
        showPopup(devPop({ kind: "vacuum", id: id, name: entName(id), icon: "vac" }), true);
      }),
      tx = mk("div", "tx", "<b></b><span></span>"),
      bt = mk("div", "rnd pane", svg("play"));
    c.insertAdjacentHTML("afterbegin", ic("vac"));
    c.appendChild(tx);
    c.appendChild(bt);
    bt.addEventListener("click", function (e) {
      e.stopPropagation();
      var s = V_(id);
      call("vacuum", s === "cleaning" ? "pause" : s === "returning" ? "return_to_base" : "start", { entity_id: id });
    });
    function up() {
      var b = A(id).battery_level;
      tx.firstChild.textContent = entName(id);
      tx.lastChild.textContent = cap(String(V_(id) || "").replace(/_/g, " ")) + (typeof b === "number" ? " · " + Math.round(b) + "%" : "");
      bt.innerHTML = svg(V_(id) === "cleaning" ? "pause" : "play");
    }
    up();
    reg(up);
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("vacuum"), "vac", ["vacuum"], save);
  },
});

/* ---- Energy ring ---- */
registerWidget("ring", {
  title: _T("power_ring"),
  icon: "plug",
  desc: _T("a_sensor_s_value_against_a_maximum"),
  sizes: ["xs", "s"],
  size: "s",
  clean: function (x) {
    var o = {},
      id = wxEntity(x, ["sensor"]),
      mx = Number(x.max);
    if (id) o.id = id;
    if (isFinite(mx) && mx > 0 && mx <= 1000000) o.max = mx;
    return o;
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("plug", _T("choose_a_sensor"), {}) : null;
    var id = x.id,
      c = wxCard("ringw", null),
      R = 26,
      L = 2 * Math.PI * R;
    c.innerHTML =
      "<svg viewBox='0 0 64 64'><circle class='bg' cx='32' cy='32' r='" + R + "'/><circle class='fg' cx='32' cy='32' r='" + R +
      "' stroke-dasharray='" + L.toFixed(1) + "' stroke-dashoffset='" + L.toFixed(1) + "' transform='rotate(-90 32 32)'/></svg><b></b><span></span>";
    var fg = c.querySelector(".fg"),
      vl = c.querySelector("b");
    c.lastChild.textContent = entName(id);
    function up() {
      var v = Number(V_(id)),
        f = isFinite(v) && x.max ? Math.max(0, Math.min(1, v / x.max)) : 0;
      fg.setAttribute("stroke-dashoffset", (L * (1 - f)).toFixed(1));
      vl.textContent = readText(id);
    }
    up();
    reg(up);
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("sensor"), "plug", ["sensor"], save);
    box.appendChild(
      numRow(
        "plug",
        _T("the_value_that_fills_the_ring"),
        d.wx.max,
        function (v) {
          if (v && v > 0) d.wx.max = v;
          else delete d.wx.max;
          save();
        },
        0,
        1000000
      )
    );
  },
});

/* ---- Sensor sparkline ---- */
registerWidget("sparkline", {
  title: _T("sensor_sparkline"),
  icon: "thermo",
  desc: _T("a_sensor_s_value_and_its_recent_curve"),
  sizes: ["s", "m"],
  size: "s",
  clean: function (x) {
    var o = {},
      id = wxEntity(x, ["sensor"]);
    if (id) o.id = id;
    if (x.r === "6h" || x.r === "24h" || x.r === "7d") o.r = x.r;
    return o;
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("thermo", _T("choose_a_sensor"), {}) : null;
    var id = x.id,
      c = wxCard("spark", null),
      v = mk("b"),
      pl = mk("div", "pl");
    c.appendChild(v);
    c.appendChild(pl);
    c.appendChild(mk("span")).textContent = entName(id);
    function up() {
      v.textContent = readText(id);
    }
    up();
    reg(up);
    chartLoad([id], x.r || "24h", function (data) {
      var pts = (data && data[id]) || [];
      if (pts.length < 2) return;
      var lo = Math.min.apply(null, pts.map(function (p) { return p[1]; })),
        hi = Math.max.apply(null, pts.map(function (p) { return p[1]; })),
        t0 = pts[0][0],
        t1 = pts[pts.length - 1][0],
        path = pts
          .map(function (p, i) {
            return (i ? "L" : "M") + (((p[0] - t0) / (t1 - t0 || 1)) * 100).toFixed(1) + " " + (24 - ((p[1] - lo) / (hi - lo || 1)) * 22 - 1).toFixed(1);
          })
          .join("");
      pl.innerHTML = "<svg viewBox='0 0 100 24' preserveAspectRatio='none'><path d='" + path + "'/></svg>";
    });
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("sensor"), "thermo", ["sensor"], save);
    box.appendChild(
      seg(
        [
          ["6h", _T("6_hours")],
          ["24h", _T("24_hours")],
          ["7d", _T("7_days")],
        ],
        d.wx.r || "24h",
        function (v) {
          d.wx.r = v;
          save();
        }
      )
    );
  },
});

/* ---- Agenda ---- */
registerWidget("agenda", {
  title: _T("agenda"),
  icon: "clock",
  desc: _T("the_next_events_of_a_calendar"),
  sizes: ["m", "l"],
  size: "m",
  clean: function (x) {
    var id = wxEntity(x, ["calendar"]);
    return id ? { id: id } : {};
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("clock", _T("choose_a_calendar"), {}) : null;
    var c = wxCard("agenda", null),
      list = mk("div");
    c.appendChild(list);
    function load() {
      var from = new Date(),
        to = new Date(from.getTime() + 14 * 86400000);
      HA.calendar.events(x.id, from.toISOString(), to.toISOString()).then(
        function (ev) {
          list.innerHTML = "";
          (Array.isArray(ev) ? ev : []).slice(0, d.sz === "l" ? 8 : 4).forEach(function (e) {
            var when = e.start && (e.start.dateTime || e.start.date),
              day = when ? new Date(when) : null,
              row = mk("div", "ev", "<b></b><span></span>");
            row.firstChild.textContent = String(e.summary || "").slice(0, 80);
            row.lastChild.textContent = day
              ? day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + (e.start.dateTime ? " · " + day.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "")
              : "";
            list.appendChild(row);
          });
          if (!list.children.length) list.appendChild(hintRow(_T("nothing_coming_up")));
        },
        function () {
          list.innerHTML = "";
          list.appendChild(hintRow(_T("couldn_t_load_the_calendar")));
        }
      );
    }
    load();
    wxEvery(c, 600000, load);
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("calendar"), "clock", ["calendar"], save);
  },
});

/* ---- To-do ---- */
registerWidget("todo", {
  title: _T("to_do"),
  icon: "check",
  desc: _T("the_open_items_of_a_to_do_list"),
  sizes: ["m", "l"],
  size: "m",
  clean: function (x) {
    var id = wxEntity(x, ["todo"]);
    return id ? { id: id } : {};
  },
  draw: function (d, x, ed) {
    if (!x.id || !wxVisible(x.id)) return ed && !x.id ? pill("check", _T("choose_a_list"), {}) : null;
    var c = wxCard("todow", null),
      list = mk("div");
    c.appendChild(list);
    function load() {
      HA.todo.items(x.id).then(
        function (items) {
          list.innerHTML = "";
          items
            .filter(function (i) { return i.status !== "completed"; })
            .slice(0, d.sz === "l" ? 10 : 5)
            .forEach(function (i) {
              var row = mk("div", "ti", "<i></i><span></span>");
              row.lastChild.textContent = String(i.summary || "").slice(0, 120);
              row.addEventListener("click", function () {
                row.classList.add("done");
                call("todo", "update_item", { entity_id: x.id, item: i.uid, status: "completed" });
                setTimeout(load, 600);
              });
              list.appendChild(row);
            });
          if (!list.children.length) list.appendChild(hintRow(_T("nothing_to_do")));
        },
        function () {
          list.innerHTML = "";
          list.appendChild(hintRow(_T("couldn_t_load_the_list")));
        }
      );
    }
    load();
    /* a list's state is how many items are open: it is read again only when that changes, not on every update of the house */
    var last = V_(x.id);
    reg(function () {
      var now = V_(x.id);
      if (now === last) return;
      last = now;
      load();
    });
    return c;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("to_do_list"), "check", ["todo"], save);
  },
});

/* ---- Folder ---- */
var FOLDER_DOMS = ["light", "switch", "fan", "input_boolean", "scene", "script", "button", "input_button", "cover", "automation"];

/* What a tap does to an entity of a folder: run it, or toggle it. */
function folderTap(id) {
  var dm = id.split(".")[0];
  if (dm === "scene" || dm === "script") call(dm, "turn_on", { entity_id: id });
  else if (dm === "button" || dm === "input_button") call(dm, "press", { entity_id: id });
  else if (dm === "cover" || dm === "automation") call(dm, "toggle", { entity_id: id });
  else call("homeassistant", "toggle", { entity_id: id });
}

registerWidget("folder", {
  title: _T("folder"),
  icon: "plus",
  desc: _T("up_to_twelve_devices_and_scenes_in_a_tile"),
  sizes: ["xs", "s"],
  size: "s",
  clean: function (x) {
    var ids = [];
    (Array.isArray(x.ids) ? x.ids : []).forEach(function (id) {
      if (ids.length < 12 && typeof id === "string" && ENTRE.test(id) && FOLDER_DOMS.indexOf(id.split(".")[0]) >= 0 && ids.indexOf(id) < 0) ids.push(id);
    });
    return { ids: ids };
  },
  draw: function (d, x, ed) {
    var ids = x.ids.filter(wxVisible);
    if (!ids.length && !ed) return null;
    var c = wxCard("fold", function () {
        showPopup("wfolder:" + secKey() + ":" + CURSEC.id + ":" + d.wid, true);
      }),
      g = mk("div", "fg");
    ids.slice(0, 4).forEach(function (id) {
      g.insertAdjacentHTML("beforeend", ic(dom(id) === "scene" ? "scene" : dom(id) === "light" ? "lights" : "plug"));
    });
    c.appendChild(g);
    c.appendChild(mk("span")).textContent = d.name;
    return c;
  },
  settings: function (box, d, save) {
    d.wx.ids.forEach(function (id, i) {
      box.appendChild(
        pill("plug", entName(id), {
          sub: function () {
            return id + " · " + _T("tap_to_remove");
          },
          tap: function () {
            d.wx.ids.splice(i, 1);
            save();
          },
        })
      );
    });
    if (d.wx.ids.length < 12)
      box.appendChild(
        pill("plus", _T("add_to_the_folder"), {
          tap: function () {
            pickEntity(_T("add_to_the_folder"), FOLDER_DOMS, null, function (id) {
              d.wx.ids.push(id);
              save();
            }, d.wx.ids);
          },
        })
      );
  },
});

/* The folder's contents, opened from its tile. `key` is "page:section:widget". */
function folderPage(b, key) {
  var q = key.split(":"),
    d = widgetOfSection(q[0], q[1], q[2]);
  if (!d) return;
  d.wx.ids.forEach(function (id) {
    if (!S(id) || !wxVisible(id)) return;
    b.appendChild(
      pill(dom(id) === "scene" ? "scene" : dom(id) === "light" ? "lights" : "plug", entName(id), {
        on: function () {
          return isOn(id);
        },
        tap: function () {
          folderTap(id);
        },
      })
    );
  });
}

/* ---- Stack ---- */
/* The widgets a stack can hold: a widget that is not an overview (those are sections of their own), not the lights master, and not a stack. */
function stackable(w) {
  var f = widgetDef(w);
  return !!f && !f.section && w !== "stack" && w !== "lmaster";
}

registerWidget("stack", {
  title: _T("stack"),
  icon: "swap",
  desc: _T("several_widgets_in_one_place_swipe_to_change"),
  sizes: ["s", "m", "l"],
  size: "m",
  clean: function (x) {
    var items = [];
    (Array.isArray(x.items) ? x.items : []).slice(0, 20).forEach(function (it) {
      var c = items.length < 5 && it && it.kind === "widget" && stackable(it.w) ? cleanDev(it) : null;
      if (c) items.push(c);
    });
    return { items: items };
  },
  draw: function (d, x, ed) {
    if (!x.items.length) return ed ? pill("swap", _T("add_widgets_to_the_stack"), {}) : null;
    var c = mk("div", "wc stk"),
      body = mk("div", "sb"),
      dots = mk("div", "sd"),
      at = 0,
      x0 = null;
    c.appendChild(body);
    c.appendChild(dots);
    function show(i) {
      at = (i + x.items.length) % x.items.length;
      body.innerHTML = "";
      var it = x.items[at],
        el = widgetDef(it.w).draw(it, it.wx, ed);
      if (el) body.appendChild(el);
      dots.innerHTML = "";
      x.items.forEach(function (_, k) {
        dots.appendChild(mk("i", k === at ? "on" : ""));
      });
    }
    show(0);
    c.addEventListener("pointerdown", function (e) {
      x0 = e.clientX;
    });
    c.addEventListener("pointerup", function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1));
    });
    dots.addEventListener("click", function (e) {
      e.stopPropagation();
      show(at + 1);
    });
    return c;
  },
  settings: function (box, d, save) {
    d.wx.items.forEach(function (it, i) {
      var f = widgetDef(it.w);
      box.appendChild(sep(f.title, f.icon));
      if (f.settings) f.settings(box, it, save);
      box.appendChild(
        pill("trash", _T("remove_from_the_stack"), {
          tap: function () {
            d.wx.items.splice(i, 1);
            save();
          },
        })
      );
    });
    if (d.wx.items.length < 5)
      Object.keys(WIDGETS)
        .filter(stackable)
        .forEach(function (w) {
          box.appendChild(
            pill(WIDGETS[w].icon, _T("add") + " " + WIDGETS[w].title.toLowerCase(), {
              tap: function () {
                d.wx.items.push(newWidgetDev(w));
                save();
              },
            })
          );
        });
  },
});
