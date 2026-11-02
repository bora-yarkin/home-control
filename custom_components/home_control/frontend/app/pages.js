/* Pages: room and home views, the bottom dock, page layout (sections are placed in the shortest column by script), swiping and moving between pages. */

/* dock: dot on rooms with lights on */
function dockState() {
  Array.prototype.forEach.call(document.querySelectorAll(".dock .di"), function (d) {
    var l = lightsAll(d.dataset.k);
    d.classList.toggle("act", l.length > 0 && countOn(l) > 0);
  });
}

/* Sections are laid out by script instead of by CSS columns or grids. A section is placed in the shortest column in list order; a full-width one (or a half-width one standing alone between full-width ones) takes the whole row. Because the result depends only on the list order and the measured heights, the same list always gives the same page, and a drag can show exactly where a section will land. */
function masonFlags(its, n) {
  var w = its.map(function (it) {
    return !!it.wide || n === 1;
  });
  for (var a = 0; a < w.length;) {
    if (w[a]) {
      a++;
      continue;
    }
    var b = a;
    while (b < w.length && !w[b]) b++;
    if (b - a === 1) w[a] = true;
    a = b;
  }
  return w;
}

function outerH(el) {
  var cs = getComputedStyle(el);
  return el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}

/* Columns whose heights differ by no more than this (px) are the same height when placing a section. */
var MASON_TIE = 60;

function masonPlan(its, fl, hts, W, n, gap) {
  var cw = (W - (n - 1) * gap) / n,
    col = [],
    pos = [],
    c;
  for (c = 0; c < n; c++) col.push(0);
  its.forEach(function (it, j) {
    if (fl[j]) {
      var y = Math.max.apply(null, col);
      pos.push({ x: 0, y: y, w: W, h: hts[j] });
      for (c = 0; c < n; c++) col[c] = y + hts[j];
    } else {
      /* The shortest column, but columns within a few pixels of each other count as equal and the first of them is taken: otherwise a small change of height (a power button appearing in a header) would send the next sections to the other column. */
      var b = 0;
      for (c = 1; c < n; c++) if (col[c] < col[b]) b = c;
      for (c = 0; c < b; c++)
        if (col[c] - col[b] <= MASON_TIE) {
          b = c;
          break;
        }
      pos.push({ x: b * (cw + gap), y: col[b], w: cw, h: hts[j] });
      col[b] += hts[j];
    }
  });
  return { pos: pos, H: Math.max.apply(null, col.concat([0])) };
}

function masonVisible(h) {
  return h._items.filter(function (it) {
    return getComputedStyle(it.el).display !== "none";
  });
}

function masonPlace(it, p) {
  it.el.style.width = p.w + "px";
  it.el.style.transform = "translate(" + p.x + "px," + p.y + "px)";
}

function masonLayout(h) {
  if (!h.isConnected || dragging > 0) return;
  var W = h.clientWidth;
  if (!W) return;
  var n = colCount(h),
    its = masonVisible(h),
    fl = masonFlags(its, n),
    cw = (W - (n - 1) * 24) / n;
  its.forEach(function (it, j) {
    it.el.style.width = (fl[j] ? W : cw) + "px";
  });
  var pl = masonPlan(
    its,
    fl,
    its.map(function (it) {
      return outerH(it.el);
    }),
    W,
    n,
    24
  );
  its.forEach(function (it, j) {
    masonPlace(it, pl.pos[j]);
  });
  h.style.height = pl.H + "px";
  h.style.visibility = "";
  h._lw = W;
  h._n = n;
}

function masonSched(h) {
  if (h._t) return;
  h._t = setTimeout(function () {
    h._t = 0;
    masonLayout(h);
  }, 0);
}

function flow(body, list) {
  COLS.forEach(function (h) {
    if (h._ro) h._ro.disconnect();
  });
  COLS.length = 0;
  var esc = CURSCOPE,
    PC = pageCols(esc),
    h = mk("div", "mason");
  body.dataset.pc = PC;
  body._flow = list;
  body._flowNodes = [h];
  h._pc = PC;
  h._items = [];
  h.style.visibility = "hidden";
  list.forEach(function (s) {
    if (!s.el) return;
    s.el._flowBody = body;
    if (EDIT && ISADMIN && s.id && !s.el.dataset.sid) editDecorate(esc, s);
    h._items.push({ el: s.el, wide: !!s.wide, id: s.id });
    h.appendChild(s.el);
  });
  body.appendChild(h);
  COLS.push(h);
  /* Placing needs real sizes, which exist once the page is attached; the observer also re-places everything when a section grows or shrinks. */
  if (window.ResizeObserver) {
    h._ro = new ResizeObserver(function () {
      masonSched(h);
    });
    h._ro.observe(h);
    h._items.forEach(function (it) {
      h._ro.observe(it.el);
    });
  }
  masonSched(h);
}

