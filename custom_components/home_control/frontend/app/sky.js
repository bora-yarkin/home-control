/* The sky behind the header, drawn on a canvas from the weather and the height of the sun. Nothing in it is a picture: the colours follow the sun's elevation, the clouds are noise that drifts with the wind and is lit from the side the sun is on, the sun has a corona and rays that turn, grow and shrink, and rain, snow, stars and lightning are particles. Rain that reaches a button or a chip of the header lands on it and runs down it (the second canvas, above the controls). */

var SKYRAMP = [
  [-18, [4, 7, 16], [10, 20, 42]],
  [-6, [14, 22, 50], [52, 48, 86]],
  [0, [36, 58, 108], [226, 140, 92]],
  [8, [58, 104, 166], [240, 178, 124]],
  [25, [63, 124, 196], [156, 198, 234]],
  [60, [47, 111, 190], [143, 192, 234]],
];

var SKYN = (function () {
  var t = [],
    s = 12345;
  for (var i = 0; i < 4096; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    t.push(s / 0x7fffffff);
  }
  return t;
})();

var SKYS = {
  cv: null,
  top: null,
  hd: null,
  raf: 0,
  last: 0,
  t: 0,
  dt: 0,
  scene: null,
  w: 0,
  h: 0,
  layers: [],
  parts: [],
  stars: [],
  motes: [],
  splashes: [],
  shoot: null,
  shootAt: 5,
  strikes: [],
  strikeAt: 2,
  sheet: null,
  flash: 0,
  obstacles: [],
  obstacleAt: 0,
  runners: [],
  bursts: [],
};

/* The two layers of cloud: the far one is smaller, slower and fainter, the near one larger and faster, so the clouds have depth. The fog is two low, stretched wisps. */
var SKYLAYERS = [
  { scale: 9, sy: 1, speed: 0.4, seed: 17.3, cover: 0.85, alpha: 0.6, dull: 0.55, amp: 3.2 },
  { scale: 5, sy: 1, speed: 1, seed: 0, cover: 1, alpha: 1, dull: 1, amp: 3.2 },
];
var SKYFOG = [
  { scale: 2.2, sy: 3.4, speed: 0.5, seed: 5, fixed: 0.95, alpha: 0.5, dull: 0, amp: 0.8, col: [226, 230, 234] },
  { scale: 3.4, sy: 4.2, speed: 1.2, seed: 40, fixed: 0.8, alpha: 0.4, dull: 0, amp: 0.8, col: [232, 236, 239] },
];

