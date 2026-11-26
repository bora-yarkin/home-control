/* Robot vacuum: the room-by-room card, the live map with trail and no-go zones, and the vacuum popup. */

/* The vacuum shown by the robot card; set by vacPopup() for the device being opened. */
var RBV = "",
  RBM = null,
  RBF = null,
  RBW = null,
  RBS = null;

var RB = {
  rooms: [],
  mode: null,
  fan: null,
  water: null,
  running: false,
  locked: false,
  lockedAt: 0,
  det: "unknown",
  detAt: 0,
  staleAt: 0,
  opt: null,
  vs: null,
};

var RBCLEAN = ["sweeping", "mapping", "working", "cleaning", "pausing", "returning"],
  RBDONE = ["charging", "charged", "fully charged"];

function rbResolve() {
  var h = H();
  if (!h || !h.entities || !h.entities[RBV]) return;
  var did = h.entities[RBV].device_id;
  Object.keys(h.entities).forEach(function (id) {
    if (
      id.indexOf("sensor.") === 0 &&
      !RBS &&
      id.endsWith("_status") &&
      h.states[id] &&
      h.states[id].attributes["vacuum.status"] !== undefined
    )
      RBS = id;
    if (!did || h.entities[id].device_id !== did || id.indexOf("select.") !== 0) return;
    if (id.endsWith("_sweep_mop_type")) RBM = id;
    else if (id.endsWith("_suction_level")) RBF = id;
    else if (id.endsWith("_mop_water_output_level")) RBW = id;
  });
}

function rbRaw() {
  var v = RBS ? V_(RBS) : "";
  return v === "unavailable" || v === "unknown" ? "" : v;
}

function rbTrack() {
  var v = V_(RBV);
  if (v !== RB.vs) {
    RB.vs = v;
    RB.opt = null;
  }
  if (!RB.locked) return;
  var raw = rbRaw(),
    now = Date.now(),
    el = now - RB.lockedAt;
  if (RB.det === "detecting") {
    if (RBCLEAN.indexOf(raw) >= 0) RB.det = "live";
    else if (now - RB.detAt > 90000) {
      RB.det = "stale";
      RB.staleAt = now;
    }
  }
  if (RB.det !== "stale") {
    if (el > 30000 && (RBDONE.indexOf(raw) >= 0 || v === "docked")) RB.locked = false;
  } else if (now - RB.staleAt > 1800000) RB.locked = false;
  if (el > 5400000) RB.locked = false;
}

function rbUnlock() {
  RB.locked = false;
  RB.det = "unknown";
  RB.opt = null;
}

var RBLAB = {
  "Sweep": _T("vacw_vacuuming"),
  "Mop": _T("vacw_mopping"),
  "Sweep Mop": _T("vacw_vac_and_mop"),
  "Sweep Before Mopping": _T("vacw_vac_before_mop"),
  "Silent": _T("vacw_silent"),
  "Basic": _T("vacw_standard"),
  "Strong": _T("vacw_strong"),
  "Full Speed": _T("vacw_turbo"),
  "Off": _T("vacw_off"),
  "Level1": _T("vacw_level_1"),
  "Level2": _T("vacw_level_2"),
  "Level3": _T("vacw_level_3"),
};

var RBICON = {
  "Sweep": "vac",
  "Mop": "drop",
  "Sweep Mop": "drop",
  "Sweep Before Mopping": "repeat",
  "Silent": "moon",
  "Basic": "fan",
  "Strong": "fan",
  "Full Speed": "fan",
  "Off": "drop",
  "Level1": "drop",
  "Level2": "drop",
  "Level3": "drop",
};

var RBMORDER = ["Sweep", "Sweep Mop", "Sweep Before Mopping", "Mop"];

function rbOptSec(b, label, ent, key, get, set, inherit) {
  var opts = (A(ent).options || []).slice();
  if (key === "mode")
    opts.sort(function (x, y) {
      var p = RBMORDER.indexOf(x),
        q = RBMORDER.indexOf(y);
      return (p < 0 ? 99 : p) - (q < 0 ? 99 : q);
    });
  var head = mk("div", "rb-sec", "<span></span><b></b>"),
    sv = head.lastChild,
    g = mk("div", "opts"),
    rs = null;
  g.setAttribute("data-k", "clean");
  head.firstChild.textContent = label;
  if (inherit) {
    rs = mk("span", "rb-chip pane", _T("same_as_all"));
    rs.addEventListener("click", function () {
      set("");
      paint();
    });
    head.insertBefore(rs, sv);
  }
  function paint() {
    var c = get();
    sv.textContent = c ? RBLAB[c] || c : inherit ? _T("same_as_all_rooms") : "";
    if (rs) rs.style.display = c ? "" : "none";
    Array.prototype.forEach.call(g.children, function (o) {
      o.classList.toggle("on", o._v === c);
    });
  }
  opts.forEach(function (v) {
    var o = mk("div", "opt", ic(RBICON[v] || "drop") + "<span></span>");
    o.lastChild.textContent = RBLAB[v] || v;
    o._v = v;
    o.addEventListener("click", function () {
      set(v);
      paint();
    });
    g.appendChild(o);
  });
  paint();
  b.appendChild(head);
  b.appendChild(g);
}

