/* The light panel: the one control of every light popup (a light, a light group, the lights master of a section), laid out like the Hue app. A colour circle and a white circle (and an Effects page) that slide under small icon tabs at the bottom left, a brightness button at the bottom right that opens a slider, and a row of tiles with the lights. One marker for each light or group sits on the circles; a light that is off is a dot where it was. Tap a group's marker to open its lights in a circle of their own, drop one marker on another to join them. Every marker is a dot; the selected one also has a drop above it in the colour of its light, with the number of lights it stands for (the icon when it is one light). */

/* The things the panel controls form a tree: the whole (a light, a group, or all the lights of a section), and under a group the lights it is made of. 'cmd' is what a command is sent to (a group is commanded as one), 'kids' what a press and hold separates it into. */
function lpNodeOf(id, icon) {
  var nm = LNAME[id] || [A(id).friendly_name || id, "light"],
    members = lightMembers(id),
    n = {
      key: id,
      name: nm[0],
      icon: icon || nm[1],
      cmd: [id],
      kids: null,
      parent: null,
      zones: zoneMembers(id).length > 1,
    };
  if (members.length)
    n.kids = members.map(function (m, i) {
      var k = lpNodeOf(m, n.zones ? n.icon : null);
      if (n.zones) {
        var word = A(id).zone_label || _T("zone");
        k.name = word.charAt(0).toUpperCase() + word.slice(1) + " " + (i + 1);
      }
      k.parent = n;
      return k;
    });
  return n;
}

/* All the lights of a section as one: its lights and groups are the first level below. */
function lpMasterNode(sid, ids) {
  var units = lightUnits(ids),
    n = { key: "m:" + sid, name: _T("all_lights"), icon: "lights", cmd: units, kids: null, parent: null, zones: false };
  n.kids = units.map(function (u) {
    var k = lpNodeOf(u, null);
    k.parent = n;
    return k;
  });
  return n;
}

function lpFind(n, key) {
  if (n.key === key) return n;
  var f = null;
  (n.kids || []).forEach(function (k) {
    f = f || lpFind(k, key);
  });
  return f;
}

/* A node of the tree, or one of the lights joined by hand. */
function lpFindIn(S, key) {
  var f = lpFind(S.root, key);
  S.joined.forEach(function (v) {
    if (v.key === key) f = v;
  });
  return f;
}

/* What is shown: the nodes of lpFrontier, with lights joined by hand taken together as one. A join whose lights are not all shown any more (their group was joined or separated) is forgotten. */
function lpVisible(S) {
  var list = lpFrontier(S.root, S.ex).slice();
  S.joined = S.joined.filter(function (v) {
    return v.kids.every(function (k) {
      return list.indexOf(k) >= 0;
    });
  });
  S.joined.forEach(function (v) {
    var at = Math.min.apply(
      null,
      v.kids.map(function (k) {
        return list.indexOf(k);
      })
    );
    v.kids.forEach(function (k) {
      list.splice(list.indexOf(k), 1);
    });
    list.splice(at, 0, v);
  });
  return list;
}

/* What is shown: the whole, or, where a node was separated, the nodes under it. */
function lpFrontier(n, ex) {
  if (!(n.kids && ex[n.key])) return [n];
  return n.kids.reduce(function (a, k) {
    return a.concat(lpFrontier(k, ex));
  }, []);
}

/* The lights of a node that can show colour ("color") or white temperature ("white"). */
function lpCap(n, mode) {
  var f = mode === "color" ? "color" : "white";
  return n.cmd.filter(function (e) {
    return lightCaps(e)[f];
  });
}

function lpSplit(e) {
  return !!(UIDEV[e] || {}).split;
}

/* A light does not report its colour or white temperature while it is off, so where it was last seen is kept (in this browser, across visits) to show its marker there instead of in the middle. */
var LPMEM = lpMemLoad(),
  lpMemT = 0,
  lpTrackAt = 0;

function lpMemLoad() {
  return deviceGet("lp.mem", {});
}

function lpRemember(e, key, v) {
  var m = LPMEM[e] || (LPMEM[e] = {});
  if (JSON.stringify(m[key]) === JSON.stringify(v)) return;
  m[key] = v;
  clearTimeout(lpMemT);
  lpMemT = setTimeout(function () {
    deviceSet("lp.mem", LPMEM);
  }, 1500);
}

/* Colour and white temperature as a light has them (or had them last); a light with separate zones (split) keeps what was last set for each zone. */
function lpHs(e) {
  var a = A(e),
    v = lpSplit(e) ? lzone(e).hs : a.hs_color;
  /* A light that reports only an xy colour (the zones of a gradient light) is placed by that colour. */
  if (!v && a.xy_color && V_(e) === "on") v = liveXyHs(a.xy_color[0], a.xy_color[1]);
  if (v) lpRemember(e, "hs", v);
  else v = (LPMEM[e] || {}).hs;
  return v || null;
}

function lpKelvin(e) {
  var v = lpSplit(e) ? lzone(e).k : A(e).color_temp_kelvin;
  if (v) lpRemember(e, "k", v);
  else v = (LPMEM[e] || {}).k;
  return v || null;
}

/* Every light that is on is remembered, also while no light popup is open. Called with every refresh; it works at most every 4 seconds. */
function lpTrackTick() {
  var h = H();
  if (!h || Date.now() - lpTrackAt < 4000) return;
  lpTrackAt = Date.now();
  Object.keys(h.states).forEach(function (id) {
    if (dom(id) !== "light" || V_(id) !== "on" || Array.isArray(A(id).entity_id)) return;
    lpHs(id);
    lpKelvin(id);
  });
}

function lpKrange(n) {
  var c = lpCap(n, "white");
  if (!c.length) return [2000, 6500];
  var a = A(c.filter(isOn)[0] || c[0]);
  return [a.min_color_temp_kelvin || 2000, a.max_color_temp_kelvin || 6500];
}

/* Sends a colour or a white temperature to what a node stands for. */
function lpPush(n, mode, data) {
  var t = lpCap(n, mode);
  if (!t.length) return;
  if (t.length === 1 && lpSplit(t[0])) {
    var d = Object.assign({ entity_id: t[0] }, data);
    lightPush(t[0], d);
    return;
  }
  callLive("lp:" + n.key + ":" + mode, "light", "turn_on", Object.assign({ entity_id: t }, data));
}

/* ---- the circles ---- */

/* Where a light puts its marker on a circle of radius R: at its colour, or at its white temperature (the height). A light with no value yet waits near the middle, spread around it so the markers do not hide each other. 'i' of 'count' is the marker's place among them. */
function lpSpot(mode, ref, R, krange, i, count) {
  var many = count > 1;
  if (mode === "color") {
    var h = ref ? lpHs(ref) : null;
    if (h) {
      var a = (h[0] * Math.PI) / 180,
        d = (h[1] / 100) * R;
      return [R + d * Math.sin(a), R - d * Math.cos(a)];
    }
    var spread = (2 * Math.PI * i) / count;
    return [R + (many ? 0.16 * R * Math.sin(spread) : 0), R - (many ? 0.16 * R * Math.cos(spread) : 0)];
  }
  var kv = ref ? lpKelvin(ref) : null,
    y = kv ? Math.max(0, Math.min(2 * R, ((kv - krange[0]) / (krange[1] - krange[0])) * 2 * R)) : R;
  return [R + (many ? (i - (count - 1) / 2) * 0.22 * R : 0), y];
}

/* Markers that would sit on top of each other (lights with the same colour) are moved a little apart, so each can be seen and picked. */
function lpApart(pts, R) {
  var gap = 46;
  for (var round = 0; round < 12; round++) {
    var again = false;
    for (var i = 0; i < pts.length; i++)
      for (var j = i + 1; j < pts.length; j++) {
        var dx = pts[j][0] - pts[i][0],
          dy = pts[j][1] - pts[i][1],
          d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.5) {
          var an = (2 * Math.PI * j) / pts.length;
          dx = Math.sin(an);
          dy = -Math.cos(an);
          d = 1;
        }
        var push = (gap - d) / 2;
        pts[i][0] -= (dx / d) * push;
        pts[i][1] -= (dy / d) * push;
        pts[j][0] += (dx / d) * push;
        pts[j][1] += (dy / d) * push;
        again = true;
      }
    pts.forEach(function (p) {
      var cx = p[0] - R,
        cy = p[1] - R,
        dist = Math.hypot(cx, cy),
        lim = R - 14;
      if (dist > lim) {
        p[0] = R + (cx / dist) * lim;
        p[1] = R + (cy / dist) * lim;
      }
    });
    if (!again) break;
  }
}

/* The single lights a node is made of (a light made of zones is one light), however deep the groups go. */
function lpLeaves(n) {
  if (!n.kids || n.zones) return [n];
  return n.kids.reduce(function (a, k) {
    return a.concat(lpLeaves(k));
  }, []);
}

/* What opens when a marker is tapped again: the zones of a light made of zones, otherwise its single lights. */
function lpOpenKids(n) {
  return n.zones ? n.kids : lpLeaves(n);
}

/* How many lights a node stands for (a light made of zones is one light). */
function lpCount(n) {
  if (!n.kids || n.zones) return 1;
  return n.kids.reduce(function (s, k) {
    return s + lpCount(k);
  }, 0);
}

/* The colour of a marker: its dot and the drop above it, with a dark or light mark on the drop, whichever reads better. */
function lpPaintMark(m, rgb) {
  if (!rgb) {
    m.dot.style.background = "";
    m.pin.style.removeProperty("--pc");
    m.pin.style.color = "";
    return;
  }
  var css = cssRgb(rgb);
  m.dot.style.background = css;
  m.pin.style.setProperty("--pc", css);
  m.pin.style.color = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.6 ? "#1a1c22" : "#fff";
}

/* A marker on a circle: a dot, and above it, while selected, a drop with the number of lights (the icon for one light), the name and the kelvin while dragging. */
function lpMarker(n, showName) {
  var m = {
    n: n,
    x: 0,
    y: 0,
    dot: mk("div", "lw-dot"),
    pin: mk("div", "lw-pin", lpCount(n) > 1 ? "<span class='lw-num'>" + lpCount(n) + "</span>" : svg(n.icon || "light")),
    tag: mk("div", "lw-tag"),
    pending: null,
    timer: 0,
    last: 0,
  };
  if (showName) m.pin.appendChild(mk("div", "lw-lbl")).textContent = n.name;
  m.pin.appendChild(m.tag);
  return m;
}

function lpPlace(m, x, y) {
  m.x = x;
  m.y = y;
  m.dot.style.left = m.pin.style.left = x + "px";
  m.dot.style.top = m.pin.style.top = y + "px";
}

/* How far a press is from a marker: from its dot or from the round tag above it, whichever is closer, so pressing the tag counts as pressing the marker. */
function lpReach(circ, e, m) {
  var r = circ.getBoundingClientRect(),
    dx = e.clientX - r.left - m.x,
    dy = e.clientY - r.top - m.y;
  if (!m.pin.classList.contains("act") || m.pin.classList.contains("off")) return Math.hypot(dx, dy);
  return Math.min(Math.hypot(dx, dy), Math.hypot(dx, dy + r.width * 0.077));
}

/* Where the finger is on the circle, and what that means for a light: { x, y, data }. */
function lpFinger(circ, mode, krange, count, e) {
  var r = circ.getBoundingClientRect(),
    R = r.width / 2,
    dx = e.clientX - r.left - R,
    dy = e.clientY - r.top - R;
  if (mode === "color") {
    var len = Math.hypot(dx, dy) || 1,
      d = Math.min(R, len),
      hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    return {
      x: R + (d * dx) / len,
      y: R + (d * dy) / len,
      data: { hs_color: [Math.round(hue) % 360, Math.round((d / R) * 100)] },
    };
  }
  var y = Math.max(0, Math.min(2 * R, dy + R));
  return {
    x: count > 1 ? Math.max(0, Math.min(2 * R, dx + R)) : R,
    y: y,
    data: { color_temp_kelvin: Math.round((krange[0] + (y / (2 * R)) * (krange[1] - krange[0])) / 10) * 10 },
  };
}

