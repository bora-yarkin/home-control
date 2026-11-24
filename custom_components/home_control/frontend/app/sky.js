/* The sky behind the header, drawn on a canvas from the weather and the height of the sun. Nothing in it is a picture: the colours follow the sun's elevation, the clouds are noise that drifts with the wind and is lit from the side the sun is on, and rain, snow, stars and lightning are particles. */

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

var SKYS = { cv: null, raf: 0, last: 0, t: 0, dt: 0, scene: null, w: 0, h: 0, layers: [], parts: [], stars: [], motes: [], splashes: [], shoot: null, shootAt: 5, bolt: null, flash: 0, flashAt: 3, flicker: 0 };

/* The two cloud layers: the far one is smaller, slower and fainter, the near one is larger and faster, so the clouds have depth. */
var SKYLAYERS = [
  { scale: 9, speed: 0.4, seed: 17.3, cover: 0.85, alpha: 0.6, dull: 0.55 },
  { scale: 5, speed: 1, seed: 0, cover: 1, alpha: 1, dull: 1 },
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

/* What a kind of weather does to the sky: how much cloud, how dark, what falls, how fast the wind moves it. */
function skyParams(kind, heavy, fast) {
  var p = { cover: 0, dark: 0, rain: 0, snow: 0, haze: 0, flash: false, wind: 0.012 };
  if (kind === "partly") p.cover = 0.45;
  else if (kind === "cloudy") {
    p.cover = 0.88;
    p.dark = heavy ? 0.5 : 0.15;
  } else if (kind === "rain") {
    p.cover = 0.94;
    p.dark = heavy ? 0.7 : 0.45;
    p.rain = heavy ? 1 : 0.55;
  } else if (kind === "storm") {
    p.cover = 1;
    p.dark = 0.8;
    p.rain = 1;
    p.flash = true;
  } else if (kind === "snow") {
    p.cover = 0.9;
    p.dark = 0.1;
    p.snow = heavy ? 1 : 0.55;
  } else if (kind === "fog") {
    p.cover = 0.8;
    p.haze = 1;
  } else if (fast) p.cover = 0.18;
  if (fast) p.wind = 0.04;
  return p;
}

/* The sky's top and bottom colour for a sun this high, greyed by cloud and darkened by dull weather. */
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
    grey = Math.min(1, p.cover * 0.85);
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
  var e = sc.elev,
    x = w * 0.62;
  return { x: x, y: h * (0.86 - (skyClamp(e, 0, 50) / 50) * 0.56), e: e };
}

