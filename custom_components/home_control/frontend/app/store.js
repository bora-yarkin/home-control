/* The shared store: dashboard data kept in Home Assistant system data, loading, saving, migration. */

/* ---- shared store (presets + scenes), HA system data: readable by all users, writable by admins ---- */
var STORE_SCOPE = "system",
  STORE_KEY = "dashboard",
  STORE = { v: 1, presets: {}, saved: {}, scenes: [], eareas: [], notify: null },
  STORE_VER = 0,
  STORE_JSON = "",
  STORE_SAVED = 0,
  ISADMIN = false;

/* STORE_NET: the saved dashboard has been read from Home Assistant at least once (a copy kept on this device does not count). Until then a save is held,
 because it would write that older copy over what another device saved since. STORE_UNSAVED: the last save failed because the connection was down. */
var STORE_NET = false,
  STORE_HELD = false,
  STORE_UNSAVED = false,
  LAYOUT_CACHE = "home_control_layout_v1";

var QAICONS = [
  "scene",
  "moon",
  "leave",
  "movie",
  "power",
  "lights",
  "tv",
  "ac",
  "fan",
  "home",
  "sofa",
  "bed",
];

function cleanPreset(p) {
  if (!p || typeof p !== "object") return null;
  /* A light made of zones: the exact colour of each zone (x, y), and the hue and saturation to show it. */
  if (Array.isArray(p.z)) {
    var z = [];
    p.z.slice(0, 8).forEach(function (c) {
      if (
        c &&
        typeof c.x === "number" &&
        typeof c.y === "number" &&
        c.x >= 0 &&
        c.x <= 1 &&
        c.y >= 0 &&
        c.y <= 1
      )
        z.push({
          x: Math.round(c.x * 10000) / 10000,
          y: Math.round(c.y * 10000) / 10000,
          h: typeof c.h === "number" && c.h >= 0 && c.h <= 360 ? Math.round(c.h) : 0,
          s: typeof c.s === "number" && c.s >= 0 && c.s <= 100 ? Math.round(c.s) : 0,
        });
    });
    return z.length > 1 ? { z: z } : null;
  }
  if (typeof p.k === "number" && p.k >= 1000 && p.k <= 20000) return { k: Math.round(p.k) };
  if (
    typeof p.h === "number" &&
    typeof p.s === "number" &&
    p.h >= 0 &&
    p.h <= 360 &&
    p.s >= 0 &&
    p.s <= 100
  )
    return { h: Math.round(p.h), s: Math.round(p.s) };
  return null;
}

/* A palette colour of a live scene: {hs: [hue, saturation]}, {k: kelvin} or {xy: [x, y]}, and b (10 to 99) when dimmer than full. */
function cleanLiveColour(c) {
  if (!c || typeof c !== "object") return null;
  var o = null;
  if (Array.isArray(c.hs) && c.hs.length === 2 && typeof c.hs[0] === "number" && typeof c.hs[1] === "number") {
    if (c.hs[0] >= 0 && c.hs[0] <= 360 && c.hs[1] >= 0 && c.hs[1] <= 100)
      o = { hs: [Math.round(c.hs[0]), Math.round(c.hs[1])] };
  } else if (typeof c.k === "number") {
    if (c.k >= 1000 && c.k <= 20000) o = { k: Math.round(c.k) };
  } else if (Array.isArray(c.xy) && c.xy.length === 2 && typeof c.xy[0] === "number" && typeof c.xy[1] === "number") {
    if (c.xy[0] >= 0 && c.xy[0] <= 0.8 && c.xy[1] >= 0 && c.xy[1] <= 0.9)
      o = { xy: [Math.round(c.xy[0] * 10000) / 10000, Math.round(c.xy[1] * 10000) / 10000] };
  }
  if (o && typeof c.b === "number" && c.b >= 10 && c.b < 99.5) o.b = Math.round(c.b);
  return o;
}

function cleanLiveInt(v, lo, hi, def) {
  return typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def;
}