/* Whether the zones of a light made of zones are blended into a line (the Linear and Mirrored styles); in Scattered and Segmented every zone is a colour of its own. */
function lpSmooth(n) {
  var m = A(n.cmd[0]).gradient_mode;
  return !m || m === "interpolated_palette" || m === "interpolated_palette_mirrored";
}

/* The blend line through the zones of a light made of zones that is separated: one smooth path per such light. */
function lpBlendPath(S, marks, R) {
  var seen = {},
    d = "";
  marks.forEach(function (m) {
    var p = m.n.parent;
    if (!(p && p.zones && S.ex[p.key] && lpSmooth(p)) || seen[p.key]) return;
    seen[p.key] = 1;
    var mine = marks.filter(function (x) {
      return x.n.parent === p;
    });
    if (mine.length > 1)
      d += smoothPath(
        blendLine(
          R,
          mine.map(function (x) {
            return [x.x, x.y];
          })
        )
      );
  });
  return d;
}

/* The drop of a marker opening and closing, copied from the Hue app frame by frame. Opening: it starts small and pale on the dot, swells to about 1.2 times its size in 70 ms and settles. Closing: it fades into the dot within 3 frames, and the dot shrinks to under half its size and bounces back. Played once by the browser's animation engine, so nothing else that changes the marker restarts it. */
function lpPinAnim(m, opening, delay) {
  if (!m.pin.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches)) return;
  if (opening)
    m.pin.animate(
      [
        { scale: 0.5, opacity: 0.3, offset: 0 },
        { scale: 1.19, opacity: 0.8, offset: 0.35 },
        { scale: 1.04, opacity: 1, offset: 0.65 },
        { scale: 1, opacity: 1, offset: 1 },
      ],
      { duration: 200, delay: delay || 0, easing: "ease-out", fill: "backwards" }
    );
  else {
    m.pin.animate(
      [
        { scale: 1, opacity: 0.85 },
        { scale: 0.55, opacity: 0 },
      ],
      { duration: 60, easing: "ease-in" }
    );
    m.dot.animate(
      [
        { scale: 1.3, opacity: 1, offset: 0 },
        { scale: 0.9, opacity: 1, offset: 0.25 },
        { scale: 0.42, opacity: 1, offset: 0.5 },
        { scale: 0.4, opacity: 1, offset: 0.6 },
        { scale: 1.15, opacity: 1, offset: 0.85 },
        { scale: 1, opacity: 1, offset: 1 },
      ],
      { duration: 200, delay: 20, easing: "ease-out", fill: "backwards" }
    );
  }
}

/* A short pop on a marker (it appears bigger, then settles), and a ring that spreads from a point of the circle: shown when a group is separated, lights are joined, or a light that was off comes on. */
function lpPop(m) {
  [m.pin, m.dot].forEach(function (x) {
    x.classList.remove("pop");
    void x.offsetWidth;
    x.classList.add("pop");
    setTimeout(function () {
      x.classList.remove("pop");
    }, 480);
  });
}

function lpRing(circ, x, y) {
  var r = mk("div", "lw-ring");
  r.style.left = x + "px";
  r.style.top = y + "px";
  circ.appendChild(r);
  setTimeout(function () {
    r.remove();
  }, 600);
}

/* The circle for one kind: markers for the lights shown, the nearest one follows the finger. A tap away from every marker deselects. A tap on a group selects it (its drop shows the count), a second tap opens its lights in a circle of their own, a tap on a light selects it; dropping one on another joins them. A light that is off is a dot at its last colour or temperature; dragging it turns it on. While dragging a white temperature its value shows above the marker. */
function lpCircle(S, mode) {
  var circ = mk("div", "lw-c " + (mode === "color" ? "col" : "wht")),
    isColor = mode === "color",
    krange = lpKrange(S.root),
    marks = [],
    lineSvg = null,
    linePath = null,
    seenSplit = 0,
    // the circle of a group that was tapped: its lights sit on its edge
    bub = null,
    // the finger: down, whether it has moved, which marker it holds, where it began
    down = false,
    moved = false,
    cur = null,
    sx = 0,
    sy = 0,
    // whether the marker under the finger was already selected when it went down
    wasSel = false,
    // a press away from every marker: nothing happens until the finger drags, then the nearest marker follows
    far = false;
  if (!isColor)
    circ.style.background = "linear-gradient(180deg," + cssRgb(kelvinRgb(krange[0])) + ",#fff 70%,#d3f0ff)";

  function ref(n) {
    var c = lpCap(n, mode);
    return c.filter(isOn)[0] || c[0];
  }
  function drawLines() {
    if (!linePath) return;
    var R = circ.clientWidth / 2;
    lineSvg.setAttribute("viewBox", "0 0 " + 2 * R + " " + 2 * R);
    linePath.setAttribute("d", lpBlendPath(S, marks, R));
  }
  function paintSel() {
    marks.concat(bub ? bub.mem : []).forEach(function (m) {
      var on = S.sel === m.n.key || (!S.sel && marks.length === 1),
        lit = countOn(m.n.cmd) > 0 || (m.forced && Date.now() - m.forced < 3000);
      /* The drop opens when the marker becomes the selected one and closes when it stops being it. */
      if (m.on !== undefined && m.on !== on && !m.inBub && lit) lpPinAnim(m, on, 0);
      m.on = on;
      m.pin.classList.toggle("act", on);
      m.dot.classList.toggle("picked", on);
      m.pin.classList.toggle("off", !lit);
      m.dot.classList.toggle("off", !lit);
      /* A light that is off is a dot in the colour it was. */
      var r = ref(m.n),
        hs = isColor && r ? lpHs(r) : null,
        k = !isColor && r ? lpKelvin(r) : null;
      lpPaintMark(m, hs ? hsv2rgb(hs[0], hs[1]) : k ? kelvinRgb(k) : r && isOn(r) ? avgLight([r]) : null);
      if (m.lit === false && lit) lpPop(m);
      m.lit = lit;
    });
  }
  /* Each marker goes where its light's colour (or white temperature) is. */
  function start() {
    var R = circ.clientWidth / 2,
      pts = marks.map(function (m, i) {
        return lpSpot(mode, ref(m.n), R, krange, i, marks.length);
      });
    if (marks.length > 1) lpApart(pts, R);
    marks.forEach(function (m, i) {
      lpPlace(m, pts[i][0], pts[i][1]);
    });
    drawLines();
    paintSel();
  }
  /* The lights a group was separated into start where the group was and slide out; the markers that were there already stay where they are. */
  function slideOut(fresh, from) {
    var finals = fresh.map(function (m) {
      return [m.x, m.y];
    });
    fresh.forEach(function (m) {
      lpPlace(m, from[0], from[1]);
    });
    void circ.offsetWidth;
    circ.classList.add("lw-anim");
    fresh.forEach(function (m, i) {
      lpPlace(m, finals[i][0], finals[i][1]);
    });
    setTimeout(function () {
      circ.classList.remove("lw-anim");
    }, 340);
  }
  /* A tapped group opens as a circle in the middle of the wheel that grows from its marker, with its lights evenly on the edge, clockwise from 12 o'clock. Dragging a light out of the circle takes it out of the group. */
  function closeBubble(fast) {
    if (!bub) return;
    var b = bub;
    bub = null;
    b.mem.forEach(function (x) {
      x.pin.remove();
      x.dot.remove();
    });
    b.m.pin.style.visibility = b.m.dot.style.visibility = "";
    if (fast) b.el.remove();
    else {
      b.el.classList.add("closing");
      setTimeout(function () {
        b.el.remove();
      }, 180);
    }
  }
  function openBubble(m) {
    closeBubble(true);
    var R = circ.clientWidth / 2,
      kids0 = lpOpenKids(m.n).filter(function (k) {
        return lpCap(k, mode).length;
      }).length,
      rho = Math.min(R, Math.max(56, R * 0.5, (kids0 * 64) / (2 * Math.PI))),
      cx = R,
      cy = R,
      kids = lpOpenKids(m.n).filter(function (k) {
        return lpCap(k, mode).length;
      });
    var el = mk("div", "lw-bub");
    el.style.cssText =
      "left:" + (cx - rho) + "px;top:" + (cy - rho) + "px;width:" + 2 * rho + "px;height:" + 2 * rho + "px;";
    circ.appendChild(el);
    /* The first light sits at 12 o'clock and the others follow clockwise, a fixed step apart like in the Hue app (spread evenly round the whole circle only when there are more than eight). */
    var ang = kids.map(function (k, i) {
      return -Math.PI / 2 + i * Math.min((2 * Math.PI) / kids.length, Math.PI / 4);
    });
    /* The circle grows from the middle of the wheel, then the lights pop in one after the other at their places. */
    var mem = kids.map(function (k, i) {
      var x = lpMarker(k, true);
      x.inBub = true;
      x.pin.classList.add("bubm");
      x.dot.classList.add("bubm");
      x.pin.style.animationDelay = 105 + i * 17 + "ms";
      lpPlace(x, cx + rho * Math.cos(ang[i]), cy + rho * Math.sin(ang[i]));
      circ.appendChild(x.dot);
      circ.appendChild(x.pin);
      return x;
    });
    m.pin.style.visibility = m.dot.style.visibility = "hidden";
    bub = { m: m, n: m.n, el: el, cx: cx, cy: cy, rho: rho, mem: mem };
    S.select(m.n.key);
  }
  /* The markers are made again whenever a group is separated or joined. */
  function build() {
    closeBubble(true);
    var before = {},
      from = null;
    marks.forEach(function (m) {
      before[m.n.key] = 1;
    });
    if (S.from && S.from.id !== seenSplit) {
      seenSplit = S.from.id;
      var old = marks.filter(function (m) {
        return m.n.key === S.from.key;
      })[0];
      if (old) from = [old.x, old.y];
    }
    marks.forEach(function (m) {
      m.dot.remove();
      m.pin.remove();
      clearTimeout(m.timer);
    });
    if (lineSvg) lineSvg.remove();
    lineSvg = linePath = null;
    var list = lpVisible(S).filter(function (n) {
      return lpCap(n, mode).length;
    });
    marks = list.map(function (n) {
      var m = lpMarker(n, list.length > 1);
      circ.appendChild(m.dot);
      circ.appendChild(m.pin);
      return m;
    });
    if (
      isColor &&
      marks.some(function (m) {
        return m.n.parent && m.n.parent.zones && S.ex[m.n.parent.key] && lpSmooth(m.n.parent);
      })
    ) {
      lineSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      lineSvg.setAttribute("class", "lw-line");
      linePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      lineSvg.appendChild(linePath);
      circ.insertBefore(lineSvg, circ.firstChild);
    }
    start();
    var fresh = from
      ? marks.filter(function (m) {
          return !before[m.n.key];
        })
      : [];
    if (fresh.length) slideOut(fresh, from);
    paintSel();
    var fly = S.flyFrom;
    if (fly) {
      /* The light tapped in the circle flies from where it was in the circle to its place on the wheel, its drop opening on the way. */
      marks.forEach(function (m) {
        if (m.n.key !== fly.key) return;
        var to = [m.x, m.y];
        lpPlace(m, fly.x, fly.y);
        lpPinAnim(m, true, 50);
        void circ.offsetWidth;
        circ.classList.add("lw-fly");
        lpPlace(m, to[0], to[1]);
        setTimeout(function () {
          circ.classList.remove("lw-fly");
        }, 400);
      });
    }
    var popKeys = fly ? null : S.popNow;
    if (popKeys) {
      if (from) lpRing(circ, from[0], from[1]);
      marks.forEach(function (m) {
        if (popKeys.indexOf(m.n.key) < 0) return;
        lpPop(m);
        if (!from) lpRing(circ, m.x, m.y);
      });
    }
  }

  /* sending: at most one command every 150 ms for a marker, and the last position always arrives */
  function flush(m) {
    m.timer = 0;
    m.last = Date.now();
    if (m.pending) lpPush(m.n, mode, m.pending);
    m.pending = null;
  }
  function send(m, d) {
    m.pending = d;
    if (!m.timer) m.timer = setTimeout(flush.bind(null, m), Math.max(0, m.last + 150 - Date.now()));
  }
  function nearest(e) {
    var best = null,
      bd = 1e9;
    marks.forEach(function (m) {
      var d = lpReach(circ, e, m);
      if (d < bd) {
        bd = d;
        best = m;
      }
    });
    return best;
  }
  function finger(e) {
    return lpFinger(circ, mode, krange, marks.length, e);
  }
  function move(e) {
    var w = finger(e),
      d = Object.assign({}, w.data);
    cur.forced = Date.now();
    cur.pin.classList.remove("off");
    cur.dot.classList.remove("off");
    if (d.hs_color) lpPaintMark(cur, hsv2rgb(d.hs_color[0], d.hs_color[1]));
    if (d.color_temp_kelvin) {
      var kr = lpKrange(cur.n);
      d.color_temp_kelvin = Math.max(kr[0], Math.min(kr[1], d.color_temp_kelvin));
      cur.tag.textContent = d.color_temp_kelvin + " K";
      lpPaintMark(cur, kelvinRgb(d.color_temp_kelvin));
      cur.pin.classList.add("drag");
    }
    lpPlace(cur, w.x, w.y);
    drawLines();
    send(cur, d);
  }
  /* Dropped on top of another marker: its lights join that one and take its colour. */
  function mergeNear(m) {
    var t = marks.filter(function (x) {
      return x !== m && Math.hypot(x.x - m.x, x.y - m.y) <= 26;
    })[0];
    if (!t) return;
    var r = circ.getBoundingClientRect();
    lpPush(m.n, mode, finger({ clientX: r.left + t.x, clientY: r.top + t.y }).data);
    S.join(m.n, t.n);
  }

  circ.addEventListener("pointerdown", function (e) {
    down = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    if (bub) {
      var hit = null,
        rc = circ.getBoundingClientRect();
      bub.mem.forEach(function (x) {
        if (lpReach(circ, e, x) <= 34 && !hit) hit = x;
      });
      if (!hit) {
        if (Math.hypot(e.clientX - rc.left - bub.cx, e.clientY - rc.top - bub.cy) <= bub.rho) {
          down = false;
          cur = null;
          return;
        }
        closeBubble(false);
      }
      cur = hit;
    } else cur = nearest(e);
    if (!cur) return;
    capturePointer(circ, e);
    far = !cur.inBub && lpReach(circ, e, cur) > 34;
    if (far) {
      wasSel = false;
      return;
    }
    wasSel = S.sel === cur.n.key || (!S.sel && marks.length === 1 && !cur.inBub);
    S.select(cur.n.key);
    cur.pin.classList.add("press");
    cur.dot.classList.add("press");
  });
  circ.addEventListener("pointermove", function (e) {
    if (!down || !cur) return;
    if (!moved) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
      moved = true;
      if (far) {
        far = false;
        S.select(cur.n.key);
        cur.pin.classList.add("press");
        cur.dot.classList.add("press");
      }
    }
    if (cur.inBub) {
      /* Dragging a light at all takes it out of the group at once, the circle closes, and the light goes where the finger goes. */
      var key = cur.n.key,
        g = bub.n,
        kid = cur.n;
      closeBubble(true);
      S.detach(g, kid);
      cur = marks.filter(function (m) {
        return m.n.key === key;
      })[0];
      if (!cur) return;
      cur.pin.classList.add("press");
      cur.dot.classList.add("press");
    }
    move(e);
  });
  function up(e) {
    marks.concat(bub ? bub.mem : []).forEach(function (m) {
      m.pin.classList.remove("press");
      m.dot.classList.remove("press");
    });
    if (!down) return;
    down = false;
    marks.forEach(function (m) {
      if (m.pending) {
        clearTimeout(m.timer);
        flush(m);
      }
      var p = m.pin;
      setTimeout(function () {
        p.classList.remove("drag");
      }, 700);
    });
    if (far && !moved) {
      far = false;
      S.select(null);
      return;
    }
    if (cur && cur.inBub) {
      /* A tap on a light of the circle closes it: the lights are separate on the wheel and the one tapped is selected. */
      if (!moved && bub) {
        var g = bub.n,
          kid = cur.n;
        closeBubble(true);
        S.pop = [kid.key];
        S.flyFrom = { key: kid.key, x: cur.x, y: cur.y };
        S.detach(g, kid, true);
      }
      return;
    }
    if (moved && cur && marks.length > 1) mergeNear(cur);
    else if (!moved && cur && cur.n.kids && wasSel && e && e.type === "pointerup") openBubble(cur);
  }
  circ.addEventListener("pointerup", up);
  circ.addEventListener("pointercancel", up);

  S.subs.push({ build: build, sel: paintSel });
  /* The markers follow the lights: when something else changes them (a preset, a scene, the app) they move too, except while a finger is on the circle or a change of this circle is still on its way. */
  reg(function () {
    if (!circ.isConnected || down) return;
    var now = Date.now();
    if (
      marks.some(function (m) {
        return m.pending || now - m.last < 2500;
      })
    )
      return;
    start();
  });
  requestAnimationFrame(build);
  return circ;
}