function relayout() {
  COLS.forEach(function (h) {
    if (h.isConnected && (h._lw !== h.clientWidth || colCount(h) !== h._n)) masonSched(h);
  });
}

/* The sections of a page, built: what roomView and homeView lay out and what livePatch compares with the open page. */
function pageList(key) {
  if (key !== "home" && UIROOM[key]) {
    CURSCOPE = "room:" + key;
    var list = secList("room:" + key);
    if (!list.length)
      list.push({
        el: section(_T("nothing_here_yet"), "plug", [
          pill("plus", _T("this_page_is_empty"), {
            sub: function () {
              return _T("add_devices_or_show_sections_in_the_");
            },
          }),
        ]),
      });
    return list;
  }
  CURSCOPE = "home";
  return secList("home");
}

function roomView(body, key) {
  flow(body, pageList(key));
}

function homeView(body) {
  flow(body, pageList("home"));
}

/* The picture of the open room behind the page. */
function applyRoomWall() {
  var rw = document.getElementById("rwall");
  if (rw) rw.remove();
  var rmv = VIEW !== "home" && UIROOM[VIEW],
    hasw = !!(rmv && rmv.img);
  document.body.classList.toggle("rwall", hasw);
  if (hasw) {
    rw = mk("div");
    rw.id = "rwall";
    var wi = new Image();
    wi.alt = "";
    wi.src = rmv.img;
    rw.appendChild(wi);
    document.body.insertBefore(rw, document.body.firstChild);
  }
}

/* What a section looks like apart from the values that update live and the camera pictures. */
function sectionSig(el) {
  var c = el.cloneNode(true);
  [].forEach.call(c.querySelectorAll(".vidbox"), function (v) {
    v.innerHTML = "";
  });
  return c.className + "|" + c.innerHTML.replace(/ style="[^"]*"/g, "");
}

/* Brings the open page up to date with changed dashboard data without rebuilding it: a section that looks the same stays as it is and keeps updating live; a changed one is replaced in place, a new one is added and a removed one is taken out. */
var LIVEPATCH_WAITING = false;

function livePatch() {
  if (!H()) return;
  if (dragging > 0) {
    LIVEPATCH_WAITING = true;
    return;
  }
  LIVEPATCH_WAITING = false;
  applyUI();
  buildDock();
  if (VIEW !== "home" && !UIROOM[VIEW]) VIEW = "home";
  var b = document.getElementById("body"),
    pg = b && b.querySelector(".pg"),
    h = pg && pg._flowNodes && pg._flowNodes[0];
  if (!h || EDIT || pg._view !== VIEW) {
    render();
    return;
  }
  document.getElementById("tt").textContent = TITLES[VIEW] || TITLES.home;
  var rmv = VIEW !== "home" && UIROOM[VIEW],
    rw = document.getElementById("rwall"),
    shown = rw && rw.querySelector("img") ? rw.querySelector("img").getAttribute("src") : "";
  if (((rmv && rmv.img) || "") !== (shown || "")) applyRoomWall();

  var list,
    outer = CUR;
  CUR = [];
  PATCH_BUILD = true;
  try {
    list = pageList(VIEW);
  } finally {
    PATCH_BUILD = false;
    CUR = outer;
  }
  list.forEach(function (s) {
    runUpdates(s.el._live || [], "section update");
  });
  var old = {};
  h._items.forEach(function (it) {
    if (it.id) old[it.id] = it;
  });
  var items = [],
    fresh = [];
  list.forEach(function (s) {
    var o = s.id && old[s.id];
    if (o && !!o.wide === !!s.wide && sectionSig(o.el) === sectionSig(s.el)) {
      s.el._dead = true;
      items.push(o);
    } else {
      s.el._flowBody = pg;
      var it = { el: s.el, wide: !!s.wide, id: s.id };
      items.push(it);
      fresh.push(it);
    }
  });
  var gone = h._items.filter(function (it) {
    return items.indexOf(it) < 0;
  });
  gone.forEach(function (it) {
    it.el._dead = true;
    if (h._ro) h._ro.unobserve(it.el);
    it.el.remove();
  });
  items.forEach(function (it) {
    h.appendChild(it.el);
  });
  fresh.forEach(function (it) {
    LIVE.push(liveOf(it.el));
    if (h._ro) h._ro.observe(it.el);
  });
  h._items = items;
  for (var i = LIVE.length - 1; i >= 0; i--) if (LIVE[i]._el && LIVE[i]._el._dead) LIVE.splice(i, 1);
  var pc = pageCols(CURSCOPE);
  pg.dataset.pc = pc;
  h._pc = pc;

  /* Camera pictures are restarted only when a camera section came or went. */
  var cams = function (it) {
    return !!it.el.querySelector(".vidbox");
  };
  if (fresh.some(cams) || gone.some(cams)) {
    stopStreams("page");
    [].forEach.call(h.querySelectorAll(".vidbox"), function (box) {
      if (box._start) box._start();
    });
  }
  var vb = h.querySelector(".vidbox");
  CAMPAGE = vb && vb._start ? { box: vb, start: vb._start } : null;
  masonSched(h);
  refresh();
}