function skyMix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function skyClamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function skySmooth(a, b, v) {
  var t = skyClamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function skyRgb(c, a) {
  return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")";
}

/* What a kind of weather does to the sky: how much cloud, how dark, what falls, how fast the wind moves it. Cloudy is a bright, broken, structured cloud with sky showing between; fog has no cloud at all, only a milky haze with low wisps. */
function skyParams(kind, heavy, fast) {
  var p = { cover: 0, dark: 0, rain: 0, snow: 0, haze: 0, flash: false, wind: 0.012, amp: 1 };
  if (kind === "partly") p.cover = 0.45;
  else if (kind === "cloudy") {
    p.cover = 0.8;
    p.dark = heavy ? 0.45 : 0.12;
    p.amp = 1.4;
  } else if (kind === "rain") {
    p.cover = 0.94;
    p.dark = heavy ? 0.7 : 0.45;
    p.rain = heavy ? 1 : 0.55;
  } else if (kind === "storm") {
    p.cover = 1;
    p.dark = 0.85;
    p.rain = 1;
    p.flash = true;
  } else if (kind === "snow") {
    p.cover = 0.9;
    p.dark = 0.1;
    p.snow = heavy ? 1 : 0.55;
  } else if (kind === "fog") {
    p.haze = 1;
    p.wind = 0.02;
  } else if (fast) p.cover = 0.18;
  if (fast) p.wind = 0.04;
  return p;
}

/* The sky's top and bottom colour for a sun this high, greyed by cloud and darkened by dull weather. Fog is a milky grey. */
function skyColours(elev, p) {
  var e = skyClamp(elev, -18, 60),
    i = 1;
  while (i < SKYRAMP.length - 1 && e > SKYRAMP[i][0]) i++;
  var a = SKYRAMP[i - 1],
    b = SKYRAMP[i],
    t = skyClamp((e - a[0]) / (b[0] - a[0]), 0, 1),
    top = skyMix(a[1], b[1], t),
    bot = skyMix(a[2], b[2], t),
    lum = 0.3 + 0.7 * skySmooth(-8, 22, e),
    shade = 1 - 0.55 * p.dark,
    grey = Math.min(1, p.cover * (p.amp > 1 ? 0.62 : 0.85));
  if (p.haze) {
    var fl = 0.22 + 0.78 * skySmooth(-8, 22, e);
    return [skyMix(top, [172 * fl, 179 * fl, 188 * fl], 0.92), skyMix(bot, [208 * fl, 213 * fl, 218 * fl], 0.92)];
  }
  return [
    skyMix(top, [96 * lum * shade, 106 * lum * shade, 118 * lum * shade], grey),
    skyMix(bot, [152 * lum * shade, 162 * lum * shade, 172 * lum * shade], grey),
  ];
}

function skyNoise(x, y) {
  var xi = Math.floor(x),
    yi = Math.floor(y),
    xf = x - xi,
    yf = y - yi,
    u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  function r(a, b) {
    return SKYN[(a & 63) * 64 + (b & 63)];
  }
  return (
    r(xi, yi) * (1 - u) * (1 - v) + r(xi + 1, yi) * u * (1 - v) + r(xi, yi + 1) * (1 - u) * v + r(xi + 1, yi + 1) * u * v
  );
}

function skyFbm(x, y) {
  return (
    (0.5 * skyNoise(x, y) + 0.25 * skyNoise(2 * x + 5.2, 2 * y + 1.3) + 0.125 * skyNoise(4 * x + 9.1, 4 * y + 3.7) + 0.0625 * skyNoise(8 * x + 2.3, 8 * y + 7.9)) /
    0.9375
  );
}

function skySun(sc, w, h) {
  return { x: w * 0.62, y: h * (0.86 - (skyClamp(sc.elev, 0, 50) / 50) * 0.56) };
}

/* One layer of cloud (or fog): noise above a threshold set by the cover, each point lit or shaded by whether more cloud lies toward the sun, and tinted by the light of the hour. */
function skyCloudLayer(i, L, sc, p, w, h) {
  var cw = 200,
    ch = Math.max(12, Math.round((cw * h) / w)),
    S = SKYS.layers[i];
  if (!S || S.cv.width !== cw || S.cv.height !== ch) {
    var cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    S = SKYS.layers[i] = { cv: cv, id: cv.getContext("2d").createImageData(cw, ch) };
  }
  var d = S.id.data,
    sun = skySun(sc, cw, ch),
    cover = L.fixed !== undefined ? L.fixed : skyClamp(p.cover * L.cover, 0, 1),
    th = 0.8 - cover * 0.52,
    day = skySmooth(-8, 12, sc.elev),
    low = 1 - skySmooth(4, 22, sc.elev),
    lit = L.col ? skyMix([60, 68, 84], L.col, 0.25 + 0.75 * skySmooth(-8, 18, sc.elev)) : skyMix(skyMix([62, 72, 98], [255, 255, 255], day), [255, 190, 140], low * day * 0.8),
    dull = 1 - 0.6 * p.dark * L.dull,
    shadeK = skyMix([0.6, 0.66, 0.78], [0.5, 0.56, 0.68], p.dark),
    amp = L.amp * (L.fixed === undefined ? p.amp : 1),
    wind = SKYS.t * p.wind * L.speed + L.seed,
    f = SKYS.flash * 150,
    top = (p.cover > 0.95 ? 0.97 : 0.9) * L.alpha;
  for (var y = 0; y < ch; y++)
    for (var x = 0; x < cw; x++) {
      var nx = (x / cw) * L.scale + wind,
        ny = (y / cw) * L.scale * L.sy,
        den = skyFbm(nx, ny),
        a = skySmooth(th, th + 0.22, den),
        o = (y * cw + x) * 4;
      if (a <= 0.004) {
        d[o + 3] = 0;
        continue;
      }
      var dx = sun.x - x,
        dy = sun.y - y,
        len = Math.sqrt(dx * dx + dy * dy) || 1,
        toward = skyFbm(nx + (dx / len) * 0.22, ny + (dy / len) * 0.22 * L.sy),
        sh = skyClamp(0.45 + (toward - den) * amp - (1 - a) * 0.25, 0, 1);
      d[o] = skyClamp(lit[0] * dull * (1 - sh * (1 - shadeK[0])) + f, 0, 255);
      d[o + 1] = skyClamp(lit[1] * dull * (1 - sh * (1 - shadeK[1])) + f, 0, 255);
      d[o + 2] = skyClamp(lit[2] * dull * (1 - sh * (1 - shadeK[2])) + f, 0, 255);
      d[o + 3] = a * top * 255;
    }
  S.cv.getContext("2d").putImageData(S.id, 0, 0);
  return S.cv;
}

function skyStars(w, h) {
  var n = Math.round((w * h) / 2600);
  SKYS.stars = [];
  for (var i = 0; i < n; i++)
    SKYS.stars.push({ x: Math.random() * w, y: Math.random() * h * 0.8, r: 0.4 + Math.random() * 0.9, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6 });
}

function skyDrop(w, h, any) {
  var z = Math.random();
  return { x: Math.random() * (w + 80), y: any ? Math.random() * h : -20, z: z };
}

function skyParts(p, w, h) {
  var n = Math.round(((w * h) / 520) * (p.rain ? 0.4 + 0.6 * p.rain : 0)) + Math.round(((w * h) / 2600) * (p.snow ? 0.4 + 0.8 * p.snow : 0));
  SKYS.parts = [];
  for (var i = 0; i < n; i++) SKYS.parts.push(skyDrop(w, h, true));
}

function skyMotes(w, h) {
  SKYS.motes = [];
  for (var i = 0; i < 26; i++)
    SKYS.motes.push({ x: Math.random() * w, y: Math.random() * h, r: 0.5 + Math.random() * 1.1, sp: 2 + Math.random() * 5, ph: Math.random() * 6.28, tw: 0.4 + Math.random() * 1.2 });
}

/* The sun: a corona, a bright yellow disc, and two sets of tapered rays that turn in opposite directions while each ray grows and shrinks on its own beat. */
function skySunDraw(g, sun, h, vis, warm) {
  var core = skyMix([255, 244, 190], [255, 170, 80], warm),
    corona = skyMix([255, 206, 90], [255, 120, 50], warm),
    r0 = Math.max(7, h * 0.085),
    bloom = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, h * 1.7);
  bloom.addColorStop(0, skyRgb(corona, 0.42 * vis));
  bloom.addColorStop(0.3, skyRgb(corona, 0.15 * vis));
  bloom.addColorStop(1, skyRgb(corona, 0));
  g.fillStyle = bloom;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  [
    { n: 14, dir: 1, speed: 0.07, reach: 1.9, half: 0.062, a: 0.5 },
    { n: 9, dir: -1, speed: 0.05, reach: 1.35, half: 0.04, a: 0.4 },
  ].forEach(function (set, si) {
    for (var i = 0; i < set.n; i++) {
      var ang = SKYS.t * set.speed * set.dir + (i * 6.2832) / set.n + si * 0.2,
        pulse = 0.5 + 0.5 * Math.sin(SKYS.t * (0.55 + 0.11 * i) + i * 1.9),
        len = h * set.reach * (0.3 + 0.7 * pulse),
        tx = sun.x + Math.cos(ang) * len,
        ty = sun.y + Math.sin(ang) * len,
        rg = g.createLinearGradient(sun.x, sun.y, tx, ty);
      rg.addColorStop(0, skyRgb(core, set.a * vis * (0.55 + 0.45 * pulse)));
      rg.addColorStop(1, skyRgb(corona, 0));
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(sun.x + Math.cos(ang - set.half) * r0, sun.y + Math.sin(ang - set.half) * r0);
      g.lineTo(tx, ty);
      g.lineTo(sun.x + Math.cos(ang + set.half) * r0, sun.y + Math.sin(ang + set.half) * r0);
      g.closePath();
      g.fill();
    }
  });
  var pulseAll = 0.92 + 0.08 * Math.sin(SKYS.t * 1.3),
    glow = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, h * 0.45 * pulseAll);
  glow.addColorStop(0, skyRgb([255, 255, 240], 0.95 * vis));
  glow.addColorStop(0.25, skyRgb(core, 0.7 * vis));
  glow.addColorStop(1, skyRgb(corona, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.fillStyle = skyRgb([255, 252, 228], vis);
  g.beginPath();
  g.arc(sun.x, sun.y, r0, 0, 6.2832);
  g.fill();
}

/* Dust in the light, drifting slowly and catching it. */
function skyMoteDraw(g, sun, w, h, amount, ds) {
  SKYS.motes.forEach(function (m) {
    m.x += Math.sin(SKYS.t * 0.2 + m.ph) * m.sp * ds;
    m.y -= m.sp * 0.3 * ds;
    if (m.y < -4) {
      m.y = h + 4;
      m.x = Math.random() * w;
    }
    var near = 1 - skyClamp(Math.sqrt((m.x - sun.x) * (m.x - sun.x) + (m.y - sun.y) * (m.y - sun.y)) / (h * 2.4), 0, 1),
      a = amount * near * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(SKYS.t * m.tw + m.ph))) * 0.5;
    g.fillStyle = "rgba(255,244,214," + a + ")";
    g.beginPath();
    g.arc(m.x, m.y, m.r, 0, 6.2832);
    g.fill();
  });
}

