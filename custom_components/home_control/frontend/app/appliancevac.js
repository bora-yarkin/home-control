/* The robot vacuum appliance (decision D-33): a custom appliance like the others, drawn as the Xiaomi vacuum's card. It knows no brand: the administrator gives its rooms,
   its settings and what Start does.
   ap.vac: rooms [{k: the value the vacuum knows the room by, l: its name}], sets [{k: the field name, l: label, o: [values], e?: a select entity for all rooms}],
   run [{action: "domain.service", data: {...}}]. In an action's data these words are replaced when Start is tapped: "$rooms" (the chosen rooms, all of them when none),
   "$room_settings" ({room: {field: value}}, only what was chosen), "$vacuum" (the vacuum entity), "$vacuum_device" (its device id), "$set.<field>" (the choice for all rooms).
   An action that needs a word with nothing behind it is skipped. With no action Start starts the vacuum. The map is the appliance's own picture from the remote builder, whose
   touch areas pick rooms, else the map entity. A room's own settings are kept with the dashboard, as the Xiaomi rooms' are. */

var VACAP = {};
/* The room list a map's touch area is choosing from. */
var VACAPPICK = null;

var VACAP_ICON = { vacuum_only: "vac", vacuum_and_mop: "drop", vacuum_then_mop: "repeat", mop_only: "drop", quiet: "moon", auto: "fan", quick: "fan", boost: "fan" };

function vacapConf(ap) {
  var v = ap.vac || (ap.vac = {});
  v.rooms = v.rooms || [];
  v.sets = v.sets || [];
  v.run = v.run || [];
  return v;
}

function vacapWord(v) {
  return RBLAB[v] || cap(String(v).replace(/_/g, " "));
}

/* A setting's choices: the select's own, in the order given in the setting when it lists them. */
function vacapOptions(set) {
  var own = set.e && apHas(set.e) ? (A(set.e).options || []).slice() : null,
    listed = (set.o || []).slice();
  if (!own) return listed;
  var ordered = listed.filter(function (x) {
    return own.indexOf(x) >= 0;
  });
  return ordered.length ? ordered : own;
}

/* A short wait between one command to the vacuum and the next, so that it is not told two things at once. */
var VACAP_WAIT = 1000;

function vacapPause() {
  return new Promise(function (r) {
    setTimeout(r, VACAP_WAIT);
  });
}

/* A room's value of a setting: its own, else the choice for all rooms, else the setting's default, as the number the vacuum knows it by when the setting gives numbers. */
function vacapRoomValue(set, own, all) {
  var v = own[set.k] || all[set.k] || set.d || "";
  if (!v) return "";
  return set.c && set.c[v] !== undefined ? set.c[v] : vacapValue(v);
}

function vacapPrefKey(aid, room) {
  return aid + ":" + room;
}

/* No-go zones and virtual walls, from the entities chosen for them, else the map's own attributes: the first list each one has. */
function vacapZones(ap, mapEnt) {
  function list(id, names) {
    if (!id) return [];
    var a = A(id),
      k = names.concat(Object.keys(a)).filter(function (n) {
        return Array.isArray(a[n]);
      })[0];
    return k ? a[k] : [];
  }
  function from(slot, attr) {
    if (ap.slots[slot] && apHas(ap.slots[slot])) return list(ap.slots[slot], [attr]);
    var a = A(mapEnt)[attr];
    return Array.isArray(a) ? a : [];
  }
  return [
    { wall: false, items: from("no_go", "no_go_areas") },
    { wall: true, items: from("walls", "virtual_walls") },
  ];
}

/* A value as the action wants it: a number written as digits is a number. */
function vacapValue(v) {
  return typeof v === "string" && /^-?\d{1,6}$/.test(v) ? Number(v) : v;
}

function vacapSendsRoomSettings(conf) {
  return /\$room_settings|\$room\./.test(JSON.stringify(conf.run));
}

/* The words of an action's data, filled in. A string that is only a word becomes its value; a word inside a longer string is written into it (a list or an object as JSON, a number
   written as digits as a number: {"room":$rooms} gives {"room":[3,4]}, which some vacuums take as one text). Returns undefined when a word has nothing behind it, so that the action is
   skipped. */