var LIVE_SRC = ["palette", "rainbow"],
  LIVE_FX = ["pulse", "flicker", "sparkle", "lightning"],
  LIVE_NATIVE = /^[a-z][a-z0-9_]{0,31}$/,
  LIVE_ALSO = ["light", "switch", "fan", "media_player", "climate", "humidifier", "input_boolean", "cover"];

/* Brightness effects of a scene or a light: up to 4, each a type, a speed (1 to 12) and a strength (1 to 100). */
function cleanLiveFx(list) {
  var out = [];
  (Array.isArray(list) ? list : []).slice(0, 16).forEach(function (f) {
    if (out.length >= 4 || !f || LIVE_FX.indexOf(f.type) < 0) return;
    out.push({ type: f.type, speed: cleanLiveInt(f.speed, 1, 12, 6), strength: cleanLiveInt(f.strength, 1, 100, 60) });
  });
  return out;
}

/* What single lights do differently: their own colours, brightness, brightness effects and the light's own effect. */
function cleanLiveLooks(m) {
  var out = {};
  if (!m || typeof m !== "object") return out;
  Object.keys(m)
    .slice(0, 32)
    .forEach(function (id) {
      var k = m[id];
      if (!/^light\.[a-z0-9_]{1,80}$/.test(id) || !k || typeof k !== "object") return;
      var o = {};
      if (Array.isArray(k.palette)) {
        var pal = [];
        k.palette.slice(0, 16).forEach(function (c) {
          var x = cleanLiveColour(c);
          if (x) pal.push(x);
        });
        if (pal.length) o.palette = pal;
      }
      if (typeof k.bri === "number") o.bri = cleanLiveInt(k.bri, 1, 100, 100);
      if (Array.isArray(k.fx)) o.fx = cleanLiveFx(k.fx);
      if (typeof k.native === "string" && LIVE_NATIVE.test(k.native)) o.native = k.native;
      if (Object.keys(o).length) out[id] = o;
    });
  return out;
}

/* Devices a scene switches when it starts: on or off, in a fixed list of domains. */
function cleanLiveAlso(list) {
  var out = [],
    seen = {};
  (Array.isArray(list) ? list : []).slice(0, 12).forEach(function (a) {
    if (!a || typeof a.id !== "string" || !/^[a-z_]+\.[a-z0-9_]+$/.test(a.id) || seen[a.id]) return;
    if (LIVE_ALSO.indexOf(a.id.split(".")[0]) < 0) return;
    seen[a.id] = 1;
    out.push({ id: a.id, on: a.on !== false });
  });
  return out;
}

/* The live part of a scene: which area it plays on, its palette and how it moves. */
function cleanLive(l) {
  if (!l || typeof l !== "object") return null;
  var pal = [];
  (Array.isArray(l.palette) ? l.palette : []).slice(0, 16).forEach(function (c) {
    var x = cleanLiveColour(c);
    if (x) pal.push(x);
  });
  if (!pal.length) return null;
  var areas = [],
    off = [];
  (Array.isArray(l.areas) ? l.areas : []).slice(0, 12).forEach(function (id) {
    if (typeof id === "string" && /^[a-z0-9_-]{1,24}$/.test(id) && areas.indexOf(id) < 0 && areas.length < 6) areas.push(id);
  });
  (Array.isArray(l.off) ? l.off : []).slice(0, 64).forEach(function (id) {
    if (typeof id === "string" && /^light\.[a-z0-9_]{1,80}$/.test(id) && off.indexOf(id) < 0 && off.length < 32) off.push(id);
  });
  var out = {
    area: typeof l.area === "string" && /^[a-z0-9_-]{1,24}$/.test(l.area) ? l.area : "",
    palette: pal,
    speed: cleanLiveInt(l.speed, 1, 12, 6),
    range: cleanLiveInt(l.range, 0, 100, 100),
    bri: cleanLiveInt(l.bri, 1, 100, 100),
    fps: cleanLiveInt(l.fps, 1, 60, 2),
    spread: ["x", "y", "z", "radial"].indexOf(l.spread) >= 0 ? l.spread : "x",
    src: LIVE_SRC.indexOf(l.src) >= 0 ? l.src : "palette",
    mode: l.mode === "segmented" ? "segmented" : "linear",
    fx: cleanLiveFx(l.fx),
    looks: cleanLiveLooks(l.looks),
    also: cleanLiveAlso(l.also),
  };
  if (areas.length) {
    out.areas = areas;
    out.off = off;
  }
  return out;
}

