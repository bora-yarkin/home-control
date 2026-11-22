/* The light panel: the one control of every light popup (a light, a light group, the lights master of a section), laid out like the Hue app. A colour circle and a white circle (and an Effects page) that slide under small icon tabs at the bottom left, a brightness button at the bottom right that opens a slider, and a row of tiles with the lights. One marker for each light or group sits on the circles; a light that is off is a dot where it was. Tap a group's marker to open its lights in a circle of their own, drop one marker on another to join them. Every marker is a dot; the selected one also has a drop above it in the colour of its light, with the number of lights it stands for (the icon when it is one light). */

/* Whether a light has an icon of its own: one the owner chose for it on the dashboard, not the plain bulb every light starts with. A light without one takes the icon of the group it is in. */
function lpOwnIcon(id) {
  var nm = LNAME[id];
  return !!(nm && nm[1] && nm[1] !== "light");
}

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
      var k = lpNodeOf(m, n.zones || !lpOwnIcon(m) ? n.icon : null);
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
    n = { key: "m:" + sid, name: LMASTER_NAME[sid] || _T("all_lights"), icon: "lights", cmd: units, kids: null, parent: null, zones: false, order: LMASTER_ORDER[sid] || null };
  n.kids = units.map(function (u) {
    var k = lpNodeOf(u, null),
      meta = (LMASTER_META[sid] || {})[u];
    /* A manual master can show a light under a name and icon of its own. */
    if (meta) {
      if (meta.n) k.name = meta.n;
      if (meta.i) k.icon = meta.i;
    }
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

/* The marker that shows a light now: the light's own, or the group (or lights joined by hand) it is in. */
function lpShownOf(S, n) {
  return (
    lpVisible(S).filter(function (m) {
      return m === n || lpLeaves(m).indexOf(n) >= 0 || (m.virtual && m.kids.some(function (k) { return lpLeaves(k).indexOf(n) >= 0; })) || (S.hier && lpHolds(m, n));
    })[0] || null
  );
}

/* Whether a node stands for another: the node itself, or one of the lights or groups under it (a group counts as one light, so it is found as a node and not only as the lights it is made of). */
function lpHolds(m, n) {
  if (m === n) return true;
  if (m.zones || !m.kids) return false;
  return m.kids.some(function (k) {
    return lpHolds(k, n);
  });
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

/* The colours of every white wheel: warm at the top, white, cool at the bottom, the same for all lights. A light's own range only decides where on the wheel it sits, so the wheels do not change colour with the lights in a popup (a master with a deep orange bulb used to be red). */
function lpWhiteWheel() {
  return "linear-gradient(180deg," + cssRgb(kelvinRgb(2200)) + ",#fff 70%,#d3f0ff)";
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
  return [R, y];
}

/* Markers that would sit on top of each other (lights with the same colour) are moved a little apart, so each can be seen and picked; on the white wheel, where a light's place across means nothing, they are moved sideways. */
function lpApart(pts, R, sideways) {
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
          dx = sideways ? 1 : Math.sin(an);
          dy = sideways ? 0 : -Math.cos(an);
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
/* A group of lights that is one light (in a panel whose groups are single lights): its marker shows its icon, not the number of its lights. */
function lpIsGroup(n) {
  return !!n.kids && !n.virtual && !n.zones;
}

function lpMarker(n, showName, asIcon) {
  var m = {
    n: n,
    x: 0,
    y: 0,
    dot: mk("div", "lw-dot"),
    pin: mk("div", "lw-pin", lpCount(n) > 1 && !asIcon ? "<span class='lw-num'>" + lpCount(n) + "</span>" : svg(n.icon || "light")),
    tag: mk("div", "lw-tag"),
    pending: null,
    timer: 0,
    last: 0,
  };
  if (showName) m.pin.appendChild(mk("div", "lw-lbl")).textContent = n.name;
  m.pin.appendChild(m.tag);
  return m;
}

/* The drop of a marker shows the number of lights it stands for, or, while one of them is picked, that light's icon. */
function lpPinPick(m, n) {
  var num = m.pin.querySelector(".lw-num"),
    ico = m.pin.querySelector(".lw-pick");
  if (!num) return;
  if (n && (!ico || ico.dataset.key !== n.key)) {
    if (ico) ico.remove();
    ico = mk("span", "lw-pick", svg(n.icon || "light"));
    ico.dataset.key = n.key;
    m.pin.insertBefore(ico, num);
    num.style.display = "none";
  } else if (!n && ico) {
    ico.remove();
    num.style.display = "";
  }
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
  if (!m.pin.classList.contains("act")) return Math.hypot(dx, dy);
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

/* Whether the zones of a light made of zones are blended into a line: a light with no style of its own is; one a plugin gives styles to says (Hue's Scattered and Segmented give every zone a colour of its own). */
function lpSmooth(n) {
  if (vlightIs(n.cmd[0])) return !LMK || LMK.live.mode !== "segmented"; /* the colours of a live scene blend unless it is segmented */
  var style = pluginStyle(n.cmd[0]);
  return !style || !style.blends || !!style.blends(n.cmd[0]);
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

/* The drop of a marker opening and closing, copied from the Hue app frame by frame (a 60 frames a second recording of the app, 2026-11-20). Opening: the drop is there at once as a small circle on the dot, is almost full size one frame later, swells to about 1.2 times its size over the next five frames and settles in four more, a bit over 160 ms in all, growing from its tip. The same drop is what appears when a circle of separated lights is closed. Closing: it fades into the dot within 3 frames, and the dot shrinks to under half its size and bounces back. Played once by the browser's animation engine, so nothing else that changes the marker restarts it. */
function lpPinAnim(m, opening, delay) {
  if (!m.pin.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches)) return;
  if (opening)
    m.pin.animate(
      [
        { scale: 0.26, opacity: 0.6, offset: 0 },
        { scale: 0.85, opacity: 1, offset: 0.1 },
        { scale: 0.88, offset: 0.2 },
        { scale: 1.15, offset: 0.3 },
        { scale: 1.2, offset: 0.4 },
        { scale: 1.17, offset: 0.5 },
        { scale: 1.07, offset: 0.6 },
        { scale: 1, offset: 0.7 },
        { scale: 0.99, offset: 0.8 },
        { scale: 1.02, offset: 0.9 },
        { scale: 1, opacity: 1, offset: 1 },
      ],
      { duration: 167, delay: delay || 0, easing: "linear", fill: "backwards" }
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
    // where lights that were just joined stay until Home Assistant reports them there: { x, y, rgb, key, until }
    hold = null,
    // whether the marker under the finger was already selected when it went down
    wasSel = false,
    // a press away from every marker: nothing happens until the finger drags, then the nearest marker follows
    far = false;
  if (!isColor)
    circ.style.background = lpWhiteWheel();

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
      if (m.on !== undefined && m.on !== on) lpPinAnim(m, on, 0);
      m.on = on;
      m.pin.classList.toggle("act", on);
      m.dot.classList.toggle("picked", on);
      lpPinPick(m, on && S.focus && S.focus.v === m.n ? S.focus.n : null);
      m.pin.classList.toggle("off", !lit);
      m.dot.classList.toggle("off", !lit);
      /* A light that is off has a black dot and, when selected, a black drop; dragging it turns it on. */
      var r = ref(m.n),
        hs = isColor && r ? lpHs(r) : null,
        k = !isColor && r ? lpKelvin(r) : null,
        held = hold && hold.key === m.n.key ? hold.rgb : null;
      lpPaintMark(m, !lit ? null : held || (hs ? hsv2rgb(hs[0], hs[1]) : k ? kelvinRgb(k) : r && isOn(r) ? avgLight([r]) : null));
      m.lit = lit;
    });
  }
  /* Each marker goes where its light's colour (or white temperature) is. */
  function start() {
    var R = circ.clientWidth / 2,
      pts = marks.map(function (m, i) {
        return lpSpot(mode, ref(m.n), R, krange, i, marks.length);
      });
    if (marks.length > 1) lpApart(pts, R, !isColor);
    if (hold && Date.now() > hold.until) hold = null;
    if (hold && !hold.key) hold.key = S.sel;
    marks.forEach(function (m, i) {
      if (hold && hold.key === m.n.key) lpPlace(m, hold.x, hold.y);
      else lpPlace(m, pts[i][0], pts[i][1]);
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
    /* The circle and its lights are gone in a single frame, as in the Hue app; the group's drop grows back where it was. */
    b.el.remove();
    b.chips.remove();
    if (!fast) lpPinAnim(b.m, true, 0);
  }
  /* What a circle lists: the lights a marker stands for (one level at a time in a panel whose groups are single lights: a group is one entry, and tapping it lists its lights). */
  function bubbleKids(n) {
    return (S.hier ? n.kids || [] : lpOpenKids(n)).filter(function (k) {
      return lpCap(k, mode).length;
    });
  }
  function openBubble(m, node, stack) {
    closeBubble(true);
    node = node || m.n;
    stack = stack || [];
    var R = circ.clientWidth / 2,
      kids0 = bubbleKids(node).length,
      rho = Math.min(R, Math.max(56, R * 0.5, (kids0 * 64) / (2 * Math.PI))),
      cx = R,
      cy = R,
      kids = bubbleKids(node);
    var el = mk("div", "lw-bub"),
      chips = mk("div", "lw-chips");
    el.style.cssText =
      "left:" + (cx - rho) + "px;top:" + (cy - rho) + "px;width:" + 2 * rho + "px;height:" + 2 * rho + "px;";
    circ.appendChild(el);
    /* The first light sits at 12 o'clock and the others follow clockwise, spread evenly round the whole circle however many there are. */
    var ang = kids.map(function (k, i) {
      return -Math.PI / 2 + (i * 2 * Math.PI) / kids.length;
    });
    /* The circle grows from the middle of the wheel, then the lights pop in one after the other at their places. */
    var mem = kids.map(function (k, i) {
      var x = lpMarker(k, true, S.hier && lpIsGroup(k));
      x.inBub = true;
      x.pin.classList.add("bubm");
      x.dot.classList.add("bubm");
      lpPlace(x, cx + rho * Math.cos(ang[i]), cy + rho * Math.sin(ang[i]));
      chips.appendChild(x.dot);
      chips.appendChild(x.pin);
      return x;
    });
    circ.appendChild(chips);
    /* Inside a group that was opened from the list, the middle of the circle goes back to that list. */
    if (stack.length) {
      var back = mk("div", "lw-bubback", svg("back"));
      back.style.left = cx + "px";
      back.style.top = cy + "px";
      back.setAttribute("role", "button");
      back.setAttribute("aria-label", _T("back"));
      back.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openBubble(m, stack[stack.length - 1], stack.slice(0, -1));
      });
      chips.appendChild(back);
    }
    m.pin.style.visibility = m.dot.style.visibility = "hidden";
    bub = { m: m, n: node, stack: stack, el: el, chips: chips, cx: cx, cy: cy, rho: rho, mem: mem };
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
      return lpCap(n, mode).length && (!S.maker || n.cmd.every(vlightIs));
    });
    marks = list.map(function (n) {
      var m = lpMarker(n, list.length > 1, S.hier && lpIsGroup(n));
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
    /* Markers that were just joined, separated or revealed: their drop grows where it is, as in the Hue app. */
    if (S.popNow)
      marks.forEach(function (m) {
        if (S.popNow.indexOf(m.n.key) >= 0) lpPinAnim(m, true, 0);
      });
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
    var r = circ.getBoundingClientRect(),
      /* The lights take what the marker they are dropped on really has, not what its place on the wheel reads as: markers are moved apart where they would overlap, and a place read back differs a little from the temperature it came from. */
      own = ref(t.n),
      exact = own && isOn(own) ? (isColor ? { hs_color: lpHs(own) } : { color_temp_kelvin: lpKelvin(own) }) : null,
      data = exact && (exact.hs_color || exact.color_temp_kelvin) ? exact : finger({ clientX: r.left + t.x, clientY: r.top + t.y }).data;
    lpPush(m.n, mode, data);
    /* The joined lights stay where they were dropped, in the colour of the spot, until the lights report it themselves (a few seconds at most); they used to start in the middle and move. */
    hold = {
      x: t.x,
      y: t.y,
      key: null,
      until: Date.now() + 3000,
      rgb: data.hs_color ? hsv2rgb(data.hs_color[0], data.hs_color[1]) : data.color_temp_kelvin ? kelvinRgb(data.color_temp_kelvin) : null,
    };
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
    if (S.focus && cur.n === S.focus.v) S.focus.keep = true;
    S.select(cur.n.key);
    cur.pin.classList.add("press");
    cur.dot.classList.add("press");
  });
  circ.addEventListener("pointermove", function (e) {
    if (!down || !cur) return;
    if (!moved) {
      /* a light of a circle needs a longer drag than a marker to be taken out: a tap that slips does not separate it */
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < (cur.inBub ? 12 : 6)) return;
      moved = true;
      if (far) {
        far = false;
        S.select(cur.n.key);
        cur.pin.classList.add("press");
        cur.dot.classList.add("press");
      }
    }
    if (!cur.inBub && S.focus && cur.n === S.focus.v) {
      /* The group's marker was picked for one of its lights (its tile was tapped): dragging it takes that light out, and the others stay together. */
      var pk = S.focus.n.key,
        pg = S.focus.v,
        pn = S.focus.n;
      S.focus = null;
      S.detach(pg, pn);
      cur = marks.filter(function (m) {
        return m.n.key === pk;
      })[0];
      if (!cur) return;
      cur.pin.classList.add("press");
      cur.dot.classList.add("press");
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
      /* A tap on a light of the circle only picks it: its drop opens above it and bounces, and the circle stays as it is. Lights are separated by dragging them out. */
      if (!moved && bub && S.hier && cur.n.kids) {
        /* A group (or a light made of zones) of the list: the circle lists its lights (its zones) instead; the lights of the old list go, the new ones come. Tapping separates nothing. */
        openBubble(bub.m, cur.n, bub.stack.concat([bub.n]));
        return;
      }
      if (!moved && bub) lpPinAnim(cur, true, 0);
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
    if (!bub && S.resplit()) return S.rebuild();
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
    /* what the light is doing beyond its colour: an effect, or a live scene's moving palette */
    fx: a.effect && a.effect !== "off" ? a.effect : "",
    dyn: !!a.dynamics && a.dynamics !== "none",
  };
}

/* Whether two lights look the same: both off, or the same colour (or white temperature) at about the same brightness, doing the same (a still colour, the same effect, or a moving palette): a light on an effect or in a live scene is not one with a light that only shows a colour, however close the colours are at the moment. */
function lpSameLook(x, y) {
  if (x.off || y.off) return !!x.off && !!y.off;
  if ((x.fx || "") !== (y.fx || "") || !!x.dyn !== !!y.dyn) return false;
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

/* A panel whose groups are single lights (S.hier) opens with its lights apart, the ones that look the same sharing a marker; a group is never opened by itself, however its lights look. */
function lpHierInit(S, root) {
  if (!root.kids) return;
  if (lpNodeLook(root)) return S.auto.push(root);
  S.ex[root.key] = true;
  var groups = [];
  root.kids.forEach(function (k) {
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
    if (g.kids.length > 1) {
      var v = S.makeVirtual(g.kids, g.kids[0].icon);
      v.auto = true;
      S.joined.push(v);
    }
  });
}

/* The lights row of a panel whose groups are single lights: the lights of the whole, a group as one tile. What is separated on the wheel does not change it: a light taken out of a group on the wheel is still in its group here. */
function lpTrayUnits(S) {
  return (S.root.kids || [S.root]).slice();
}

/* A panel opens showing what the lights really do: a group whose lights look the same stays one marker; when they differ it opens separated, and the lights that look the same stay together as one marker. */
function lpAutoSplit(S, n) {
  if (!n.kids) return;
  if (lpNodeLook(n)) return S.auto.push(n);
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
    if (g.kids.length > 1) {
      var v = S.makeVirtual(g.kids, g.kids[0].icon);
      v.auto = true;
      S.joined.push(v);
    }
  });
  n.kids.forEach(function (k) {
    lpAutoSplit(S, k);
  });
}

/* The state of one panel: what is separated (S.ex) or joined by hand (S.joined), what is selected, and the pieces that must follow (the circles in S.subs, the brightness row S.bsl). 'both' is true when there are Colour and White tabs. */
function lpState(root, both, groups) {
  var S = {
    root: root,
    both: both,
    ex: {},
    /* The groups of the lights row that are opened beside their tile (not separated on the wheel). */
    trayEx: {},
    sel: null,
    subs: [],
    joined: [],
    /* what was left whole at the opening because its lights looked the same (looked at again by resplit) */
    auto: [],
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
  S.detach = function (g, kid) {
    if (S.hier) return S.pullOut(kid);
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
    if (rest.length > 1) S.joined.push(S.makeVirtual(rest, rest[0].icon));
    /* No slide and no pop: the light is under the finger already and follows it. */
    S.sel = kid.key;
    S.rebuild();
  };
  /* A panel whose groups are single lights: one light (or group) is taken out of the marker it is in and has a marker of its own. A group that holds it is opened where it stands (the others of it stay together, with whatever they were together with). */
  S.pullOut = function (kid) {
    var chain = [];
    for (var p = kid.parent; p; p = p.parent) chain.unshift(p);
    chain.forEach(function (a) {
      if (a === S.root || S.ex[a.key]) return;
      S.ex[a.key] = true;
      S.joined = S.joined.map(function (v) {
        if (v.kids.indexOf(a) < 0) return v;
        var kids = [];
        v.kids.forEach(function (k) {
          if (k === a) kids = kids.concat(a.kids);
          else kids.push(k);
        });
        return S.makeVirtual(kids, v.icon);
      });
    });
    var holder = S.joined.filter(function (v) {
      return v.kids.indexOf(kid) >= 0;
    })[0];
    if (holder) {
      var rest = holder.kids.filter(function (k) {
        return k !== kid;
      });
      S.joined = S.joined.filter(function (v) {
        return v !== holder;
      });
      if (rest.length > 1) S.joined.push(S.makeVirtual(rest, rest[0].icon));
    }
    S.sel = kid.key;
    S.pop = [kid.key];
    S.rebuild();
  };
  /* Dropping one marker on another, in a panel whose groups are single lights: they share one marker; a group that has all its lights in it is whole again, and so on up to the whole. */
  S.joinHier = function (a, b) {
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
    var again = true;
    while (again) {
      again = false;
      for (var i = 0; i < kids.length && !again; i++) {
        var par = kids[i].parent;
        if (
          par &&
          par.kids.every(function (k) {
            return kids.indexOf(k) >= 0;
          })
        ) {
          /* the group takes the place of the first of its lights */
          var at = kids.length;
          kids.forEach(function (k, j) {
            if (par.kids.indexOf(k) >= 0) at = Math.min(at, j);
          });
          kids = kids.filter(function (k) {
            return par.kids.indexOf(k) < 0;
          });
          kids.splice(Math.min(at, kids.length), 0, par);
          delete S.ex[par.key];
          again = true;
        }
      }
    }
    if (kids.length === 1) S.sel = kids[0].key;
    else {
      var v = S.makeVirtual(kids, b.icon);
      S.joined.push(v);
      S.sel = v.key;
    }
    S.pop = [S.sel];
    S.rebuild();
  };
  /* The lights that were left in one marker, or put in one, because they looked the same when the panel opened are taken apart when they no longer do (a scene was run, a light was changed somewhere else). A marker the person made by dropping one on another, or a group they joined again, stays as it is. Returns whether anything was taken apart. */
  S.resplit = function () {
    var changed = false;
    S.auto = S.auto.filter(function (n) {
      if (S.ex[n.key]) return false;
      if (lpNodeLook(n)) return true;
      if (S.hier) lpHierInit(S, n);
      else lpAutoSplit(S, n);
      changed = true;
      return false;
    });
    var keep = S.joined.filter(function (v) {
      if (!v.auto) return true;
      var first = null;
      return v.kids.every(function (k) {
        var l = lpNodeLook(k);
        if (!l) return false;
        first = first || l;
        return lpSameLook(first, l);
      });
    });
    if (keep.length !== S.joined.length) {
      S.joined = keep;
      changed = true;
    }
    if (changed && S.sel && !lpFindIn(S, S.sel)) S.sel = null;
    return changed;
  };
  S.rebuild = function () {
    S.popNow = S.pop;
    S.pop = null;
    S.subs.forEach(function (s) {
      s.build();
    });
    S.popNow = null;
    if (S.bsl) S.bsl.refresh();
  };
  /* A light picked inside a marker that stands for several (S.focus = {v: the marker's node, n: the light}): the marker stays whole, shows the light's icon, and what is set acts on
     the light alone, as the Hue app does it. Any other choice ends it. */
  S.focus = null;
  S.select = function (key) {
    if (S.focus && !(S.focus.keep && key === S.focus.v.key)) S.focus = null;
    if (S.focus) S.focus.keep = false;
    S.sel = key;
    S.subs.forEach(function (s) {
      s.sel();
    });
    if (S.bsl) S.bsl.refresh();
  };
  /* What brightness, temperatures and the like act on: the selected marker, or the whole. */
  S.target = function () {
    if (S.focus && S.sel === S.focus.v.key) return S.focus.n;
    return (S.sel && lpFindIn(S, S.sel)) || root;
  };
  /* A tile was tapped: the light is selected, and its marker is shown (the groups above it are separated where needed, and lights joined by hand are taken apart). */
  S.reveal = function (n) {
    /* A light whose marker stands for several (lights that look the same, or a group not separated) is picked inside it: nothing is separated until that marker is dragged. */
    var shown = lpShownOf(S, n);
    if (shown && shown !== n && lpCount(shown) > 1 && !S.maker) {
      S.focus = { v: shown, n: n, keep: true };
      return S.select(shown.key);
    }
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
    if (S.maker) return; /* the colours of a live scene are not joined to one another or to lights */
    if (S.hier) return S.joinHier(a, b);
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
  /* A master that shows its groups as one light: a group is one light, and the lights that look the same share a marker (S.hier). */
  S.hier = !!groups;
  if (S.hier) lpHierInit(S, root);
  else lpAutoSplit(S, root);
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

/* The effects of a node's lights (what Home Assistant lists for them) and the scenes of its room that a plugin owns (Hue's). */
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
      return pluginSceneKind(id) && areas[areaIdOf(id)];
    })
    .sort(function (x, y) {
      return (
        !!pluginSceneKind(y).dynamic(y) - !!pluginSceneKind(x).dynamic(x) ||
        String(A(x).name || x).localeCompare(String(A(y).name || y))
      );
    });
  return { effects: effects, scenes: scenes };
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
  var c = lpFxCat(effect) || { def: "", v: [] },
    out = [{ id: effect, label: c.def || _T("default"), base: null }];
  c.v.forEach(function (v) {
    out.push({ id: effect + ":" + v[0], label: v[1], base: v[2] });
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
  return look.bri || (lpFxCat(effect) || {}).bri;
}

/* The speed step a look shows: the one chosen, otherwise the Hue app's own for the effect. */
function lpFxSpeed(effect, look) {
  return look.speed || (lpFxCat(effect) || {}).spd;
}

/* The bridge's speed (0 to 1) of a step, as the Hue app maps it for that effect. */
function lpFxBridgeSpeed(effect, step) {
  var r = (lpFxCat(effect) || {}).rng || [0, 1];
  return Math.round((r[0] + ((step - 1) / 11) * (r[1] - r[0])) * 10000) / 10000;
}

/* The picture of a coloured variant: the effect's picture turned to its colour. */
function lpFxTint(effect, look) {
  var base = (lpFxCat(effect) || {}).h;
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
  FX.lights = lights;
  liveStopOn(lights);
  if (name !== "off") {
    LPFXRUN[name] = id;
    if (LPFXTMP[name] && id !== name + ":~") delete LPFXTMP[name];
    lpFxSaveMore();
  }
  var st = name === "off" ? {} : draft || lpFxLook(id),
    step = name === "off" ? 0 : st.speed,
    bri = name === "off" ? 0 : lpFxBri(name, st),
    /* A colour or a speed with an effect is the plus integration's to play (Home Assistant's light entity takes neither): the lights it owns, one by one. */
    src = (lpFxCat(name) || {}).src,
    ours =
      src && src.set_effect && (st.hs || st.k || step)
        ? lightIndividuals(lights).filter(function (e) {
            return fxMatches(src, e);
          })
        : [];
  if (ours.length) {
    var d = { lights: ours, effect: name };
    if (st.hs) d.hs_color = st.hs;
    else if (st.k) d.kelvin = st.k;
    if (step) d.speed = lpFxBridgeSpeed(name, step);
    call(src.id, src.set_effect, d);
    if (bri) call("light", "turn_on", { entity_id: lights, brightness_pct: bri });
  } else {
    var t = { entity_id: lights, effect: name };
    if (bri) t.brightness_pct = bri;
    call("light", "turn_on", t);
  }
}

/* The effects page of the live scene maker: the effects of the selected light (the lights, when none or the colours are selected), No effect first. Tapping one sets it for that light in the scene (the colours come from the scene); nothing is sent to the lights. */
function lpMakerFxPane(S, pane, fx) {
  var box = mk("div", "lp-fx"),
    tiles = [];
  pane.appendChild(box);
  function lightsOf(name) {
    var ids = S.target().cmd.filter(function (x) {
      return !vlightIs(x);
    });
    if (!ids.length) ids = LMK.lights.slice();
    return ids.filter(function (id) {
      return name === "off" || (Array.isArray(A(id).effect_list) && A(id).effect_list.indexOf(name) >= 0);
    });
  }
  function active(name) {
    var ids = lightsOf(name);
    return (
      ids.length > 0 &&
      ids.every(function (id) {
        return name === "off" ? !LMK.fx[id] : LMK.fx[id] === name;
      })
    );
  }
  function tile(name) {
    var el = mk("div", "lp-fxt"),
      sw = mk("div", "lp-fxs");
    sw.innerHTML = lpFxArt(name);
    el.appendChild(sw);
    el.appendChild(mk("div", "lp-fxn")).textContent = lpFxLabel(name);
    el.addEventListener("click", function () {
      var ids = lightsOf(name);
      if (!ids.length) return toast(_T("nothing_selected_has_effects"));
      ids.forEach(function (id) {
        if (name === "off") delete LMK.fx[id];
        else LMK.fx[id] = name;
      });
      liveMakerChanged();
      paint();
      if (S.rebuild) S.rebuild();
    });
    tiles.push({ el: el, name: name });
    return el;
  }
  function row(names) {
    var r = mk("div", "lp-fxr");
    names.forEach(function (n) {
      r.appendChild(tile(n));
    });
    return r;
  }
  box.appendChild(row(["off"]));
  fxGroups(
    fx.effects.filter(function (x) {
      return x !== "off";
    })
  ).forEach(function (g) {
    box.appendChild(mk("div", "lp-fx-h")).textContent = g.label;
    box.appendChild(row(g.names));
  });
  function paint() {
    tiles.forEach(function (t) {
      t.el.classList.toggle("picked", active(t.name));
    });
  }
  S.subs.push({ build: paint, sel: paint });
  paint();
}

/* The Effects page, as in the Hue app: the effects of the lights in groups (Flames, Sparkly, ...), each effect a row that scrolls sideways with its colours and a Create tile at the end, then the Hue scenes of the room. Tapping a tile starts it on what is selected (the whole when nothing is); tapping the one that runs stops it. The tile that runs turns to its colour, and the pencil that opens its settings slides in on its right, pushing the tiles after it along. */
function lpFxPane(S, pane, fx) {
  FX.lights = S.target().cmd.map(lpFxLight);
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
  });
  /* The groups of the catalogues that know these effects, in their order; the effects no catalogue groups come last under More. */
  fxGroups(names).forEach(function (g) {
    box.appendChild(mk("div", "lp-fx-h")).textContent = g.label;
    g.names.forEach(function (x) {
      box.appendChild(effectRow(x));
    });
  });
  function paint() {
    tiles.forEach(function (t) {
      var on = !!t.active();
      t.el.classList.toggle("picked", on);
      t.slot.classList.toggle("open", on && t.pen.style.display !== "none");
      if (t.look) {
        var l = t.look();
        t.sw.firstChild.style.filter = lpFxTint(t.effect, l);
        t.el.style.setProperty("--fh", l.hs ? l.hs[0] : l.k ? 40 : (lpFxCat(t.effect) || {}).h || 210);
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
      mode === "color" ? "" : lpWhiteWheel();
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

/* The lights under the circle, like in the Hue app: a tile for every light (a light made of zones is one tile), with its icon, its name and a switch, in a row that scrolls sideways. The row does not depend on what is joined or separated on the circle: groups are always shown as the lights they are made of. A tile is the colour the light shows, or its zone colours. Tapping a tile selects it and shows its pin on the circle; its switch turns it on or off. */
function lpTrayNodes(S) {
  var list = S.maker ? lpVisible(S).slice() : S.hier ? lpTrayUnits(S) : lpLeaves(S.root);
  return lpSortLights(list, S.root.order);
}

/* The lights in the order of the tile row: the order the owner set for the section's lights master (a light that is not in it goes last), else by name. */
function lpSortLights(list, order) {
  var byName = function (x, y) {
    return x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: "base" });
  };
  if (!order || !order.length) return list.slice().sort(byName);
  var at = function (n) {
    var i = order.indexOf(n.key);
    return i < 0 ? order.length : i;
  };
  return list.slice().sort(function (x, y) {
    return at(x) - at(y) || byName(x, y);
  });
}

/* The effect that a tile's lights play, if any (a light made of zones plays it on the Hue light behind it). */
function lpTileEffect(n) {
  if (LMK && n.cmd.every(function (x) { return !vlightIs(x); }) && lpMakerOn()) {
    var own = n.cmd.map(function (x) { return LMK.fx[x]; }).filter(Boolean)[0];
    return own || "";
  }
  var e = n.cmd.map(lpFxLight).filter(function (x) {
    var f = A(x).effect;
    return f && f !== "off";
  })[0];
  return e ? A(e).effect : "";
}

/* The colours an effect moves through, from the corner at the top left to the one at the bottom right and back, in the colour it was started in. */
function lpFxGradient(effect) {
  var pal = (lpFxCat(effect) || {}).pal || ["#8a8fff", "#ffffff", "#1c1f4a"];
  return "linear-gradient(135deg," + pal.concat(pal[0]).join(",") + ")";
}

/* The lights a scene that moves plays on now: the live scenes that run (the engine says which lights each has) and a plugin's scenes that play (Hue's dynamic scenes, when the plugin can say which lights they are on). */
function lpDynamicLights() {
  var set = {},
    s = engineSensor() ? liveSessions() : {};
  Object.keys(s).forEach(function (sid) {
    (s[sid].lights || []).forEach(function (e) {
      set[e] = 1;
    });
  });
  Object.keys(H().states).forEach(function (id) {
    var kind = id.indexOf("scene.") === 0 ? pluginSceneKind(id) : null;
    if (kind && kind.lights && kind.dynamic(id) && kind.active(id))
      (kind.lights(id) || []).forEach(function (e) {
        set[e] = 1;
      });
  });
  return set;
}

/* What one light is doing, in a word for the line under its name: Sync (a plugin says a sync plays on it), the effect it runs, Dynamics (a scene's colours moving), or Static (one colour). Nothing while it is off. */
function lpLightDoing(e, dyn) {
  var on = V_(e) === "on";
  if (pluginPlays(e)) return _T("tile_sync");
  if (!on) return "";
  var own = A(lpFxLight(e)),
    fx = own.effect;
  if (fx && fx !== "off") return typeof lpFxLabel === "function" ? lpFxLabel(fx) : cap(String(fx).replace(/_/g, " "));
  /* the bridge says a light plays a scene's colours (Hue's `dynamics` is "none" when it does not) */
  if (own.dynamics && own.dynamics !== "none") return _T("tile_dynamics");
  return dyn[e] || dyn[lpFxLight(e)] ? _T("tile_dynamics") : _T("tile_static");
}

/* The same for a tile: what all its lights do, or Mixed when they do not do the same. */
function lpTileDoing(n, dyn) {
  var words = [];
  lpLeaves(n).forEach(function (l) {
    var w = lpLightDoing(l.cmd[0], dyn);
    if (w && words.indexOf(w) < 0) words.push(w);
  });
  return words.length > 1 ? _T("tile_mixed") : words[0] || "";
}

function lpTileColours(n) {
  var one = n.cmd.length === 1 ? lightStops(n.cmd[0]) : null;
  if (one && one.length > 1) return one;
  var c = avgLight(n.cmd.filter(isOn));
  return c ? [c] : null;
}

/* Whether a tile is part of what is selected: the tile itself, the group it belongs to, or one of its zones. */
function lpTileSel(S, n) {
  if (S.focus && S.sel === S.focus.v.key) {
    for (var q = S.focus.n; q; q = q.parent) if (q === n) return true;
    return false;
  }
  /* With nothing picked nothing is lit, unless the panel is for one light and its tile is the only one. */
  if (!S.sel) return n === S.root;
  var sel = lpFindIn(S, S.sel);
  if (!sel) return false;
  for (var p = sel; p; p = p.parent) if (p === n) return true;
  if (lpLeaves(sel).indexOf(n) >= 0) return true; /* a group or joined lights are picked: the tiles of their lights */
  return sel.cmd.some(function (e) {
    return n.cmd.indexOf(e) >= 0;
  });
}

/* The lights row of a panel whose groups are single lights: each tile, and after a group that was opened its lights (which can be groups that are opened too). */
function lpTrayStruct(S, list, depth) {
  return list.map(function (n) {
    var item = { n: n };
    /* A group opens by itself, once, when its lights are not running alike; after that it is as it was left. */
    if (lpIsGroup(n) && S.trayEx[n.key] === undefined) S.trayEx[n.key] = !lpNodeLook(n);
    if (lpIsGroup(n) && S.trayEx[n.key]) item.kids = lpTrayStruct(S, lpSortLights(n.kids, null), (depth || 0) + 1);
    return item;
  });
}

function lpTraySig(items) {
  return items
    .map(function (it) {
      return it.n.key + (it.kids ? "[" + lpTraySig(it.kids) + "]" : "");
    })
    .join(",");
}

/* The colours a group tile shows: its lights' own when they do not all run alike (a gradient from the top left to the bottom right), else the one colour. */
function lpGroupColours(n) {
  var cs = [];
  (n.kids || []).forEach(function (k) {
    var c = avgLight(k.cmd.filter(isOn));
    if (!c) return;
    if (
      !cs.some(function (x) {
        return Math.abs(x[0] - c[0]) + Math.abs(x[1] - c[1]) + Math.abs(x[2] - c[2]) < 24;
      })
    )
      cs.push(c);
  });
  return cs.length > 1 ? cs.slice(0, 4) : null;
}

function lpTray(S) {
  var tray = mk("div", "lp-tray"),
    tiles = [];
  function paint() {
    var dyn = lpDynamicLights();
    tiles.forEach(function (t) {
      if (t.sub) t.sub.textContent = lpTileDoing(t.n, dyn);
      var on = countOn(t.n.cmd) > 0,
        grp = S.hier && lpIsGroup(t.n),
        cs = on ? (grp && lpGroupColours(t.n)) || lpTileColours(t.n) : null,
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
            ? "linear-gradient(" + (grp ? "135deg" : "180deg") + "," + cs.map(cssRgb).join(",") + ")"
            : "linear-gradient(180deg," + cssRgb(cs[0]) + "," + cssRgb(cs[0].map(function (v) {
                return v * 0.86;
              })) + ")";
      } else t.el.style.background = "";
      t.el.classList.toggle("lt", !!cs && lum > 0.62);
    });
  }
  var curSig = null;
  /* A panel whose groups are single lights: the tiles, and beside a group that was opened its lights, with a button that closes it. An opened or closed group slides, and the tiles after it slide with it. */
  function fillHier() {
    var items = lpTrayStruct(S, lpTrayNodes(S)),
      sig = lpTraySig(items);
    if (sig === curSig) return;
    curSig = sig;
    var left = tray.scrollLeft;
    tray.textContent = "";
    tiles = [];
    addItems(items, tray);
    if (S.members) addPlus();
    fitGroups();
    tray.scrollLeft = left;
  }
  /* An opened group is as wide as its lights, said outright (the widths of the tiles and the space between them, the same numbers as in the style sheet), so that no browser can work out a narrower one and let the next tile sit on top of the last light. Innermost first. */
  function groupWidth(g) {
    var kids = [].slice.call(g.children),
      sum = 0;
    kids.forEach(function (c) {
      sum += c.classList.contains("lp-tg") ? groupWidth(c) : c.classList.contains("lp-tcol") ? 30 : 98;
    });
    return sum + Math.max(0, kids.length - 1) * 10;
  }
  function fitGroups() {
    [].forEach.call(tray.querySelectorAll(".lp-tg"), function (g) {
      g.style.width = g.style.flexBasis = groupWidth(g) + "px";
    });
  }
  /* Opening and closing a group are moves of the tiles, not changes of their width: the section is revealed from its left edge while the tiles after it slide to or from where they stand, with the same timing, so the edge of the reveal and the tile after it travel together. Only transforms and a clip are animated, which the browser does without laying the row out again. */
  var LP_SLIDE = { duration: 340, easing: "cubic-bezier(.3,.8,.25,1)" };
  function laterSiblings(el) {
    var out = [];
    for (var s = el.nextElementSibling; s; s = s.nextElementSibling) out.push(s);
    return out;
  }
  function spin(wrap, from, to) {
    var arrow = wrap.querySelector(".lp-tcol svg");
    if (arrow && arrow.animate) arrow.animate([{ transform: "rotate(" + from + "deg)" }, { transform: "rotate(" + to + "deg)" }], { duration: LP_SLIDE.duration, easing: LP_SLIDE.easing, fill: "forwards" });
  }
  /* The row slides to a place (the same time and the same slowing as the tiles). */
  function scrollTrayTo(x, ms) {
    var from = tray.scrollLeft;
    if (Math.abs(x - from) < 1) return;
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / ms),
        e = 1 - Math.pow(1 - p, 3);
      tray.scrollLeft = from + (x - from) * e;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function leftIn(el) {
    return el.getBoundingClientRect().left - tray.getBoundingClientRect().left + tray.scrollLeft;
  }
  function resig() {
    curSig = lpTraySig(lpTrayStruct(S, lpTrayNodes(S)));
  }
  /* A group of the row is opened: its lights come out to the right of its tile. */
  function expandGroup(n, tileEl) {
    S.trayEx[n.key] = true;
    var parent = tileEl.parentNode,
      it = lpTrayStruct(S, [n])[0];
    /* inside another opened group the row is drawn again (the section around it changes width too) */
    if (parent !== tray || !it.kids || !tileEl.animate) {
      fillHier();
      paint();
      return;
    }
    var wrap = makeWrap(it);
    parent.insertBefore(wrap, tileEl.nextSibling);
    fitGroups();
    resig();
    paint();
    var shift = wrap.offsetWidth + 10;
    /* The row slides so that the group and its lights are in view (the group stays in view too). */
    var end = leftIn(wrap) + wrap.offsetWidth + 12;
    if (end > tray.scrollLeft + tray.clientWidth) scrollTrayTo(Math.max(0, Math.min(end - tray.clientWidth, leftIn(tileEl) - 8)), LP_SLIDE.duration);
    laterSiblings(wrap).forEach(function (s) {
      s.animate([{ transform: "translateX(" + -shift + "px)" }, { transform: "translateX(0)" }], LP_SLIDE);
    });
    wrap.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], LP_SLIDE);
    spin(wrap, 180, 0);
  }
  /* Closing an opened group: the reverse. */
  function collapseGroup(n, wrap) {
    if (wrap.parentNode !== tray || !wrap.animate) {
      S.trayEx[n.key] = false;
      fillHier();
      paint();
      return;
    }
    var shift = wrap.offsetWidth + 10,
      /* The row gets shorter by that much. If it is scrolled past the new end, it slides back with the rest, so the browser does not pull it back in one step when the section goes. */
      after = Math.max(0, tray.scrollWidth - shift - tray.clientWidth);
    if (tray.scrollLeft > after) scrollTrayTo(after, LP_SLIDE.duration);
    var moved = laterSiblings(wrap).map(function (s) {
        return s.animate([{ transform: "translateX(0)" }, { transform: "translateX(" + -shift + "px)" }], { duration: LP_SLIDE.duration, easing: LP_SLIDE.easing, fill: "forwards" });
      }),
      shut = wrap.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 100% 0 0)" }], { duration: LP_SLIDE.duration, easing: LP_SLIDE.easing, fill: "forwards" });
    spin(wrap, 0, 180);
    shut.onfinish = function () {
      /* the section goes and the tiles' slide is taken off in the same moment, so they do not move twice */
      S.trayEx[n.key] = false;
      wrap.remove();
      tiles = tiles.filter(function (x) {
        return x.el.isConnected;
      });
      resig();
      moved.forEach(function (a) {
        a.cancel();
      });
      paint();
    };
  }
  function makeWrap(it) {
    var wrap = mk("div", "lp-tg"),
      col = mk("div", "lp-tcol", svg("chevs"));
    wrap.dataset.key = it.n.key;
    col.setAttribute("role", "button");
    col.setAttribute("aria-label", _T("back"));
    col.addEventListener("click", function () {
      collapseGroup(it.n, wrap);
    });
    wrap.appendChild(col);
    addItems(it.kids, wrap);
    return wrap;
  }
  function addItems(items, parent) {
    items.forEach(function (it) {
      addTile(it.n, parent);
      if (it.kids) parent.appendChild(makeWrap(it));
    });
  }
  /* The tiles follow what is shown on the circles: a group that was separated is its lights. */
  function fill() {
    if (S.hier) return fillHier();
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
    nodes.forEach(function (n) {
      addTile(n);
    });
    if (S.members) addPlus();
    tray.scrollLeft = left;
  }
  /* In a scene editor the tiles can be taken out of the scene and others of the room added: S.members is { lights(), candidates(), add(id), remove(id) }. */
  function addPlus() {
    var el = mk("div", "lp-tile lp-add", svg("plus")),
      nm = mk("div", "lp-tn"),
      list = null;
    nm.textContent = _T("add_a_light");
    el.appendChild(nm);
    el.addEventListener("click", function () {
      if (list) {
        list.remove();
        list = null;
        return;
      }
      var ids = S.members.candidates();
      list = mk("div", "lp-addlist");
      if (!ids.length) list.appendChild(mk("div", "lp-addnone")).textContent = _T("nothing_found");
      ids.forEach(function (id) {
        list.appendChild(
          pill("light", A(id).friendly_name || id, {
            tap: function () {
              S.members.add(id);
            },
          })
        );
      });
      tray.parentNode.insertBefore(list, tray.nextSibling);
    });
    tray.appendChild(el);
  }
  function addTile(n, parent) {
    var el = mk("div", "lp-tile", "<div class='lp-tfx'></div>" + svg(n.icon || "light")),
      nm = mk("div", "lp-tn"),
      sw = mk("div", "lp-sw", "<i></i>");
    nm.textContent = n.name;
    el.appendChild(nm);
    var doing = mk("div", "lp-ts");
    el.appendChild(doing);
    el.appendChild(sw);
    el.addEventListener("click", function () {
      S.reveal(n);
      /* A tap on a group opens it beside its tile: its lights come out to the right of it. Tapping it again closes it. */
      if (S.hier && lpIsGroup(n)) {
        if (!S.trayEx[n.key]) expandGroup(n, el);
        else {
          var open = el.nextElementSibling;
          if (open && open.classList.contains("lp-tg") && open.dataset.key === n.key && !open.getAnimations().length) collapseGroup(n, open);
        }
      }
    });
    sw.addEventListener("click", function (e) {
      e.stopPropagation();
      lightsMasterToggle(n.cmd);
    });
    if (S.members && S.members.lights().length > 1) {
      var rm = mk("div", "lp-rm", svg("minus"));
      rm.setAttribute("role", "button");
      rm.setAttribute("aria-label", _T("remove_2"));
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        n.cmd.forEach(function (id) {
          S.members.remove(id);
        });
      });
      el.appendChild(rm);
    }
    (parent || tray).appendChild(el);
    tiles.push({ n: n, el: el, fxl: el.firstChild, sub: doing });
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

/* The light made of zones that the style button is for: the selected one, or the one whose zone is selected, when a plugin offers styles for it (Hue Plus's). */
function lpStyleNode(S) {
  var n = S.target(),
    z = n.zones ? n : n.parent && n.parent.zones ? n.parent : null;
  return z && pluginStyle(z.cmd[0]) ? z : null;
}

/* The brightness button with the slider that rises from it. 'o' has pct(), lit(), live(v), commit(v), stage() and, to show the number in another way than as a percent of the slider, fmt(v).  Pressing it opens the slider smoothly: held, the slider follows the finger and closes when it is let go; tapped, it stays open until something else is tapped. The light popup and the Spotify sync popup both use it. `o` says what it controls: pct() the brightness now, lit() whether it is on (the button is bright), live(v) while the finger moves, commit(v) when it is let go, and stage() the element that gets the class bri-open while the slider is open, so the rest of that popup can be dimmed. */
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
  /* The sun is as light as the button's until the fill is behind it, then dark; it changes colour smoothly. */
  function lit() {
    var on = !!o.lit();
    btn.classList.toggle("on", on);
    ico.classList.toggle("on", on);
  }
  function paint(v) {
    fill.style.height = v + "%";
    val.textContent = o.fmt ? o.fmt(v) : v + "%";
    ico.classList.toggle("dark", v >= 12);
    lit();
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
    if (!on) ico.classList.remove("dark");
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
    else lit();
  };
  reg(function () {
    if (wrap.isConnected) wrap.refresh();
  });
  /* The sun starts as lit as the button, so nothing changes colour when the slider opens. */
  lit();
  return wrap;
}