/* One layer of clouds: noise above a threshold set by the cover, each point lit or shaded by whether more cloud lies toward the sun, and tinted by the light of the hour. */
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
    th = 0.8 - skyClamp(p.cover * L.cover, 0, 1) * 0.52,
    day = skySmooth(-8, 12, sc.elev),
    low = 1 - skySmooth(4, 22, sc.elev),
    lit = skyMix(skyMix([62, 72, 98], [255, 255, 255], day), [255, 190, 140], low * day * 0.8),
    dull = 1 - 0.6 * p.dark * L.dull,
    shadeK = skyMix([0.6, 0.66, 0.78], [0.5, 0.56, 0.68], p.dark),
    wind = SKYS.t * p.wind * L.speed + L.seed,
    f = SKYS.flash * 150,
    top = (p.cover > 0.95 ? 0.97 : 0.9) * L.alpha;
  for (var y = 0; y < ch; y++)
    for (var x = 0; x < cw; x++) {
      var nx = (x / cw) * L.scale + wind,
        ny = (y / cw) * L.scale,
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
        toward = skyFbm(nx + (dx / len) * 0.22, ny + (dy / len) * 0.22),
        sh = skyClamp(0.45 + (toward - den) * 3.2 - (1 - a) * 0.25, 0, 1);
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

/* Soft beams of light fanning down from the sun through the gaps in the cloud. They stay where they are and swell and fade, each on its own beat. */
function skyBeams(g, sun, w, h, p, sc) {
  var day = skySmooth(-2, 8, sc.elev),
    amount = day * skySmooth(0.2, 0.5, p.cover) * (1 - skySmooth(0.9, 1, p.cover)) * (p.rain || p.snow ? 0 : 1);
  if (amount < 0.02) return;
  var warm = 1 - skySmooth(3, 28, sc.elev),
    col = skyMix([255, 244, 214], [255, 184, 120], warm);
  for (var k = 0; k < 7; k++) {
    var ang = Math.PI / 2 + (k - 3) * 0.2 + Math.sin(SKYS.t * 0.07 + k * 2.1) * 0.025,
      spread = 0.045 + 0.02 * ((k * 5) % 3),
      beat = 0.5 + 0.5 * Math.sin(SKYS.t * (0.16 + 0.03 * k) + k * 1.7),
      len = h * 2.2,
      x1 = sun.x + Math.cos(ang - spread) * len,
      y1 = sun.y + Math.sin(ang - spread) * len,
      x2 = sun.x + Math.cos(ang + spread) * len,
      y2 = sun.y + Math.sin(ang + spread) * len,
      bg = g.createLinearGradient(sun.x, sun.y, (x1 + x2) / 2, (y1 + y2) / 2);
    bg.addColorStop(0, skyRgb(col, 0.22 * amount * beat));
    bg.addColorStop(1, skyRgb(col, 0));
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(sun.x, sun.y);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.closePath();
    g.fill();
  }
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

/* A jagged bolt from the cloud to the bottom of the header, with a branch. */
function skyMakeBolt(w, h) {
  var pts = [],
    x = w * (0.3 + Math.random() * 0.6),
    y = 0;
  while (y < h) {
    pts.push([x, y]);
    y += 8 + Math.random() * 14;
    x += (Math.random() - 0.5) * 22;
  }
  pts.push([x, h]);
  var at = Math.floor(pts.length * (0.3 + Math.random() * 0.3)),
    br = [pts[at]],
    bx = pts[at][0],
    by = pts[at][1],
    dir = Math.random() < 0.5 ? -1 : 1;
  while (by < h) {
    by += 8 + Math.random() * 10;
    bx += dir * (4 + Math.random() * 12);
    br.push([bx, by]);
  }
  return [pts, br];
}

function skyBoltDraw(g, bolt, a) {
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = "rgba(190,210,255," + a + ")";
  g.shadowBlur = 14;
  bolt.forEach(function (line, i) {
    g.strokeStyle = "rgba(240,246,255," + a * (i ? 0.6 : 1) + ")";
    g.lineWidth = i ? 1 : 1.8;
    g.beginPath();
    line.forEach(function (q, j) {
      if (j) g.lineTo(q[0], q[1]);
      else g.moveTo(q[0], q[1]);
    });
    g.stroke();
  });
  g.restore();
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
  }
  var g = cv.getContext("2d"),
    cols = skyColours(sc.elev, p),
    dt = SKYS.dt || 0;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, skyRgb(cols[0], 1));
  gr.addColorStop(1, skyRgb(cols[1], 1));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);

  var night = skySmooth(-2, -9, sc.elev),
    veil = 1 - Math.min(1, p.cover * 1.1);
  if (night > 0.02 && veil > 0.05) {
    SKYS.stars.forEach(function (s) {
      var tw = 0.6 + 0.4 * Math.sin(SKYS.t * s.sp + s.ph);
      g.fillStyle = "rgba(255,255,255," + night * veil * tw * 0.85 + ")";
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, 6.2832);
      g.fill();
    });
  }
  var ds = skyClamp(dt, 0, 0.05);
  skyShooting(g, w, h, ds, night * veil);
  g.globalCompositeOperation = "lighter";
  var sun = skySun(sc, w, h),
    atmos = 1 - 0.45 * p.cover * (1 - p.haze * 0.3);
  if (sc.elev > -5) {
    var vis = skySmooth(-5, 3, sc.elev) * atmos,
      warm = 1 - skySmooth(3, 28, sc.elev),
      core = skyMix([255, 246, 220], [255, 190, 120], warm),
      halo = skyMix([255, 214, 140], [255, 130, 70], warm),
      r1 = h * 1.5,
      a1 = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, r1);
    a1.addColorStop(0, skyRgb(halo, 0.38 * vis));
    a1.addColorStop(0.25, skyRgb(halo, 0.14 * vis));
    a1.addColorStop(1, skyRgb(halo, 0));
    g.fillStyle = a1;
    g.fillRect(0, 0, w, h);
    var a2 = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, h * 0.34);
    a2.addColorStop(0, skyRgb(core, 0.95 * vis));
    a2.addColorStop(0.18, skyRgb(core, 0.7 * vis));
    a2.addColorStop(1, skyRgb(core, 0));
    g.fillStyle = a2;
    g.fillRect(0, 0, w, h);
  }
  if (sc.elev < -2) {
    var mv = skySmooth(-2, -8, sc.elev) * (1 - p.cover * 0.8),
      mx = w * 0.62,
      my = h * 0.34,
      m1 = g.createRadialGradient(mx, my, 0, mx, my, h * 0.7);
    m1.addColorStop(0, "rgba(180,200,255," + 0.28 * mv + ")");
    m1.addColorStop(1, "rgba(180,200,255,0)");
    g.fillStyle = m1;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
    var m2 = g.createRadialGradient(mx - 2, my - 2, 1, mx, my, 11);
    m2.addColorStop(0, "rgba(255,255,248," + mv + ")");
    m2.addColorStop(1, "rgba(214,222,240," + mv + ")");
    g.fillStyle = m2;
    g.beginPath();
    g.arc(mx, my, 11, 0, 6.2832);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";

  if (p.cover > 0.02) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    SKYLAYERS.forEach(function (L, i) {
      g.drawImage(skyCloudLayer(i, L, sc, p, w, h), 0, 0, w, h);
    });
  }
  g.globalCompositeOperation = "lighter";
  skyBeams(g, sun, w, h, p, sc);
  var motes = skySmooth(2, 12, sc.elev) * (1 - skySmooth(0.5, 0.95, p.cover)) * (p.rain || p.snow ? 0 : 1);
  if (motes > 0.02) skyMoteDraw(g, sun, w, h, motes, ds);
  g.globalCompositeOperation = "source-over";
  if (p.haze) {
    var hz = g.createLinearGradient(0, 0, 0, h),
      drift = 0.5 + 0.5 * Math.sin(SKYS.t * 0.12);
    hz.addColorStop(0, "rgba(150,158,168," + (0.22 + 0.1 * drift) + ")");
    hz.addColorStop(0.6, "rgba(158,166,176," + (0.42 + 0.1 * drift) + ")");
    hz.addColorStop(1, "rgba(166,174,183,0.6)");
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
  }

  var bright = 0.55 + 0.45 * skySmooth(-4, 20, sc.elev);
  g.lineCap = "round";
  var gust = Math.max(0, Math.sin(SKYS.t * 0.23) * Math.sin(SKYS.t * 0.57)),
    wind = 0.2 + 0.08 * Math.sin(SKYS.t * 0.3) + gust * 0.3;
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
      len = 7 + d.z * 15;
    d.y += v * ds;
    d.x -= v * ds * wind;
    if (d.y > h + 4 || d.x < -20) {
      if (d.z > 0.45 && SKYS.splashes.length < 60 && d.x > 0 && d.x < w) SKYS.splashes.push({ x: d.x, y: h - 1 - Math.random() * 3, age: 0 });
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
  if (SKYS.bolt && SKYS.flash > 0.12) skyBoltDraw(g, SKYS.bolt, Math.min(1, SKYS.flash * 1.4));
  if (SKYS.flash > 0) {
    g.fillStyle = "rgba(225,232,255," + SKYS.flash * 0.3 + ")";
    g.fillRect(0, 0, w, h);
  }
}

