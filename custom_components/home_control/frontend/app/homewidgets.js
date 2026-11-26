/* Widgets for a home screen (decision D-25): clock and weather, now playing, camera snapshot, vacuum, power ring, sensor sparkline, agenda, to-do, folder and stack. They are registered in the same registry as the
   others (app/widgetkinds.js) and are made of the dashboard's own parts, so they look like everything else on it: a tile is a `.gb` tile, a list is rows (`pill`) under a heading, a camera is a `.vidbox`, a button is a
   round button. Each says which entity it shows (checked here: the right kind of entity, nothing else), the sizes it can take, and what can be done in it: the to-do list adds, checks and removes items, the agenda adds
   events, a note is written where it is, now playing and the vacuum have their buttons. Every command goes through call(), which keeps the dashboard's access settings. */

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

/* A tile of a widget: the dashboard's own tile (`.gb`: a value over its name), with whatever else a widget puts in it. */
function wxTile(cls, open) {
  var t = mk("div", "gb pane wt " + cls);
  if (open) t.addEventListener("click", open);
  return t;
}

/* Keeps something on a widget up to date as long as the widget is on the page. */
function wxEvery(el, ms, fn) {
  var t = setInterval(function () {
    if (!el.isConnected) clearInterval(t);
    else fn();
  }, ms);
}

/* The part of a widget that is made again when its data changes (the rows of a list): the updates of its rows are kept apart, so rows that are gone are not updated any more. Returns the function that builds it. */
function wxLive(box, build) {
  var live = { fns: [] };
  reg(function () {
    runUpdates(live.fns, "widget update");
  });
  return function () {
    var outer = CUR;
    live.fns = [];
    CUR = live.fns;
    box.innerHTML = "";
    try {
      build(box);
    } finally {
      CUR = outer;
    }
    runUpdates(live.fns, "widget update");
  };
}

/* The pen of a widget that has content to edit (the items of a to-do list): it opens a popup of its own for that content and nothing else; the widget's own settings (its entity, its size, taking it off the page) are for the page editor. A widget that is
   not a device of a section (inside a stack) has no popup to open, and no pen while the page is edited, where a tap opens the settings. */
function wxPen(d) {
  var f = widgetDef(d.w),
    s = CURSEC;
  if (!f || !f.content || editing() || !s || (s.devs || []).indexOf(d) < 0) return null;
  return function () {
    showPopup("wcontent:" + secKey() + ":" + s.id + ":" + d.wid, true);
  };
}

/* What the popup of a widget's content shows. `key` is "page:section:widget". */
function widgetContentPage(b, key) {
  var q = key.split(":"),
    d = widgetOfSection(q[0], q[1], q[2]),
    f = d && widgetDef(d.w);
  if (f && f.content && d.wx.id) f.content(b, d);
}

/* A widget that is a card of its own: one `.pane` with a header (the icon, the name, a small button when the widget can add something, and the pen) over its content, as on a phone's home screen. `widget` is the
   widget's device when `d` only gives the name. Returns the card and its body. */