/* A meteor now and then on a clear night. */
function skyShooting(g, w, h, ds, amount) {
  SKYS.shootAt -= ds;
  if (!SKYS.shoot && SKYS.shootAt <= 0 && amount > 0.5) {
    var ang = 0.35 + Math.random() * 0.3;
    SKYS.shoot = { x: w * (0.1 + Math.random() * 0.6), y: Math.random() * h * 0.35, vx: Math.cos(ang) * 330, vy: Math.sin(ang) * 330, life: 0 };
    SKYS.shootAt = 7 + Math.random() * 14;
  }
  var m = SKYS.shoot;
  if (!m) return;
  m.life += ds;
  m.x += m.vx * ds;
  m.y += m.vy * ds;
  var a = Math.max(0, 1 - m.life / 0.9) * amount,
    tx = m.x - m.vx * 0.12,
    ty = m.y - m.vy * 0.12,
    sg = g.createLinearGradient(m.x, m.y, tx, ty);
  sg.addColorStop(0, "rgba(255,255,255," + a + ")");
  sg.addColorStop(1, "rgba(255,255,255,0)");
  g.strokeStyle = sg;
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(m.x, m.y);
  g.lineTo(tx, ty);
  g.stroke();
  if (a <= 0) SKYS.shoot = null;
}

