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

/* The clock is shown in the regular header unless it is turned off. The slim header leaves it out unless it is turned on. */
function hdrClockShown(mt, size) {
  return (size || hdrSize()) === "slim" ? mt.clockSlim === true : mt.clock !== false;
}

/* An item is shown unless it has been turned off; an item with no choice of its own is hidden in the slim header. */
function hdrShown(it, size) {
  if (it.show === true || it.show === false) return it.show;
  return (size || hdrSize()) !== "slim";
}

/* The header size this user sees: their own choice in Appearance, otherwise the one set for the page. */
function hdrSize() {
  return PREFS.hdrSize || (UI.meta || {}).size || "regular";
}

function hdrBuild() {
  var box = document.getElementById("hch"),
    mt = UI.meta || {},
    hd = document.querySelector(".hdr");
  if (!box || !hd) return;
  hd.classList.toggle("slim", hdrSize() === "slim");
  hd.classList.toggle("noclock", !hdrClockShown(mt));
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

function hdrLive() {
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
}

var HLAB = {
  weather: _T("weather"),
  people: _T("people_at_home"),
  lights: _T("lights_on_2"),
  entity: _T("a_sensor_reading"),
};

function hdrPage(box, m) {
  m.hdr = m.hdr || [];
  function draw() {
    box.appendChild(sep(_T("header_size"), "tune"));
    box.appendChild(
      seg(
        [
          ["regular", _T("regular")],
          ["slim", _T("slim_2")],
        ],
        m.size || "regular",
        function (v) {
          m.size = v;
          uiChanged();
          redrawBox(box, draw);
        }
      )
    );
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
    box.appendChild(sep(_T("header_items"), "home"));
    if (m.size === "slim") {
      var slimHint = mk("div", "hint");
      slimHint.textContent = _T("slim_header_hides_items");
      box.appendChild(slimHint);
    }
    var rows = [];
    m.hdr.forEach(function (it, i) {
      var r = hdrItem(it) || { i: "info", t: HLAB[it.k] },
        p = pill(r.i, r.t, {
          sub: function () {
            return HLAB[it.k] + (hdrShown(it, m.size) ? "" : " · " + _T("hidden").toLowerCase());
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
      var hn = mk("div", "hint");
      hn.textContent = _T("nothing_here_yet_add_weather_who_is_");
      box.appendChild(hn);
    }
    if (m.hdr.length < 4) {
      ["weather", "people", "lights", "entity"].forEach(function (k) {
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
      pill(hdrShown(it, m.size) ? "eye" : "eyeoff", _T("show_in_header"), {
        on: function () {
          return hdrShown(it, m.size);
        },
        sub: function () {
          return hdrShown(it, m.size) ? _T("shown") : _T("hidden");
        },
        tap: function () {
          it.show = !hdrShown(it, m.size);
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
  var hn = mk("div", "hint");
  hn.textContent = _T("the_header_size_greeting_and_items_a");
  b.appendChild(hn);
  var hb = mk("div");
  b.appendChild(hb);
  hdrPage(hb, UI.meta);
}