/* An entertainment area: lights placed in a cube from -1 to 1 (x left to right, y back to front, z floor to ceiling) and dummy objects that only show where things are. */
function cleanArea(a) {
  if (
    !a ||
    typeof a.id !== "string" ||
    !/^[a-z0-9_-]{1,24}$/.test(a.id) ||
    typeof a.name !== "string" ||
    !/^[a-z0-9_-]{1,24}$/.test(a.room)
  )
    return null;
  function pos(v, d) {
    return typeof v === "number" && isFinite(v) ? Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000 : d;
  }
  var seen = {},
    lights = [],
    dummies = [];
  (Array.isArray(a.lights) ? a.lights : []).slice(0, 32).forEach(function (l) {
    if (!l || typeof l.id !== "string" || l.id.indexOf("light.") !== 0 || !ENTRE.test(l.id) || seen[l.id]) return;
    seen[l.id] = 1;
    var o = { id: l.id, x: pos(l.x, 0), y: pos(l.y, 0), z: pos(l.z, 0) };
    /* A light made of zones is one item with a direction (degrees on the floor), a tilt (0 flat to 90 upright) and a length. */
    if (typeof l.a === "number" && isFinite(l.a)) o.a = Math.round((((l.a % 360) + 360) % 360));
    if (typeof l.p === "number" && isFinite(l.p)) o.p = Math.round(Math.max(0, Math.min(90, l.p)));
    if (typeof l.len === "number" && isFinite(l.len)) o.len = Math.round(Math.max(0.2, Math.min(2, l.len)) * 100) / 100;
    lights.push(o);
  });
  (Array.isArray(a.dummies) ? a.dummies : []).slice(0, 16).forEach(function (m) {
    if (!m || typeof m.k !== "string" || !/^[a-z]{1,12}$/.test(m.k)) return;
    var w = typeof m.w === "number" && isFinite(m.w) ? Math.max(0.1, Math.min(2, m.w)) : 0.4,
      h = typeof m.h === "number" && isFinite(m.h) ? Math.max(0.1, Math.min(2, m.h)) : 0.4;
    dummies.push({
      k: m.k,
      x: pos(m.x, 0),
      y: pos(m.y, 0),
      w: Math.round(w * 1000) / 1000,
      h: Math.round(h * 1000) / 1000,
    });
  });
  return { id: a.id, name: a.name.slice(0, 40), room: a.room, lights: lights, dummies: dummies };
}

function cleanScene(s) {
  if (
    !s ||
    typeof s.id !== "string" ||
    typeof s.name !== "string" ||
    !/^[a-z0-9_-]{1,24}$/.test(s.room)
  )
    return null;
  var live = s.live ? cleanLive(s.live) : null;
  if (s.live && !live) return null;
  var auto = s.auto ? cleanAuto(s.auto) : null;
  if (s.auto && !auto) return null;
  var acts = [];
  (Array.isArray(s.acts) ? s.acts : []).slice(0, 20).forEach(function (a) {
    if (a && typeof a.live === "string" && /^[a-z0-9_-]{1,24}$/.test(a.live)) {
      acts.push({ live: a.live });
      return;
    }
    if (!a || typeof a.id !== "string" || !/^[a-z_]+\.[a-z0-9_]+$/.test(a.id)) return;
    var dm = dom(a.id);
    if (["light", "media_player", "fan", "climate", "switch", "input_boolean"].indexOf(dm) < 0)
      return;
    var o = { id: a.id };
    if (dm === "climate") {
      o.mode = a.mode === "cool" || a.mode === "heat" ? a.mode : "off";
      if (typeof a.temp === "number") o.temp = Math.max(10, Math.min(35, Math.round(a.temp)));
    } else {
      o.on = a.on !== false;
      if (dm === "light" && o.on) {
        if (typeof a.bri === "number") o.bri = Math.max(1, Math.min(100, Math.round(a.bri)));
        var c = cleanPreset(a.col);
        if (c) o.col = c;
        if (typeof a.fx === "string" && a.fx !== "off" && /^[A-Za-z0-9 _.-]{1,40}$/.test(a.fx)) o.fx = a.fx;
      }
    }
    acts.push(o);
  });
  var out = {
    id: s.id.slice(0, 24),
    name: s.name.slice(0, 40),
    room: s.room,
    icon:
      typeof s.icon === "string" && (QAICONS.indexOf(s.icon) >= 0 || iconOk(s.icon))
        ? s.icon
        : "scene",
    others: s.others === "lights" || s.others === "all" ? s.others : "keep",
    acts: acts,
  };
  if (live) out.live = live;
  if (auto) out.auto = auto;
  var tags = cleanTags(s.tags);
  if (tags.length) out.tags = tags;
  return out;
}