function rbRoomPage(b, rid) {
  rbResolve();
  b.appendChild(hintRow(_T("used_when_this_room_is_cleaned_what")));
  if (RBM)
    rbOptSec(
      b,
      _T("mode"),
      RBM,
      "mode",
      function () {
        return rbPref(rid).mode || "";
      },
      function (v) {
        rbPrefSet(rid, "mode", v);
      },
      true
    );
  if (RBF)
    rbOptSec(
      b,
      _T("suction"),
      RBF,
      "fan",
      function () {
        return rbPref(rid).fan || "";
      },
      function (v) {
        rbPrefSet(rid, "fan", v);
      },
      true
    );
  if (RBW)
    rbOptSec(
      b,
      _T("water_output"),
      RBW,
      "water",
      function () {
        return rbPref(rid).water || "";
      },
      function (v) {
        rbPrefSet(rid, "water", v);
      },
      true
    );
  b.appendChild(sep(_T("cleaning_passes"), "repeat"));
  b.appendChild(
    seg(
      [
        ["1", "1×"],
        ["2", "2×"],
        ["3", "3×"],
      ],
      String(rbPref(rid).times || 1),
      function (v) {
        rbPrefSet(rid, "times", +v);
      }
    )
  );
}

function rbRooms() {
  return Integrations.vacuum.rooms(A(RBV));
}

function rbSleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

/* Stop ends the clean and sends the robot back to its dock, using the vacuum's own "stop and go charge" action when it has one; Pause only pauses. */
function rbDock() {
  var btn = Integrations.vacuum.dockButton(H(), RBV);
  vacKick(RBV);
  if (btn) call("button", "press", { entity_id: btn });
  else {
    call("vacuum", "stop", { entity_id: RBV });
    setTimeout(function () {
      call("vacuum", "return_to_base", { entity_id: RBV });
    }, 1500);
  }
}

async function rbStart() {
  if (!gate([RBV], rbStart)) return;
  rbResolve();
  rbTrack();
  var h = H();
  if (!h || RB.running || RB.locked) return;
  RB.running = true;
  try {
    /* The shown state can be old, and a stale "returning" or "cleaning" would block the start with no sign, so the robot is asked first. */
    await h.callService("homeassistant", "update_entity", { entity_id: RBV }).catch(function () {});
    await rbSleep(2500);
    var s = V_(RBV),
      list = rbRooms();
    if (s === "cleaning" || s === "returning") {
      RB.running = false;
      toast(
        s === "cleaning"
          ? _T("the_robot_is_already_cleaning")
          : _T("the_robot_is_already_on_its_way_back")
      );
      return;
    }
    if (!list.length) {
      RB.running = false;
      return;
    }
    if (RB.mode && RBM) {
      await h.callService("select", "select_option", { entity_id: RBM, option: RB.mode });
      await rbSleep(2000);
    }
    if (RB.fan && RBF) {
      await h.callService("select", "select_option", { entity_id: RBF, option: RB.fan });
      await rbSleep(1500);
    }
    if (RB.water && RBW) {
      await h.callService("select", "select_option", { entity_id: RBW, option: RB.water });
      await rbSleep(1500);
    }
    /* No room chosen means every room; each room uses its own preferences where it has them and the main selection otherwise. */
    var ids = (
      RB.rooms.length
        ? RB.rooms
        : list.map(function (r) {
            return r.id;
          })
    ).map(Number);
    for (var i = 0; i < ids.length; i++) {
      var rm = list.filter(function (r) {
          return r.id === String(ids[i]);
        })[0],
        pf = rbPref(ids[i]),
        md = pf.mode || RB.mode,
        fn = pf.fan || RB.fan,
        wt = pf.water || RB.water;
      await Integrations.vacuum.setRoom(RBV, ids[i], rm ? rm.name : "", {
        fan: fn,
        water: wt,
        mode: md,
        times: pf.times,
      });
      await rbSleep(1000);
    }
    await rbSleep(1000);
    await Integrations.vacuum.cleanRooms(RBV, ids);
    vacKick(RBV);
    RB.locked = true;
    RB.lockedAt = Date.now();
    RB.det = "detecting";
    RB.detAt = Date.now();
    RB.opt = null;
    RB.vs = V_(RBV);
  } catch (e) {
    toast(
      String(e && e.message ? e.message : e)
        .slice(0, 80)
        .replace(/^/, _T("couldn_t_start_the_robot") + ": ")
    );
  }
  RB.running = false;
}

