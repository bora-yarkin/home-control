/* History page (what happened and who caused it) and the change log with undo. */

/* ---- history (admin) ---- */
var ALLUSERS = null,
  HIST = {
    range: 24,
    room: "all",
    kind: "all",
    by: "all",
    q: "",
    limit: 80,
    events: null,
    ents: null,
  };

var HISTKINDS = [
  ["all", _T("everything")],
  ["light", _T("lights")],
  ["media", _T("media")],
  ["climate", _T("climate")],
  ["fan", _T("fans")],
  ["switch", _T("switches")],
  ["other", _T("other")],
];

function allUsers(cb) {
  if (ALLUSERS) return cb(ALLUSERS);
  HA.users()
    .then(function (l) {
      ALLUSERS = {};
      l.forEach(function (u) {
        ALLUSERS[u.id] = u.name;
      });
      cb(ALLUSERS);
    })
    .catch(function () {
      ALLUSERS = {};
      cb(ALLUSERS);
    });
}

function histEnts() {
  var out = [],
    seen = {};
  UI.rooms.forEach(function (r) {
    (UI.devs[r.id] || []).forEach(function (d) {
      if (
        !d.id ||
        seen[d.id] ||
        ["light", "media", "climate", "fan", "switch", "vacuum", "cover", "lock", "camera"].indexOf(
          d.kind
        ) < 0
      )
        return;
      seen[d.id] = 1;
      out.push({ id: d.id, name: d.name, icon: d.icon || "plug", kind: d.kind, room: r.id });
    });
  });
  return out;
}

function histFetch(cb) {
  var ents = histEnts(),
    end = new Date(),
    start = new Date(end.getTime() - HIST.range * 3600000);
  HA.logbook({
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    entity_ids: ents.map(function (e) {
      return e.id;
    }),
  })
    .then(function (ev) {
      cb(ev || [], ents);
    })
    .catch(function () {
      cb(null, ents);
    });
}

function histKindOf(k) {
  return ["light", "media", "climate", "fan", "switch"].indexOf(k) >= 0 ? k : "other";
}

/* Whether an automation or script caused an event. */
function histAuto(e) {
  return (
    e.context_event_type === "automation_triggered" ||
    (e.context_entity_id || "").indexOf("automation.") === 0 ||
    e.context_domain === "script" ||
    e.context_event_type === "script_started"
  );
}

/* Who or what caused an event. An automation started by a state change, such as a wall switch, is named after the device that started it; any other automation or script is named as such. */
function histBy(e, users) {
  if (e.context_user_id && users[e.context_user_id]) return users[e.context_user_id];
  if (e.context_user_id) return _T("a_user");
  if (
    e.context_event_type === "automation_triggered" ||
    (e.context_entity_id || "").indexOf("automation.") === 0
  ) {
    var m = /triggered by state of ([a-z_]+\.[a-z0-9_]+)/.exec(e.context_message || "");
    if (m) {
      var h = H(),
        en = h.entities[m[1]],
        dv = en && en.device_id && h.devices[en.device_id];
      return (
        (dv && (dv.name_by_user || dv.name)) ||
        (h.states[m[1]] && h.states[m[1]].attributes.friendly_name) ||
        m[1]
      );
    }
    return "Automation";
  }
  if (e.context_domain === "script" || e.context_event_type === "script_started") return "Script";
  return "";
}

function histDay(ts) {
  var d = new Date(ts * 1000),
    n = new Date(),
    y = new Date(n.getTime() - 86400000),
    k = function (x) {
      return x.getFullYear() + "-" + x.getMonth() + "-" + x.getDate();
    };
  if (k(d) === k(n)) return _T("today");
  if (k(d) === k(y)) return _T("yesterday");
  return d.toLocaleDateString(LOC(), { weekday: "long", day: "numeric", month: "long" });
}