/* An auto scene: up to ten colours, each a colour (h, s) or a white (k) with a brightness (b, 1 to 100). */
function cleanAuto(a) {
  if (!a || typeof a !== "object" || !Array.isArray(a.colors)) return null;
  var colors = [];
  a.colors.slice(0, 40).forEach(function (c) {
    if (!c || typeof c !== "object" || colors.length >= 10) return;
    var o = {};
    if (typeof c.k === "number" && c.k >= 1500 && c.k <= 9000) o.k = Math.round(c.k);
    else if (typeof c.h === "number" && typeof c.s === "number" && c.h >= 0 && c.h <= 360 && c.s >= 0 && c.s <= 100) {
      o.h = Math.round(c.h);
      o.s = Math.round(c.s);
    } else return;
    o.b = typeof c.b === "number" ? Math.max(1, Math.min(100, Math.round(c.b))) : 100;
    colors.push(o);
  });
  return colors.length ? { colors: colors } : null;
}

/* Every tag any scene has, once, in order: the tags of the home. A tag nobody uses any more is not here. */
function sceneTags() {
  var out = [];
  STORE.scenes.forEach(function (sc) {
    (sc.tags || []).forEach(function (t) {
      if (out.indexOf(t) < 0) out.push(t);
    });
  });
  return out.sort();
}

/* The most scenes that can be made (the integration keeps as many live scenes). */
var SCENE_MAX = 200;

/* Whether a scene can be saved: one that is already there always, a new one while there is room; else the person is told. */
function sceneFits(id) {
  if (
    STORE.scenes.length < SCENE_MAX ||
    STORE.scenes.some(function (x) {
      return x.id === id;
    })
  )
    return true;
  toast(_T("scenes_full"));
  return false;
}

function cleanStore(v) {
  var o = {
    v: 1,
    presets: {},
    saved: {},
    scenes: [],
    eareas: [],
    qaSeeded: !!(v && v.qaSeeded),
    ui: cleanUI(v && v.ui),
    access: cleanAccess(v && v.access),
    notify: cleanNotify(v && v.notify),
    cfg: cleanCfg(v && v.cfg),
    icons: cleanIcons(v && v.icons),
  };
  if (v && v.presets && typeof v.presets === "object")
    Object.keys(v.presets).forEach(function (id) {
      if (id.indexOf("light.") !== 0 || !Array.isArray(v.presets[id])) return;
      var out = [];
      v.presets[id].slice(0, 40).forEach(function (p) {
        var c = cleanPreset(p);
        if (c) out.push(c);
      });
      o.presets[id] = out;
    });
  /* Saved colours and white temperatures, by room (see saved.js). */
  if (v && v.saved && typeof v.saved === "object")
    Object.keys(v.saved)
      .slice(0, 40)
      .forEach(function (room) {
        if (!/^[a-z0-9_-]{1,24}$/.test(room) || !Array.isArray(v.saved[room])) return;
        var list = [];
        v.saved[room].slice(0, SAVED_MAX).forEach(function (p) {
          var c = cleanPreset(p);
          if (
            c &&
            !c.z &&
            !list.some(function (x) {
              return JSON.stringify(x) === JSON.stringify(c);
            })
          )
            list.push(c);
        });
        if (list.length) o.saved[room] = list;
      });
  /* Every scene that is stored is loaded: cutting the list here would lose the rest for good at the next save. The limit is on making new ones (sceneFits). */
  if (v && Array.isArray(v.scenes))
    v.scenes.forEach(function (s) {
      var c = cleanScene(s);
      if (c) o.scenes.push(c);
    });
  if (v && Array.isArray(v.eareas))
    v.eareas.slice(0, 24).forEach(function (a) {
      var c = cleanArea(a);
      if (c) o.eareas.push(c);
    });
  if (v && Array.isArray(v.temps))
    o.temps = v.temps
      .filter(function (k, i, a) {
        return typeof k === "number" && k >= 1000 && k <= 20000 && a.indexOf(k) === i;
      })
      .slice(0, 16)
      .map(Math.round);
  return o;
}