function vacapFill(data, words) {
  var missing = false;
  function value(name) {
    var w = Object.prototype.hasOwnProperty.call(words, name) ? words[name] : undefined;
    if (w === undefined || w === "" || (w && typeof w === "object" && !Object.keys(w).length)) missing = true;
    return w;
  }
  function written(w) {
    if (Array.isArray(w)) return JSON.stringify(w.map(vacapValue));
    return w && typeof w === "object" ? JSON.stringify(w) : JSON.stringify(String(w)).slice(1, -1);
  }
  var WORD = /\$(set\.[A-Za-z0-9_]+|room_settings|room_name|room\.[A-Za-z0-9_]+|rooms|room|vacuum_device|vacuum)/g;
  function walk(x) {
    if (typeof x === "string" && x.charAt(0) === "$" && (Object.prototype.hasOwnProperty.call(words, x) || !/[^$A-Za-z0-9_.]/.test(x))) return value(x);
    if (typeof x === "string" && x.indexOf("$") >= 0)
      return x.replace(WORD, function (name) {
        var w = value(name);
        return w === undefined ? name : written(w);
      });
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      var o = {};
      Object.keys(x).forEach(function (k) {
        o[k] = walk(x[k]);
      });
      return o;
    }
    return x;
  }
  var out = walk(data || {});
  return missing ? undefined : out;
}

/* What the actions are filled with: `chosen` room keys (none: all), `all` the choices for all rooms, `pref(room)` a room's own. */
function vacapWords(ap, vacuum, chosen, all, pref) {
  var conf = vacapConf(ap),
    rooms = chosen.length
      ? chosen
      : conf.rooms.map(function (r) {
          return r.k;
        }),
    settings = {},
    e = vacuum && H().entities && H().entities[vacuum],
    words = { $rooms: rooms.slice(), $vacuum: vacuum || "", $vacuum_device: (e && e.device_id) || "" };
  rooms.forEach(function (r) {
    var own = pref(r),
      m = {};
    conf.sets.forEach(function (s) {
      var v = own[s.k] || all[s.k];
      if (v) m[s.k] = vacapValue(v);
    });
    if (Object.keys(m).length) settings[r] = m;
  });
  words.$room_settings = settings;
  conf.sets.forEach(function (s) {
    words["$set." + s.k] = all[s.k] ? vacapValue(all[s.k]) : "";
  });
  return words;
}

/* Runs the actions one after the other. */
function vacapStart(ap, vacuum, chosen, all, pref) {
  var conf = vacapConf(ap),
    words = vacapWords(ap, vacuum, chosen, all, pref);
  /* a select bound to a setting takes the choice for all rooms first */
  var before = conf.sets
    .filter(function (s) {
      return !s.r && s.e && apHas(s.e) && all[s.k] && all[s.k] !== V_(s.e);
    })
    .map(function (s) {
      return function () {
        return H().callService(dom(s.e), "select_option", { entity_id: s.e, option: all[s.k] });
      };
    });
  var actions = [];
  conf.run.forEach(function (r) {
    /* an action once per room gets that room's words as well */
    var times = r.each
      ? words.$rooms.map(function (k) {
          var room = conf.rooms.filter(function (x) {
              return x.k === k;
            })[0] || { k: k, l: k },
            own = pref(k),
            extra = { $room: vacapValue(k), $room_name: room.l || k };
          conf.sets.forEach(function (s) {
            extra["$room." + s.k] = vacapRoomValue(s, own, all);
          });
          return Object.assign({}, words, extra);
        })
      : [words];
    times.forEach(function (w) {
      var data = vacapFill(r.data, w);
      if (data === undefined) return;
      var p = r.action.split(".");
      actions.push(function () {
        return H().callService(p[0], p[1], data);
      });
    });
  });
  if (!actions.length && vacuum)
    actions = [
      function () {
        return H().callService("vacuum", "start", { entity_id: vacuum });
      },
    ];
  return before.concat(actions).reduce(function (p, step, i) {
    return p.then(i ? vacapPause : null).then(step);
  }, Promise.resolve());
}