/* ---- what the panel remembers ---- */

/* What a light looks like right now: off, or its colour (or white temperature) and brightness. */
function lpLook(e) {
  if (!isOn(e)) return { off: true };
  var a = A(e);
  return {
    b: a.brightness ? a.brightness / 2.55 : null,
    xy: a.xy_color || null,
    k: a.color_temp_kelvin || null,
    mode: a.color_mode,
  };
}

/* Whether two lights look the same: both off, or the same colour (or white temperature) at about the same brightness. */
function lpSameLook(x, y) {
  if (x.off || y.off) return !!x.off && !!y.off;
  if (x.b != null && y.b != null && Math.abs(x.b - y.b) >= 8) return false;
  if (x.mode === "color_temp" && y.mode === "color_temp" && x.k && y.k) return Math.abs(x.k - y.k) < 150;
  if (x.xy && y.xy) return Math.hypot(x.xy[0] - y.xy[0], x.xy[1] - y.xy[1]) < 0.012;
  return false;
}

/* The look of everything a node stands for, or null when its lights do not all look the same. */
function lpNodeLook(n) {
  if (!n.kids) return lpLook(n.cmd[0]);
  var first = null;
  for (var i = 0; i < n.kids.length; i++) {
    var l = lpNodeLook(n.kids[i]);
    if (!l || (first && !lpSameLook(first, l))) return null;
    first = first || l;
  }
  return first;
}

/* A panel opens showing what the lights really do: a group whose lights look the same stays one marker; when they differ it opens separated, and the lights that look the same stay together as one marker. */
function lpAutoSplit(S, n) {
  if (!n.kids || lpNodeLook(n)) return;
  S.ex[n.key] = true;
  var groups = [];
  n.kids.forEach(function (k) {
    var l = lpNodeLook(k),
      g = l
        ? groups.filter(function (x) {
            return x.look && lpSameLook(x.look, l);
          })[0]
        : null;
    if (g) g.kids.push(k);
    else groups.push({ look: l, kids: [k] });
  });
  groups.forEach(function (g) {
    if (g.kids.length > 1) S.joined.push(S.makeVirtual(g.kids, g.kids[0].icon));
  });
  n.kids.forEach(function (k) {
    lpAutoSplit(S, k);
  });
}

/* The state of one panel: what is separated (S.ex) or joined by hand (S.joined), what is selected, and the pieces that must follow (the circles in S.subs, the brightness row S.bsl). 'both' is true when there are Colour and White tabs. */
function lpState(root, both) {
  var S = {
    root: root,
    both: both,
    ex: {},
    sel: null,
    subs: [],
    joined: [],
    jn: 0,
    from: null,
    pop: null,
    popNow: null,
    mode: "white",
    modes: [],
    stage: null,
    bsl: null,
  };
  /* One lights joined by hand: a marker that stands for several, moving them together. */
  S.makeVirtual = function (kids, icon) {
    var cmd = [];
    kids.forEach(function (k) {
      k.cmd.forEach(function (e) {
        if (cmd.indexOf(e) < 0) cmd.push(e);
      });
    });
    return {
      key: "c" + ++S.jn,
      virtual: true,
      name: kids
        .map(function (k) {
          return k.name;
        })
        .join(", "),
      icon: icon,
      cmd: cmd,
      kids: kids,
      parent: null,
      zones: false,
    };
  };
  /* A light was dragged out of its group's circle: it is on its own, the rest of the group stays together. */
  S.detach = function (g, kid, apart) {
    var gone = lpLeaves(kid),
      rest = lpOpenKids(g).filter(function (k) {
        return gone.indexOf(k) < 0;
      });
    /* The circle showed every single light, so the groups inside are separated down to single lights. */
    function open(n) {
      if (n === kid || !n.kids || (n.zones && n !== g)) return;
      S.ex[n.key] = true;
      n.kids.forEach(open);
    }
    if (g.virtual) {
      S.joined = S.joined.filter(function (v) {
        return v !== g;
      });
      g.kids.forEach(open);
    } else open(g);
    if (!apart && rest.length > 1) S.joined.push(S.makeVirtual(rest, rest[0].icon));
    /* No slide and no pop: the light is under the finger already and follows it. */
    S.sel = kid.key;
    S.rebuild();
  };
  S.rebuild = function () {
    S.popNow = S.pop;
    S.pop = null;
    S.subs.forEach(function (s) {
      s.build();
    });
    S.popNow = null;
    S.flyFrom = null;
    if (S.bsl) S.bsl.refresh();
  };
  S.select = function (key) {
    S.sel = key;
    S.subs.forEach(function (s) {
      s.sel();
    });
    if (S.bsl) S.bsl.refresh();
  };
  /* What brightness, temperatures and the like act on: the selected marker, or the whole. */
  S.target = function () {
    return (S.sel && lpFindIn(S, S.sel)) || root;
  };
  /* A tile was tapped: the light is selected, and its marker is shown (the groups above it are separated where needed, and lights joined by hand are taken apart). */
  S.reveal = function (n) {
    /* A light that was joined to others by hand leaves them first. */
    for (var q = n; q; q = q.parent) {
      var v = S.joined.filter(function (x) {
        return x.kids.indexOf(q) >= 0;
      })[0];
      if (v) {
        S.pop = [q.key];
        S.detach(v, q);
        return q === n ? undefined : S.reveal(n);
      }
    }
    var open = [];
    for (var p = n.parent; p; p = p.parent) if (p.kids && !S.ex[p.key]) open.push(p);
    if (!open.length) return S.select(n.key);
    open.forEach(function (p) {
      S.ex[p.key] = true;
    });
    S.from = { key: open[open.length - 1].key, id: ++S.jn };
    S.pop = [n.key];
    S.sel = n.key;
    S.rebuild();
    S.select(n.key);
  };
  /* Dropping one marker on another: they become one marker that moves together. When that makes all the lights of a separated group, the group is whole again. */
  S.join = function (a, b) {
    var kids = [],
      gone = [];
    [a, b].forEach(function (n) {
      if (n.virtual) {
        kids = kids.concat(n.kids);
        gone.push(n);
      } else kids.push(n);
    });
    S.joined = S.joined.filter(function (v) {
      return gone.indexOf(v) < 0;
    });
    var p = kids[0].parent;
    if (
      p &&
      p.kids.length === kids.length &&
      kids.every(function (k) {
        return k.parent === p;
      })
    ) {
      delete S.ex[p.key];
      S.sel = p.key;
    } else {
      var v = S.makeVirtual(kids, b.icon);
      S.joined.push(v);
      S.sel = v.key;
    }
    S.pop = [S.sel];
    S.rebuild();
  };
  lpAutoSplit(S, root);
  return S;
}

/* ---- the pieces of the panel ---- */

var LP_COLOUR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

/* The tab that opens: White, unless a light that is on shows a colour. */
function lpFirstMode(root, colorOk, whiteOk) {
  if (!(colorOk && whiteOk)) return colorOk ? "color" : "white";
  var on = lpCap(root, "color")
    .concat(lpCap(root, "white"))
    .filter(isOn)[0];
  return on && LP_COLOUR_MODES.indexOf(A(on).color_mode) >= 0 ? "color" : "white";
}

/* The light that has the effects: the light itself (Philips Hue Plus gives a gradient light its effects as well as its zones). */
function lpFxLight(e) {
  return e;
}