function wxCard(d, icon, addLabel, add, widget) {
  var card = mk("div", "wcard pane"),
    head = mk("div", "wh", ic(icon) + "<b></b>"),
    body = mk("div", "wb"),
    edit = wxPen(widget || d);
  head.querySelector("b").textContent = d.name;
  function button(cls, glyph, label, fn) {
    var b = mk("div", "rnd pane " + cls, svg(glyph));
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", label);
    b.addEventListener("click", fn);
    head.appendChild(b);
  }
  if (add) button("wadd", "plus", addLabel, add);
  if (edit) button("wpen", "edit", _T("edit_content"), edit);
  card.appendChild(head);
  card.appendChild(body);
  return { card: card, body: body };
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
    var t = wxTile("clk"),
      tm = mk("b"),
      dt = mk("span");
    t.appendChild(tm);
    t.appendChild(dt);
    function weatherId() {
      return x.id || firstWeather();
    }
    function up() {
      var n = new Date(),
        w = weatherId(),
        a = w && wxVisible(w) && S(w) ? A(w) : null,
        cond = a ? (HCOND[V_(w)] || [cap(String(V_(w)).replace(/[-_]/g, " "))])[0] : "";
      tm.textContent = n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      dt.textContent = n.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + (a ? " · " + (typeof a.temperature === "number" ? Math.round(a.temperature) + "° " : "") + cond : "");
    }
    up();
    reg(up);
    wxEvery(t, 15000, up);
    return t;
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
      c = mk("div", "np pane"),
      art = mk("div", "art"),
      tx = mk("div", "tx", "<b></b><span></span>"),
      bar = mk("div", "ctl");
    function btn(icon, service, label) {
      var b = mk("div", "rnd pane", svg(icon));
      b.setAttribute("role", "button");
      b.setAttribute("aria-label", label);
      b.addEventListener("click", function () {
        call("media_player", service, { entity_id: id });
      });
      bar.appendChild(b);
      return b;
    }
    btn("prev", "media_previous_track", _T("previous"));
    var pp = btn("play", "media_play_pause", _T("play_pause"));
    btn("next", "media_next_track", _T("next"));
    c.appendChild(art);
    c.appendChild(tx);
    c.appendChild(bar);
    c.addEventListener("click", function (e) {
      if (!e.target.closest(".rnd")) showPopup(devPop({ kind: "media", id: id, name: entName(id), icon: "media" }), true);
    });
    function up() {
      var a = A(id),
        pic = a.entity_picture_local || a.entity_picture || "";
      art.style.backgroundImage = pic && /^(\/(?!\/)|https:\/\/)/.test(pic) ? "url(" + JSON.stringify(pic) + ")" : "";
      tx.firstChild.textContent = a.media_title || entName(id);
      tx.lastChild.textContent = a.media_artist || (V_(id) === "playing" ? _T("playing") : cap(String(V_(id) || "")));
      pp.innerHTML = svg(V_(id) === "playing" ? "pause" : "play");
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
      c = mk("div", "vidbox snapw"),
      im = mk("img"),
      nm = mk("span");
    im.alt = "";
    nm.textContent = entName(id);
    c.appendChild(im);
    c.appendChild(nm);
    c.addEventListener("click", function () {
      showPopup(devPop({ kind: "camera", id: id, name: entName(id), icon: "cam" }), true);
    });
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
      w = wxCard({ name: entName(id) }, "vac", "", null, d),
      st = mk("span", "wsub"),
      bar = mk("div", "wbar");
    w.card.querySelector(".wh b").after(st);
    w.card.addEventListener("click", function (e) {
      if (e.target.closest(".rbtn")) return;
      /* a vacuum the dashboard has as an appliance opens that, else the vacuum's own popup */
      var known = vacuumList().filter(function (v) {
        return v.id === id;
      })[0];
      showPopup(known ? known.pop : devPop({ kind: "vacuum", id: id, name: entName(id), icon: "vac" }), true);
    });
    [
      ["play", "start", _T("start")],
      ["pause", "pause", _T("pause")],
      ["home", "return_to_base", _T("dock")],
    ].forEach(function (b) {
      bar.appendChild(
        rbtn(
          b[0],
          function () {
            call("vacuum", b[1], { entity_id: id });
          },
          b[2]
        )
      );
    });
    w.body.appendChild(bar);
    function up() {
      var b = vacBattery(id);
      st.textContent = cap(String(V_(id) || "").replace(/_/g, " ")) + (b !== undefined ? " · " + b + "%" : "");
    }
    up();
    reg(up);
    return w.card;
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("vacuum"), "vac", ["vacuum"], save);
  },
});