/* Wallpaper colours follow the sun: night, dawn, day and dusk blend by the sun's elevation (clock fallback), warmed by the lights that are on.
 A fixed colour picked in Appearance overrides this. Each key lists top, upper, lower, horizon glow and accent. */

function initSwipe() {
  var m = document.querySelector("main"),
    sx = 0,
    sy = 0,
    mode = 0,
    vx = 0,
    lx = 0,
    lt = 0,
    dir = 0,
    key = null,
    still = null,
    rub = 0,
    hush = false;
  function skip(t) {
    return t && t.closest && t.closest(".slide,input,textarea,.touch,.rbtn.hold,.sel,.menu,.ptzov,.pill.slidable .ic");
  }
  function neighbour(d) {
    var i = ORDER.indexOf(VIEW) + d;
    return i >= 0 && i < ORDER.length ? ORDER[i] : null;
  }
  m.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" || SHEET || PG || (EDIT && ISADMIN)) return;
    mode = skip(e.target) ? 3 : 1;
    sx = lx = e.clientX;
    sy = e.clientY;
    lt = performance.now();
    vx = 0;
  });
  m.addEventListener("pointermove", function (e) {
    if (mode !== 1 && mode !== 2) return;
    var ddx = e.clientX - sx,
      ddy = e.clientY - sy;
    if (mode === 1) {
      if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
      if (Math.abs(ddx) <= Math.abs(ddy) * 1.3) {
        mode = 3;
        return;
      }
      mode = 2;
      capturePointer(m, e);
      dir = ddx < 0 ? 1 : -1;
      key = neighbour(dir);
      still = null;
      if (key && motionOff()) {
        still = key;
        key = null;
      }
      if (key) pgBegin(key, dir);
      else m.style.overflowX = "hidden";
    }
    if (still) {
      rub = ddx;
      return;
    }
    if (key) pgSet(Math.max(0, Math.min(1, (-ddx * dir) / PG.D)));
    else {
      rub = ddx / 4;
      document.getElementById("body").firstElementChild.style.transform =
        "translate3d(" + rub + "px,0,0)";
    }
    var now = performance.now();
    vx = 0.7 * vx + 0.3 * ((e.clientX - lx) / Math.max(1, now - lt));
    lx = e.clientX;
    lt = now;
  });
  function release(cancel) {
    if (mode !== 2) {
      mode = 0;
      return;
    }
    mode = 0;
    hush = true;
    setTimeout(function () {
      hush = false;
    }, 400);
    if (still) {
      var sk = still;
      still = null;
      m.style.overflowX = "";
      if (!cancel && Math.abs(rub) > window.innerWidth * 0.22) go(sk);
      rub = 0;
      return;
    }
    if (!key) {
      var pg = document.getElementById("body").firstElementChild,
        a = pg.animate(
          [{ transform: "translate3d(" + rub + "px,0,0)" }, { transform: "translate3d(0,0,0)" }],
          { duration: 260, easing: "cubic-bezier(.2,.8,.25,1)" }
        );
      pg.style.transform = "";
      a.onfinish = a.oncancel = function () {
        m.style.overflowX = "";
      };
      rub = 0;
      return;
    }
    var p = PG.p,
      toward = vx * -dir,
      fling = toward > 0.45,
      back = toward < -0.45,
      commit = !cancel && !back && (p > 0.3 || fling),
      rem = commit ? 1 - p : p;
    var dur = Math.max(160, Math.min(420, rem * 520));
    if (fling && commit) dur = Math.max(140, Math.min(dur, ((rem * PG.D) / toward) * 1.6));
    PG.to = commit ? 1 : 0;
    pgRun(PG.to, dur, EASE_FLING, commit ? pgCommit : pgCancel);
    key = null;
  }
  m.addEventListener("pointerup", function () {
    release(false);
  });
  m.addEventListener("pointercancel", function () {
    release(true);
  });
  m.addEventListener(
    "click",
    function (e) {
      if (hush) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );
}

