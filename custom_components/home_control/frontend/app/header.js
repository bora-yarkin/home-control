/* The page header: weather, people, lights, clock, greeting and its settings. */

/* Header items: weather, who is home, lights on, or any sensor reading. The list, size and greeting are edited in Settings, Names and header. */
var HCOND = {
  sunny: ["Sunny", "bright"],
  "clear-night": ["Clear", "moon"],
  cloudy: ["Cloudy", "info"],
  partlycloudy: ["Partly cloudy", "info"],
  rainy: ["Rain", "drop"],
  pouring: ["Heavy rain", "drop"],
  "lightning-rainy": ["Storm", "drop"],
  lightning: ["Storm", "info"],
  snowy: ["Snow", "info"],
  "snowy-rainy": ["Sleet", "drop"],
  fog: ["Fog", "info"],
  hail: ["Hail", "drop"],
  windy: ["Windy", "info"],
  "windy-variant": ["Windy", "info"],
  exceptional: ["Alert", "info"],
};

function firstWeather() {
  var h = H();
  if (!h) return "";
  var ks = Object.keys(h.states).filter(function (k) {
    return k.indexOf("weather.") === 0;
  });
  return ks[0] || "";
}

function hdrItem(it) {
  if (it.k === "weather") {
    var id = it.id || firstWeather();
    if (!id || !S(id)) return null;
    var c = HCOND[V_(id)] || [cap(String(V_(id)).replace(/[-_]/g, " ")), "info"],
      a = A(id),
      t = typeof a.temperature === "number" ? Math.round(a.temperature) + "°" : "";
    return { i: c[1], t: (t ? t + " · " : "") + c[0] };
  }
  if (it.k === "people") {
    var h = H();
    if (!h) return null;
    var ps = Object.keys(h.states).filter(function (k) {
      return k.indexOf("person.") === 0;
    });
    if (!ps.length) return null;
    var home = ps
      .filter(function (k) {
        return h.states[k].state === "home";
      })
      .map(function (k) {
        return String(A(k).friendly_name || k).split(" ")[0];
      });
    return {
      i: "home",
      t:
        home.length === ps.length
          ? _T("everyone_home")
          : home.length
            ? home.length <= 2
              ? home.join(", ") + _T("home_2")
              : home.length + _T("people_home")
            : _T("nobody_home"),
    };
  }
  if (it.k === "lights") {
    var n = countOn(lightUnits(allLights()));
    return { i: "lights", t: n ? n + _T("lights_on") : _T("lights_off") };
  }
  if (it.k === "alerts") return alertList().length ? { i: "alert", t: alertText() } : null;
  if (it.k === "entity") {
    if (!it.id || !S(it.id)) return null;
    return { i: sensorIcon(it.id), t: (it.l || entName(it.id)) + " " + readText(it.id) };
  }
  return null;
}

function greeting() {
  var h = new Date().getHours(),
    u = H() && H().user && H().user.name;
  return (
    (h < 5
      ? _T("good_night")
      : h < 12
        ? _T("good_morning")
        : h < 18
          ? _T("good_afternoon")
          : _T("good_evening")) + (u ? ", " + String(u).split(" ")[0] : "")
  );
}

var HDRC = [];

/* The clock is shown unless it is turned off. */
function hdrClockShown(mt) {
  return mt.clock !== false;
}

/* An item is shown unless it has been turned off. */
function hdrShown(it) {
  return it.show !== false;
}

/* The status tiles of the open page (its own list, set in the header's settings: decision D-27) as a row of the header. The row changes with the page, and a page with no status tiles keeps the short header. It is independent of the page's own Status
   section, whose tiles are devices. */
var HSTF = [];