/* One setting as the Xiaomi card draws it: the name, the value, a row of round choices. */
function vacapChoices(b, set, get, put, inherit) {
  var head = mk("div", "rb-sec", "<span></span><b></b>"),
    sv = head.lastChild,
    g = mk("div", "opts"),
    same = null;
  g.setAttribute("data-k", "clean");
  head.firstChild.textContent = set.l;
  if (inherit) {
    same = mk("span", "rb-chip pane");
    same.textContent = _T("same_as_all");
    same.setAttribute("role", "button");
    same.addEventListener("click", function () {
      put("");
      paint();
    });
    head.insertBefore(same, sv);
  }
  var values = vacapOptions(set),
    counted = values.length > 0 && values.every(function (v) { return /^\d{1,2}$/.test(v); });
  function pick(v) {
    put(get() === v && !inherit ? "" : v);
    paint();
  }
  /* a setting that counts (the cleaning passes) is a row of 1x, 2x, as the Xiaomi room page draws it */
  if (counted)
    g = seg(
      values.map(function (v) {
        return [v, v + "×"];
      }),
      get(),
      pick
    );
  function paint() {
    var c = get();
    sv.textContent = c && !counted ? vacapWord(c) : !c && inherit ? _T("same_as_all_rooms") : "";
    if (same) same.style.display = c ? "" : "none";
    Array.prototype.forEach.call(g.children, function (o, i) {
      if (counted) o.classList.toggle("act", values[i] === c);
      else o.classList.toggle("on", o._v === c);
    });
  }
  if (!counted) values.forEach(function (v) {
    var o = mk("div", "opt", ic(VACAP_ICON[v] || RBICON[v] || "drop") + "<span></span>");
    o.lastChild.textContent = vacapWord(v);
    o._v = v;
    o.setAttribute("role", "button");
    o.addEventListener("click", function () {
      pick(v);
    });
    g.appendChild(o);
  });
  paint();
  b.appendChild(head);
  b.appendChild(g);
}

/* The settings of one room (the gear of its tile). The key of the popup is "<appliance>:<room>". */
function vacapRoomPage(b, key) {
  var at = key.indexOf(":"),
    d = apFind(key.slice(0, at)),
    room = key.slice(at + 1);
  if (!d) return;
  var store = vacapPrefKey(d.aid, room);
  b.appendChild(hintRow(_T("used_when_this_room_is_cleaned_what")));
  vacapConf(d.ap).sets.forEach(function (s) {
    vacapChoices(
      b,
      s,
      function () {
        return rbPref(store)[s.k] || "";
      },
      function (v) {
        rbPrefSet(store, s.k, v);
      },
      true
    );
  });
}