function robotCard(b) {
  rbResolve();
  reg(rbTrack);
  var rooms = rbRooms();
  var hd = mk(
    "div",
    "rb-sec",
    "<span>" + _T("rooms_caps") + "</span><span class='rb-chips'></span>"
  );
  var ch = hd.querySelector(".rb-chips");
  var tiles = mk("div", "rooms");
  tiles.setAttribute("data-k", "clean");
  var start = mk("div", "rb-start pane");
  function paintStart() {
    rbTrack();
    var s = V_(RBV);
    var busy = RB.running || RB.locked || s === "cleaning" || s === "returning";
    var dis = busy;
    start.classList.toggle("dis", dis);
    start.innerHTML =
      svg("play") +
      "<span>" +
      (RB.running
        ? _T("starting")
        : busy
          ? s === "returning" || RB.opt === "returning"
            ? _T("returning")
            : _T("cleaning")
          : RB.rooms.length
            ? _T("start_on_selected_rooms")
            : _T("start_all_rooms")) +
      "</span>";
    if (typeof paintCtl === "function" && ctl) paintCtl();
  }
  function paintRooms() {
    Array.prototype.forEach.call(tiles.children, function (t) {
      t.classList.toggle("on", RB.rooms.indexOf(t._id) >= 0);
      if (t._gz) t._gz.classList.toggle("on", Object.keys(rbPref(t._id)).length > 0);
    });
    paintStart();
  }
  var all = mk("span", "rb-chip pane", _T("all")),
    clr = mk("span", "rb-chip pane", _T("clear"));
  all.addEventListener("click", function () {
    RB.rooms = rooms.map(function (r) {
      return r.id;
    });
    paintRooms();
  });
  clr.addEventListener("click", function () {
    RB.rooms = [];
    paintRooms();
  });
  ch.appendChild(all);
  ch.appendChild(clr);
  rooms.forEach(function (r) {
    var t = mk("div", "room pane", ic("home") + "<span></span>");
    t.lastChild.textContent = r.name;
    t._id = r.id;
    if (ISADMIN) {
      var gz = mk("span", "rb-g", svg("tune"));
      gz.title = _T("room_preferences");
      gz.addEventListener("click", function (e) {
        e.stopPropagation();
        showPopup("rb-room:" + r.id, true);
      });
      t.appendChild(gz);
      t._gz = gz;
    }
    t.addEventListener("click", function () {
      var i = RB.rooms.indexOf(r.id);
      if (i >= 0) RB.rooms.splice(i, 1);
      else RB.rooms.push(r.id);
      paintRooms();
    });
    tiles.appendChild(t);
  });
  b.appendChild(hd);
  b.appendChild(tiles);
  paintRooms();
  reg(paintRooms);
  function optSec(label, ent, key) {
    var o = A(ent).options || [];
    if (RB[key] === null && o.indexOf(V_(ent)) >= 0) RB[key] = V_(ent);
    rbOptSec(
      b,
      label,
      ent,
      key,
      function () {
        return RB[key];
      },
      function (v) {
        RB[key] = v;
      }
    );
  }
  if (RBM) optSec(_T("mode"), RBM, "mode");
  if (RBF) optSec(_T("suction"), RBF, "fan");
  if (RBW) optSec(_T("water_output"), RBW, "water");
  /* The control buttons only exist while the robot is working: Pause while it is cleaning, Resume while it is paused, Stop and dock in both. */
  var ctl = mk("div", "rrow rbc"),
    bPause = rbtn(
      "pause",
      function () {
        RB.opt = "paused";
        call("vacuum", "pause", { entity_id: RBV });
        paintStart();
      },
      _T("pause")
    ),
    bResume = rbtn(
      "play",
      function () {
        RB.opt = "cleaning";
        call("vacuum", "start", { entity_id: RBV });
        paintStart();
      },
      _T("resume")
    ),
    bStop = rbtn(
      "stop",
      function () {
        rbUnlock();
        rbDock();
        RB.opt = "returning";
        paintStart();
        paintCtl();
      },
      _T("stop_and_dock")
    );
  ctl.appendChild(bPause);
  ctl.appendChild(bResume);
  ctl.appendChild(bStop);
  function paintCtl() {
    var v = V_(RBV),
      st = RB.locked ? RB.opt || v : v,
      working = RB.locked || v === "cleaning" || v === "paused" || v === "returning",
      paused = st === "paused",
      ret = v === "returning" || RB.opt === "returning";
    bPause.style.display = working && !paused && !ret ? "" : "none";
    bResume.style.display = paused ? "" : "none";
    bStop.style.display = working ? "" : "none";
    ctl.style.display = working ? "" : "none";
    ctl.style.gridTemplateColumns =
      "repeat(" +
      [bPause, bResume, bStop].filter(function (x) {
        return x.style.display !== "none";
      }).length +
      ",1fr)";
  }
  b.appendChild(ctl);
  paintCtl();
  reg(paintCtl);
  start.addEventListener("click", function () {
    var p = rbStart();
    paintStart();
    p.then(paintStart);
  });
  b.appendChild(start);
  reg(paintStart);
}

