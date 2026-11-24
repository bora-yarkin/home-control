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

var SKYS = { cv: null, raf: 0, last: 0, t: 0, scene: null, w: 0, h: 0, cl: null, id: null, parts: [], stars: [], flash: 0, flashAt: 0, flicker: 0 };

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

/* The clouds: noise above a threshold set by the cover, each point lit or shaded by whether more cloud lies toward the sun, and tinted by the light of the hour. */
function skyClouds(sc, p, w, h) {
  var cw = 200,
    ch = Math.max(12, Math.round((cw * h) / w));
  if (!SKYS.cl || SKYS.cl.width !== cw || SKYS.cl.height !== ch) {
    SKYS.cl = document.createElement("canvas");
    SKYS.cl.width = cw;
    SKYS.cl.height = ch;
    SKYS.id = SKYS.cl.getContext("2d").createImageData(cw, ch);
  }
  var d = SKYS.id.data,
    sun = skySun(sc, cw, ch),
    th = 0.8 - p.cover * 0.52,
    day = skySmooth(-8, 12, sc.elev),
    low = 1 - skySmooth(4, 22, sc.elev),
    lit = skyMix(skyMix([62, 72, 98], [255, 255, 255], day), [255, 190, 140], low * day * 0.8),
    dull = 1 - 0.6 * p.dark,
    shadeK = skyMix([0.6, 0.66, 0.78], [0.5, 0.56, 0.68], p.dark),
    wind = SKYS.t * p.wind,
    f = SKYS.flash * 150,
    top = p.cover > 0.95 ? 0.97 : 0.9;
  for (var y = 0; y < ch; y++)
    for (var x = 0; x < cw; x++) {
      var nx = (x / cw) * 5 + wind,
        ny = (y / cw) * 5,
        den = skyFbm(nx, ny),
        a = skySmooth(th, th + 0.22, den);
      var o = (y * cw + x) * 4;
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
  SKYS.cl.getContext("2d").putImageData(SKYS.id, 0, 0);
  return SKYS.cl;
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
    g.drawImage(skyClouds(sc, p, w, h), 0, 0, w, h);
  }
  if (p.haze) {
    var hz = g.createLinearGradient(0, 0, 0, h);
    hz.addColorStop(0, "rgba(150,158,168,0.3)");
    hz.addColorStop(0.6, "rgba(158,166,176,0.5)");
    hz.addColorStop(1, "rgba(166,174,183,0.6)");
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
  }

  var bright = 0.55 + 0.45 * skySmooth(-4, 20, sc.elev);
  g.lineCap = "round";
  var wind = 0.22 + 0.1 * Math.sin(SKYS.t * 0.3),
    ds = skyClamp(dt, 0, 0.05);
  SKYS.parts.forEach(function (d, i) {
    if (d.k === undefined) d.k = p.snow && (!p.rain || Math.random() < 0.5) ? 1 : 0;
    if (d.k === 1) {
      d.y += (20 + d.z * 38) * ds;
      d.x += Math.sin(SKYS.t * (0.6 + d.z) + i) * 14 * ds - 3 * ds;
      if (d.y > h + 6) {
        SKYS.parts[i] = d = skyDrop(w, h, false);
        d.k = 1;
      }
      g.fillStyle = "rgba(255,255,255," + (0.35 + d.z * 0.55) * bright + ")";
      g.beginPath();
      g.arc(d.x, d.y, 0.8 + d.z * 1.9, 0, 6.2832);
      g.fill();
      return;
    }
    var v = 380 + d.z * 640,
      len = 7 + d.z * 15;
    d.y += v * ds;
    d.x -= v * ds * wind;
    if (d.y > h + 20 || d.x < -20) {
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