/* Lightning: a bright flash and a quick second one, at random times a few seconds apart. */
function skyFlash(dt) {
  if (!SKYS.scene.p.flash) {
    SKYS.flash = 0;
    return;
  }
  SKYS.flashAt -= dt;
  if (SKYS.flashAt <= 0) {
    SKYS.flash = 1;
    SKYS.bolt = skyMakeBolt(SKYS.w || 400, SKYS.h || 100);
    SKYS.flicker = Math.random() < 0.6 ? 0.18 : 0;
    SKYS.flashAt = 4 + Math.random() * 9;
  } else if (SKYS.flicker > 0 && SKYS.flash < 0.35) {
    SKYS.flicker -= dt;
    if (SKYS.flicker <= 0) SKYS.flash = 0.8;
  }
  SKYS.flash = Math.max(0, SKYS.flash - dt * 3.2);
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
    skyFlash(SKYS.dt);
    skyDraw();
  }
  SKYS.raf = requestAnimationFrame(skyFrame);
}

function skyStop() {
  if (SKYS.raf) cancelAnimationFrame(SKYS.raf);
  SKYS.raf = 0;
  SKYS.cv = null;
}

/* Shows the sky for a scene { kind, heavy, fast, elev } on the layer: it moves while the page is shown, and stands still with reduced motion. */
function skyShow(layer, scene) {
  var cv = layer.querySelector("canvas");
  if (!cv) {
    cv = document.createElement("canvas");
    layer.appendChild(cv);
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
