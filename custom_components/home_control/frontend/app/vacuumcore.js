/* What every robot vacuum uses, whatever its brand: asking it for its state while one is watched, a room's own choices, and the live map with its trail and no-go zones. The robot
   vacuum appliance (app/appliancevac.js) is built on this alone; app/vacuum.js is the older card that knows one integration. */

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

/* Per-room cleaning preferences. Whatever a room leaves unset follows the main selection in the popup. */
function rbPref(id) {
  var r = STORE.cfg && STORE.cfg.rb;
  return (r && r[String(id)]) || {};
}

function rbPrefSet(id, k, v) {
  var rb = JSON.parse(JSON.stringify((STORE.cfg && STORE.cfg.rb) || {})),
    o = (rb[id] = rb[id] || {});
  if (v === "" || v === null || v === undefined || (k === "times" && v === 1)) delete o[k];
  else o[k] = v;
  if (!Object.keys(o).length) delete rb[id];
  STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { rb: rb }));
  storeChanged();
}

/* A live map image, shown at the top of a vacuum's popup. It keeps its own height and scrolls by itself, because a floor plan can be much taller than the popup. */
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

/* A vacuum's map: what a robot vacuum appliance draws from the entities chosen for it, and what the popup of a vacuum device draws.
   `cfg`: { id (the vacuum entity, for its state and history), me (the map: an image or camera entity), ps (the entity whose attributes give the robot's x and y, if any),
   opts() (the map settings), zones() (a promise of [{ wall, items }], if any) }. */
function vacMapView(b, cfg) {
  var id = cfg.id || "",
    me = cfg.me,
    key = id || me;
  /* where the robot is: the position entity, else the map's own `vacuum_position` */
  function robot() {
    return cfg.ps ? A(cfg.ps) : A(me).vacuum_position || {};
  }
  var box = mk("div", "rb-map pane"),
    wrap = mk("div", "rb-mapw"),
    img = mk("img"),
    last = "",
    lbl = mk("div", "rb-mls");
  img.alt = _T("map_of_the_robot_vacuum");
  lbl.style.fontSize = (cfg.opts().ls || 13.5) + "px";
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
    var mp = cfg.opts(),
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
  var ps = cfg.ps || "",
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
    var a = robot(),
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
  var mt = cfg.opts(),
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
    trail = RBTRAIL[key] = RBTRAIL[key] || { pts: [], st: "", loaded: false };
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
    var st = id ? V_(id) : "",
      a = robot();
    if (st === "cleaning" && trail.st && RUN.indexOf(trail.st) < 0) trail.pts = [];
    trail.st = st;
    if (RUN.indexOf(st) >= 0 && typeof a.x === "number" && typeof a.y === "number") push(a.x, a.y);
  }
  function load() {
    if (!trail || trail.loaded || !id || !ps) return;
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
    if (!zg || !cfg.zones) return;
    cfg
      .zones()
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