/* Builds the row for the open page; without force it keeps the row when the page and its tiles are the same. */
/* The header's height slides whenever it changes, whatever the cause: the status row coming or going, a room name that fits on one line or needs two. A caller takes the height the header has (hdrBegin: any slide in progress is ended, so the next measure is the natural height), changes the header, then hdrGlide eases from the old height to the new one, clipped by the header, while the page below follows. */
function hdrBegin(hd) {
  hd = hd || document.querySelector(".hdr");
  if (!hd) return 0;
  var from = hd.getBoundingClientRect().height;
  if (hd._hslide) {
    hd._hslide.cancel();
    hd._hslide = null;
  }
  return from;
}

function hdrGlide(hd, from) {
  hd = hd || document.querySelector(".hdr");
  if (!hd) return;
  var closing = hd._hclose;
  hd._hclose = null;
  /* a status row that is going away stays in place while the header closes over it, but is not part of the height it closes to */
  if (closing) closing.style.display = "none";
  var to = hd.getBoundingClientRect().height;
  if (closing) closing.style.display = "";
  var drop = function () {
    if (closing) hdrStatusDrop(closing);
  };
  if (!from || Math.abs(from - to) < 1 || !hd.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    drop();
    return;
  }
  var a = hd.animate([{ height: from + "px" }, { height: to + "px" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
  hd._hslide = a;
  a.onfinish = a.oncancel = function () {
    if (hd._hslide === a) hd._hslide = null;
    drop();
  };
}

/* The status row of a page: a row under the header's text, in the header, whose tiles are the page's own. */
function hdrStatusDrop(box) {
  HSTF.forEach(function (f) {
    var i = LIVE.indexOf(f);
    if (i >= 0) LIVE.splice(i, 1);
  });
  HSTF = [];
  if (box) box.remove();
}

/* Sets the status row for page `key` (the open page, or the one that is coming). With `from` (a height taken by hdrBegin) the caller glides afterwards; without it this does the whole thing, for a change in the tiles or the alerts alone. */
function hdrStatusSync(force, key, from) {
  var hd = document.querySelector(".hdr");
  if (!hd) return;
  key = key || (PG ? PG.key : VIEW);
  var tiles = statShown(key),
    on = tiles.length > 0,
    sig = on ? key + "|" + JSON.stringify(tiles) : "";
  if (!force && hd._hstSig === sig) return;
  var alone = from === undefined,
    first = hd._hstSig === undefined;
  if (alone) from = first ? 0 : hdrBegin(hd);
  hd._hstSig = sig;
  var box = hd.querySelector("#hst");
  if (!on) {
    if (box) hd._hclose = box;
    if (alone) hdrGlide(hd, from);
    return;
  }
  var mine = [],
    prev = CUR,
    g;
  CUR = mine;
  try {
    g = statGrid(key);
  } finally {
    CUR = prev;
  }
  if (!g) return;
  hd._hclose = null;
  HSTF.forEach(function (f) {
    var i = LIVE.indexOf(f);
    if (i >= 0) LIVE.splice(i, 1);
  });
  HSTF = [];
  if (!box) {
    box = mk("div", "hstat");
    box.id = "hst";
    hd.appendChild(box);
  }
  box.innerHTML = "";
  var inner = mk("div", "hstin");
  inner.appendChild(g);
  box.appendChild(inner);
  mine.forEach(function (f) {
    LIVE.push(f);
    HSTF.push(f);
    f();
  });
  if (alone) hdrGlide(hd, from);
}

function hdrBuild() {
  var box = document.getElementById("hch"),
    mt = UI.meta || {},
    hd = document.querySelector(".hdr");
  if (!box || !hd) return;
  hd.classList.toggle("greet", !!mt.greet);
  box.innerHTML = "";
  HDRC = [];
  (mt.hdr || []).forEach(function (it) {
    var el = mk("div", "hchip", "<span></span><span></span>");
    box.appendChild(el);
    HDRC.push({ it: it, el: el, ic: "", txt: "" });
  });
  hdrLive();
}

/* The weather entity's condition as the sky it paints: [what is in the sky, how strong]. */
var HSKYW = {
  sunny: ["clear", ""],
  "clear-night": ["clear", ""],
  partlycloudy: ["partly", ""],
  cloudy: ["cloudy", ""],
  exceptional: ["cloudy", "heavy"],
  rainy: ["rain", ""],
  pouring: ["rain", "heavy"],
  "lightning-rainy": ["storm", "heavy"],
  lightning: ["storm", ""],
  snowy: ["snow", ""],
  "snowy-rainy": ["snow", "heavy"],
  hail: ["snow", "heavy"],
  fog: ["fog", ""],
  windy: ["clear", "fast"],
  "windy-variant": ["partly", "fast"],
};

/* The header's backdrop is the sky over the house (sky.js): what the weather entity says, lit by the height of the sun as Home Assistant's sun says, else by the clock. A page with a room picture keeps the picture. Mine, in Appearance, turns it off. */
function hdrSky() {
  var hd = document.querySelector(".hdr");
  if (!hd) return;
  var sky = hd.querySelector(".hsky"),
    w = firstWeather(),
    c = w && S(w) ? HSKYW[V_(w)] : null,
    show = !!c && PREFS.sky !== false && ((UI && UI.meta) || {}).sky !== false && !document.body.classList.contains("rwall");
  if (!show) {
    if (sky) sky.classList.remove("on");
    skyStop();
    return;
  }
  if (!sky) {
    sky = mk("div", "hsky");
    hd.insertBefore(sky, hd.firstChild);
  }
  var sun = S("sun.sun") ? A("sun.sun") : null,
    now = new Date(),
    hour = now.getHours() + now.getMinutes() / 60,
    elev = sun && typeof sun.elevation === "number" ? sun.elevation : 55 * Math.sin((Math.PI * (hour - 6)) / 12);
  if (V_(w) === "clear-night") elev = Math.min(elev, -10);
  sky.classList.add("on");
  skyShow(sky, { kind: c[0], heavy: c[1] === "heavy", fast: c[1] === "fast", elev: elev });
}

function hdrLive() {
  roomOffSync();
  hdrSky();
  var mt = UI.meta || {},
    eb = document.querySelector(".eyebrow");
  if (eb && mt.greet) {
    var g = greeting();
    if (eb.textContent !== g) eb.textContent = g;
    eb.style.display = "";
  }
  var any = false;
  HDRC.forEach(function (c) {
    var r = hdrShown(c.it) && hdrItem(c.it);
    if (!r) {
      c.el.style.display = "none";
      return;
    }
    any = true;
    c.el.style.display = "";
    if (r.i !== c.ic) {
      c.ic = r.i;
      c.el.firstChild.innerHTML = svg(r.i);
    }
    if (r.t !== c.txt) {
      c.txt = r.t;
      c.el.lastChild.textContent = r.t;
    }
  });
  var hc = document.getElementById("hch");
  if (hc) hc.style.display = any ? "" : "none";
  hdrStatusSync(false);
}

var HLAB = {
  weather: _T("weather"),
  people: _T("people_at_home"),
  lights: _T("lights_on_2"),
  alerts: _T("attention"),
  entity: _T("a_sensor_reading"),
};

/* The page whose status tiles the header settings list: the one that was open when they were. */
var HSTPAGE = "";

/* The status tiles of one page, as a row of the header (each its own tile, edited like the others); the page is chosen here, since each has its own. */
function hdrStatusBlock(box, redraw) {
  var pages = ["home"].concat(
      UI.rooms.map(function (r) {
        return r.id;
      })
    ),
    pg = pages.indexOf(HSTPAGE) >= 0 ? HSTPAGE : pages.indexOf(VIEW) >= 0 ? VIEW : "home",
    l = (UI.stat[pg] = UI.stat[pg] || []);
  box.appendChild(sep(_T("status_tiles_in_the_header"), "thermo"));
  box.appendChild(hintRow(_T("status_tiles_in_the_header_hint")));
  box.appendChild(
    dropRow(
      _T("page"),
      pages,
      function () {
        return pg;
      },
      function (v) {
        HSTPAGE = v;
        redraw();
      },
      "home",
      function (v) {
        return v === "home" ? UI.meta.homeTab || _T("home") : (roomById(v) || { name: v }).name;
      }
    )
  );
  var rows = [];
  l.forEach(function (t, i) {
    var p = pill(t.k === "alerts" ? "alert" : "thermo", t.l, {
      sub: function () {
        return t.k === "alerts" ? _T("only_while_something_needs_attention") : t.id;
      },
      tap: function () {
        showPopup("manage-stat-tile:" + pg + ":" + i, true);
      },
    });
    box.appendChild(p);
    rows.push(p);
  });
  makeSortable(box, rows, function (f, to) {
    l.splice(to, 0, l.splice(f, 1)[0]);
    uiChanged();
    redraw();
  });
  if (l.length < 6)
    box.appendChild(
      pill("plus", _T("add_status_tile"), {
        tap: function () {
          addStatTile(pg);
        },
      })
    );
  if (l.length < 6 && !l.some(function (t) { return t.k === "alerts"; }))
    box.appendChild(
      pill("plus", _T("add_attention"), {
        tap: function () {
          l.push({ k: "alerts", l: _T("attention") });
          uiChanged();
          redraw();
        },
      })
    );
}

function hdrPage(box, m) {
  m.hdr = m.hdr || [];
  function draw() {
    box.appendChild(
      pill("bright", _T("greeting"), {
        on: function () {
          return !!m.greet;
        },
        sub: function () {
          return m.greet ? _T("shown_instead_of_the_line_above_the_") : _T("off");
        },
        tap: function () {
          m.greet = !m.greet;
          if (!m.greet) {
            var eb = document.querySelector(".eyebrow");
            if (eb) eb.textContent = m.eyebrow;
          }
          uiChanged();
          redrawBox(box, draw);
        },
      })
    );
    box.appendChild(
      pill("bright", _T("weather_sky"), {
        on: function () {
          return m.sky !== false;
        },
        sub: function () {
          return m.sky !== false ? _T("the_sky_behind_the_header_for_everyone") : _T("off");
        },
        tap: function () {
          m.sky = m.sky === false;
          uiChanged();
          redrawBox(box, draw);
        },
      })
    );
    hdrStatusBlock(box, function () {
      redrawBox(box, draw);
    });
    box.appendChild(sep(_T("header_items"), "home"));
    var rows = [];
    m.hdr.forEach(function (it, i) {
      var r = hdrItem(it) || { i: "info", t: HLAB[it.k] },
        p = pill(r.i, r.t, {
          sub: function () {
            return HLAB[it.k] + (hdrShown(it) ? "" : " · " + _T("hidden").toLowerCase());
          },
          tap: function () {
            showPopup("manage-hitem:" + i, true);
          },
        });
      box.appendChild(p);
      rows.push(p);
    });
    makeSortable(box, rows, function (f, to) {
      m.hdr.splice(to, 0, m.hdr.splice(f, 1)[0]);
      uiChanged();
      redrawBox(box, draw);
    });
    if (!m.hdr.length) {
      box.appendChild(hintRow(_T("nothing_here_yet_add_weather_who_is_")));
    }
    if (m.hdr.length < 4) {
      ["weather", "people", "lights", "alerts", "entity"].forEach(function (k) {
        if (
          k !== "entity" &&
          m.hdr.some(function (x) {
            return x.k === k;
          })
        )
          return;
        box.appendChild(
          pill("plus", _T("add") + " " + HLAB[k].toLowerCase(), {
            tap: function () {
              if (k === "entity") {
                pickEntity(
                  _T("choose_a_sensor"),
                  ["sensor", "binary_sensor", "number", "input_number", "counter"],
                  null,
                  function (id) {
                    m.hdr.push({
                      k: "entity",
                      id: id,
                      l: (A(id).friendly_name || id).slice(0, 24),
                    });
                    uiChanged();
                  }
                );
              } else {
                m.hdr.push({ k: k });
                uiChanged();
                redrawBox(box, draw);
              }
            },
          })
        );
      });
    }
  }
  redrawBox(box, draw);
}

function hitemPage(b, i) {
  var m = UI.meta,
    it = (m.hdr || [])[i];
  if (!it) return;
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(
      pill(hdrShown(it) ? "eye" : "eyeoff", _T("show_in_header"), {
        on: function () {
          return hdrShown(it);
        },
        sub: function () {
          return hdrShown(it) ? _T("shown") : _T("hidden");
        },
        tap: function () {
          it.show = !hdrShown(it);
          uiChanged();
          redrawBox(box, draw);
        },
      })
    );
    if (it.k === "entity" || it.k === "weather") {
      box.appendChild(
        textRow(
          "edit",
          _T("label"),
          it.l || "",
          function (v) {
            if (v) it.l = v.slice(0, 24);
            else delete it.l;
            uiChanged();
          },
          24
        )
      );
      box.appendChild(
        pill(
          it.k === "weather" ? "bright" : sensorIcon(it.id),
          it.id ? entName(it.id) : _T("first_weather_entity"),
          {
            sub: function () {
              return _T("tap_to_choose_another");
            },
            tap: function () {
              pickEntity(
                _T("choose_an_entity"),
                it.k === "weather"
                  ? ["weather"]
                  : ["sensor", "binary_sensor", "number", "input_number", "counter"],
                null,
                function (id) {
                  it.id = id;
                  uiChanged();
                }
              );
            },
          }
        )
      );
      if (it.k === "weather" && it.id)
        box.appendChild(
          pill("restart", _T("use_the_first_weather_entity"), {
            tap: function () {
              delete it.id;
              uiChanged();
              redrawBox(box, draw);
            },
          })
        );
    }
    box.appendChild(
      pill("trash", _T("remove_from_header"), {
        tap: function () {
          m.hdr.splice(i, 1);
          uiChanged();
          popBack();
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* While editing, the header is editable in place: a pen on the title, or a tap on the header, opens its settings. */
function hdrEdit() {
  var hd = document.querySelector(".hdr"),
    pen = document.getElementById("hpen"),
    on = document.body.classList.contains("editing");
  if (!hd) return;
  if (!on) {
    if (pen) pen.remove();
    return;
  }
  if (!hd._edBound) {
    hd._edBound = 1;
    hd.addEventListener("click", function (e) {
      if (!document.body.classList.contains("editing") || e.target.closest(".hb")) return;
      hdrOpen();
    });
  }
  if (!pen) {
    pen = mk("div", "rnd pane", svg("edit"));
    pen.id = "hpen";
    pen.setAttribute("role", "button");
    pen.tabIndex = 0;
    pen.setAttribute("aria-label", _T("edit_the_header"));
    pen.addEventListener("click", function (e) {
      e.stopPropagation();
      hdrOpen();
    });
    pen.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        hdrOpen();
      }
    });
    document.querySelector(".trow").appendChild(pen);
  }
}

function hdrOpen() {
  showPopup(VIEW === "home" ? "manage-names" : "manage-header:" + VIEW, true);
}

function roomHeaderPage(b, rid) {
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
    pill("edit", _T("room_details"), {
      sub: function () {
        return _T("name_icon_area_and_picture");
      },
      tap: function () {
        showPopup("manage-details:" + rid, true);
      },
    })
  );
  b.appendChild(hintRow(_T("the_greeting_and_items_are_shared_by_every_page")));
  var hb = mk("div");
  b.appendChild(hb);
  hdrPage(hb, UI.meta);
}