/* Vacuum: the room-by-room card when the robot reports its rooms, otherwise start, pause and dock; then its readings. */
/* A robot vacuum's top row is its battery with the readings it reports (cleaning area and time), in the same tiles as every other reading. */
function vacSummary(b, id) {
  var inf = devInfo(id, { battery: true }),
    /* What the person bound under modes or care values is shown there, not a second time here. */
    bound = ((UIDEV[id] && UIDEV[id].vx && (UIDEV[id].vx.care || []).concat(UIDEV[id].vx.modes || [])) || []),
    nums = inf.read
      .filter(function (e) {
        return dom(e) === "sensor" && bound.indexOf(e) < 0;
      })
      .slice(0, 5),
    items = [
      [
        _T("battery"),
        function () {
          var l = vacBattery(id);
          return l !== undefined ? l + "%" : "–";
        },
      ],
    ].concat(
      nums.map(function (e) {
        return [
          advName(e),
          function () {
            return entVal(e);
          },
        ];
      })
    );
  b.appendChild(glance(items, 3));
}

function vacMapEnt(id) {
  return Integrations.vacuum.mapImage(H(), id);
}

/* The map of a vacuum device's popup, with the entities its integration keeps. */
function vacMap(b, id) {
  var me = vacMapEnt(id);
  if (!me) return;
  vacMapView(b, {
    id: id,
    me: me,
    ps: Integrations.vacuum.positionSensor(me),
    opts: function () {
      return (UIDEV[id] || {}).map || {};
    },
    zones: function () {
      return Integrations.vacuum.zones(id);
    },
  });
}


/* Every cleaning run of the last 30 days, read from the robot's state history. A run starts when the state becomes "cleaning" from a state that is not part of a run, and ends at the first state that is neither cleaning nor paused (so the trip back to the dock is not counted). The area comes from the robot's cleaning area sensor. */
function vacPopup(b, id) {
  if (RBV !== id) {
    RBV = id;
    RBM = RBF = RBW = RBS = null;
  }
  vacWatch(b, id);
  vacMap(b, id);
  vacSummary(b, id);
  if (rbRooms().length) robotCard(b);
  else vacGeneric(b, id);
  readingsBlock(b, id, { battery: true, noNums: true, noCare: true });
  vacProfile(b, id);
}

function vacGeneric(b, id) {
  b.appendChild(
    pill("vac", _T("status"), {
      on: function () {
        return ["cleaning", "returning"].indexOf(V_(id)) >= 0;
      },
      sub: function () {
        var a = A(id);
        return a["vacuum.status_desc"] || cap(V_(id));
      },
    })
  );
  var can = { start: true, pause: true, dock: true },
    tr = mk("div", "rrow"),
    start = rbtn("play", function () {
      if (can.start) call("vacuum", "start", { entity_id: id });
    }, _T("start")),
    pause = rbtn("pause", function () {
      if (can.pause) call("vacuum", "pause", { entity_id: id });
    }, _T("pause")),
    dock = rbtn("home", function () {
      if (can.dock) call("vacuum", "return_to_base", { entity_id: id });
    }, _T("dock"));
  [start, pause, dock].forEach(function (x) {
    tr.appendChild(x);
  });
  /* What the vacuum can do now: Pause only while it cleans, Start unless it already cleans, Dock unless it is docked or on its way. */
  function paint() {
    var st = V_(id),
      gone = !svOk(id);
    can.start = !(gone || st === "cleaning");
    can.pause = !gone && st === "cleaning";
    can.dock = !(gone || st === "docked" || st === "returning");
    start.classList.toggle("na", !can.start);
    pause.classList.toggle("na", !can.pause);
    dock.classList.toggle("na", !can.dock);
  }
  paint();
  reg(paint);
  b.appendChild(tr);
  var speeds = A(id).fan_speed_list;
  if (Array.isArray(speeds) && speeds.length) {
    var g = mk("div", "grid3");
    g.appendChild(
      selectTile(
        _T("vac_fan_speed"),
        function () {
          return A(id).fan_speed_list || [];
        },
        function () {
          return A(id).fan_speed;
        },
        function (v) {
          call("vacuum", "set_fan_speed", { entity_id: id, fan_speed: v });
        },
        "fan"
      )
    );
    b.appendChild(g);
  }
}