/* The effects of a node's lights (what Home Assistant lists for them) and the Hue scenes of its room. */
function lpFxOf(root) {
  var h = H(),
    seen = {},
    effects = [],
    areas = {};
  root.cmd.forEach(function (e) {
    var l = A(lpFxLight(e)).effect_list;
    if (Array.isArray(l))
      l.forEach(function (x) {
        if (!seen[x]) {
          seen[x] = 1;
          effects.push(x);
        }
      });
    var a = areaIdOf(e);
    if (a) areas[a] = 1;
  });
  effects.sort(function (a, b) {
    return (a === "off" ? 0 : 1) - (b === "off" ? 0 : 1);
  });
  var scenes = Object.keys(h.states)
    .filter(function (id) {
      return Integrations.scenes.isHue(h, id) && areas[areaIdOf(id)];
    })
    .sort(function (x, y) {
      return (
        (A(y).is_dynamic !== false) - (A(x).is_dynamic !== false) ||
        String(A(x).name || x).localeCompare(String(A(y).name || y))
      );
    });
  return { effects: effects, scenes: scenes };
}

/* The pictures of the effects: small drawings in place of the photos the Hue app uses. */
var lpFxN = 0;

function lpFxArt(name) {
  var n = ++lpFxN,
    id = function (s) {
      return s + n;
    },
    star = function (cx, cy, r, fill) {
      return (
        "<path d='M" + cx + " " + (cy - r) + "Q" + cx + " " + cy + " " + (cx + r) + " " + cy + "Q" + cx + " " + cy + " " + cx + " " + (cy + r) +
        "Q" + cx + " " + cy + " " + (cx - r) + " " + cy + "Q" + cx + " " + cy + " " + cx + " " + (cy - r) + "Z' fill='" + fill + "'/>"
      );
    },
    rg = function (gid, stops) {
      return (
        "<radialGradient id='" + gid + "' cx='50%' cy='50%' r='50%'>" +
        stops.map(function (s) {
          return "<stop offset='" + s[0] + "' stop-color='" + s[1] + "' stop-opacity='" + (s[2] === undefined ? 1 : s[2]) + "'/>";
        }).join("") + "</radialGradient>"
      );
    },
    lg = function (gid, stops) {
      return (
        "<linearGradient id='" + gid + "' x1='0' y1='0' x2='0' y2='1'>" +
        stops.map(function (s) {
          return "<stop offset='" + s[0] + "' stop-color='" + s[1] + "'/>";
        }).join("") + "</linearGradient>"
      );
    },
    wrap = function (defs, body) {
      return "<svg viewBox='0 0 100 100' preserveAspectRatio='xMidYMid slice'><defs>" + defs + "</defs>" + body + "</svg>";
    },
    sky = function (stops, sun) {
      return wrap(
        lg(id("s"), stops),
        "<rect width='100' height='100' fill='url(#" + id("s") + ")'/>" + sun
      );
    },
    s = "";
  switch (name) {
    case "off":
      return "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='22' fill='none' stroke='currentColor' stroke-width='5' opacity='.6'/><path d='M34 66L66 34' stroke='currentColor' stroke-width='5' stroke-linecap='round' opacity='.6'/></svg>";
    case "candle":
      return wrap(
        rg(id("g"), [[0, "#ffb347", 0.8], [0.55, "#7a3a10", 0.4], [1, "#120802", 0]]) + lg(id("f"), [[0, "#fff6c8"], [0.45, "#ffd24a"], [1, "#ff8a1e"]]),
        "<rect width='100' height='100' fill='#150a04'/><rect width='100' height='100' fill='url(#" + id("g") + ")'/>" +
          "<rect x='40' y='60' width='20' height='36' rx='3' fill='#f1dcb6'/><rect x='40' y='60' width='20' height='6' rx='3' fill='#fff1d8'/>" +
          "<rect x='49' y='55' width='2' height='7' fill='#2f2012'/>" +
          "<path d='M50 22C60 34 62 45 57 54C55 58 45 58 43 54C38 45 42 34 50 22Z' fill='url(#" + id("f") + ")'/>"
      );
    case "fire":
      return wrap(
        rg(id("g"), [[0, "#ff7a1f", 0.7], [1, "#1a0603", 0]]),
        "<rect width='100' height='100' fill='#1a0603'/><circle cx='50' cy='84' r='58' fill='url(#" + id("g") + ")'/>" +
          "<path d='M50 12C64 32 80 46 72 70C67 86 33 86 28 70C20 48 38 40 50 12Z' fill='#ff4a12'/>" +
          "<path d='M50 36C60 50 68 58 63 73C60 82 40 82 37 73C32 60 42 52 50 36Z' fill='#ff9a1f'/>" +
          "<path d='M50 56C56 63 59 68 57 75C55 80 45 80 43 75C41 68 45 63 50 56Z' fill='#ffe27a'/>"
      );
    case "prism":
      s = "";
      ["#ff3b3b", "#ff9a2b", "#ffe234", "#3fe05a", "#2bb8ff", "#8a5cff"].forEach(function (c, i) {
        s += "<path d='M62 52L98 " + (28 + i * 9) + "' stroke='" + c + "' stroke-width='4' stroke-linecap='round' opacity='.92'/>";
      });
      return wrap(
        "",
        "<rect width='100' height='100' fill='#0e1022'/><path d='M4 50L40 50' stroke='#fff' stroke-width='4' stroke-linecap='round'/>" +
          "<path d='M50 24L74 68L26 68Z' fill='rgba(255,255,255,.14)' stroke='#fff' stroke-width='2' stroke-linejoin='round'/>" + s
      );
    case "sparkle":
      return wrap(
        lg(id("g"), [[0, "#2c3f9a"], [1, "#0a0f2e"]]),
        "<rect width='100' height='100' fill='url(#" + id("g") + ")'/>" +
          star(34, 32, 13, "#fff") + star(68, 26, 7, "#bfe4ff") + star(70, 62, 15, "#fff") + star(28, 72, 7, "#9fd0ff") + star(50, 50, 5, "#fff") + star(84, 84, 5, "#bfe4ff")
      );
    case "opal":
      return wrap(
        rg(id("a"), [[0, "#ffc2e6", 0.95], [1, "#ffc2e6", 0]]) + rg(id("b"), [[0, "#b4f0e0", 0.95], [1, "#b4f0e0", 0]]) + rg(id("c"), [[0, "#b9c4ff", 0.95], [1, "#b9c4ff", 0]]),
        "<rect width='100' height='100' fill='#efe8ff'/><circle cx='30' cy='34' r='46' fill='url(#" + id("a") + ")'/><circle cx='72' cy='40' r='44' fill='url(#" + id("b") + ")'/><circle cx='50' cy='76' r='46' fill='url(#" + id("c") + ")'/>"
      );
    case "glisten":
      return wrap(
        lg(id("g"), [[0, "#f6dca2"], [0.5, "#b87a32"], [1, "#2a1a0c"]]),
        "<rect width='100' height='100' fill='url(#" + id("g") + ")'/>" +
          "<path d='M6 38Q28 30 50 38T94 38' fill='none' stroke='#fff' stroke-opacity='.4' stroke-width='2'/><path d='M0 56Q25 46 50 56T100 56' fill='none' stroke='#fff' stroke-opacity='.3' stroke-width='2'/><path d='M0 74Q25 66 50 74T100 74' fill='none' stroke='#fff' stroke-opacity='.2' stroke-width='2'/>" +
          star(32, 30, 8, "#fff") + star(66, 46, 11, "#fff") + star(80, 66, 6, "#ffeec0") + star(40, 62, 5, "#ffeec0")
      );
    case "underwater":
      return wrap(
        lg(id("g"), [[0, "#86ecff"], [0.45, "#1f78bf"], [1, "#07203f"]]),
        "<rect width='100' height='100' fill='url(#" + id("g") + ")'/>" +
          "<path d='M20 0L40 100L10 100Z' fill='#fff' opacity='.1'/><path d='M60 0L90 100L52 100Z' fill='#fff' opacity='.1'/>" +
          "<path d='M0 40Q25 30 50 40T100 40' fill='none' stroke='#fff' stroke-opacity='.35' stroke-width='2'/><path d='M0 62Q25 52 50 62T100 62' fill='none' stroke='#fff' stroke-opacity='.25' stroke-width='2'/><path d='M0 82Q25 74 50 82T100 82' fill='none' stroke='#fff' stroke-opacity='.18' stroke-width='2'/>"
      );
    case "cosmos":
      return wrap(
        rg(id("a"), [[0, "#d46bff", 0.85], [1, "#d46bff", 0]]) + rg(id("b"), [[0, "#5b8cff", 0.8], [1, "#5b8cff", 0]]),
        "<rect width='100' height='100' fill='#0a0820'/><circle cx='36' cy='40' r='44' fill='url(#" + id("a") + ")'/><circle cx='68' cy='64' r='42' fill='url(#" + id("b") + ")'/>" +
          "<circle cx='20' cy='20' r='1.6' fill='#fff'/><circle cx='80' cy='24' r='1.2' fill='#fff'/><circle cx='56' cy='14' r='1' fill='#fff'/><circle cx='88' cy='54' r='1.6' fill='#fff'/><circle cx='14' cy='70' r='1.2' fill='#fff'/><circle cx='48' cy='88' r='1.4' fill='#fff'/><circle cx='64' cy='40' r='1' fill='#fff'/>"
      );
    case "sunbeam":
      s = "";
      for (var i = 0; i < 12; i++) {
        var a = (i * Math.PI) / 6;
        s += "<path d='M" + (50 + Math.cos(a) * 20).toFixed(1) + " " + (42 + Math.sin(a) * 20).toFixed(1) + "L" + (50 + Math.cos(a) * 60).toFixed(1) + " " + (42 + Math.sin(a) * 60).toFixed(1) + "' stroke='#fff' stroke-opacity='.4' stroke-width='3' stroke-linecap='round'/>";
      }
      return wrap(
        lg(id("g"), [[0, "#ffe08a"], [1, "#ff9a3d"]]) + rg(id("h"), [[0, "#fffbe0", 1], [1, "#fff1a8", 0]]),
        "<rect width='100' height='100' fill='url(#" + id("g") + ")'/>" + s + "<circle cx='50' cy='42' r='30' fill='url(#" + id("h") + ")'/><circle cx='50' cy='42' r='12' fill='#fffbe8'/>"
      );
    case "enchant":
      return wrap(
        lg(id("g"), [[0, "#8a6bff"], [1, "#24104f"]]) + rg(id("b"), [[0, "#ff9ad8", 0.8], [1, "#ff9ad8", 0]]),
        "<rect width='100' height='100' fill='url(#" + id("g") + ")'/><circle cx='64' cy='36' r='34' fill='url(#" + id("b") + ")'/>" +
          star(36, 62, 12, "#fff") + star(66, 30, 9, "#ffd6f3") + star(24, 28, 6, "#e3d6ff") + star(78, 70, 6, "#fff") + star(52, 82, 4, "#ffd6f3")
      );
    case "sunrise":
      return sky([[0, "#3b2a6b"], [0.55, "#ff7a5c"], [1, "#ffd38a"]], "<circle cx='50' cy='70' r='17' fill='#fff2b0'/><rect y='70' width='100' height='30' fill='#1a1230'/>");
    case "sunset":
      return sky([[0, "#2a1b4f"], [0.55, "#c2406b"], [1, "#ff9a4d"]], "<circle cx='50' cy='74' r='17' fill='#ffd08a'/><rect y='72' width='100' height='28' fill='#160f2a'/>");
  }
  return wrap(rg(id("g"), [[0, "#ffffff", 0.9], [0.5, "#8a8fff", 0.9], [1, "#1c1f4a"]]), "<rect width='100' height='100' fill='url(#" + id("g") + ")'/>");
}