var TITLES = { home: _T("app_title") },
  DOCK = [],
  ORDER = ["home"];

function clock() {
  var d = new Date();
  document.getElementById("clk").textContent = tfmt(d, { hour: "2-digit", minute: "2-digit" });
  document.getElementById("dt").textContent = d.toLocaleDateString(
    LOC(),
    window.innerWidth < 480
      ? { weekday: "short", day: "numeric", month: "short" }
      : { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );
}

function render() {
  var keep = RVIEW === VIEW ? scrollHold() : null;
  RVIEW = VIEW;
  if (SHEET) closeSheet();
  stopStreams("page");
  LIVE.length = 0;
  CUR = LIVE;
  document.getElementById("tt").textContent = TITLES[VIEW] || TITLES.home;
  var b = document.getElementById("body");
  b.innerHTML = "";
  applyRoomWall();
  document.body.classList.toggle("editing", EDIT && ISADMIN && (VIEW === "home" || !!UIROOM[VIEW]));
  edToolbar();
  b.appendChild(buildPage(VIEW, LIVE).el);
  clock();
  if (keep) keep();
  /* Fill live values now instead of on the next refresh tick, so nothing shows placeholders. */
  if (H()) refresh();
}

function motionOff() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* The pill under the selected dock item follows that item whenever it changes size or place (a larger display size, a font that arrives late, a room added), instead of being placed once. */
var DOCK_WATCH = typeof ResizeObserver === "function" ? new ResizeObserver(movePill) : null;

function movePill() {
  var d = document.getElementById("dock"),
    dp = d.querySelector(".dp"),
    el = d.querySelector(".di.sel");
  if (!dp || !el) return;
  dp.style.width = el.offsetWidth + "px";
  dp.style.transform = "translateX(" + el.offsetLeft + "px)";
}

function buildDock() {
  var d = document.getElementById("dock");
  d.innerHTML = "<span class='dp'></span>";
  DOCK.forEach(function (r) {
    var b = mk(
      "div",
      "di" + (VIEW === r[0] ? " sel" : ""),
      svg(r[3]) + "<span>" + r[1] + "</span>"
    );
    b.dataset.k = r[0];
    b.addEventListener("click", function () {
      if (dockHeld) return;
      go(r[0]);
    });
    d.appendChild(b);
  });
  if (DOCK_WATCH) {
    DOCK_WATCH.disconnect();
    DOCK_WATCH.observe(d);
    [].forEach.call(d.querySelectorAll(".di"), function (item) {
      DOCK_WATCH.observe(item);
    });
  }
  dockSort(d);
  movePill();
}

var dockHeld = false;

/* While editing, holding a room on the bottom bar and dragging it changes the order of the rooms (the Home tab stays first). */
function dockSort(d) {
  var items = [].slice.call(d.querySelectorAll(".di")).filter(function (x) {
    return x.dataset.k !== "home";
  });
  if (!ISADMIN || items.length < 2) return;
  items.forEach(function (el) {
    el.addEventListener("pointerdown", function (e) {
      dockHeld = false;
      if (!document.body.classList.contains("editing")) return;
      var at = { clientX: e.clientX, clientY: e.clientY },
        timer = setTimeout(function () {
          stop();
          dockHeld = true;
          edDrag(
            { clientX: at.clientX, clientY: at.clientY, preventDefault: function () {}, stopPropagation: function () {} },
            el,
            items,
            function (from, to) {
              edReorder(
                UI.rooms,
                items.map(function (x) {
                  return roomById(x.dataset.k);
                }),
                from,
                to
              );
              uiChanged();
            }
          );
        }, 380);
      function track(ev) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 8) stop();
        at = ev;
      }
      function stop() {
        clearTimeout(timer);
        document.removeEventListener("pointermove", track);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
      }
      document.addEventListener("pointermove", track);
      document.addEventListener("pointerup", stop);
      document.addEventListener("pointercancel", stop);
    });
  });
}