/* The appliance's page: map, readings, rooms, settings, Start, and Pause, Resume and Stop while it works. */
function vacapPage(b, d) {
  var ap = d.ap,
    conf = vacapConf(ap),
    vacuum = ap.slots.vacuum && apHas(ap.slots.vacuum) ? ap.slots.vacuum : "",
    state = VACAP[d.aid] || (VACAP[d.aid] = { rooms: [], all: {}, running: false }),
    img = d.rm && d.rm.v === "i" && d.rm.img,
    mapEnt = ap.slots.map && apHas(ap.slots.map) ? ap.slots.map : "",
    spots = [],
    tiles = mk("div", "rooms"),
    start = mk("div", "rb-start pane"),
    ctl = mk("div", "rrow rbc");

  function flip(k) {
    var at = state.rooms.indexOf(k);
    if (at >= 0) state.rooms.splice(at, 1);
    else state.rooms.push(k);
    paint();
  }

  /* a map entity is drawn as the vacuum card's map: scrolled to the robot, coloured as set, with names, trail and zones */
  if (!img && mapEnt)
    vacMapView(b, {
      id: vacuum,
      me: mapEnt,
      ps: ap.slots.position && apHas(ap.slots.position) ? ap.slots.position : "",
      opts: function () {
        return (apFind(d.aid) || d).map || {};
      },
      zones: function () {
        return Promise.resolve(vacapZones(ap, mapEnt));
      },
    });
  else if (img) {
    var box = mk("div", "rb-map pane vacap-map"),
      wrap = mk("div", "rb-mapw"),
      pic = mk("img");
    pic.alt = _T("map_of_the_robot_vacuum");
    wrap.appendChild(pic);
    box.appendChild(wrap);
    {
      pic.src = img.u;
      img.hs.forEach(function (h) {
        if (!h.a || h.a.t !== "room") return;
        var z = mk("div", "vacap-spot");
        z.style.cssText = "left:" + h.x + "%;top:" + h.y + "%;width:" + h.w + "%;height:" + h.h + "%" + (h.r === "ellipse" ? ";border-radius:50%" : "");
        z._k = h.a.r;
        z.setAttribute("role", "button");
        z.setAttribute("aria-label", (conf.rooms.filter(function (r) { return r.k === h.a.r; })[0] || {}).l || h.a.r);
        z.addEventListener("click", function () {
          flip(h.a.r);
        });
        spots.push(z);
        wrap.appendChild(z);
      });
    }
    b.appendChild(box);
  }

  var readings = [];
  if (vacuum || ap.slots.battery)
    readings.push([
      _T("battery"),
      function () {
        var v = ap.slots.battery && apHas(ap.slots.battery) && svOk(ap.slots.battery) ? Math.round(Number(V_(ap.slots.battery))) : vacuum ? vacBattery(vacuum) : undefined;
        return v !== undefined && isFinite(v) ? v + "%" : "–";
      },
    ]);
  if (vacuum && !conf.nost)
    readings.push([
      _T("status"),
      function () {
        return apStateText(ap.slots.state && apHas(ap.slots.state) ? ap.slots.state : vacuum);
      },
    ]);
  ap.extra.forEach(function (x) {
    if (x.o && apHas(x.e))
      readings.push([
        x.l || vacShort(x.e, vacuum),
        function () {
          return svOk(x.e) ? entVal(x.e) : "–";
        },
      ]);
  });
  if (readings.length) b.appendChild(glance(readings, 3));

  /* nothing to start yet: say so instead of a Start that does nothing */
  if (!vacuum && !conf.run.length) {
    b.appendChild(hintRow(ISADMIN ? _T("ap_nothing_is_bound_yet_choose_set_up") : _T("ap_nothing_is_bound_yet")));
    return;
  }

  if (conf.rooms.length) {
    var head = mk("div", "rb-sec", "<span></span><span class='rb-chips'></span>");
    head.firstChild.textContent = _T("rooms_caps");
    [
      ["all", function () { state.rooms = conf.rooms.map(function (r) { return r.k; }); }],
      ["clear", function () { state.rooms = []; }],
    ].forEach(function (c) {
      var s = mk("span", "rb-chip pane");
      s.textContent = _T(c[0]);
      s.setAttribute("role", "button");
      s.addEventListener("click", function () {
        c[1]();
        paint();
      });
      head.lastChild.appendChild(s);
    });
    tiles.setAttribute("data-k", "clean");
    conf.rooms.forEach(function (r) {
      var t = mk("div", "room pane", ic("home") + "<span></span>");
      t.lastChild.textContent = r.l || r.k;
      t._k = r.k;
      t.setAttribute("role", "button");
      /* a room's own settings are offered only when Start sends them */
      if (ISADMIN && conf.sets.length && vacapSendsRoomSettings(conf)) {
        var gear = mk("span", "rb-g", svg("tune"));
        gear.title = _T("room_preferences");
        gear.addEventListener("click", function (e) {
          e.stopPropagation();
          showPopup("vacap-room:" + d.aid + ":" + r.k, true);
        });
        t.appendChild(gear);
        t._gear = gear;
      }
      t.addEventListener("click", function () {
        flip(r.k);
      });
      tiles.appendChild(t);
    });
    b.appendChild(head);
    b.appendChild(tiles);
  }

  conf.sets.filter(function (s) {
    return !s.r;
  }).forEach(function (s) {
    if (state.all[s.k] === undefined) state.all[s.k] = s.e && apHas(s.e) && svOk(s.e) ? V_(s.e) : "";
    vacapChoices(
      b,
      s,
      function () {
        return state.all[s.k];
      },
      function (v) {
        state.all[s.k] = v;
      }
    );
  });

  function vac(action) {
    call("vacuum", action, { entity_id: vacuum });
    vacKick(vacuum);
  }
  var bPause = rbtn("pause", function () { vac("pause"); }, _T("pause")),
    bResume = rbtn("play", function () { vac("start"); }, _T("resume")),
    bStop = rbtn(
      "stop",
      function () {
        vac("stop");
        setTimeout(function () {
          vac("return_to_base");
        }, 1500);
      },
      _T("stop_and_dock")
    );
  ctl.appendChild(bPause);
  ctl.appendChild(bResume);
  ctl.appendChild(bStop);

  function paint() {
    Array.prototype.forEach.call(tiles.children, function (t) {
      t.classList.toggle("on", state.rooms.indexOf(t._k) >= 0);
      if (t._gear) t._gear.classList.toggle("on", Object.keys(rbPref(vacapPrefKey(d.aid, t._k))).length > 0);
    });
    spots.forEach(function (z) {
      z.classList.toggle("on", state.rooms.indexOf(z._k) >= 0);
    });
    var s = vacuum ? V_(vacuum) : "",
      busy = state.running || s === "cleaning" || s === "returning",
      working = s === "cleaning" || s === "paused" || s === "returning",
      html =
        svg("play") +
        "<span>" +
        (state.running
          ? _T("starting")
          : busy
            ? _T(s === "returning" ? "returning" : "cleaning")
            : state.rooms.length
              ? _T("start_on_selected_rooms")
              : _T("start_all_rooms")) +
        "</span>";
    start.classList.toggle("dis", busy || s === "unavailable");
    if (start._html !== html) start.innerHTML = start._html = html;
    bPause.style.display = s === "cleaning" ? "" : "none";
    bResume.style.display = s === "paused" ? "" : "none";
    bStop.style.display = working ? "" : "none";
    ctl.style.display = working ? "" : "none";
    ctl.style.gridTemplateColumns = "repeat(" + (s === "returning" ? 1 : 2) + ",1fr)";
  }

  function run() {
    var s = vacuum ? V_(vacuum) : "";
    if (state.running || s === "cleaning" || s === "returning" || s === "unavailable") return;
    /* the gate runs what it is given, at once or after the person confirms */
    if (vacuum) gate([vacuum], go);
    else go();
  }
  function go() {
    if (state.running) return;
    state.running = true;
    paint();
    var chosen = conf.rooms
      .map(function (r) {
        return r.k;
      })
      .filter(function (k) {
        return state.rooms.indexOf(k) >= 0;
      });
    vacapStart(ap, vacuum, chosen, state.all, function (r) {
      return rbPref(vacapPrefKey(d.aid, r));
    })
      .catch(function (e) {
        toast(_T("couldn_t_start_the_robot") + ": " + String((e && e.message) || e).slice(0, 80));
      })
      .then(function () {
        state.running = false;
        if (vacuum) vacKick(vacuum);
        paint();
      });
  }
  start.setAttribute("role", "button");
  start.addEventListener("click", run);
  b.appendChild(ctl);
  b.appendChild(start);
  if (vacuum) vacWatch(b, vacuum);
  reg(paint);
  paint();
}