function lpFxLabel(name) {
  if (name === "off") return _T("no_effect");
  if (name === "fire") return _T("fx_fireplace");
  var s = String(name).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* The colours of a Hue scene, read once from the bridge (needs the Scene engine). */
var LP_SCENEPAL = {};

function lpScenePalette(id, done) {
  if (LP_SCENEPAL[id]) return done(LP_SCENEPAL[id]);
  if (!engineSensor()) return;
  HA.serviceResponse("hue_plus", "import_hue_scene", { entity_id: id })
    .then(function (r) {
      if (!r || !r.palette || !r.palette.length) return;
      LP_SCENEPAL[id] = r.palette.map(function (c) {
        return cssRgb(c.k ? kelvinRgb(c.k) : liveXyRgb(c.xy[0], c.xy[1]));
      });
      done(LP_SCENEPAL[id]);
    })
    .catch(function () {});
}

/* What was chosen for each effect (kept in this browser): { effect: { hs: [hue, saturation] or k: kelvin, speed: 1 to 12 } }. An effect with nothing chosen runs as it is by default. */
var LPFXS = deviceGet("lp.fxs", {});

function lpFxSave() {
  deviceSet("lp.fxs", LPFXS);
}

/* The effect that the settings popups are for, and the state of the panel that opened them. */
var LPFXED = null;

/* Opening a popup from the panel (an effect's settings, the style, the presets) leaves the panel, and coming back builds it again. What it showed (its tab and the selected light) is kept here for that one return, and dropped when the popups are closed. */
var LPBACK = null;

function lpGo(S, key) {
  LPBACK = { root: S.root.key, mode: S.mode, sel: S.sel };
  showPopup(key, true);
}

/* The bridge ids of the Hue lights behind some light entities (a light group stands for its members). */
function lpHueIds(list) {
  var out = [];
  list.forEach(function (e) {
    var hid = A(e).hue_light_id,
      r = H().entities[e];
    if (hid) out.push(hid);
    else if (r && r.platform === "hue" && r.unique_id) out.push(r.unique_id);
    else lpHueIds(lightMembers(e)).forEach(function (x) {
      out.push(x);
    });
  });
  return out.filter(function (x, i, all) {
    return all.indexOf(x) === i;
  });
}

/* The effects as the Hue app groups them, with the colours each is offered in. A colour is a variant of the effect: the effect run with that colour (the bridge takes one for an effect). The first tile of an effect is the effect as it is by default; the Hue app's Bright and Pastel versions of Prism and Opal are different palettes the bridge does not take, so they are not offered. h is the hue of the effect's picture, pal the colours of its moving tile. What the Hue app starts an effect with: bri the brightness (Underwater's is read from the app's screen, not told), spd the speed step shown (1 to 12). The bridge's speed is 0 to 1, and the app's 12 steps are spread evenly over a range of it that is different for each effect: rng is the bridge speed of step 1 and of step 12, read from the bridge while the app moved the slider. Every effect starts at the bridge's 0.5, which is where its default step is. */
var LPFX_CATS = ["flames", "sparkly", "wavy", "drops", "loops", "daylight", "more"];
var LPFX = {
  candle: { cat: "flames", h: 35, pal: ["#ffd27a","#ff8a1e","#8a3d10"], bri: 26, spd: 6, rng: [0, 1], def: "", v: [["orange", "fxv_orange", { hs: [30, 100] }], ["warm", "fxv_warm", { k: 2200 }]] },
  fire: { cat: "flames", h: 25, pal: ["#ffb13a","#ff4a12","#5a1608"], bri: 84, spd: 6, rng: [0, 1], def: "", v: [["purple", "fxv_purple", { hs: [275, 85] }], ["green", "fxv_green", { hs: [150, 90] }]] },
  glisten: { cat: "sparkly", h: 40, pal: ["#f6dca2","#b87a32","#4a2d10"], bri: 100, spd: 6, rng: [0.3016, 0.6984], def: "fxv_gold", v: [["purple", "fxv_purple", { hs: [275, 70] }], ["pink", "fxv_pink", { hs: [330, 60] }]] },
  sparkle: { cat: "sparkly", h: 45, pal: ["#7a8cff","#2c3f9a","#0a0f2e"], bri: 100, spd: 6, rng: [0.3016, 0.6984], def: "fxv_yellow", v: [["orange", "fxv_orange", { hs: [25, 100] }], ["red", "fxv_red", { hs: [0, 100] }], ["white", "fxv_white", { k: 6500 }]] },
  underwater: { cat: "wavy", h: 205, pal: ["#86ecff","#1f78bf","#07203f"], bri: 100, spd: 12, rng: [0.1984, 0.5], def: "fxv_blue", v: [["green", "fxv_green", { hs: [150, 80] }], ["turquoise", "fxv_turquoise", { hs: [175, 90] }], ["lightblue", "fxv_lightblue", { hs: [195, 45] }]] },
  cosmos: { cat: "wavy", h: 285, pal: ["#d46bff","#5b8cff","#140c3a"], bri: 100, spd: 8, rng: [0.25, 0.6151], def: "fxv_purple", v: [["gold", "fxv_gold", { hs: [40, 90] }], ["blue", "fxv_blue", { hs: [235, 80] }], ["pink", "fxv_pink", { hs: [310, 85] }]] },
  sunbeam: { cat: "drops", h: 40, pal: ["#fffbe0","#ffd08a","#ff9a3d"], bri: 100, spd: 6, rng: [0.3889, 0.619], def: "", v: [["orange", "fxv_orange", { hs: [20, 80] }], ["purple", "fxv_purple", { hs: [265, 60] }]] },
  enchant: { cat: "drops", h: 320, pal: ["#ff9ad8","#8a6bff","#24104f"], bri: 50, spd: 6, rng: [0.3889, 0.619], def: "", v: [] },
  prism: { cat: "loops", h: 200, pal: ["#ff3b3b","#ffe234","#3fe05a","#2bb8ff","#8a5cff"], bri: 100, spd: 6, rng: [0.3889, 0.619], def: "fxv_bright", v: [] },
  opal: { cat: "loops", h: 200, pal: ["#ffc2e6","#b4f0e0","#b9c4ff"], bri: 100, spd: 7, rng: [0.3889, 0.5794], def: "fxv_pastel", v: [] },
  sunrise: { cat: "daylight", h: 25, pal: ["#3b2a6b","#ff7a5c","#ffd38a"], def: "", v: [] },
  sunset: { cat: "daylight", h: 15, pal: ["#2a1b4f","#c2406b","#ff9a4d"], def: "", v: [] },
};

/* Effects made with Create (kept in this browser): { effect: [{ n: id, label }] }. Their colour and speed are in LPFXS under the variant's id, "effect:n". */
var LPFXC = deviceGet("lp.fxc", {});

/* Which variant of each effect was started last, so the tile that is running can be told apart from its siblings: { effect: id }. */
var LPFXRUN = deviceGet("lp.fxr", {});

function lpFxSaveMore() {
  deviceSet("lp.fxc", LPFXC);
  deviceSet("lp.fxr", LPFXRUN);
}

/* Effects applied once: { effect: { after: the id of the tile it was made from, hs | k, speed, bri } }. Kept until another version of that effect is started. */
var LPFXTMP = {};

/* A variant is named "effect" (the default), "effect:slug", or "effect:~" (not saved). */
function lpFxEffectOf(id) {
  return String(id).split(":")[0];
}

function lpFxVars(effect) {
  var c = LPFX[effect] || { def: "", v: [] },
    out = [{ id: effect, label: c.def ? _T(c.def) : _T("default"), base: null }];
  c.v.forEach(function (v) {
    out.push({ id: effect + ":" + v[0], label: _T(v[1]), base: v[2] });
  });
  (LPFXC[effect] || []).forEach(function (x) {
    out.push({ id: effect + ":" + x.n, label: x.label, base: null, custom: true });
  });
  /* "Apply once" leaves a tile that is not saved, right after the one it was made from. */
  var tmp = LPFXTMP[effect];
  if (tmp) {
    var at = 0;
    out.forEach(function (v, i) {
      if (v.id === tmp.after) at = i;
    });
    out.splice(at + 1, 0, { id: effect + ":~", label: _T("fx_not_saved"), base: null, tmp: true });
  }
  return out;
}

function lpFxVar(id) {
  return (
    lpFxVars(lpFxEffectOf(id)).filter(function (v) {
      return v.id === id;
    })[0] || null
  );
}

/* What a variant runs with: the colour and speed chosen for it, otherwise its own colour. { hs, k, speed } */
function lpFxLook(id) {
  var v = lpFxVar(id),
    st = (v && v.tmp ? LPFXTMP[lpFxEffectOf(id)] : LPFXS[id]) || {},
    col = st.hs || st.k ? st : (v && v.base) || {};
  return { hs: col.hs, k: col.k, speed: st.speed, bri: st.bri };
}

/* The brightness a look runs at: the one chosen, otherwise the Hue app's own for the effect (undefined: left as it is). */
function lpFxBri(effect, look) {
  return look.bri || (LPFX[effect] || {}).bri;
}

/* The speed step a look shows: the one chosen, otherwise the Hue app's own for the effect. */
function lpFxSpeed(effect, look) {
  return look.speed || (LPFX[effect] || {}).spd;
}

/* The bridge's speed (0 to 1) of a step, as the Hue app maps it for that effect. */
function lpFxBridgeSpeed(effect, step) {
  var r = (LPFX[effect] || {}).rng || [0, 1];
  return Math.round((r[0] + ((step - 1) / 11) * (r[1] - r[0])) * 10000) / 10000;
}

/* The picture of a coloured variant: the effect's picture turned to its colour. */
function lpFxTint(effect, look) {
  var base = (LPFX[effect] || {}).h;
  if (look.hs && base !== undefined) return "hue-rotate(" + Math.round(look.hs[0] - base) + "deg)";
  if (look.k) return "saturate(.2) brightness(1.1)";
  return "";
}

function lpFxRunning(S, effect) {
  return S.target().cmd.some(function (e) {
    return A(lpFxLight(e)).effect === effect;
  });
}

/* Starts a variant (or "off") on what is selected, in its colour and speed when it has them (the bridge takes both for an effect, Home Assistant's light entity does not). `draft` is a look being edited, run in place of the saved one. */
function lpFxRun(S, id, draft) {
  var name = lpFxEffectOf(id),
    lights = S.target()
      .cmd.map(lpFxLight)
      .filter(function (e, i, all) {
        return all.indexOf(e) === i && Array.isArray(A(e).effect_list) && A(e).effect_list.indexOf(name) >= 0;
      });
  if (!lights.length) return toast(_T("nothing_selected_has_effects"));
  liveStopOn(lights);
  if (name !== "off") {
    LPFXRUN[name] = id;
    if (LPFXTMP[name] && id !== name + ":~") delete LPFXTMP[name];
    lpFxSaveMore();
  }
  var st = name === "off" ? {} : draft || lpFxLook(id),
    step = name === "off" ? 0 : st.speed,
    bri = name === "off" ? 0 : lpFxBri(name, st),
    ids = st.hs || st.k || step ? lpHueIds(lights) : [];
  if (ids.length && Integrations.hueplus.has(H(), "set_effect")) {
    var d = { lights: ids, effect: name };
    if (st.hs) d.hs_color = st.hs;
    else if (st.k) d.kelvin = st.k;
    if (step) d.speed = lpFxBridgeSpeed(name, step);
    call("hue_plus", "set_effect", d);
    if (bri) call("light", "turn_on", { entity_id: lights, brightness_pct: bri });
  } else {
    var t = { entity_id: lights, effect: name };
    if (bri) t.brightness_pct = bri;
    call("light", "turn_on", t);
  }
}

/* The Effects page, as in the Hue app: the effects of the lights in groups (Flames, Sparkly, ...), each effect a row that scrolls sideways with its colours and a Create tile at the end, then the Hue scenes of the room. Tapping a tile starts it on what is selected (the whole when nothing is); tapping the one that runs stops it. The tile that runs turns to its colour, and the pencil that opens its settings slides in on its right, pushing the tiles after it along. */
function lpFxPane(S, pane, fx) {
  var box = mk("div", "lp-fx"),
    tiles = [];
  pane.appendChild(box);
  /* The page is drawn again (a tile was added or removed in the settings above it) where it was scrolled to. */
  function rebuild() {
    var top = box.scrollTop;
    box.remove();
    lpFxPane(S, pane, fx);
    pane.querySelector(".lp-fx").scrollTop = top;
  }
  function tile(label, sub, art) {
    var el = mk("div", "lp-fxt"),
      sw = mk("div", "lp-fxs"),
      slot = mk("div", "lp-fxp"),
      pen = mk("div", "lp-fxe", svg("edit")),
      t = { el: el, sw: sw, slot: slot };
    if (art) sw.innerHTML = art;
    el.appendChild(sw);
    el.appendChild(mk("div", "lp-fxn")).textContent = label;
    el.appendChild(mk("div", "lp-fxv")).textContent = sub || "";
    pen.setAttribute("role", "button");
    pen.setAttribute("aria-label", _T("effect_settings"));
    slot.appendChild(pen);
    t.pen = pen;
    return t;
  }
  function put(row, t) {
    row.appendChild(t.el);
    row.appendChild(t.slot);
    tiles.push(t);
  }
  function effectRow(effect) {
    var row = mk("div", "lp-fxr");
    lpFxVars(effect).forEach(function (v) {
      var t = tile(lpFxLabel(effect), v.label, lpFxArt(effect));
      t.sw.appendChild(mk("div", "lp-fxstop", "<i></i>"));
      t.look = function () {
        return lpFxLook(v.id);
      };
      t.effect = effect;
      t.active = function () {
        var last = LPFXRUN[effect];
        if (!last || !lpFxVar(last)) last = effect;
        return lpFxRunning(S, effect) && last === v.id;
      };
      t.el.addEventListener("click", function () {
        lpFxRun(S, t.active() ? "off" : v.id);
      });
      t.pen.addEventListener("click", function () {
        LPFXED = { S: S, name: v.id };
        showPopup("lfxs:" + v.id, false, rebuild);
      });
      if (v.tmp) {
        /* The plus under the pencil keeps the effect as a new one of its own. */
        var keep = mk("div", "lp-fxe", svg("plus"));
        keep.setAttribute("role", "button");
        keep.setAttribute("aria-label", _T("fx_save_as_new"));
        keep.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var tmp = LPFXTMP[effect],
            list = (LPFXC[effect] = LPFXC[effect] || []),
            n = "c" + Date.now().toString(36),
            made = { hs: tmp.hs, k: tmp.k, speed: tmp.speed, bri: tmp.bri };
          list.push({ n: n, label: _T("fx_custom") + (list.length ? " " + (list.length + 1) : "") });
          LPFXS[effect + ":" + n] = made;
          LPFXRUN[effect] = effect + ":" + n;
          delete LPFXTMP[effect];
          lpFxSave();
          lpFxSaveMore();
          rebuild();
        });
        t.slot.appendChild(keep);
      }
      put(row, t);
    });
    var add = mk("div", "lp-fxt new"),
      plus = mk("div", "lp-fxs plus", svg("plus"));
    add.appendChild(plus);
    add.appendChild(mk("div", "lp-fxn")).textContent = _T("fx_create") + " " + lpFxLabel(effect);
    add.addEventListener("click", function () {
      var list = (LPFXC[effect] = LPFXC[effect] || []),
        n = "c" + Date.now().toString(36);
      list.push({ n: n, label: _T("fx_custom") + (list.length ? " " + (list.length + 1) : "") });
      lpFxSaveMore();
      LPFXED = { S: S, name: effect + ":" + n };
      lpFxRun(S, effect + ":" + n);
      showPopup("lfxs:" + effect + ":" + n, false, rebuild);
    });
    row.appendChild(add);
    return row;
  }
  var names = fx.effects.filter(function (x) {
      return x !== "off";
    }),
    byCat = {};
  Object.keys(LPFX)
    .concat(
      names.filter(function (x) {
        return !LPFX[x];
      })
    )
    .forEach(function (x) {
      if (names.indexOf(x) < 0) return;
      var c = (LPFX[x] || {}).cat || "more";
      (byCat[c] = byCat[c] || []).push(x);
    });
  LPFX_CATS.forEach(function (c) {
    if (!byCat[c]) return;
    box.appendChild(mk("div", "lp-fx-h")).textContent = _T("fx_" + c);
    byCat[c].forEach(function (x) {
      box.appendChild(effectRow(x));
    });
  });
  if (fx.scenes.length) {
    box.appendChild(mk("div", "lp-fx-h")).textContent = _T("scenes");
    var row = mk("div", "lp-fxr");
    fx.scenes.forEach(function (id) {
      var t = tile(A(id).name || id, "", "");
      t.sw.style.background = "var(--f-raise)";
      lpScenePalette(id, function (stops) {
        t.sw.style.background = "linear-gradient(135deg," + (stops.length > 1 ? stops : [stops[0], stops[0]]).join(",") + ")";
      });
      t.active = function () {
        return Integrations.scenes.active(H(), id);
      };
      t.el.addEventListener("click", function () {
        if (A(id).is_dynamic !== false) hueSceneStart(id);
        else {
          liveStopOn(S.root.cmd);
          call("scene", "turn_on", { entity_id: id });
        }
      });
      if (A(id).is_dynamic !== false)
        t.pen.addEventListener("click", function () {
          lpGo(S, "hscene:" + id);
        });
      else t.pen.style.display = "none";
      put(row, t);
    });
    box.appendChild(row);
  }
  function paint() {
    tiles.forEach(function (t) {
      var on = !!t.active();
      t.el.classList.toggle("picked", on);
      t.slot.classList.toggle("open", on && t.pen.style.display !== "none");
      if (t.look) {
        var l = t.look();
        t.sw.firstChild.style.filter = lpFxTint(t.effect, l);
        t.el.style.setProperty("--fh", l.hs ? l.hs[0] : l.k ? 40 : (LPFX[t.effect] || {}).h || 210);
        t.el.style.setProperty("--fs", l.k && !l.hs ? "12%" : "80%");
      }
    });
  }
  paint();
  reg(function () {
    if (box.isConnected) paint();
  });
}