/* ---- Page changes ----
 The current and the next page sit side by side on one strip. A single progress value (0 = current page, 1 = next page)
 positions the strip, the dock pill and the title together, so a tap and a swipe both move as one surface.
 A tap drives the progress with a timer; a swipe drives it with the finger and then finishes from where it was let go. */
var PG = null;

function bezier(x1, y1, x2, y2) {
  function a(p1, p2, t) {
    return ((1 - 3 * p2 + 3 * p1) * t + (3 * p2 - 6 * p1)) * t * t + 3 * p1 * t;
  }
  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var t = x;
    for (var i = 0; i < 8; i++) {
      var d = a(x1, x2, t) - x;
      if (Math.abs(d) < 1e-4) break;
      var dt = 3 * (1 - 3 * x2 + 3 * x1) * t * t + 2 * (3 * x2 - 6 * x1) * t + 3 * x1 || 1e-6;
      t -= d / dt;
    }
    return a(y1, y2, Math.max(0, Math.min(1, t)));
  };
}

var EASE_TAP = bezier(0.32, 0.72, 0, 1),
  EASE_FLING = bezier(0.2, 0.8, 0.25, 1);

function buildPage(key, live) {
  var prev = CUR;
  CUR = live;
  var p = mk("div", "pg");
  p._view = key;
  try {
    viewFor(key)(p);
  } finally {
    CUR = prev;
  }
  return { el: p, live: live };
}

function roomWall(key) {
  var r = key !== "home" && UIROOM[key];
  if (!(r && r.img)) return null;
  var rw = mk("div");
  rw.className = "rwall-x";
  rw.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
  var im = new Image();
  im.alt = "";
  im.src = r.img;
  im.style.cssText = "width:100%;height:100%;object-fit:cover";
  rw.appendChild(im);
  return rw;
}

function dockSel(key) {
  Array.prototype.forEach.call(document.querySelectorAll(".di"), function (d) {
    d.classList.toggle("sel", d.dataset.k === key);
  });
}

function pillAt(k) {
  var el = document.querySelector('#dock .di[data-k="' + k + '"]');
  return el ? [el.offsetLeft, el.offsetWidth] : null;
}

function pageUrl(key) {
  START_DONE = true;
  window.HA.route.set(key === "home" ? "" : key);
}

function pgBegin(key, dir) {
  if (SHEET) closeSheet();
  stopStreams("page");
  var main = document.querySelector("main"),
    body = document.getElementById("body"),
    old = body.firstElementChild,
    s = main.scrollTop,
    W = body.offsetWidth;
  var nw = buildPage(key, []),
    bg = document.querySelector(".bg"),
    rwOld = document.getElementById("rwall"),
    rwNew = roomWall(key);
  nw.el.style.cssText = "position:absolute;left:0;top:0;width:100%";
  body.style.position = "relative";
  body.appendChild(nw.el);
  /* Bring the incoming page fully up to date (live values and column layout) before it moves, so nothing changes when it lands. */
  runUpdates(nw.live, "page update");
  relayout();
  main.style.overflowX = "hidden";
  main.scrollTop = 0;
  body.style.minHeight = Math.max(old.offsetHeight, nw.el.offsetHeight) + "px";
  /* Wallpapers crossfade while the strip moves. */
  if (rwOld || rwNew) {
    document.body.classList.remove("rwall");
    if (rwOld) {
      rwOld.style.zIndex = 0;
      bg.after(rwOld);
    }
    if (rwNew) {
      rwNew.style.opacity = 0;
      (rwOld || bg).after(rwNew);
    }
  }
  PG = {
    key: key,
    from: VIEW,
    dir: dir,
    main: main,
    body: body,
    old: old,
    nw: nw,
    s: s,
    D: Math.round((window.innerWidth + W) / 2) + 8,
    hdr: document.querySelector(".hdr"),
    tt: document.getElementById("tt"),
    dp: document.querySelector("#dock .dp"),
    pa: pillAt(VIEW),
    pb: pillAt(key),
    rwOld: rwOld,
    rwNew: rwNew,
    hadWall: !!rwOld,
    p: 0,
    raf: 0,
    half: false,
  };
  pgSet(0);
}