/* ---- Power ring ---- */
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
      t = wxTile("ringw"),
      R = 26,
      L = 2 * Math.PI * R,
      g = mk("div", "rg2");
    g.innerHTML =
      "<svg viewBox='0 0 64 64'><circle class='bg' cx='32' cy='32' r='" + R + "'/><circle class='fg' cx='32' cy='32' r='" + R +
      "' stroke-dasharray='" + L.toFixed(1) + "' stroke-dashoffset='" + L.toFixed(1) + "' transform='rotate(-90 32 32)'/></svg><b></b>";
    t.appendChild(g);
    t.appendChild(mk("span")).textContent = entName(id);
    var fg = g.querySelector(".fg"),
      vl = g.querySelector("b");
    function up() {
      var v = Number(V_(id)),
        f = isFinite(v) && x.max ? Math.max(0, Math.min(1, v / x.max)) : 0;
      fg.setAttribute("stroke-dashoffset", (L * (1 - f)).toFixed(1));
      vl.textContent = readText(id);
    }
    up();
    reg(up);
    return t;
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
      t = wxTile("spark"),
      v = mk("b"),
      pl = mk("div", "pl");
    t.appendChild(v);
    t.appendChild(pl);
    t.appendChild(mk("span")).textContent = entName(id);
    function up() {
      v.textContent = readText(id);
    }
    up();
    reg(up);
    chartLoad([id], x.r || "24h", function (data) {
      var pts = (data && data[id]) || [];
      if (pts.length < 2) {
        pl.textContent = _T("no_history_yet");
        return;
      }
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
    return t;
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
/* Adding an event: a title, a day and a time (or the whole day), for a calendar that accepts them. */
function eventDlg(entity, done) {
  var now = new Date(),
    pad = function (n) {
      return String(n).padStart(2, "0");
    },
    day = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()),
    st = { title: "", day: day, time: pad((now.getHours() + 1) % 24) + ":00", all: false };
  bottomSheet(function (box, close) {
    function field(type, ph, key) {
      var w = mk("div", "as-t"),
        i = mk("input");
      i.type = type;
      i.placeholder = ph;
      i.value = st[key];
      i.addEventListener("input", function () {
        st[key] = i.value;
      });
      w.appendChild(i);
      box.appendChild(w);
      return i;
    }
    var title = field("text", _T("event_title"), "title");
    field("date", "", "day");
    var time = field("time", "", "time");
    var all = mk("div", "as-b", "");
    all.setAttribute("role", "checkbox");
    function paintAll() {
      all.textContent = (st.all ? "✓ " : "") + _T("all_day");
      all.setAttribute("aria-checked", st.all ? "true" : "false");
      time.parentNode.style.display = st.all ? "none" : "";
    }
    all.addEventListener("click", function () {
      st.all = !st.all;
      paintAll();
    });
    box.appendChild(all);
    paintAll();
    var add = mk("div", "as-b");
    add.setAttribute("role", "button");
    add.textContent = _T("add_event");
    add.addEventListener("click", function () {
      if (!st.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(st.day)) {
        title.focus();
        return;
      }
      var start = new Date(st.day + "T" + (st.all ? "00:00" : /^\d{2}:\d{2}$/.test(st.time) ? st.time : "09:00")),
        end = new Date(start.getTime() + (st.all ? 86400000 : 3600000)),
        f = function (d, withTime) {
          return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + (withTime ? " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00" : "");
        },
        data = st.all ? { entity_id: entity, summary: st.title.trim().slice(0, 120), start_date: f(start), end_date: f(end) } : { entity_id: entity, summary: st.title.trim().slice(0, 120), start_date_time: f(start, true), end_date_time: f(end, true) };
      close();
      call("calendar", "create_event", data);
      setTimeout(done, 800);
    });
    box.appendChild(add);
    var no = mk("div", "as-b cancel");
    no.setAttribute("role", "button");
    no.textContent = _T("cancel");
    no.addEventListener("click", close);
    box.appendChild(no);
    setTimeout(function () {
      title.focus();
    }, 380);
  });
}

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
    var w = wxCard(d, "clock", _T("add_event"), function () {
        eventDlg(x.id, load);
      }),
      events = null,
      failed = false,
      build = wxLive(w.body, function (box) {
        if (failed) box.appendChild(hintRow(_T("couldn_t_load_the_calendar")));
        else if (events && !events.length) box.appendChild(hintRow(_T("nothing_coming_up")));
        else
          (events || []).slice(0, d.sz === "l" ? 8 : 4).forEach(function (e) {
            var when = e.start && (e.start.dateTime || e.start.date),
              day = when ? new Date(when) : null,
              row = mk("div", "wr", "<span class='dd'><b></b><span></span></span><span class='tx'><span class='nm'></span><span class='sb'></span></span>");
            if (day) {
              row.querySelector(".dd b").textContent = day.getDate();
              row.querySelector(".dd span").textContent = day.toLocaleDateString([], { weekday: "short" });
            }
            row.querySelector(".nm").textContent = String(e.summary || "").slice(0, 80);
            row.querySelector(".sb").textContent = e.start && e.start.dateTime ? day.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : _T("all_day");
            box.appendChild(row);
          });
      });
    function load() {
      var from = new Date(),
        to = new Date(from.getTime() + 14 * 86400000);
      HA.calendar.events(x.id, from.toISOString(), to.toISOString()).then(
        function (ev) {
          events = Array.isArray(ev) ? ev : [];
          failed = false;
          build();
        },
        function () {
          failed = true;
          build();
        }
      );
    }
    build();
    load();
    wxEvery(w.card, 600000, load);
    return w.card;
  },
  /* its events (to read: Home Assistant can add an event to a calendar but not change or delete one) and a way to add one */
  content: function (box, d) {
    var id = d.wx.id,
      list = mk("div");
    box.appendChild(
      pill("plus", _T("add_event"), {
        tap: function () {
          eventDlg(id, fill);
        },
      })
    );
    box.appendChild(list);
    function fill() {
      var from = new Date();
      HA.calendar.events(id, from.toISOString(), new Date(from.getTime() + 60 * 86400000).toISOString()).then(
        function (ev) {
          list.innerHTML = "";
          if (!ev.length) list.appendChild(hintRow(_T("nothing_coming_up")));
          ev.slice(0, 30).forEach(function (e) {
            var when = e.start && (e.start.dateTime || e.start.date),
              day = when ? new Date(when) : null;
            list.appendChild(
              pill("clock", String(e.summary || "").slice(0, 80), {
                sub: function () {
                  return day ? day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + (e.start.dateTime ? " · " + day.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "") : "";
                },
              })
            );
          });
        },
        function () {
          list.innerHTML = "";
          list.appendChild(hintRow(_T("couldn_t_load_the_calendar")));
        }
      );
    }
    fill();
  },
  settings: function (box, d, save) {
    wxPick(box, d, _T("calendar"), "clock", ["calendar"], save);
  },
});