/* The words for a speed step. */
function lpSpeedWord(v) {
  return v === 1 ? _T("slowest") : v <= 4 ? _T("slow") : v <= 8 ? _T("medium") : v <= 11 ? _T("fast") : _T("fastest");
}

/* The look being edited in the settings of a variant. A preset is edited as a draft that is kept or dropped when leaving (see lpFxLeave); what is made with Create and what was applied once are changed as they are. */
function lpFxObj(ed) {
  var v = lpFxVar(ed.name);
  if (v.tmp) return LPFXTMP[lpFxEffectOf(ed.name)];
  if (v.custom) return LPFXS[ed.name] || (LPFXS[ed.name] = {});
  if (!ed.draft) {
    var l = lpFxLook(ed.name);
    ed.draft = { hs: l.hs && l.hs.slice(), k: l.k, speed: l.speed };
    ed.orig = JSON.stringify(ed.draft);
  }
  return ed.draft;
}

/* Leaving the settings of a preset that was changed asks, as the Hue app does: Save keeps the change for that preset, Apply once leaves it running as a tile that is not saved next to it, Cancel stays. `leave` goes on to wherever the person was going. */
function lpFxLeave(ed, leave) {
  var d = ed.draft;
  if (!d || JSON.stringify(d) === ed.orig) return false;
  var id = ed.name,
    effect = lpFxEffectOf(id);
  askSheet(_T("fx_what_to_do"), [
    {
      label: _T("fx_save"),
      fn: function () {
        LPFXS[id] = { hs: d.hs, k: d.k, speed: d.speed };
        lpFxSave();
        POPGUARD = null;
        leave();
      },
    },
    {
      label: _T("fx_apply_once"),
      fn: function () {
        LPFXTMP[effect] = { after: id, hs: d.hs, k: d.k, speed: d.speed };
        LPFXRUN[effect] = effect + ":~";
        lpFxSaveMore();
        lpFxRun(ed.S, effect + ":~");
        POPGUARD = null;
        leave();
      },
    },
  ]);
  return true;
}

/* The settings of one variant, as in the Hue app: its colour (a wheel with white), its speed, and for one made with Create its brightness and name too, and a way back (a preset returns to how it was by default, one made with Create is deleted). Every change runs the effect again at once. */
function lpFxSettingsPopup(b, name) {
  var ed = LPFXED,
    box = mk("div");
  if (!ed || ed.name !== name || !lpFxVar(name)) {
    b.appendChild(pill("info", _T("nothing_found"), {}));
    return;
  }
  var S = ed.S,
    effect = lpFxEffectOf(name),
    variant = lpFxVar(name),
    obj = lpFxObj(ed);
  POPGUARD =
    variant.custom || variant.tmp
      ? null
      : function (leave) {
          return lpFxLeave(ed, leave);
        };
  b.appendChild(box);
  function run() {
    lpFxSave();
    lpFxRun(S, name, obj);
  }
  function draw() {
    var head = mk("div", "lp-fxh"),
      sw = mk("div", "lp-fxs"),
      shown = obj.hs || obj.k ? obj : lpFxLook(name);
    sw.innerHTML = lpFxArt(effect);
    sw.firstChild.style.filter = lpFxTint(effect, shown);
    head.appendChild(sw);
    head.appendChild(mk("div", "lp-fxh-n")).textContent = lpFxLabel(effect) + " · " + variant.label;
    box.appendChild(head);
    if (variant.custom)
      box.appendChild(
        textRow(
          "edit",
          _T("fx_name"),
          variant.label,
          function (v) {
            (LPFXC[effect] || []).forEach(function (x) {
              if (effect + ":" + x.n === name && v) x.label = v;
            });
            lpFxSaveMore();
            variant = lpFxVar(name);
            redrawBox(box, draw);
          },
          24
        )
      );
    var colour = pill("palette", _T("colour_lights"), {
      sub: function () {
        return shown.hs ? _T("custom_colour") : shown.k ? shown.k + " K" : _T("default");
      },
      tap: function () {
        showPopup("lfxc:" + name, true);
      },
    });
    if (shown.hs || shown.k) {
      var dot = mk("span", "lp-fxdot");
      dot.style.background = shown.hs ? cssRgb(hsv2rgb(shown.hs[0], shown.hs[1])) : cssRgb(kelvinRgb(shown.k));
      colour.appendChild(dot);
    }
    box.appendChild(colour);
    if (variant.custom)
      box.appendChild(
        sliderRow({
          icon: "bright",
          name: _T("brightness"),
          min: 1,
          max: 100,
          step: 1,
          get: function () {
            return lpFxBri(effect, obj) || 100;
          },
          fmt: function (v) {
            return v + "%";
          },
          on: function () {
            return true;
          },
          commit: function (v) {
            obj.bri = v;
            run();
          },
        })
      );
    box.appendChild(
      sliderRow({
        icon: "tune",
        name: _T("speed"),
        min: 1,
        max: 12,
        step: 1,
        get: function () {
          return lpFxSpeed(effect, obj) || 6;
        },
        fmt: function (v) {
          return v + " - " + lpSpeedWord(v);
        },
        on: function () {
          return true;
        },
        commit: function (v) {
          obj.speed = v;
          run();
        },
      })
    );
    if (variant.custom)
      box.appendChild(
        pill("trash", _T("fx_delete"), {
          tap: function () {
            LPFXC[effect] = (LPFXC[effect] || []).filter(function (x) {
              return effect + ":" + x.n !== name;
            });
            delete LPFXS[name];
            if (LPFXRUN[effect] === name) delete LPFXRUN[effect];
            lpFxSave();
            lpFxSaveMore();
            if (lpFxRunning(S, effect)) lpFxRun(S, "off");
            popBack();
          },
        })
      );
    else if (!variant.tmp)
      box.appendChild(
        pill("trash", _T("reset_effect"), {
          tap: function () {
            delete LPFXS[name];
            ed.draft = null;
            obj = lpFxObj(ed);
            lpFxSave();
            lpFxRun(S, name);
            redrawBox(box, draw);
          },
        })
      );
  }
  redrawBox(box, draw);
}