function histTime(ts) {
  var d = new Date(ts * 1000);
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

function histChips(label, opts, cur, fn) {
  var wrap = mk("div", "hf"),
    l = mk("div", "hfl");
  l.textContent = label;
  wrap.appendChild(l);
  var row = mk("div", "pre hfr");
  opts.forEach(function (o) {
    var c = mk("div", "rbtn pane keepc" + (String(o[0]) === String(cur) ? " act" : ""));
    c.textContent = o[1];
    c.addEventListener("click", function () {
      fn(o[0]);
    });
    row.appendChild(c);
  });
  wrap.appendChild(row);
  return wrap;
}

function historyPage(b) {
  var top = mk("div"),
    qw = mk("div", "sqw pane", svg("search")),
    qi = mk("input", "sq"),
    sum = mk("div"),
    list = mk("div");
  qi.type = "text";
  qi.placeholder = _T("search_devices_or_events");
  qi.setAttribute("autocomplete", "off");
  qi.value = HIST.q;
  qw.appendChild(qi);
  b.appendChild(sum);
  b.appendChild(top);
  b.appendChild(qw);
  b.appendChild(list);
  var users = {};
  function filtered() {
    var ents = {};
    (HIST.ents || []).forEach(function (e) {
      ents[e.id] = e;
    });
    var tk = norm(HIST.q).trim().split(/\s+/).filter(Boolean);
    return (HIST.events || [])
      .filter(function (ev) {
        var en = ents[ev.entity_id];
        if (!en) return false;
        if (HIST.room !== "all" && en.room !== HIST.room) return false;
        if (HIST.kind !== "all" && histKindOf(en.kind) !== HIST.kind) return false;
        var by = histBy(ev, users);
        if (HIST.by === "auto") {
          if (!histAuto(ev)) return false;
        } else if (HIST.by !== "all" && by !== HIST.by) return false;
        if (tk.length) {
          var hay = norm(
            en.name + " " + (ev.message || "") + " " + by + " " + (TITLES[en.room] || "")
          );
          if (
            !tk.every(function (x) {
              return hay.indexOf(x) >= 0;
            })
          )
            return false;
        }
        return true;
      })
      .sort(function (a, c) {
        return c.when - a.when;
      });
  }
  function drawTop() {
    top.innerHTML = "";
    top.appendChild(
      histChips(
        _T("time"),
        [
          [1, _T("last_hour")],
          [6, _T("6_hours")],
          [24, _T("24_hours")],
          [168, _T("7_days")],
        ],
        HIST.range,
        function (v) {
          HIST.range = +v;
          HIST.limit = 80;
          load();
        }
      )
    );
    top.appendChild(
      histChips(
        _T("room"),
        [["all", _T("all_rooms")]].concat(
          UI.rooms.map(function (r) {
            return [r.id, r.name];
          })
        ),
        HIST.room,
        function (v) {
          HIST.room = v;
          HIST.limit = 80;
          drawTop();
          drawList();
        }
      )
    );
    top.appendChild(
      histChips(_T("type"), HISTKINDS, HIST.kind, function (v) {
        HIST.kind = v;
        HIST.limit = 80;
        drawTop();
        drawList();
      })
    );
    var by = [["all", _T("anyone")]],
      seenBy = {};
    (HIST.events || []).forEach(function (e) {
      var n = histBy(e, users);
      if (n && !histAuto(e) && !seenBy[n]) {
        seenBy[n] = 1;
        by.push([n, n]);
      }
    });
    by.push(["auto", _T("automations")]);
    top.appendChild(
      histChips(_T("by_2"), by, HIST.by, function (v) {
        HIST.by = v;
        HIST.limit = 80;
        drawTop();
        drawList();
      })
    );
  }
  function drawSum(evs) {
    sum.innerHTML = "";
    var card = mk("div", "hcard pane"),
      n = evs.length,
      devs = {};
    evs.forEach(function (e) {
      devs[e.entity_id] = (devs[e.entity_id] || 0) + 1;
    });
    var topDev = Object.keys(devs).sort(function (a, c) {
        return devs[c] - devs[a];
      })[0],
      en = (HIST.ents || []).filter(function (x) {
        return x.id === topDev;
      })[0];
    var h = mk("div", "hhead");
    h.innerHTML = "<div><div class='hbig'></div><div class='hsub'></div></div>";
    h.querySelector(".hbig").textContent = n + (n === 1 ? _T("event") : _T("events"));
    h.querySelector(".hsub").textContent =
      Object.keys(devs).length +
      (Object.keys(devs).length === 1 ? _T("device_3") : _T("devices_3")) +
      _T("active") +
      (en ? _T("most_active") + en.name : "");
    card.appendChild(h);
    var nb = 24,
      bk = [],
      i,
      span = HIST.range * 3600000,
      t0 = Date.now() - span;
    for (i = 0; i < nb; i++) bk.push(0);
    evs.forEach(function (e) {
      var k = Math.min(nb - 1, Math.max(0, Math.floor(((e.when * 1000 - t0) / span) * nb)));
      bk[k]++;
    });
    var mx = Math.max.apply(null, bk.concat([1])),
      bars = mk("div", "hbars");
    bk.forEach(function (v) {
      var c = mk("div", "hbar");
      c.style.height = Math.max(4, Math.round((v / mx) * 100)) + "%";
      if (!v) c.classList.add("z");
      bars.appendChild(c);
    });
    card.appendChild(bars);
    var ax = mk("div", "haxis"),
      a1 = mk("span"),
      a2 = mk("span");
    a1.textContent = HIST.range >= 168 ? _T("7_days_ago") : HIST.range + _T("h_ago");
    a2.textContent = _T("now_2");
    ax.appendChild(a1);
    ax.appendChild(a2);
    card.appendChild(ax);
    sum.appendChild(card);
  }
  function drawList() {
    var evs = filtered(),
      ents = {};
    (HIST.ents || []).forEach(function (e) {
      ents[e.id] = e;
    });
    drawSum(evs);
    redrawBox(list, function () {
      if (HIST.events === null) {
        list.appendChild(
          pill("info", _T("couldn_t_load_the_history"), {
            sub: function () {
              return _T("home_assistant_did_not_return_any_ev");
            },
          })
        );
        return;
      }
      if (!evs.length) {
        list.appendChild(
          pill("info", _T("nothing_matches"), {
            sub: function () {
              return _T("try_a_longer_time_range_or_fewer_fil");
            },
          })
        );
        return;
      }
      var last = "";
      evs.slice(0, HIST.limit).forEach(function (ev) {
        var en = ents[ev.entity_id],
          day = histDay(ev.when);
        if (day !== last) {
          last = day;
          var dh = mk("div", "hday");
          dh.textContent = day;
          list.appendChild(dh);
        }
        var st = String(ev.state || ev.message || "").toLowerCase(),
          cls = /unavailable|unknown|offline|error/.test(st)
            ? "warn"
            : /\bon\b|playing|open|cleaning|heat|cool|unlocked/.test(st) ||
                /turned on/.test(String(ev.message || ""))
              ? "on"
              : "off",
          by = histBy(ev, users);
        var row = mk(
          "div",
          "hrow pane",
          "<div class='hdot " +
            cls +
            "'>" +
            svg(en.icon || "plug") +
            "</div><div class='hmain'><div class='hnm'></div><div class='hms'></div><div class='hmeta'></div></div><div class='htime'></div>"
        );
        row.querySelector(".hnm").textContent = en.name;
        row.querySelector(".hms").textContent = cap(String(ev.message || ev.state || "changed"));
        row.querySelector(".htime").textContent = histTime(ev.when);
        var meta = row.querySelector(".hmeta");
        [TITLES[en.room], by ? "by " + by : ""].forEach(function (x) {
          if (!x) return;
          var tg = mk("span", "htag");
          tg.textContent = x;
          meta.appendChild(tg);
        });
        list.appendChild(row);
      });
      if (evs.length > HIST.limit) {
        var more = pill("plus", _T("show_more"), {
          sub: function () {
            return evs.length - HIST.limit + _T("older_events");
          },
          tap: function () {
            HIST.limit += 80;
            drawList();
          },
        });
        list.appendChild(more);
      }
    });
  }
  function load() {
    drawTop();
    list.innerHTML = "";
    list.appendChild(pill("restart", _T("loading_history"), {}));
    histFetch(function (ev, ents) {
      HIST.events = ev;
      HIST.ents = ents;
      drawTop();
      drawList();
    });
  }
  qi.addEventListener("input", function () {
    HIST.q = qi.value;
    HIST.limit = 80;
    drawList();
  });
  allUsers(function (u) {
    users = u;
    load();
  });
}

/* ---- change log with undo (admin) ---- */
var LOGKEY = "dashboard_log",
  LOGNEXT = false,
  LOGSKIP = false,
  LOGDATA = null,
  LOGPARTS = ["ui", "scenes", "presets", "access", "notify"];

var UIKEYLAB = {
    rooms: "rooms",
    devs: "devices",
    chips: "climate tiles",
    stat: "status tiles",
    bats: "batteries",
    layout: "layout",
    caps: "light features",
    on: "light defaults",
    newSince: "new devices",
    ignored: "ignored devices",
    meta: "names",
  },
  PARTLAB = {
    scenes: "scenes",
    presets: "light presets",
    access: "access rules",
    sched: "schedules",
    notify: "notifications",
  };

function logDiff(prev, cur) {
  var parts = [],
    words = [];
  LOGPARTS.forEach(function (p) {
    if (JSON.stringify(prev[p]) === JSON.stringify(cur[p])) return;
    parts.push(p);
    if (p === "ui") {
      var pu = prev.ui || {},
        cu = cur.ui || {};
      Object.keys(UIKEYLAB).forEach(function (k) {
        if (JSON.stringify(pu[k]) !== JSON.stringify(cu[k]) && words.indexOf(UIKEYLAB[k]) < 0)
          words.push(UIKEYLAB[k]);
      });
    } else words.push(PARTLAB[p]);
  });
  return { parts: parts, summary: words.length ? cap(words.join(", ")) : _T("settings") };
}

function logLoad(cb) {
  if (LOGDATA) return cb(LOGDATA);
  HA.data
    .get("system", LOGKEY)
    .then(function (v) {
      LOGDATA = v && Array.isArray(v.entries) ? v : { v: 1, entries: [] };
      cb(LOGDATA);
    })
    .catch(function () {
      LOGDATA = { v: 1, entries: [] };
      cb(LOGDATA);
    });
}

function logSave() {
  HA.data.set("system", LOGKEY, LOGDATA).catch(function () {});
}

function logChange(pj, cj) {
  if (!pj) return;
  var prev = JSON.parse(pj),
    cur = JSON.parse(cj),
    d = logDiff(prev, cur);
  if (!d.parts.length) return;
  var snap = {};
  d.parts.forEach(function (p) {
    if (p !== "notify") snap[p] = prev[p];
  });
  var now = Date.now(),
    user = (H().user && H().user.name) || _T("admin_2");
  logLoad(function (L) {
    var e = L.entries[0];
    if (e && e.u === user && now - e.t < 60000) {
      Object.keys(snap).forEach(function (p) {
        if (!(p in e.p)) e.p[p] = snap[p];
      });
      e.t = now;
      var w = (e.s + ", " + d.summary.toLowerCase()).split(", "),
        u = [];
      w.forEach(function (x) {
        x = x.toLowerCase();
        if (u.indexOf(x) < 0) u.push(x);
      });
      e.s = cap(u.join(", "));
    } else L.entries.unshift({ t: now, u: user, s: d.summary, p: snap });
    L.entries = L.entries.slice(0, 10);
    logSave();
    var e0 = L.entries[0];
    if (ISADMIN && e0)
      toastAct(_T("saved"), _T("undo_btn"), function () {
        LOGSKIP = true;
        undoEntry(e0);
        LOGDATA.entries = LOGDATA.entries.filter(function (x) {
          return x !== e0;
        });
        logSave();
      });
  });
}

function toastAct(m, label, fn) {
  var old = document.querySelector(".toast.act");
  if (old) old.remove();
  var t = mk("div", "toast pane act");
  t.setAttribute("role", "status");
  var s = document.createElement("span");
  s.textContent = m;
  t.appendChild(s);
  var b = mk("span", "tact");
  b.textContent = label;
  b.addEventListener("click", function () {
    t.remove();
    fn();
  });
  t.appendChild(b);
  document.body.appendChild(t);
  requestAnimationFrame(function () {
    t.classList.add("in");
  });
  setTimeout(function () {
    t.classList.remove("in");
    setTimeout(function () {
      t.remove();
    }, 300);
  }, 7000);
}

function undoEntry(e) {
  var n = JSON.parse(JSON.stringify(STORE));
  Object.keys(e.p).forEach(function (p) {
    if (p === "ui") {
      var u = cleanUI(e.p.ui);
      if (u) n.ui = u;
    } else n[p] = e.p[p];
  });
  var c = cleanStore(n);
  if (!c.ui) c.ui = UI;
  STORE = c;
  UI = c.ui;
  STORE_VER++;
  LOGNEXT = true;
  storeSave();
  applyUI();
  buildDock();
  render();
  toast(_T("change_undone"));
}

function logPage(b) {
  var box = mk("div");
  b.appendChild(box);
  logLoad(function (L) {
    if (!box.isConnected) return;
    redrawBox(box, function () {
      var hint = mk("div", "hint");
      hint.textContent = _T("the_last_ten_changes_to_settings_und");
      box.appendChild(hint);
      if (!L.entries.length)
        box.appendChild(
          pill("info", _T("no_changes_yet"), {
            sub: function () {
              return _T("changes_you_make_in_settings_appear_");
            },
          })
        );
      L.entries.forEach(function (e) {
        var keys = Object.keys(e.p),
          d = new Date(e.t),
          when =
            d.toLocaleDateString(LOC(), { day: "numeric", month: "short" }) +
            " " +
            histTime(e.t / 1000);
        box.appendChild(
          pill("restart", e.s, {
            sub: function () {
              return when + " · " + e.u + (keys.length ? "" : _T("can_t_be_undone"));
            },
            tap: function () {
              if (!keys.length) {
                toast(_T("this_change_can_t_be_undone_here"));
                return;
              }
              confirmDlg(_T("undo") + e.s + _T("from") + when + "?", function () {
                undoEntry(e);
              });
            },
          })
        );
      });
    });
  });
}