/* Lightning forks: a path from a to b broken at its middle and pushed sideways, again and again, with branches that leave it downward. Fills out with lines of points, the main one first. */
function skyBoltPath(x0, y0, x1, y1, spread, out, width) {
  var pts = [
    [x0, y0],
    [x1, y1],
  ];
  for (var pass = 0; pass < 5; pass++) {
    var next = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1],
        b = pts[i];
      next.push([(a[0] + b[0]) / 2 + (Math.random() - 0.5) * spread, (a[1] + b[1]) / 2 + (Math.random() - 0.5) * spread * 0.4]);
      next.push(b);
    }
    pts = next;
    spread *= 0.55;
  }
  out.push({ pts: pts, w: width });
  if (width > 0.9)
    for (var k = 3; k < pts.length - 3; k += 4 + Math.floor(Math.random() * 6))
      if (Math.random() < 0.55) {
        var q = pts[k],
          dir = Math.random() < 0.5 ? -1 : 1;
        skyBoltPath(q[0], q[1], q[0] + dir * (14 + Math.random() * 40), q[1] + (y1 - q[1]) * (0.5 + Math.random() * 0.6), 16, out, width * 0.5);
      }
}

/* A strike: a forked bolt that flickers (strong, gone, strong again, fading) over about a third of a second and lights the cloud. */
function skyStrike(w, h) {
  var x = w * (0.28 + Math.random() * 0.68),
    lines = [];
  skyBoltPath(x, -6, x + (Math.random() - 0.5) * 60, h + 4, 34, lines, 2.4);
  return { lines: lines, x: x, age: 0 };
}

function skyStrikeLevel(age) {
  if (age < 0.05) return 1;
  if (age < 0.1) return 0.2;
  if (age < 0.17) return 0.95;
  if (age < 0.3) return 0.6 * (1 - (age - 0.17) / 0.13);
  return 0;
}