/* The colour of an effect: the colour wheel and the white wheel, one marker. Dragging changes the effect at once. */
function lpFxColourPopup(b, name) {
  var ed = LPFXED;
  if (!ed || ed.name !== name || !lpFxVar(name)) {
    b.appendChild(pill("info", _T("nothing_found"), {}));
    return;
  }
  var S = ed.S,
    st = lpFxObj(ed),
    mode = st.k && !st.hs ? "white" : "color",
    krange = [2000, 6500],
    circ = mk("div", "lw-c"),
    m = lpMarker({ icon: "sparkle", name: "" }, false),
    tabs = mk("div", "lp-itabs lp-fxtabs"),
    timer = 0,
    down = false;
  m.pin.classList.add("act");
  function shape() {
    circ.className = "lw-c " + (mode === "color" ? "col" : "wht");
    circ.style.background =
      mode === "color" ? "" : "linear-gradient(180deg," + cssRgb(kelvinRgb(krange[0])) + ",#fff 70%,#d3f0ff)";
    [].forEach.call(tabs.children, function (x) {
      x.classList.toggle("on", x.dataset.m === mode);
    });
    var R = circ.clientWidth / 2;
    if (mode === "color" && st.hs) {
      var a = (st.hs[0] * Math.PI) / 180,
        d = (st.hs[1] / 100) * R;
      lpPlace(m, R + d * Math.sin(a), R - d * Math.cos(a));
    } else if (mode === "white" && st.k)
      lpPlace(m, R, Math.max(0, Math.min(2 * R, ((st.k - krange[0]) / (krange[1] - krange[0])) * 2 * R)));
    m.pin.style.visibility = m.dot.style.visibility = (mode === "color" ? st.hs : st.k) ? "" : "hidden";
  }
  function run() {
    clearTimeout(timer);
    timer = 0;
    lpFxSave();
    lpFxRun(S, name, st);
  }
  function at(e) {
    var w = lpFinger(circ, mode, krange, 1, e);
    lpPlace(m, w.x, w.y);
    m.pin.style.visibility = m.dot.style.visibility = "";
    if (w.data.hs_color) {
      st.hs = w.data.hs_color;
      delete st.k;
    } else {
      st.k = Math.max(krange[0], Math.min(krange[1], w.data.color_temp_kelvin));
      delete st.hs;
    }
    if (!timer) timer = setTimeout(run, 300);
  }
  [["color", "<i></i>"], ["white", "<i></i>"]].forEach(function (x) {
    var el = mk("div", "lp-it " + x[0], x[1]);
    el.dataset.m = x[0];
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", x[0] === "color" ? _T("colour") : _T("white"));
    el.addEventListener("click", function () {
      mode = x[0];
      shape();
    });
    tabs.appendChild(el);
  });
  circ.appendChild(m.dot);
  circ.appendChild(m.pin);
  circ.addEventListener("pointerdown", function (e) {
    down = true;
    capturePointer(circ, e);
    m.pin.classList.add("press");
    at(e);
  });
  circ.addEventListener("pointermove", function (e) {
    if (down) at(e);
  });
  function up() {
    m.pin.classList.remove("press");
    if (down) run();
    down = false;
  }
  circ.addEventListener("pointerup", up);
  circ.addEventListener("pointercancel", up);
  var view = mk("div", "lp-view");
  view.appendChild(circ);
  b.appendChild(view);
  b.appendChild(tabs);
  b.appendChild(mk("div", "hint")).textContent = _T("effects_own_colours");
  requestAnimationFrame(shape);
}

/* The lights under the circle, like in the Hue app: a tile for each light (a group of a master popup is one tile, a light made of zones is one tile), with its icon, its name and a switch, in a row that scrolls sideways. A tile is the colour the light shows, or its zone colours. Tapping a tile selects it, and shows its marker on the circle; its switch turns it on or off. */
function lpTrayNodes(S) {
  var list = [];
  /* Lights joined by hand keep their own tiles; a light made of zones is one tile. */
  lpVisible(S).forEach(function (v) {
    (v.virtual ? v.kids : [v]).forEach(function (n) {
      var t = n.parent && n.parent.zones ? n.parent : n;
      if (list.indexOf(t) < 0) list.push(t);
    });
  });
  return list;
}

/* The effect that a tile's lights play, if any (a light made of zones plays it on the Hue light behind it). */
function lpTileEffect(n) {
  var e = n.cmd.map(lpFxLight).filter(function (x) {
    var f = A(x).effect;
    return f && f !== "off";
  })[0];
  return e ? A(e).effect : "";
}

/* The colours an effect moves through, from the corner at the top left to the one at the bottom right and back, in the colour it was started in. */
function lpFxGradient(effect) {
  var pal = (LPFX[effect] || {}).pal || ["#8a8fff", "#ffffff", "#1c1f4a"];
  return "linear-gradient(135deg," + pal.concat(pal[0]).join(",") + ")";
}

function lpTileColours(n) {
  var one = n.cmd.length === 1 ? lightStops(n.cmd[0]) : null;
  if (one && one.length > 1) return one;
  var c = avgLight(n.cmd.filter(isOn));
  return c ? [c] : null;
}

/* Whether a tile is part of what is selected: the tile itself, the group it belongs to, or one of its zones. */
function lpTileSel(S, n) {
  var sel = S.sel ? lpFindIn(S, S.sel) : S.root;
  if (!sel) return false;
  for (var p = sel; p; p = p.parent) if (p === n) return true;
  return sel.cmd.some(function (e) {
    return n.cmd.indexOf(e) >= 0;
  });
}

function lpTray(S) {
  var tray = mk("div", "lp-tray"),
    tiles = [];
  function paint() {
    tiles.forEach(function (t) {
      var on = countOn(t.n.cmd) > 0,
        cs = on ? lpTileColours(t.n) : null,
        lum = 0;
      var fxn = on ? lpTileEffect(t.n) : "";
      t.el.classList.toggle("on", on);
      t.el.classList.toggle("picked", lpTileSel(S, t.n));
      t.el.classList.toggle("fx", !!fxn);
      if (fxn) {
        t.fxl.style.background = lpFxGradient(fxn);
        t.fxl.style.filter = lpFxTint(fxn, lpFxLook(LPFXRUN[fxn] || fxn));
        t.el.style.background = "";
        t.el.classList.remove("lt");
        return;
      }
      if (cs) {
        lum = cs.reduce(function (s, c) {
          return s + (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
        }, 0) / cs.length;
        t.el.style.background =
          cs.length > 1
            ? "linear-gradient(180deg," + cs.map(cssRgb).join(",") + ")"
            : "linear-gradient(180deg," + cssRgb(cs[0]) + "," + cssRgb(cs[0].map(function (v) {
                return v * 0.86;
              })) + ")";
      } else t.el.style.background = "";
      t.el.classList.toggle("lt", !!cs && lum > 0.62);
    });
  }
  /* The tiles follow what is shown on the circles: a group that was separated is its lights. */
  function fill() {
    var nodes = lpTrayNodes(S);
    if (
      tiles.length === nodes.length &&
      tiles.every(function (t, i) {
        return t.n === nodes[i];
      })
    )
      return;
    var left = tray.scrollLeft;
    tray.textContent = "";
    tiles = [];
    nodes.forEach(addTile);
    tray.scrollLeft = left;
  }
  function addTile(n) {
    var el = mk("div", "lp-tile", "<div class='lp-tfx'></div>" + svg(n.icon || "light")),
      nm = mk("div", "lp-tn"),
      sw = mk("div", "lp-sw", "<i></i>");
    nm.textContent = n.name;
    el.appendChild(nm);
    el.appendChild(sw);
    el.addEventListener("click", function () {
      S.reveal(n);
    });
    sw.addEventListener("click", function (e) {
      e.stopPropagation();
      lightsMasterToggle(n.cmd);
    });
    tray.appendChild(el);
    tiles.push({ n: n, el: el, fxl: el.firstChild });
  }
  S.subs.push({
    build: function () {
      fill();
      paint();
    },
    sel: function () {
      paint();
      var t = tiles.filter(function (x) {
        return lpTileSel(S, x.n);
      })[0];
      if (t) tray.scrollTo({ left: t.el.offsetLeft - (tray.clientWidth - t.el.offsetWidth) / 2, behavior: "smooth" });
    },
  });
  reg(function () {
    if (tray.isConnected) paint();
  });
  fill();
  paint();
  return tray;
}

/* The styles of a light made of zones, as in the Hue app: pins with a smooth blend (Linear, Mirrored) or colours of their own (Scattered, Segmented). */
var LP_STYLES = [
  ["interpolated_palette", "linear", "<circle cx='5' cy='8' r='2.4'/><circle cx='12' cy='8' r='2.4'/><circle cx='19' cy='8' r='2.4'/><path d='M3 16h18'/>"],
  ["interpolated_palette_mirrored", "mirrored", "<circle cx='6' cy='8' r='2.4'/><circle cx='18' cy='8' r='2.4'/><path d='M12 3v16M3 16h18'/>"],
  ["random_pixelated", "scattered", "<circle cx='5' cy='11' r='2.4'/><circle cx='12' cy='6' r='2.4'/><circle cx='19' cy='12' r='2.4'/>"],
  ["segmented_palette", "segmented", "<circle cx='5' cy='8' r='2.4'/><circle cx='12' cy='8' r='2.4'/><circle cx='19' cy='8' r='2.4'/><path d='M3 16h4M10 16h4M17 16h4'/>"],
];

function lpStyleIcon(mode) {
  var s = LP_STYLES.filter(function (x) {
    return x[0] === mode;
  })[0];
  return "<svg viewBox='0 0 24 24'>" + (s ? s[2] : LP_STYLES[0][2]) + "</svg>";
}

/* The light made of zones that the style button is for: the selected one, or the one whose zone is selected. */
function lpStyleNode(S) {
  var n = S.target(),
    z = n.zones ? n : n.parent && n.parent.zones ? n.parent : null;
  return z && A(z.cmd[0]).gradient_modes ? z : null;
}

/* The popup of the style button. Tapping a style changes the light at once; the orientation turns the zones around (Linear and Mirrored). */
function lpStylePopup(b, id) {
  var box = mk("div"),
    tiles = {};
  b.appendChild(sep(_T("mode"), "palette"));
  var g = mk("div", "gridl g2 lp-modes");
  LP_STYLES.forEach(function (s) {
    var el = mk("div", "lp-mode", "<svg viewBox='0 0 24 24'>" + s[2] + "</svg>");
    el.appendChild(mk("div", "lp-mode-n")).textContent = _T(s[1]);
    el.setAttribute("role", "button");
    el.addEventListener("click", function () {
      call("hue_plus", "set_style", { light: A(id).hue_light_id, style: s[1] });
    });
    tiles[s[0]] = el;
    g.appendChild(el);
  });
  b.appendChild(g);
  b.appendChild(box);
  function paint() {
    var mode = A(id).gradient_mode,
      offered = A(id).gradient_modes || [];
    Object.keys(tiles).forEach(function (k) {
      tiles[k].classList.toggle("picked", k === mode);
      tiles[k].style.display = offered.indexOf(k) < 0 ? "none" : "";
    });
    box.innerHTML = "";
    if (mode === "interpolated_palette" || mode === "interpolated_palette_mirrored") {
      box.appendChild(sep(_T("orientation"), "swap"));
      box.appendChild(
        pill("swap", _T("turn_the_colours_around"), {
          tap: function () {
            call("hue_plus", "set_style", { light: A(id).hue_light_id, flip: true });
          },
        })
      );
    }
  }
  paint();
  reg(function () {
    if (b.isConnected) paint();
  });
}

/* The brightness button with the slider that rises from it. Pressing it opens the slider smoothly: held, the slider follows the finger and closes when it is let go; tapped, it stays open until something else is tapped. The light popup and the Spotify sync popup both use it. `o` says what it controls: pct() the brightness now, lit() whether it is on (the button is bright), live(v) while the finger moves, commit(v) when it is let go, and stage() the element that gets the class bri-open while the slider is open, so the rest of that popup can be dimmed. */
function briControl(o) {
  var wrap = mk("div", "lp-bri"),
    btn = mk("div", "lp-bri-btn", svg("bright")),
    sl = mk("div", "lp-bri-sl"),
    fill = mk("div", "lp-bri-fill"),
    ico = mk("div", "lp-bri-ico", svg("bright")),
    val = mk("div", "lp-bri-val"),
    open = false,
    drag = null;
  sl.appendChild(fill);
  sl.appendChild(ico);
  wrap.appendChild(val);
  wrap.appendChild(sl);
  wrap.appendChild(btn);
  function paint(v) {
    fill.style.height = v + "%";
    val.textContent = v + "%";
    btn.classList.toggle("on", !!o.lit());
  }
  function outside(e) {
    if (wrap.contains(e.target)) return;
    e.stopPropagation();
    document.addEventListener("click", swallow, true);
    setTimeout(function () {
      document.removeEventListener("click", swallow, true);
    }, 600);
    setOpen(false);
  }
  function swallow(e) {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener("click", swallow, true);
  }
  function setOpen(on) {
    if (open === on) return;
    open = on;
    wrap.classList.toggle("open", on);
    var stage = o.stage && o.stage();
    if (stage) stage.classList.toggle("bri-open", on);
    if (on) {
      paint(o.pct());
      document.addEventListener("pointerdown", outside, true);
    } else document.removeEventListener("pointerdown", outside, true);
  }
  wrap.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    e.preventDefault();
    capturePointer(wrap, e);
    var onBtn = btn.contains(e.target) || ico.contains(e.target);
    drag = { y0: e.clientY, v0: o.pct(), v: o.pct(), t0: Date.now(), moved: false, onBtn: onBtn, hold: onBtn && !open };
    if (!open) setOpen(true);
    sl.classList.add("drag");
  });
  wrap.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dy = drag.y0 - e.clientY;
    if (!drag.moved && Math.abs(dy) < 5) return;
    drag.moved = true;
    var v = Math.max(0, Math.min(100, Math.round(drag.v0 + (dy / (sl.clientHeight || 240)) * 100)));
    drag.v = v;
    paint(v);
    o.live(v);
  });
  function up() {
    var d = drag;
    drag = null;
    sl.classList.remove("drag");
    if (!d) return;
    if (d.moved) o.commit(d.v);
    if (d.hold) {
      if (d.moved || Date.now() - d.t0 >= 350) setOpen(false);
    } else if (d.onBtn && !d.moved) setOpen(false);
  }
  wrap.addEventListener("pointerup", up);
  wrap.addEventListener("pointercancel", up);
  wrap.refresh = function () {
    if (open && !drag) paint(o.pct());
    else btn.classList.toggle("on", !!o.lit());
  };
  reg(function () {
    if (wrap.isConnected) wrap.refresh();
  });
  return wrap;
}