/* The brightness button at the bottom right of the light popup: it sets the brightness of what is selected (the whole when nothing is). */
/* Whether the popup of a section's lights master changes the whole room (the section's choice) instead of only the lights that are on. */
function lpAll(S) {
  var k = S.root && S.root.key;
  return !!(k && k.indexOf("m:") === 0 && LMASTER_ALL[k.slice(2)]);
}

/* A single light of the live scene maker that is selected (not the colours, not the whole): its own brightness is set, and it is the one light the maker keeps a brightness for. */
function lpMakerLight(S) {
  var n = S.target();
  return n !== S.root && n.cmd.length === 1 && !vlightIs(n.cmd[0]) && !(n.kids && n.kids.length > 1 && !n.zones) ? n.cmd[0] : null;
}

/* Whether the maker is open (the panel of a light popup is not the maker's). */
function lpMakerOn() {
  return !!(LMK && LMK.S);
}

/* The brightness button of the live scene maker: with one light selected it is that light's brightness, with nothing or the colours selected it is the scene's. Nothing is sent to the lights (the preview plays the scene). */
function lpMakerBrightness(S) {
  return briControl({
    pct: function () {
      var id = lpMakerLight(S);
      return (id && LMK.bri[id]) || LMK.live.bri;
    },
    lit: function () {
      return liveMakerLightsOn();
    },
    live: function () {},
    commit: function (v) {
      var id = lpMakerLight(S);
      if (id) LMK.bri[id] = Math.max(1, v);
      else LMK.live.bri = Math.max(1, v);
      liveMakerChanged();
    },
    stage: function () {
      return S.stage;
    },
  });
}