function pgSet(p) {
  var g = PG;
  g.p = p;
  var x = -g.dir * p * g.D;
  g.old.style.transform = "translate3d(" + x + "px," + -g.s + "px,0)";
  g.nw.el.style.transform = "translate3d(" + (g.dir * g.D + x) + "px,0,0)";
  /* If the old page was scrolled, the header returns to view with the same progress instead of jumping. */
  g.hdr.style.transform = g.s ? "translate3d(0," + -g.s * (1 - p) + "px,0)" : "";
  g.tt.style.opacity = Math.abs(1 - 2 * p);
  var half = p >= 0.5;
  if (half !== g.half) {
    g.half = half;
    var k = half ? g.key : g.from;
    g.tt.textContent = TITLES[k] || TITLES.home;
    dockSel(k);
  }
  if (g.pa && g.pb && g.dp) {
    g.dp.style.transform = "translateX(" + (g.pa[0] + (g.pb[0] - g.pa[0]) * p) + "px)";
    g.dp.style.width = g.pa[1] + (g.pb[1] - g.pa[1]) * p + "px";
  }
  if (g.rwOld) g.rwOld.style.opacity = g.rwNew ? 1 : 1 - p;
  if (g.rwNew) g.rwNew.style.opacity = p;
}

/* Frames drive the motion; the timer only lands the move if frames stall (throttled or hidden page), so a page change always completes. */
function pgRun(to, dur, ease, done) {
  var g = PG,
    from = g.p,
    t0 = performance.now(),
    fin = false;
  cancelAnimationFrame(g.raf);
  clearTimeout(g.tm);
  function end() {
    if (fin || PG !== g) return;
    fin = true;
    cancelAnimationFrame(g.raf);
    clearTimeout(g.tm);
    pgSet(to);
    done();
  }
  function step(now) {
    if (fin) return;
    var t = Math.min(1, (now - t0) / dur);
    pgSet(from + (to - from) * ease(t));
    if (t < 1) g.raf = requestAnimationFrame(step);
    else end();
  }
  g.raf = requestAnimationFrame(step);
  g.tm = setTimeout(end, dur + 250);
}

function pgClean() {
  var g = PG;
  g.old.style.transform = "";
  g.nw.el.style.cssText = "";
  g.body.style.position = "";
  g.body.style.minHeight = "";
  g.hdr.style.transform = "";
  g.tt.style.opacity = "";
  g.main.style.overflowX = "";
}

function pgCommit() {
  var g = PG;
  cancelAnimationFrame(g.raf);
  clearTimeout(g.tm);
  pgClean();
  PG = null;
  g.old.remove();
  VIEW = g.key;
  APPROVED = {};
  LIVE.length = 0;
  g.nw.live.forEach(function (f) {
    LIVE.push(f);
  });
  CUR = LIVE;
  if (g.rwOld) g.rwOld.remove();
  if (g.rwNew) {
    g.rwNew.id = "rwall";
    g.rwNew.className = "";
    g.rwNew.style.opacity = "";
  }
  document.body.classList.toggle("rwall", !!g.rwNew);
  document.body.classList.toggle("editing", EDIT && ISADMIN && (VIEW === "home" || !!UIROOM[VIEW]));
  edToolbar();
  g.tt.textContent = TITLES[VIEW] || TITLES.home;
  dockSel(VIEW);
  movePill();
  refresh();
  clock();
  pageUrl(VIEW);
}

function pgCancel() {
  var g = PG;
  cancelAnimationFrame(g.raf);
  clearTimeout(g.tm);
  pgClean();
  PG = null;
  g.nw.el.remove();
  if (g.rwNew) g.rwNew.remove();
  if (g.rwOld) g.rwOld.style.opacity = "";
  document.body.classList.toggle("rwall", g.hadWall);
  dockSel(VIEW);
  movePill();
  render();
  refresh();
  g.main.scrollTop = g.s;
}

/* A second tap while a page is still moving lands the current move first, then starts the new one. */
function pgSettle() {
  if (!PG) return;
  if (PG.to === 0) pgCancel();
  else pgCommit();
}

function go(key) {
  var main = document.querySelector("main");
  pgSettle();
  if (key === VIEW || ORDER.indexOf(key) < 0) {
    main.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  var dir = ORDER.indexOf(key) > ORDER.indexOf(VIEW) ? 1 : -1;
  if (motionOff() || !document.getElementById("body").firstElementChild) {
    VIEW = key;
    APPROVED = {};
    dockSel(key);
    movePill();
    render();
    refresh();
    main.scrollTop = 0;
    pageUrl(key);
    return;
  }
  pgBegin(key, dir);
  PG.to = 1;
  pgRun(1, 460, EASE_TAP, pgCommit);
}