/* An entity's name without the vacuum's own, for the tiles. */
function vacShort(entity, vacuum) {
  var name = A(entity).friendly_name || entity,
    h = H(),
    e = vacuum && h.entities && h.entities[vacuum],
    dv = e && h.devices && h.devices[e.device_id],
    dev = (dv && (dv.name_by_user || dv.name)) || (vacuum && A(vacuum).friendly_name) || "";
  if (dev && name.indexOf(dev + " ") === 0) name = name.slice(dev.length + 1);
  return cap(name.replace(/ life$/i, ""));
}

/* ---- the setup of a vacuum appliance (its part of the appliance's set-up page) ---- */

function vacapEditor(box, d, redraw) {
  var ap = d.ap,
    conf = vacapConf(ap),
    aid = d.aid;
  function listRow(kind, items, label, sub, add, title) {
    box.appendChild(sep(_T(title), "vac"));
    var rows = [];
    items.forEach(function (x, i) {
      var el = pill("tune", label(x), {
        sub: function () {
          return sub(x);
        },
        tap: function () {
          showPopup("vacap-" + kind + ":" + aid + ":" + i, true);
        },
      });
      rows.push(el);
      box.appendChild(el);
    });
    if (rows.length > 1)
      makeSortable(box, rows, function (from, to) {
        items.splice(to, 0, items.splice(from, 1)[0]);
        uiChanged();
        redraw();
      });
    if (items.length < add.max)
      box.appendChild(
        pill("plus", _T(add.label), {
          tap: function () {
            items.push(add.make(items));
            uiChanged();
            showPopup("vacap-" + kind + ":" + aid + ":" + (items.length - 1), true);
          },
        })
      );
  }
  listRow(
    "r",
    conf.rooms,
    function (r) {
      return r.l || r.k;
    },
    function (r) {
      return r.k;
    },
    { max: 40, label: "vacap_add_room", make: function (l) { return { k: String(l.length + 1), l: "" }; } },
    "vacap_rooms"
  );
  listRow(
    "s",
    conf.sets,
    function (s) {
      return s.l || s.k;
    },
    function (s) {
      return s.k + " · " + vacapOptions(s).join(", ");
    },
    { max: 6, label: "vacap_add_setting", make: function (l) { return { k: "setting_" + (l.length + 1), l: _T("mode"), o: [] }; } },
    "vacap_settings"
  );
  listRow(
    "a",
    conf.run,
    function (r) {
      return r.action;
    },
    function (r) {
      return JSON.stringify(r.data);
    },
    { max: 4, label: "vacap_add_action", make: function () { return { action: "vacuum.start", data: { entity_id: "$vacuum" } }; } },
    "vacap_start_actions"
  );
  box.appendChild(hintRow(_T("vacap_start_hint")));
  box.appendChild(
    flagPill("info", _T("vacap_status_tile"), conf, "nost", function (on) {
      return on ? _T("on_cap") : _T("off");
    }, true)
  );
  /* the map's look, the same settings a vacuum device has */
  if (ap.slots.map && !(d.rm && d.rm.v === "i" && d.rm.img))
    devVacuumMapOptions({
      d: d,
      box: box,
      get mapMore() {
        return VACAPMAPMORE;
      },
      set mapMore(v) {
        VACAPMAPMORE = v;
      },
      redraw: redraw,
    });
}