function cleanCfg(c) {
  var o = {
    rb: {},
    gx: {},
    mediaCtl: false,
    partsLow: 15,
    alertOff: [],
    wallPhotos: [],
    wallOff: [],
  };
  if (c && typeof c === "object") {
    if (c.mediaCtl === true) o.mediaCtl = true;
    if (c.rb && typeof c.rb === "object")
      Object.keys(c.rb)
        .slice(0, 120)
        .forEach(function (id) {
          var p = c.rb[id];
          /* a Xiaomi room by its number; a vacuum appliance's room as "<appliance>:<room>" */
          if (!/^(\d{1,3}|[a-z0-9_]{1,40}:[A-Za-z0-9_-]{1,24})$/.test(id) || !p || typeof p !== "object") return;
          var q = {};
          ["mode", "fan", "water"].forEach(function (k) {
            if (typeof p[k] === "string" && /^[A-Za-z0-9 &_-]{1,40}$/.test(p[k])) q[k] = p[k];
          });
          if (p.times === 2 || p.times === 3) q.times = p.times;
          /* a vacuum appliance's own settings of a room */
          if (id.indexOf(":") > 0)
            Object.keys(p)
              .slice(0, 6)
              .forEach(function (k) {
                if (/^[A-Za-z0-9_]{1,40}$/.test(k) && typeof p[k] === "string" && /^[^<>]{1,40}$/.test(p[k])) q[k] = p[k];
              });
          if (Object.keys(q).length) o.rb[id] = q;
        });
    if (c.gx && typeof c.gx === "object")
      ["lights", "acs", "fans", "media"].forEach(function (k) {
        if (Array.isArray(c.gx[k]))
          o.gx[k] = c.gx[k]
            .filter(function (x, i, a) {
              return typeof x === "string" && ENTRE.test(x) && a.indexOf(x) === i;
            })
            .slice(0, 60);
      });
    if ([5, 10, 15, 20, 25].indexOf(c.partsLow) >= 0) o.partsLow = c.partsLow;
    if (Array.isArray(c.alertOff))
      o.alertOff = c.alertOff.filter(function (k, i, a) {
        return ALERT_KEYS.indexOf(k) >= 0 && a.indexOf(k) === i;
      });
    /* The photos of the wall screen, and which of them are switched off (kept in the gallery, not shown): `wallOff` lists positions in `wallPhotos`; a photo that is dropped as
       invalid takes its place in that list with it. */
    if (Array.isArray(c.wallPhotos)) {
      var moved = {};
      c.wallPhotos.slice(0, 16).forEach(function (u, i) {
        if (
          typeof u === "string" &&
          ((u.length <= 300 && /^(https:\/\/|\/local\/)/.test(u)) ||
            (u.length <= 180000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(u)))
        ) {
          moved[i] = o.wallPhotos.length;
          o.wallPhotos.push(u);
        }
      });
      if (Array.isArray(c.wallOff))
        c.wallOff.forEach(function (i) {
          if (typeof i === "number" && i in moved && o.wallOff.indexOf(moved[i]) < 0) o.wallOff.push(moved[i]);
        });
      o.wallOff.sort(function (a, b) {
        return a - b;
      });
    }
  }
  return o;
}