function skyStrikes(g, w, h, ds, p) {
  SKYS.flash = 0;
  if (!p.flash) {
    SKYS.strikes = [];
    SKYS.sheet = null;
    return;
  }
  SKYS.strikeAt -= ds;
  if (SKYS.strikeAt <= 0) {
    SKYS.strikes.push(skyStrike(w, h));
    SKYS.strikeAt = Math.random() < 0.4 ? 0.12 + Math.random() * 0.25 : 2.5 + Math.random() * 5;
  }
  if (!SKYS.sheet && Math.random() < ds * 0.5) SKYS.sheet = { x: w * Math.random(), age: 0 };
  SKYS.strikes = SKYS.strikes.filter(function (s) {
    s.age += ds;
    s.lv = skyStrikeLevel(s.age);
    SKYS.flash = Math.max(SKYS.flash, s.lv);
    return s.age <= 0.3;
  });
  var sh = SKYS.sheet;
  if (sh) {
    sh.age += ds;
    var lvl = Math.max(0, Math.sin(sh.age * 22)) * (1 - sh.age / 0.45);
    if (sh.age > 0.45) SKYS.sheet = null;
    else if (lvl > 0.02) {
      var sg = g.createRadialGradient(sh.x, h * 0.2, 0, sh.x, h * 0.2, h * 1.2);
      sg.addColorStop(0, "rgba(190,205,250," + lvl * 0.4 + ")");
      sg.addColorStop(1, "rgba(190,205,250,0)");
      g.globalCompositeOperation = "lighter";
      g.fillStyle = sg;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over";
      SKYS.flash = Math.max(SKYS.flash, lvl * 0.5);
    }
  }
  /* The whole sky brightens first, then the bolts are drawn over it, white at the core with a blue glow. */
  if (SKYS.flash > 0) {
    g.fillStyle = "rgba(225,232,255," + SKYS.flash * 0.2 + ")";
    g.fillRect(0, 0, w, h);
  }
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  SKYS.strikes.forEach(function (s) {
    if (s.lv <= 0.01) return;
    var gl = g.createRadialGradient(s.x, 0, 0, s.x, 0, h * 1.5);
    gl.addColorStop(0, "rgba(200,215,255," + s.lv * 0.5 + ")");
    gl.addColorStop(1, "rgba(200,215,255,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = gl;
    g.fillRect(0, 0, w, h);
    s.lines.forEach(function (l) {
      [
        [l.w * 5, "120,160,255", 0.3, 0],
        [l.w * 1.8, "210,225,255", 0.9, 10],
        [l.w * 0.8, "255,255,255", 1, 0],
      ].forEach(function (pass) {
        g.strokeStyle = "rgba(" + pass[1] + "," + Math.min(1, s.lv * pass[2]) + ")";
        g.lineWidth = pass[0];
        g.shadowColor = "rgba(140,180,255," + s.lv + ")";
        g.shadowBlur = pass[3] * 1.6;
        g.beginPath();
        l.pts.forEach(function (q, i) {
          if (i) g.lineTo(q[0], q[1]);
          else g.moveTo(q[0], q[1]);
        });
        g.stroke();
      });
    });
    g.globalCompositeOperation = "source-over";
  });
  g.restore();
}

/* The buttons and chips of the header as rounded shapes (a stadium: two half circles and a straight middle, a circle when it is as wide as it is high), in the canvas's own coordinates. */
function skyObstacles() {
  var hd = SKYS.hd,
    out = [];
  if (!hd) return out;
  var hr = hd.getBoundingClientRect();
  [].forEach.call(hd.querySelectorAll(".rnd, .hchip"), function (el) {
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || getComputedStyle(el).display === "none") return;
    out.push({ cx: r.left - hr.left + r.width / 2, cy: r.top - hr.top + r.height / 2, w: r.width, h: r.height, r: Math.min(r.width, r.height) / 2 });
  });
  return out;
}

function skyInside(o, x, y) {
  var dx = Math.max(0, Math.abs(x - o.cx) - (o.w / 2 - o.r)),
    dy = y - o.cy;
  return dx * dx + dy * dy <= o.r * o.r;
}

/* Half the width of the shape at a height: the straight middle plus the circle's chord. */
function skyHalfWidth(o, y) {
  var dy = y - o.cy;
  return o.w / 2 - o.r + Math.sqrt(Math.max(0, o.r * o.r - dy * dy));
}

/* A drop that has landed on a control: a small burst of spray, and often a bead that runs down the surface (slowly, in fits, bending round the curve of a button) and falls from its lowest point. */
function skyLand(o, x, y, rain) {
  var spray = [];
  for (var i = 0; i < 5; i++) spray.push({ x: x, y: y, vx: (Math.random() - 0.5) * 70, vy: -(30 + Math.random() * 60) });
  SKYS.bursts.push({ parts: spray, age: 0 });
  if (SKYS.runners.length < 36 && Math.random() < 0.3 + 0.35 * rain) {
    var hw = skyHalfWidth(o, y) || 1;
    SKYS.runners.push({ o: o, f: skyClamp((x - o.cx) / hw, -0.92, 0.92), x: x, y: y, v: 6, hang: 0, free: false, trail: [], ph: Math.random() * 6.28, size: 1.5 + Math.random() * 1.4 });
  }
}