/* The brightness button at the bottom right of the light popup: it sets the brightness of what is selected (the whole when nothing is). */
function lpBrightness(S) {
  var ids = function () {
    return S.target().cmd;
  };
  return briControl({
    pct: function () {
      return lightsMasterPct(ids());
    },
    lit: function () {
      return countOn(ids()) > 0;
    },
    live: function (v) {
      if (v > 0) callLive("lpb:" + S.root.key, "light", "turn_on", { entity_id: lightTargets(ids()), brightness_pct: v });
    },
    commit: function (v) {
      if (v <= 0) call("light", "turn_off", { entity_id: lightTargets(ids()) });
      else call("light", "turn_on", { entity_id: lightTargets(ids()), brightness_pct: v });
    },
    stage: function () {
      return S.stage;
    },
  });
}

/* Everything under the title of a light popup that is about the lights themselves: the circles (Colour and White) and the Effects page that slide under the icon tabs at the bottom left, the brightness button at the bottom right, and the tiles. 'S' is the state of what it shows. */
function lpStage(S, host) {
  var root = S.root,
    colorOk = lpCap(root, "color").length > 0,
    whiteOk = lpCap(root, "white").length > 0,
    fx = lpFxOf(root),
    st = mk("div", "lp-stage"),
    view = mk("div", "lp-view"),
    track = mk("div", "lp-track"),
    bar = mk("div", "lp-bar"),
    panes = {},
    tabs = null,
    modes = [];
  if (colorOk) modes.push("color");
  if (whiteOk) modes.push("white");
  if (fx.effects.length || fx.scenes.length) modes.push("fx");
  S.modes = modes;
  if (S.restore && modes.indexOf(S.restore.mode) >= 0) S.mode = S.restore.mode;
  if (S.restore && S.restore.sel) S.sel = S.restore.sel;
  if (modes.indexOf(S.mode) < 0) S.mode = modes[0];
  S.stage = st;
  track.style.setProperty("--n", modes.length);
  modes.forEach(function (m) {
    panes[m] = mk("div", "lp-pane" + (m === "fx" ? " fx" : ""));
    if (m !== "fx") panes[m].appendChild(lpCircle(S, m));
    track.appendChild(panes[m]);
  });
  view.appendChild(track);
  function paint(anim) {
    track.style.transform = "translateX(" + (-modes.indexOf(S.mode) * 100) / modes.length + "%)";
    modes.forEach(function (m) {
      panes[m].classList.toggle("off", m !== S.mode);
    });
    if (tabs)
      [].forEach.call(tabs.querySelectorAll(".lp-it"), function (x) {
        x.classList.toggle("on", x.dataset.m === S.mode);
      });
    if (S.mode === "fx" && !panes.fx._built) {
      panes.fx._built = true;
      lpFxPane(S, panes.fx, fx);
    }
  }
  if (modes.length > 1) {
    tabs = mk("div", "lp-itabs");
    modes.forEach(function (m, i) {
      if (m === "fx") tabs.appendChild(mk("div", "lp-sep"));
      var x = mk("div", "lp-it " + m, m === "fx" ? svg("sparkle") : "<i></i>");
      x.setAttribute("role", "button");
      x.setAttribute("aria-label", m === "color" ? _T("colour") : m === "white" ? _T("white") : _T("effects"));
      x.dataset.m = m;
      x.addEventListener("click", function () {
        S.mode = m;
        paint(true);
      });
      tabs.appendChild(x);
    });
    bar.appendChild(tabs);
  }
  S.bsl = lpBrightness(S);
  var right = mk("div", "lp-bar-r"),
    style = mk("div", "lp-style");
  style.setAttribute("role", "button");
  style.setAttribute("aria-label", _T("style"));
  style.addEventListener("click", function () {
    var z = lpStyleNode(S);
    if (z) lpGo(S, "lstyle:" + z.key);
  });
  function paintStyle() {
    var z = lpStyleNode(S);
    style.style.display = z ? "" : "none";
    if (z) style.innerHTML = lpStyleIcon(A(z.cmd[0]).gradient_mode);
  }
  S.subs.push({ build: paintStyle, sel: paintStyle });
  reg(function () {
    if (style.isConnected) paintStyle();
  });
  paintStyle();
  right.appendChild(style);
  right.appendChild(S.bsl);
  bar.appendChild(right);
  st.appendChild(view);
  st.appendChild(bar);
  st.appendChild(lpTray(S));
  host.appendChild(st);
  paint(false);
  return st;
}

/* Brightness of what is selected (the whole when nothing is) as a slider row, for lights that have no colour or white circle. Tapping it switches that on or off. */
function lpBrightnessRow(S) {
  var root = S.root,
    ids = function () {
      return S.target().cmd;
    };
  return sliderRow({
    icon: "bright",
    name: _T("brightness"),
    sub: function () {
      return S.sel && S.sel !== root.key ? S.target().name : "";
    },
    min: 0,
    max: 100,
    step: 1,
    fillColor: popFillOf(root.cmd, function () {
      return avgLight(ids().filter(isOn));
    }),
    get: function () {
      return lightsMasterPct(ids());
    },
    fmt: function (v) {
      return v + "%";
    },
    on: function () {
      return countOn(ids()) > 0;
    },
    live: function (v) {
      if (v > 0)
        callLive("lpb:" + root.key, "light", "turn_on", {
          entity_id: lightTargets(ids()),
          brightness_pct: v,
        });
    },
    commit: function (v) {
      if (v <= 0) call("light", "turn_off", { entity_id: lightTargets(ids()) });
      else call("light", "turn_on", { entity_id: lightTargets(ids()), brightness_pct: v });
    },
    onTap: function () {
      lightsMasterToggle(ids());
    },
  });
}

/* The old colour / white slider, for a Lights section that has the colour wheel turned off. */
function lpSliders(b, root, colorOk, whiteOk) {
  var box = mk("div"),
    ref = function (mode) {
      var c = lpCap(root, mode);
      return c.filter(isOn)[0] || c[0];
    };
  b.appendChild(box);
  lightColourRow(box, {
    color: colorOk,
    white: whiteOk,
    icon: root.icon,
    wheel: false,
    colorNow: function () {
      var r = lpCap(root, "color").filter(isOn)[0];
      return !!r && LP_COLOUR_MODES.indexOf(A(r).color_mode) >= 0;
    },
    hs: function () {
      var r = ref("color");
      return (r && lpHs(r)) || null;
    },
    kelvin: function () {
      var r = ref("white");
      return r ? lpKelvin(r) : null;
    },
    krange: function () {
      return lpKrange(root);
    },
    kgrad: whiteOk ? kelGrad(lpCap(root, "white")[0]) : "",
    push: function (d) {
      lpPush(root, "hs_color" in d ? "color" : "white", d);
    },
  });
}

/* The white temperatures saved for every light. Until one is added or removed here, they are the whites already saved as presets of lights. */
/* ---- the panel ---- */

/* 'root' is the node tree of what the popup controls. 'o': room (the room whose saved colours are shown, or null for none), and sliders (the colour wheel is turned off for this light or section: the old colour slider is shown instead). */
function lightPanel(b, root, o) {
  var colorOk = lpCap(root, "color").length > 0,
    whiteOk = lpCap(root, "white").length > 0,
    any = colorOk || whiteOk,
    S = lpState(root, colorOk && whiteOk);
  S.mode = lpFirstMode(root, colorOk, whiteOk);
  S.restore = LPBACK && LPBACK.root === root.key ? LPBACK : null;
  LPBACK = null;
  if (o.ready) o.ready(S);
  if (any && !o.sliders) lpStage(S, b);
  else {
    S.bsl = lpBrightnessRow(S);
    b.appendChild(S.bsl);
  }
  if (any && o.sliders) lpSliders(b, root, colorOk, whiteOk);
  if (any && o.room) {
    var pbox = mk("div");
    b.appendChild(pbox);
    lpSaved(pbox, S, o.room);
  }
}

/* A colour or white temperature on a node: the lights of it that can show it take it. */
function lpApplyPreset(n, p) {
  if (p.k) {
    if (!lpCap(n, "white").length) {
      toast(_T("this_light_has_no_white_temperature"));
      return;
    }
    var kr = lpKrange(n);
    lpPush(n, "white", { color_temp_kelvin: Math.max(kr[0], Math.min(kr[1], p.k)) });
    return;
  }
  if (!lpCap(n, "color").length) {
    toast(_T("this_light_has_no_colour"));
    return;
  }
  lpPush(n, "color", { hs_color: [p.h, p.s] });
}

/* ---- saved ---- */

/* The Saved section: the colours and white temperatures saved for the room, one tap each, set on what is selected (the whole when nothing is). Administrators get a + that saves the colour or temperature the selected light (or group) shows now, and a pencil that turns on removing; while removing, All saved opens the colours of the other rooms to copy one here. */
function lpSaved(pbox, S, room) {
  var edit = false;
  function round(icon, label, fn, on) {
    var b = mk("div", "rnd pane sm secact" + (on ? " act" : ""), svg(icon));
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", label);
    b.title = label;
    b.addEventListener("click", fn);
    return b;
  }
  function draw() {
    pbox.innerHTML = "";
    var hd = sep(_T("saved"), "palette"),
      items = savedOf(room);
    if (ISADMIN) {
      hd.appendChild(
        round("plus", _T("save"), function () {
          var c = savedCapture(S.target());
          if (c && savedAdd(room, c)) draw();
        })
      );
      if (items.length)
        hd.appendChild(
          round(
            "edit",
            _T("edit_saved"),
            function () {
              edit = !edit;
              draw();
            },
            edit
          )
        );
    }
    pbox.appendChild(hd);
    var g = mk("div", "gridl g2 lp-pg");
    items.forEach(function (p) {
      var r = pill("palette", p.k ? p.k + " K" : _T("colour") + " " + p.h + "°", {
        tap: function () {
          if (edit) {
            savedRemove(room, p);
            draw();
          } else lpApplyPreset(S.target(), p);
        },
      });
      r.classList.add("pal");
      r.style.setProperty("background", "linear-gradient(90deg," + presetCss(p) + "," + presetCss(p) + ")", "important");
      if (edit) r.appendChild(mk("span", "lw-x", svg("close")));
      g.appendChild(r);
    });
    if (edit)
      g.appendChild(
        pill("palette", _T("all_saved"), {
          tap: function () {
            lpGo(S, "presets-all:" + room);
          },
        })
      );
    pbox.appendChild(g);
    if (!items.length && !ISADMIN) {
      var hn = mk("div", "hint");
      hn.textContent = _T("nothing_saved_yet");
      pbox.appendChild(hn);
    }
  }
  draw();
}
