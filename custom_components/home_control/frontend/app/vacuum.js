/* Robot vacuum: the room-by-room card, the live map with trail and no-go zones, and the vacuum popup. */

/* A vacuum reports its state slowly by itself, so after a command it is asked for its state every few seconds for a minute. Without this the dashboard keeps showing the old state although the robot is already moving. */
var VACKICK = {};

/* While a vacuum popup is open the vacuum is asked for its state every few seconds. */
function vacWatch(b, id) {
  var t = setInterval(function () {
    var h = H();
    if (!h || !document.body.contains(b)) {
      clearInterval(t);
      return;
    }
    h.callService("homeassistant", "update_entity", { entity_id: id }).catch(function () {});
  }, 5000);
}

function vacKick(id) {
  var h = H();
  if (!h || !id) return;
  var k = (VACKICK[id] = VACKICK[id] || { until: 0, t: 0 });
  k.until = Date.now() + 6e4;
  if (k.t) return;
  k.t = setInterval(function () {
    if (Date.now() > k.until) {
      clearInterval(k.t);
      k.t = 0;
      return;
    }
    var hh = H();
    if (hh)
      hh.callService("homeassistant", "update_entity", { entity_id: id }).catch(function () {});
  }, 3000);
}

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
  "Sweep": "Vacuuming",
  "Mop": "Mopping",
  "Sweep Mop": "Vac & Mop",
  "Sweep Before Mopping": "Vac before Mop",
  "Silent": "Silent",
  "Basic": "Standard",
  "Strong": "Strong",
  "Full Speed": "Turbo",
  "Off": "Off",
  "Level1": "Level 1",
  "Level2": "Level 2",
  "Level3": "Level 3",
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

/* Per-room cleaning preferences. Whatever a room leaves unset follows the main selection in the popup. */
function rbPref(id) {
  var r = STORE.cfg && STORE.cfg.rb;
  return (r && r[String(id)]) || {};
}