function skyDrawTop(ds) {
  var cv = SKYS.top;
  if (!cv) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2),
    w = SKYS.w,
    h = SKYS.h;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  SKYS.bursts = SKYS.bursts.filter(function (b) {
    b.age += ds;
    if (b.age > 0.4) return false;
    g.fillStyle = "rgba(225,238,255," + (1 - b.age / 0.4) * 0.7 + ")";
    b.parts.forEach(function (q) {
      q.vy += 420 * ds;
      q.x += q.vx * ds;
      q.y += q.vy * ds;
      g.beginPath();
      g.arc(q.x, q.y, 0.8, 0, 6.2832);
      g.fill();
    });
    return true;
  });
  SKYS.runners = SKYS.runners.filter(function (r) {
    var o = r.o;
    if (!r.free) {
      if (r.hang > 0) {
        r.hang -= ds;
        if (r.hang <= 0) r.free = true;
      } else {
        r.v += (40 + 30 * Math.random()) * ds;
        var sticky = Math.sin(SKYS.t * 6 + r.ph) > 0.55 ? 0.12 : 1;
        r.y += r.v * sticky * ds;
        if (r.y >= o.cy + o.r - 1) {
          r.y = o.cy + o.r - 1;
          r.hang = 0.2 + Math.random() * 0.2;
          r.v = 0;
        }
        r.x = o.cx + r.f * skyHalfWidth(o, r.y);
      }
    } else {
      r.v += 760 * ds;
      r.y += r.v * ds;
    }
    r.trail.push([r.x, r.y]);
    if (r.trail.length > (r.free ? 4 : 16)) r.trail.shift();
    if (r.y > h + 8) return false;
    var n = r.trail.length;
    g.lineCap = "round";
    for (var i = 1; i < n; i++) {
      g.strokeStyle = "rgba(235,244,255," + (i / n) * (r.free ? 0.15 : 0.3) + ")";
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(r.trail[i - 1][0], r.trail[i - 1][1]);
      g.lineTo(r.trail[i][0], r.trail[i][1]);
      g.stroke();
    }
    var rad = r.size * (r.free ? 0.8 : 1) * (r.hang > 0 ? 1.25 : 1),
      stretch = r.free ? 1 + Math.min(r.v / 500, 1.4) : 1;
    g.save();
    g.translate(r.x, r.y);
    g.scale(1, stretch);
    var bead = g.createRadialGradient(-rad * 0.3, -rad * 0.4, 0, 0, 0, rad);
    bead.addColorStop(0, "rgba(255,255,255,.95)");
    bead.addColorStop(0.45, "rgba(214,230,255,.45)");
    bead.addColorStop(1, "rgba(170,195,235,.28)");
    g.fillStyle = bead;
    g.beginPath();
    g.arc(0, 0, rad, 0, 6.2832);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.lineWidth = 0.6;
    g.stroke();
    g.restore();
    return true;
  });
}