function seedStore() {
  var o = { v: 1, presets: {}, saved: {}, scenes: [], eareas: [] };
  Object.keys(LNAME).forEach(function (id) {
    var a = A(id),
      c = lightCaps(id);
    if (!c.known) return;
    var list = [];
    if (c.white)
      [2403, 2702, 3558].forEach(function (k) {
        if (
          a.min_color_temp_kelvin !== undefined &&
          (k < a.min_color_temp_kelvin || k > a.max_color_temp_kelvin)
        )
          return;
        list.push({ k: k });
      });
    o.presets[id] = list;
  });
  return o;
}

function storeSave() {
  if (!H()) return;
  if (!STORE_NET) {
    STORE_HELD = true;
    return;
  }
  STORE.ui = UI;
  var prevJ = STORE_JSON;
  STORE_JSON = JSON.stringify(STORE);
  if (EDIT && !EDSKIP && prevJ && prevJ !== STORE_JSON) {
    EDHIST.push(prevJ);
    if (EDHIST.length > 40) EDHIST.shift();
    var ub = document.querySelector("#edtool .et-undo");
    if (ub) ub.classList.remove("dis");
  }
  if (LOGNEXT) {
    LOGNEXT = false;
    if (!LOGSKIP) {
      try {
        logChange(prevJ, STORE_JSON);
      } catch (e) {}
    }
    LOGSKIP = false;
  }
  STORE_SAVED = Date.now();
  HA.data
    .set(STORE_SCOPE, STORE_KEY, STORE)
    .then(function () {
      STORE_UNSAVED = false;
      layoutCacheWrite();
    })
    .catch(function (e) {
      /* A lost connection is not a refusal: the change is kept and saved when the connection is back (see initStore). */
      if (HA.isTransportError(e)) {
        STORE_UNSAVED = true;
        toast(_T("not_saved_no_connection"));
        return;
      }
      toast(_T("couldn_t_save_only_admins_can_change"));
    });
}

/* True once the saved dashboard and the registries have both come from Home Assistant, not only the copies of the last visit. What changes Home
   Assistant or the dashboard by itself (the notification automations, the room-off scripts, the batteries that join the list) works only from these:
   a copy that is older than what another device did would make it undo that. */
function dataIsReal() {
  return STORE_NET && HA.registriesLoaded();
}

/* ---- the last saved dashboard, kept on this device ----
 The page is first drawn from it while the real one is asked for. It is this person's copy (under their user id); the real one replaces it in place as
 soon as it arrives, the way a change saved on another device does. */
function layoutCacheOwner() {
  try {
    return H().user.id || null;
  } catch (e) {
    return null;
  }
}

function layoutCacheRead() {
  var c = deviceGet(LAYOUT_CACHE, null),
    owner = layoutCacheOwner();
  return owner && c && c.user === owner && c.store && typeof c.store === "object" && c.store.v === 1 ? c.store : null;
}

function layoutCacheWrite() {
  var owner = layoutCacheOwner();
  if (owner) deviceSet(LAYOUT_CACHE, { user: owner, store: STORE });
}

function storeGet(key) {
  return HA.data.get(STORE_SCOPE, key);
}

/* The first read of the saved dashboard data. Changes after it arrive through the subscription started by initStore. */
function storeLoad() {
  var h = H();
  if (!h || Date.now() - STORE_SAVED < 8000) return;
  if (/^(scene-|manage|ui-|pick|stg|access)/.test(CURRENT || "")) return;
  storeGet(STORE_KEY)
    .then(function (v) {
      return v && typeof v === "object" && v.v === 1 ? v : null;
    })
    .then(storeTake)
    .catch(function () {
      /* Until the saved layout is in nothing can be drawn, and until the real one is in nothing can be saved, so it is asked for again. */
      if (!STORE_NET) setTimeout(storeLoad, 2000);
    });
}

/* Takes over saved data that differs from what is open and brings the open page up to date in place. */
var STORE_WAIT = 0;