/* ---- To-do ---- */
/* The to-do lists drawn on the page, by entity: each knows how to read its list again, so the edit view can refresh the card after an item is changed there. */
var TODO_LOAD = {};

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
    var w = wxCard(d, "check", _T("add_item"), function () {
        textDlg(_T("new_item"), "", _T("add_item"), function (v) {
          call("todo", "add_item", { entity_id: x.id, item: v.trim().slice(0, 120) });
          setTimeout(load, 600);
        });
      }),
      items = null,
      failed = false,
      build = wxLive(w.body, function (box) {
        if (failed) return box.appendChild(hintRow(_T("couldn_t_load_the_list")));
        if (!items) return;
        var open = items.filter(function (i) { return i.status !== "completed"; }),
          done = items.filter(function (i) { return i.status === "completed"; });
        open.slice(0, d.sz === "l" ? 12 : 6).forEach(function (i) {
          box.appendChild(row(i, false));
        });
        if (!open.length) box.appendChild(hintRow(_T("nothing_to_do")));
        done.slice(0, 3).forEach(function (i) {
          box.appendChild(row(i, true));
        });
      });
    /* a tap on the circle checks an item off, or puts it back */
    function row(i, finished) {
      var r = mk("div", "wr" + (finished ? " done" : ""), "<span class='ck2'></span><span class='nm'></span>"),
        ticked = finished;
      r.querySelector(".nm").textContent = String(i.summary || "").slice(0, 120);
      r.querySelector(".ck2").setAttribute("role", "checkbox");
      r.querySelector(".ck2").setAttribute("aria-checked", finished ? "true" : "false");
      r.querySelector(".ck2").addEventListener("click", function () {
        ticked = !ticked;
        r.classList.toggle("done", ticked);
        call("todo", "update_item", { entity_id: x.id, item: i.uid, status: ticked ? "completed" : "needs_action" });
        setTimeout(load, 600);
      });
      return r;
    }
    function load() {
      HA.todo.items(x.id).then(
        function (list) {
          items = list;
          failed = false;
          build();
        },
        function () {
          failed = true;
          build();
        }
      );
    }
    build();
    load();
    TODO_LOAD[x.id] = load;
    /* a list's state is how many items are open: it is read again only when that changes, not on every update of the house */
    var last = V_(x.id);
    reg(function () {
      var now = V_(x.id);
      if (now === last) return;
      last = now;
      load();
    });
    return w.card;
  },
  /* its items, in a popup of their own: add one, change the words of one (a tap), take one off the list (the trash, after asking) */
  content: function (box, d) {
    var id = d.wx.id,
      list = mk("div");
    box.appendChild(
      pill("plus", _T("add_item"), {
        tap: function () {
          textDlg(_T("new_item"), "", _T("add_item"), function (v) {
            call("todo", "add_item", { entity_id: id, item: v.trim().slice(0, 120) });
            again();
          });
        },
      })
    );
    box.appendChild(list);
    function again() {
      setTimeout(function () {
        if (TODO_LOAD[id]) TODO_LOAD[id]();
        fill();
      }, 600);
    }
    function fill() {
      HA.todo.items(id).then(
        function (items) {
          list.innerHTML = "";
          if (!items.length) list.appendChild(hintRow(_T("nothing_to_do")));
          items.forEach(function (i) {
            list.appendChild(
              pill("check", String(i.summary || "").slice(0, 120), {
                sub: function () {
                  return i.status === "completed" ? _T("done") : "";
                },
                tap: function () {
                  textDlg(_T("to_do_item"), String(i.summary || ""), _T("save"), function (v) {
                    call("todo", "update_item", { entity_id: id, item: i.uid, rename: v.trim().slice(0, 120) });
                    again();
                  });
                },
                action: {
                  label: _T("remove_item"),
                  icon: function () {
                    return "trash";
                  },
                  show: function () {
                    return true;
                  },
                  fn: function () {
                    confirmDlg(
                      _T("remove_item") + ": " + String(i.summary || "").slice(0, 60) + "?",
                      function () {
                        call("todo", "remove_item", { entity_id: id, item: [i.uid] });
                        again();
                      },
                      _T("remove_item")
                    );
                  },
                },
              })
            );
          });
        },
        function () {
          list.innerHTML = "";
          list.appendChild(hintRow(_T("couldn_t_load_the_list")));
        }
      );
    }
    fill();
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

/* The icon an entity of a folder has on the dashboard: the one of the device when the page has it, else one for its kind. */
function folderIcon(id) {
  var dv = devsOf().filter(function (d) {
    return d.id === id;
  })[0];
  return (dv && dv.icon) || (dom(id) === "scene" ? "scene" : dom(id) === "light" ? "lights" : dom(id) === "script" ? "play" : "plug");
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
    var t = wxTile("fold", function () {
        showPopup("wfolder:" + secKey() + ":" + CURSEC.id + ":" + d.wid, true);
      }),
      g = mk("div", "fg");
    ids.slice(0, 4).forEach(function (id) {
      g.insertAdjacentHTML("beforeend", ic(folderIcon(id)));
    });
    t.appendChild(g);
    t.appendChild(mk("span")).textContent = d.name;
    return t;
  },
  settings: function (box, d, save) {
    d.wx.ids.forEach(function (id, i) {
      box.appendChild(
        pill(folderIcon(id), entName(id), {
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
      pill(folderIcon(id), entName(id), {
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
  return !!f && !f.section && !f.noStack && w !== "stack" && w !== "lmaster";
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
    var c = mk("div", "stk"),
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