function rbPrefSet(id, k, v) {
  var rb = JSON.parse(JSON.stringify((STORE.cfg && STORE.cfg.rb) || {})),
    o = (rb[id] = rb[id] || {});
  if (v === "" || v === null || v === undefined || (k === "times" && +v === 1)) delete o[k];
  else o[k] = v;
  if (!Object.keys(o).length) delete rb[id];
  STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { rb: rb }));
  storeChanged();
}

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
  var h = mk("div", "hint");
  h.textContent = _T("used_when_this_room_is_cleaned_what");
  b.appendChild(h);
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
    nums = inf.read
      .filter(function (e) {
        return dom(e) === "sensor";
      })
      .slice(0, 5),
    items = [
      [
        _T("battery"),
        function () {
          var l = A(id).battery_level;
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

/* The live map image from the Robot Vacuum Map integration, shown at the top of the robot popup. It keeps its own height and scrolls by itself, because a floor plan can be much taller than the popup. */
var RBTRAIL = {};

/* The robot describes a no-go zone as corner points in one of a few shapes: pairs, a flat list of numbers, {x,y} objects, or an object holding one of these under "points". A flat list of four numbers is a rectangle (or the two ends of a wall). */
function zonePts(z, wall) {
  if (z && !Array.isArray(z) && typeof z === "object") {
    if (z.points) return zonePts(z.points, wall);
    if (
      ["x0", "y0", "x1", "y1"].every(function (k) {
        return typeof z[k] === "number";
      })
    )
      return wall
        ? [
            [z.x0, z.y0],
            [z.x1, z.y1],
          ]
        : [
            [z.x0, z.y0],
            [z.x1, z.y0],
            [z.x1, z.y1],
            [z.x0, z.y1],
          ];
    return [];
  }
  if (!Array.isArray(z)) return [];
  if (
    z.length &&
    z.every(function (n) {
      return typeof n === "number";
    })
  ) {
    if (z.length === 4 && !wall)
      return [
        [z[0], z[1]],
        [z[2], z[1]],
        [z[2], z[3]],
        [z[0], z[3]],
      ];
    var o = [];
    for (var i = 0; i + 1 < z.length; i += 2) o.push([z[i], z[i + 1]]);
    return o;
  }
  return z
    .map(function (p) {
      return Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number"
        ? [p[0], p[1]]
        : p && typeof p.x === "number" && typeof p.y === "number"
          ? [p.x, p.y]
          : null;
    })
    .filter(Boolean);
}

function vacMapEnt(id) {
  return Integrations.vacuum.mapImage(H(), id);
}

function vacMap(b, id) {
  var me = vacMapEnt(id);
  if (!me) return;
  var box = mk("div", "rb-map pane"),
    wrap = mk("div", "rb-mapw"),
    img = mk("img"),
    last = "",
    lbl = mk("div", "rb-mls");
  img.alt = _T("map_of_the_robot_vacuum");
  lbl.style.fontSize = (((UIDEV[id] || {}).map || {}).ls || 13.5) + "px";
  wrap.appendChild(img);
  wrap.appendChild(lbl);
  box.appendChild(wrap);
  b.appendChild(box);
  /* Positions and rooms come in the vacuum's own coordinates. Three calibration points that come with the map are enough to turn them into image pixels. */
  function toPx() {
    var c = A(me).calibration_points || [];
    if (c.length < 3) return null;
    var p0 = c[0],
      p1 = c[1],
      p2 = c[2],
      dx = p1.vacuum.x - p0.vacuum.x,
      dy = p2.vacuum.y - p0.vacuum.y;
    if (!dx || !dy) return null;
    var ax = (p1.map.x - p0.map.x) / dx,
      ay = (p1.map.y - p0.map.y) / dx,
      bx = (p2.map.x - p0.map.x) / dy,
      by = (p2.map.y - p0.map.y) / dy;
    return function (x, y) {
      var vx = x - p0.vacuum.x,
        vy = y - p0.vacuum.y;
      return [p0.map.x + vx * ax + vy * bx, p0.map.y + vx * ay + vy * by];
    };
  }
  /* Room names go at the middle of each room. */
  function labels() {
    lbl.innerHTML = "";
    var f = toPx(),
      rooms = A(me).rooms || {};
    if (!f || !img.naturalWidth) return;
    Object.keys(rooms).forEach(function (k) {
      var r = rooms[k];
      if (!r || !r.name) return;
      var p = f((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
      if (!(p[0] >= 0 && p[1] >= 0 && p[0] <= img.naturalWidth && p[1] <= img.naturalHeight))
        return;
      var t = mk("span", "rb-ml");
      t.textContent = r.name;
      t.style.left = (p[0] / img.naturalWidth) * 100 + "%";
      t.style.top = (p[1] / img.naturalHeight) * 100 + "%";
      lbl.appendChild(t);
    });
  }
  /* Minimal style: the map is a flat image with a handful of colours. The outside becomes see-through, each room keeps its own colour as a soft tint, and every edge between outside and room, or between two rooms, is drawn as a line. Grey pixels are the robot and charger icons and stay as they are. */
  function minimal(src, mp, done) {
    var im = new Image();
    im.onload = function () {
      try {
        var w = im.naturalWidth,
          h = im.naturalHeight,
          cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        var cx = cv.getContext("2d");
        cx.drawImage(im, 0, 0);
        var d = cx.getImageData(0, 0, w, h),
          p = d.data,
          key = new Int32Array(w * h),
          i,
          x,
          y;
        function rgb(c) {
          var s = mk("span");
          s.style.color = c;
          box.appendChild(s);
          var v = (getComputedStyle(s).color.match(/\d+/g) || [255, 255, 255]).map(Number);
          s.remove();
          return v;
        }
        var ink = rgb("var(--ink,#fff)"),
          acc = rgb("var(--acc,currentColor)"),
          fa = mp.fa === undefined ? 70 : mp.fa;
        for (i = 0; i < w * h; i++) {
          var r = p[i * 4],
            g = p[i * 4 + 1],
            b = p[i * 4 + 2];
          key[i] =
            r === g && g === b
              ? -1
              : r === 19 && g === 87 && b === 148
                ? 0
                : (r << 16) | (g << 8) | b;
        }
        function at(xx, yy) {
          return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : key[yy * w + xx];
        }
        for (y = 0; y < h; y++)
          for (x = 0; x < w; x++) {
            i = y * w + x;
            var k = key[i],
              o = i * 4;
            if (k === -1) continue;
            if (k === 0) {
              p[o + 3] = 0;
              continue;
            }
            var own = [p[o], p[o + 1], p[o + 2]],
              e = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(function (n) {
                return n !== -1 && n !== k;
              });
            if (e) {
              var l =
                mp.lc === "acc"
                  ? acc
                  : mp.lc === "room"
                    ? own.map(function (v) {
                        return Math.round(v + (255 - v) * 0.45);
                      })
                    : ink;
              p[o] = l[0];
              p[o + 1] = l[1];
              p[o + 2] = l[2];
              p[o + 3] = 235;
            } else {
              var f = mp.fc === "acc" ? acc : own;
              p[o] = f[0];
              p[o + 1] = f[1];
              p[o + 2] = f[2];
              p[o + 3] = fa;
            }
          }
        cx.putImageData(d, 0, 0);
        done(cv.toDataURL());
      } catch (err) {
        done(src);
      }
    };
    im.onerror = function () {
      done(src);
    };
    im.src = src;
  }
  function paint() {
    var pic = A(me).entity_picture;
    if (!pic) return;
    var mp = (UIDEV[id] || {}).map || {},
      o = !!mp.m,
      k = pic + "|" + V_(me) + "|" + JSON.stringify(mp);
    if (k === last) return;
    last = k;
    var u = pic + (pic.indexOf("?") >= 0 ? "&" : "?") + "t=" + encodeURIComponent(V_(me));
    if (o)
      minimal(u, mp, function (s) {
        if (last === k) img.src = s;
      });
    else img.src = u;
  }
  /* The map opens centred, top to bottom, on the robot and keeps following it until the map is scrolled by hand. */
  var ps = Integrations.vacuum.positionSensor(me),
    touched = false,
    at = "";
  ["wheel", "touchstart", "pointerdown"].forEach(function (ev) {
    box.addEventListener(
      ev,
      function () {
        touched = true;
      },
      { passive: true }
    );
  });
  function center() {
    if (touched || !img.naturalWidth) return;
    var a = A(ps),
      f = toPx();
    if (!f || typeof a.x !== "number" || typeof a.y !== "number") return;
    var p = f(a.x, a.y),
      k = p[0] + "," + p[1];
    if (k === at) return;
    at = k;
    var t = p[1] * (img.clientWidth / img.naturalWidth) - box.clientHeight / 2;
    box.scrollTop = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, t));
  }
  /* Drawn above the map: the trail of the current or last cleaning run, and the no-go zones. The trail is read from the robot's position history when the map opens, so a run nobody watched is still there, and then extended live. */
  var mt = (UIDEV[id] || {}).map || {},
    trail = null,
    pl = null,
    tr = null,
    zg = null,
    zones = [],
    RUN = ["cleaning", "paused", "returning"],
    NS = "http://www.w3.org/2000/svg";
  function el(n, at) {
    var e = document.createElementNS(NS, n);
    Object.keys(at).forEach(function (k) {
      e.setAttribute(k, at[k]);
    });
    return e;
  }
  if (mt.tr || mt.nz) {
    tr = el("svg", { "class": "rb-tr", preserveAspectRatio: "none" });
    wrap.insertBefore(tr, lbl);
  }
  if (mt.nz) {
    zg = el("g", {});
    tr.appendChild(zg);
  }
  if (mt.tr) {
    trail = RBTRAIL[id] = RBTRAIL[id] || { pts: [], st: "", loaded: false };
    pl = el("polyline", {
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke",
      "stroke-width": mt.tw || 3,
    });
    pl.style.stroke = mt.tc === "ink" ? "var(--ink)" : "var(--acc)";
    tr.appendChild(pl);
  }
  function drawTrail() {
    if (!tr || !img.naturalWidth) return;
    var f = toPx();
    if (!f) return;
    function sv(l) {
      return l
        .map(function (q) {
          var p = f(q[0], q[1]);
          return p[0].toFixed(1) + "," + p[1].toFixed(1);
        })
        .join(" ");
    }
    tr.setAttribute("viewBox", "0 0 " + img.naturalWidth + " " + img.naturalHeight);
    if (pl) pl.setAttribute("points", sv(trail.pts));
    if (zg) {
      zg.innerHTML = "";
      zones.forEach(function (z) {
        zg.appendChild(
          el(z.wall ? "polyline" : "polygon", {
            points: sv(z.pts),
            fill: z.wall ? "none" : "rgba(255,90,90,.2)",
            stroke: "rgb(255,90,90)",
            "stroke-width": z.wall ? 3 : 1.5,
            "stroke-dasharray": z.wall ? "none" : "5 3",
            "stroke-linecap": "round",
            "vector-effect": "non-scaling-stroke",
          })
        );
      });
    }
  }
  function push(x, y) {
    var l = trail.pts[trail.pts.length - 1];
    if (l && l[0] === x && l[1] === y) return;
    trail.pts.push([x, y]);
    if (trail.pts.length > 4000) trail.pts.shift();
  }
  function track() {
    if (!trail) return;
    var st = V_(id),
      a = A(ps);
    if (st === "cleaning" && trail.st && RUN.indexOf(trail.st) < 0) trail.pts = [];
    trail.st = st;
    if (RUN.indexOf(st) >= 0 && typeof a.x === "number" && typeof a.y === "number") push(a.x, a.y);
  }
  function load() {
    if (!trail || trail.loaded) return;
    trail.loaded = true;
    var since = new Date(Date.now() - 864e5).toISOString();
    HA.history({
      start_time: since,
      entity_ids: [id],
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    })
      .then(function (r) {
        var l = r[id] || [],
          start = null,
          prev = "";
        l.forEach(function (e) {
          if (e.s === "cleaning" && prev && RUN.indexOf(prev) < 0) start = e.lu;
          prev = e.s;
        });
        if (start === null) return;
        return HA.history({
          start_time: new Date(start * 1000 - 6e4).toISOString(),
          entity_ids: [ps],
          minimal_response: false,
          no_attributes: false,
          significant_changes_only: false,
        }).then(function (q) {
          var live = trail.pts;
          trail.pts = [];
          (q[ps] || []).forEach(function (e) {
            var a = e.a || {};
            if (typeof a.x === "number" && typeof a.y === "number") push(a.x, a.y);
          });
          live.forEach(function (p) {
            push(p[0], p[1]);
          });
          drawTrail();
        });
      })
      .catch(function () {});
  }
  /* The robot keeps its forbidden areas and virtual walls as text; they are asked for each time the map opens. */
  function loadZones() {
    if (!zg) return;
    Integrations.vacuum
      .zones(id)
      .then(function (groups) {
        var out = [];
        groups.forEach(function (g) {
          g.items.forEach(function (z) {
            var p = zonePts(z, g.wall);
            if (p.length >= 2) out.push({ pts: p, wall: g.wall });
          });
        });
        zones = out;
        drawTrail();
      })
      .catch(function () {});
  }
  img.addEventListener("error", function () {
    box.style.display = "none";
  });
  img.addEventListener("load", function () {
    box.style.display = "";
    labels();
    at = "";
    center();
    drawTrail();
  });
  var geo = "";
  function geoCheck() {
    var g = JSON.stringify([A(me).rooms, A(me).calibration_points]);
    if (g === geo) return;
    geo = g;
    labels();
    at = "";
    center();
    drawTrail();
  }
  reg(function () {
    geoCheck();
    paint();
    center();
    track();
    drawTrail();
  });
  paint();
  track();
  load();
  loadZones();
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
  var tr = mk("div", "rrow");
  tr.appendChild(
    rbtn(
      "play",
      function () {
        call("vacuum", "start", { entity_id: id });
      },
      _T("start")
    )
  );
  tr.appendChild(
    rbtn(
      "pause",
      function () {
        call("vacuum", "pause", { entity_id: id });
      },
      _T("pause")
    )
  );
  tr.appendChild(
    rbtn(
      "home",
      function () {
        call("vacuum", "return_to_base", { entity_id: id });
      },
      _T("dock")
    )
  );
  b.appendChild(tr);
}