function skyDraw() {
  var cv = SKYS.cv,
    sc = SKYS.scene;
  if (!cv || !sc) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2),
    w = cv.clientWidth,
    h = cv.clientHeight;
  if (!w || !h) return;
  var p = sc.p;
  if (w !== SKYS.w || h !== SKYS.h || SKYS.key !== sc.key) {
    SKYS.w = w;
    SKYS.h = h;
    SKYS.key = sc.key;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    skyStars(w, h);
    skyMotes(w, h);
    skyParts(p, w, h);
    SKYS.runners = [];
    SKYS.bursts = [];
    SKYS.strikes = [];
    SKYS.obstacleAt = 0;
  }
  var g = cv.getContext("2d"),
    cols = skyColours(sc.elev, p),
    ds = skyClamp(SKYS.dt || 0, 0, 0.05);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, skyRgb(cols[0], 1));
  gr.addColorStop(1, skyRgb(cols[1], 1));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);

  var night = skySmooth(-2, -9, sc.elev),
    veil = 1 - Math.min(1, (p.cover + p.haze) * 1.1);
  if (night > 0.02 && veil > 0.05) {
    SKYS.stars.forEach(function (s) {
      var tw = 0.6 + 0.4 * Math.sin(SKYS.t * s.sp + s.ph);
      g.fillStyle = "rgba(255,255,255," + night * veil * tw * 0.85 + ")";
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, 6.2832);
      g.fill();
    });
  }
  skyShooting(g, w, h, ds, night * veil);

  var sun = skySun(sc, w, h);
  g.globalCompositeOperation = "lighter";
  if (sc.elev > -5) {
    var vis = skySmooth(-5, 3, sc.elev) * (1 - 0.9 * p.cover * p.cover) * (1 - 0.65 * p.haze);
    skySunDraw(g, sun, h, vis, 1 - skySmooth(3, 28, sc.elev));
  }
  g.globalCompositeOperation = "source-over";
  if (sc.elev < -2) {
    var mv = skySmooth(-2, -8, sc.elev) * (1 - p.cover * 0.8) * (1 - p.haze * 0.7),
      mx = w * 0.62,
      my = h * 0.34,
      m1 = g.createRadialGradient(mx, my, 0, mx, my, h * 0.6);
    m1.addColorStop(0, "rgba(170,190,240," + 0.2 * mv + ")");
    m1.addColorStop(1, "rgba(170,190,240,0)");
    g.fillStyle = m1;
    g.fillRect(0, 0, w, h);
    var m2 = g.createRadialGradient(mx - 3, my - 3, 1, mx, my, 11);
    m2.addColorStop(0, "rgba(246,247,250," + mv + ")");
    m2.addColorStop(1, "rgba(196,204,222," + mv + ")");
    g.fillStyle = m2;
    g.beginPath();
    g.arc(mx, my, 11, 0, 6.2832);
    g.fill();
    g.fillStyle = "rgba(150,160,185," + 0.35 * mv + ")";
    [
      [-3, -2, 3],
      [3, 3, 2.4],
      [2, -5, 1.6],
      [-5, 4, 1.8],
    ].forEach(function (c) {
      g.beginPath();
      g.arc(mx + c[0], my + c[1], c[2], 0, 6.2832);
      g.fill();
    });
  }

  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  if (p.haze) {
    SKYFOG.forEach(function (L, i) {
      g.drawImage(skyCloudLayer(2 + i, L, sc, p, w, h), 0, 0, w, h);
    });
    var breathe = 0.5 + 0.5 * Math.sin(SKYS.t * 0.15),
      hz = g.createLinearGradient(0, 0, 0, h);
    hz.addColorStop(0, "rgba(200,206,213," + (0.18 + 0.08 * breathe) + ")");
    hz.addColorStop(1, "rgba(214,219,224," + (0.62 + 0.1 * breathe) + ")");
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
  } else if (p.cover > 0.02)
    SKYLAYERS.forEach(function (L, i) {
      g.drawImage(skyCloudLayer(i, L, sc, p, w, h), 0, 0, w, h);
    });
  var motes = skySmooth(2, 12, sc.elev) * (1 - skySmooth(0.5, 0.95, p.cover)) * (p.rain || p.snow || p.haze ? 0 : 1);
  if (motes > 0.02) {
    g.globalCompositeOperation = "lighter";
    skyMoteDraw(g, sun, w, h, motes, ds);
    g.globalCompositeOperation = "source-over";
  }

  var bright = 0.55 + 0.45 * skySmooth(-4, 20, sc.elev);
  g.lineCap = "round";
  var gust = Math.max(0, Math.sin(SKYS.t * 0.23) * Math.sin(SKYS.t * 0.57)),
    wind = 0.2 + 0.08 * Math.sin(SKYS.t * 0.3) + gust * 0.3;
  if (SKYS.t >= SKYS.obstacleAt) {
    SKYS.obstacles = skyObstacles();
    SKYS.obstacleAt = SKYS.t + 0.5;
  }
  SKYS.parts.forEach(function (d, i) {
    if (d.k === undefined) d.k = p.snow && (!p.rain || Math.random() < 0.5) ? 1 : 0;
    if (d.k === 1) {
      d.y += (20 + d.z * 38) * ds;
      d.x += Math.sin(SKYS.t * (0.6 + d.z) + i) * 14 * ds - (3 + gust * 46) * ds;
      if (d.y > h + 6 || d.x < -8) {
        SKYS.parts[i] = d = skyDrop(w, h, false);
        d.k = 1;
      }
      g.fillStyle = "rgba(255,255,255," + (0.3 + d.z * 0.6) * bright + ")";
      g.beginPath();
      g.arc(d.x, d.y, 0.7 + d.z * 2.2, 0, 6.2832);
      g.fill();
      return;
    }
    var v = 380 + d.z * 640,
      len = 7 + d.z * 15,
      ox = d.x,
      oy = d.y;
    d.y += v * ds;
    d.x -= v * ds * wind;
    var hit = null;
    if (d.z > 0.3) {
      var steps = Math.ceil(Math.abs(d.y - oy) / 6);
      for (var s = 1; s <= steps && !hit; s++)
        for (var j = 0; j < SKYS.obstacles.length; j++) {
          var o = SKYS.obstacles[j],
            tx = ox + ((d.x - ox) * s) / steps,
            ty = oy + ((d.y - oy) * s) / steps;
          if (skyInside(o, tx, ty)) {
            hit = [o, tx, ty];
            break;
          }
        }
    }
    if (hit) skyLand(hit[0], hit[1], hit[2], p.rain);
    if (hit || d.y > h + 4 || d.x < -20) {
      if (!hit && d.z > 0.45 && SKYS.splashes.length < 60 && d.x > 0 && d.x < w) SKYS.splashes.push({ x: d.x, y: h - 1 - Math.random() * 3, age: 0 });
      SKYS.parts[i] = d = skyDrop(w, h, false);
      d.k = 0;
    }
    g.strokeStyle = "rgba(208,222,246," + (0.18 + d.z * 0.42) * bright + ")";
    g.lineWidth = 0.6 + d.z * 0.9;
    g.beginPath();
    g.moveTo(d.x, d.y);
    g.lineTo(d.x + len * wind, d.y - len);
    g.stroke();
  });
  if (p.rain) {
    var mist = g.createLinearGradient(0, h * 0.6, 0, h);
    mist.addColorStop(0, "rgba(190,200,215,0)");
    mist.addColorStop(1, "rgba(190,200,215," + 0.16 * p.rain * bright + ")");
    g.fillStyle = mist;
    g.fillRect(0, h * 0.6, w, h * 0.4);
  }
  SKYS.splashes = SKYS.splashes.filter(function (sp) {
    sp.age += ds;
    if (sp.age > 0.4) return false;
    var k = sp.age / 0.4;
    g.strokeStyle = "rgba(208,222,246," + (1 - k) * 0.4 * bright + ")";
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(sp.x, sp.y, 1 + k * 6, 0.5 + k * 1.6, 0, 0, 6.2832);
    g.stroke();
    return true;
  });
  skyStrikes(g, w, h, ds, p);
  skyDrawTop(ds);
}