function storeTake(v, fromCache) {
  /* The first layout is built from the Home Assistant registries. Until all of them are in, nothing is generated or saved. */
  if (!HA.registriesLoaded() && !(v && typeof v === "object" && v.ui)) {
    clearTimeout(STORE_WAIT);
    STORE_WAIT = setTimeout(function () {
      storeTake(v);
    }, 1500);
    return;
  }
  if (!fromCache) STORE_NET = true;
  var prevUI = JSON.stringify(UI) + JSON.stringify(STORE.access),
    had = !!(v && typeof v === "object"),
    force = !had,
    n = had ? cleanStore(v) : seedStore();
  if (!n.ui) {
    n.ui = cleanUI(setupEmpty());
    force = true;
  }
  if (!n.qaSeeded) {
    n.scenes = seedQA().concat(n.scenes);
    n.qaSeeded = true;
    force = true;
  }
  if (force && ISADMIN) {
    STORE = n;
    UI = n.ui;
    storeSave();
  }
  var js = JSON.stringify(n);
  if ((force && ISADMIN) || js !== STORE_JSON) {
    STORE = n;
    STORE_JSON = js;
    STORE_VER++;
    UI = n.ui;
    /* Before the first drawing there is no page to bring up to date; the first drawing is made from this. */
    if (BOOTED && JSON.stringify(UI) + JSON.stringify(STORE.access) !== prevUI) livePatch();
    refresh();
  }
  STORE_READY = true;
  STORE_FIRST_IN();
  if (ISADMIN && !STORE.access && !SEEDACC) {
    SEEDACC = 1;
    seedAccess();
  }
  if (fromCache) return;
  layoutCacheWrite();
  /* What was held back while only the copy on this device was in is saved now, on top of what Home Assistant had. */
  if (STORE_HELD) {
    STORE_HELD = false;
    storeSave();
  }
}

var STORE_PENDING = null,
  STORE_PENDING_T = 0;

/* Dashboard data saved by anyone, this session included, arrives here as it happens. While a settings popup is open, or right after this session saved, it waits and is taken over later, so nothing being typed is overwritten. */
function storeEvent(v) {
  if (!v || typeof v !== "object" || v.v !== 1) return;
  if (
    Date.now() - STORE_SAVED < 8000 ||
    /^(scene-|manage|ui-|pick|stg|access)/.test(CURRENT || "")
  ) {
    STORE_PENDING = v;
    clearTimeout(STORE_PENDING_T);
    STORE_PENDING_T = setTimeout(function () {
      var p = STORE_PENDING;
      STORE_PENDING = null;
      if (p) storeEvent(p);
    }, 4000);
    return;
  }
  try {
    storeTake(v);
  } catch (e) {}
}

/* Resolves when the saved dashboard data has been taken over for the first time. */
var STORE_FIRST_IN,
  STORE_FIRST = new Promise(function (res) {
    STORE_FIRST_IN = res;
  });

function initStore() {
  try {
    ISADMIN = !!H().user.is_admin;
  } catch (e) {
    ISADMIN = false;
  }
  /* The page is drawn from the copy of the last visit when there is one; the real dashboard is asked for at once and replaces it. */
  var cached = layoutCacheRead();
  if (cached) storeTake(cached, true);
  storeLoad();
  /* A save that failed because the connection was down is made again when it is back. It goes first: for the seconds after a save, what Home Assistant
     sends about the dashboard waits, so the connection's own report of the stored dashboard does not undo the change. */
  HA.onConnection(
    function () {},
    function () {
      if (!STORE_UNSAVED || !STORE_NET) return;
      STORE_UNSAVED = false;
      storeSave();
    }
  );
  /* If Home Assistant refuses the subscription, the data is read again every minute instead. */
  try {
    HA.data.subscribe(STORE_SCOPE, STORE_KEY, storeEvent).catch(function () {
      setInterval(storeLoad, 60000);
    });
  } catch (e) {
    setInterval(storeLoad, 60000);
  }
  return STORE_FIRST;
}

function storeChanged() {
  if (!ISADMIN) return;
  STORE_VER++;
  LOGNEXT = true;
  storeSave();
  refresh();
}

/* ---- New devices ----
 Home Assistant records when each entity was created. Controllable entities created after the app last looked
 (UI.newSince), that are not on the dashboard (directly or inside a light group) and not ignored, are offered
 to admins in Settings, and a dot on the settings button says there is something to review. */
/* True once the shared store has been read from Home Assistant; nothing here may save before that, or the defaults would overwrite it. */
var STORE_READY = false;