/* Whether the map's further settings are open in the editor. */
var VACAPMAPMORE = false;

function vacapItemPage(b, key, list) {
  var p = key.split(":"),
    d = apFind(p[0]),
    items = d && vacapConf(d.ap)[list],
    x = items && items[+p[1]];
  if (!x) return;
  function field(label, value, set, max, hint) {
    b.appendChild(sep(_T(label), "edit"));
    b.appendChild(
      textRow(
        "edit",
        _T(label),
        value,
        function (v) {
          set(v.trim());
          uiChanged();
        },
        max
      )
    );
    if (hint) b.appendChild(hintRow(_T(hint)));
  }
  if (list === "rooms") {
    field("rm_label", x.l, function (v) { x.l = v.slice(0, 24); }, 24);
    field("vacap_room_value", x.k, function (v) { if (/^[A-Za-z0-9_-]{1,24}$/.test(v)) x.k = v; else toast(_T("vacap_bad_value")); }, 24, "vacap_room_value_hint");
  } else if (list === "sets") {
    field("rm_label", x.l, function (v) { x.l = v.slice(0, 24); }, 24);
    field("vacap_field", x.k, function (v) { if (/^[A-Za-z0-9_]{1,40}$/.test(v)) x.k = v; else toast(_T("vacap_bad_value")); }, 40, "vacap_field_hint");
    field("vacap_values", (x.o || []).join(", "), function (v) {
      x.o = v.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
    }, 200, "vacap_values_hint");
    b.appendChild(
      pill("plug", _T("vacap_or_select"), {
        sub: function () {
          return x.e || _T("ap_not_set");
        },
        tap: function () {
          pickEntity(_T("vacap_or_select"), ["select", "input_select"], null, function (id) {
            x.e = id;
            uiChanged();
          });
        },
      })
    );
    b.appendChild(
      flagPill("home", _T("vacap_room_only"), x, "r", function (on) {
        return on ? _T("on_cap") : _T("off");
      })
    );
    field(
      "vacap_codes",
      Object.keys(x.c || {})
        .map(function (n) {
          return n + "=" + x.c[n];
        })
        .join(", "),
      function (v) {
        var codes = {};
        v.split(",").forEach(function (pair) {
          var m = /^\s*([^=]+?)\s*=\s*(-?\d+(\.\d+)?)\s*$/.exec(pair);
          if (m) codes[m[1]] = Number(m[2]);
        });
        if (Object.keys(codes).length) x.c = codes;
        else delete x.c;
      },
      300,
      "vacap_codes_hint"
    );
    field("vacap_default", x.d || "", function (v) {
      if (v) x.d = v.slice(0, 40);
      else delete x.d;
    }, 40);
  } else {
    b.appendChild(
      flagPill("repeat", _T("vacap_each_room"), x, "each", function (on) {
        return on ? _T("vacap_each_room_on") : _T("off");
      })
    );
    field("vacap_action", x.action, function (v) { if (/^[a-z_]+\.[a-z0-9_]+$/.test(v)) x.action = v; else toast(_T("vacap_bad_value")); }, 80, "vacap_action_hint");
    b.appendChild(sep(_T("vacap_data"), "edit"));
    b.appendChild(
      areaRow(
        _T("vacap_data"),
        JSON.stringify(x.data, null, 2),
        function (v) {
          try {
            var o = JSON.parse(v);
            if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not an object");
            x.data = o;
            uiChanged();
          } catch (e) {
            toast(_T("vacap_bad_data"));
          }
        },
        1000
      )
    );
    b.appendChild(hintRow(_T("vacap_start_hint")));
  }
  var rm = pill("trash", _T("ap_clear"), {
    tap: function () {
      items.splice(+p[1], 1);
      uiChanged();
      popBack();
    },
  });
  stgActions(b, [rm], [rm]);
}