function lpBrightness(S) {
  if (S.maker) return lpMakerBrightness(S);
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
      if (v > 0 && !pluginSceneDim(ids(), v, false)) callLive("lpb:" + S.root.key, "light", "turn_on", { entity_id: lightTargets(ids(), lpAll(S)), brightness_pct: v });
    },
    commit: function (v) {
      if (v <= 0) call("light", "turn_off", { entity_id: lightTargets(ids(), lpAll(S)) });
      else if (!pluginSceneDim(ids(), v, true)) call("light", "turn_on", { entity_id: lightTargets(ids(), lpAll(S)), brightness_pct: v });
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
  if (fx.effects.length) modes.push("fx");
  /* A lights master has the Scenes page after Effects. */
  if (!S.maker && mscSection(root)) modes.push("scenes");
  /* and the sync, as a page of its own, when the master has it on */
  var syncId = !S.maker && mscSection(root) ? masterSyncOf(mscSection(root).e) : null;
  if (syncId) modes.push("sync");
  S.modes = modes;
  if (S.restore && modes.indexOf(S.restore.mode) >= 0) S.mode = S.restore.mode;
  if (S.restore && S.restore.sel) S.sel = S.restore.sel;
  /* A lights master can open on a tab of its own choice (when it is there and the panel is not coming back to the page it was on). */
  var ref0 = S.restore ? null : mscSection(root),
    want = ref0 ? ref0.e.mtab : "";
  if (want && modes.indexOf(want) >= 0) S.mode = want;
  if (modes.indexOf(S.mode) < 0) S.mode = modes[0];
  S.stage = st;
  track.style.setProperty("--n", modes.length);
  modes.forEach(function (m) {
    panes[m] = mk("div", "lp-pane" + (m === "fx" || m === "scenes" || m === "sync" ? " fx" : "") + (m === "sync" ? " sync" : ""));
    if (m !== "fx" && m !== "scenes" && m !== "sync") panes[m].appendChild(lpCircle(S, m));
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
      if (S.maker) lpMakerFxPane(S, panes.fx, fx);
      else lpFxPane(S, panes.fx, fx);
    }
    if (S.mode === "scenes" && !panes.scenes._built) {
      panes.scenes._built = true;
      lpScenesPane(S, panes.scenes);
    }
    if (S.mode === "sync" && !panes.sync._built) {
      panes.sync._built = true;
      panes.sync._size = lpSyncPane(S, panes.sync, syncId, function () {
        lpSyncSize(S, view, panes.sync, true);
      });
    }
    lpSyncMode(S, st, view, panes.sync, anim);
  }
  if (modes.length > 1) {
    tabs = mk("div", "lp-itabs");
    modes.forEach(function (m, i) {
      if (m === "fx" || m === "scenes" || m === "sync") tabs.appendChild(mk("div", "lp-sep"));
      var x = mk("div", "lp-it " + m, m === "fx" ? svg("sparkle") : m === "scenes" ? svg("palette") : m === "sync" ? svg("syncring") : "<i></i>");
      x.setAttribute("role", "button");
      x.setAttribute("aria-label", m === "color" ? _T("colour") : m === "white" ? _T("white") : m === "scenes" ? _T("scenes") : m === "sync" ? _T("master_sync_tab") : _T("effects"));
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
    if (S.maker) return lpGo(S, "lmkmode:");
    var z = lpStyleNode(S);
    if (z) lpGo(S, "lstyle:" + z.key);
  });
  function paintStyle() {
    if (S.maker) {
      style.style.display = "";
      style.innerHTML = liveMakerModeIcon(LMK.live.mode);
      return;
    }
    var z = lpStyleNode(S);
    style.style.display = z ? "" : "none";
    if (z) style.innerHTML = pluginStyle(z.cmd[0]).icon(z.cmd[0]);
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
  /* The tray slides shut while the sync is shown. */
  var trayBox = mk("div", "lp-collapsible");
  trayBox.appendChild(lpTray(S));
  S.syncSubs = (S.syncSubs || []).concat([
    function (on) {
      trayBox.classList.toggle("shut", on);
    },
  ]);
  st.appendChild(trayBox);
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
      if (v > 0 && !pluginSceneDim(ids(), v, false))
        callLive("lpb:" + root.key, "light", "turn_on", {
          entity_id: lightTargets(ids(), lpAll(S)),
          brightness_pct: v,
        });
    },
    commit: function (v) {
      if (v <= 0) call("light", "turn_off", { entity_id: lightTargets(ids(), lpAll(S)) });
      else if (!pluginSceneDim(ids(), v, true)) call("light", "turn_on", { entity_id: lightTargets(ids(), lpAll(S)), brightness_pct: v });
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
    S = lpState(root, colorOk && whiteOk, !!o.groups);
  S.maker = !!o.maker;
  S.members = o.members || null;
  S.groupTiles = !!o.groups;
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
    var pbox = mk("div"),
      pwrap = mk("div", "lp-collapsible");
    pwrap.appendChild(pbox);
    b.appendChild(pwrap);
    lpSaved(pbox, S, o.room);
    if (S.mode === "sync") pwrap.classList.add("shut");
    /* The saved colours slide shut while the sync is shown. */
    S.syncSubs = (S.syncSubs || []).concat([
      function (on) {
        pwrap.classList.toggle("shut", on);
      },
    ]);
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

/* The sync as a page of the light panel: the same page as the sync popup, built into the panel. While it is shown the saved colours, the lights row and the brightness button go (they slide shut or fade), the panel's page grows to the height of the sync page so the tabs slide down to the bottom, and everything comes back when another tab is chosen. `size` is called when the page changes height. */
function lpSyncPane(S, pane, id, size) {
  var box = mk("div", "lp-fx"),
    inner = mk("div", "lp-sync-in"),
    kind = pluginDeviceKind(id),
    prev = CUR;
  box.appendChild(inner);
  pane.appendChild(box);
  /* What the page registers for its updates belongs to the popup that shows it, not to the whole page. */
  CUR = SLIVE;
  try {
    popupDef(kind.pop + ":" + id).build(inner);
  } finally {
    CUR = prev;
  }
  if (window.ResizeObserver) new ResizeObserver(size).observe(inner);
  pane._inner = inner;
  return size;
}

/* The height the page of the panel has while the sync is shown: what the sync page needs, at most most of the screen. */
function lpSyncSize(S, view, pane, animate) {
  if (S.mode !== "sync" || !pane._inner) return;
  var want = Math.max(260, Math.min(pane._inner.offsetHeight + 8, Math.round(window.innerHeight * 0.62)));
  view.style.transition = animate ? "height .38s cubic-bezier(.2,.9,.25,1)" : "none";
  view.style.height = want + "px";
}

/* Switching to or from the sync page: the classes that slide and fade the rest, and the page's height. */
function lpSyncMode(S, st, view, pane, anim) {
  var on = S.mode === "sync",
    was = st.classList.contains("sync");
  if (on === was) return;
  st.classList.toggle("sync", on);
  (S.syncSubs || []).forEach(function (f) {
    f(on);
  });
  if (on) {
    view.classList.add("sizing");
    var from = view.offsetHeight;
    view.style.transition = "none";
    view.style.height = from + "px";
    void view.offsetHeight;
    lpSyncSize(S, view, pane, anim !== false);
  } else {
    var cur = view.offsetHeight;
    view.classList.remove("sizing");
    view.style.height = "";
    var nat = view.offsetHeight;
    view.classList.add("sizing");
    view.style.transition = "none";
    view.style.height = cur + "px";
    void view.offsetHeight;
    view.style.transition = anim === false ? "none" : "height .38s cubic-bezier(.2,.9,.25,1)";
    view.style.height = nat + "px";
    setTimeout(function () {
      if (S.mode === "sync") return;
      view.classList.remove("sizing");
      view.style.height = "";
      view.style.transition = "";
    }, 420);
  }
}