function skyFrame(now) {
  var cv = SKYS.cv;
  if (!cv || !cv.isConnected) {
    SKYS.raf = 0;
    return;
  }
  if (now - SKYS.last >= 32) {
    SKYS.dt = SKYS.last ? Math.min((now - SKYS.last) / 1000, 0.1) : 0;
    SKYS.last = now;
    SKYS.t += SKYS.dt;
    skyDraw();
  }
  SKYS.raf = requestAnimationFrame(skyFrame);
}

function skyStop() {
  if (SKYS.raf) cancelAnimationFrame(SKYS.raf);
  SKYS.raf = 0;
  SKYS.cv = null;
  SKYS.runners = [];
  SKYS.bursts = [];
  if (SKYS.top) SKYS.top.remove();
  SKYS.top = null;
}

/* Shows the sky for a scene { kind, heavy, fast, elev } on the layer: it moves while the page is shown, and stands still with reduced motion. */
function skyShow(layer, scene) {
  var cv = layer.querySelector("canvas");
  if (!cv) {
    cv = document.createElement("canvas");
    layer.appendChild(cv);
  }
  var hd = layer.parentNode;
  SKYS.hd = hd;
  if (!SKYS.top || !SKYS.top.isConnected) {
    SKYS.top = document.createElement("canvas");
    SKYS.top.className = "hskytop";
    hd.appendChild(SKYS.top);
  }
  var p = skyParams(scene.kind, scene.heavy, scene.fast);
  SKYS.scene = { p: p, elev: scene.elev, key: scene.kind + (scene.heavy ? "h" : "") + (scene.fast ? "f" : "") };
  SKYS.cv = cv;
  /* The brighter the sky, the stronger the scrim behind the text. */
  var cols = skyColours(scene.elev, p),
    lum = (cols[0][0] + cols[0][1] + cols[0][2] + cols[1][0] + cols[1][1] + cols[1][2]) / (6 * 255);
  layer.style.setProperty("--scrim", (0.04 + 0.24 * skyClamp(lum * 1.4, 0, 1)).toFixed(2));
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) {
    if (SKYS.raf) cancelAnimationFrame(SKYS.raf);
    SKYS.raf = 0;
    skyDraw();
  } else if (!SKYS.raf) {
    SKYS.last = 0;
    SKYS.raf = requestAnimationFrame(skyFrame);
  }
}
