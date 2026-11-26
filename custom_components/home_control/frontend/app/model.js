/* The data model: rooms, devices, status tiles, the starting layout and cleaning of saved data. */

/* ---- data-driven home model (rooms, devices, status tiles) ---- */
var UI = null,
  UIROOM = {},
  UIDEV = {},
  UIOWN = {};

var KINDS = [
  "light",
  "media",
  "climate",
  "fan",
  "switch",
  "vacuum",
  "camera",
  "special",
  "remote",
  "appliance",
  "sensor",
  "number",
  "select",
  "button",
  "cover",
  "lock",
  "scene",
  "cscene",
  "scenes",
  "widget",
];

/* The lights that are the zones of another light (a gradient tube is one light with a light for each of its colour zones). They are not put on a page by themselves: the main light controls its zones, and one can still be added by hand. */
function zoneLightIds(states, entities) {
  var out = {};
  Object.keys(states).forEach(function (id) {
    var a = states[id].attributes || {};
    if (id.indexOf("light.") === 0 && Array.isArray(a.zone_colors) && Array.isArray(a.entity_id))
      a.entity_id.forEach(function (m) {
        if (m !== id) out[m] = 1;
      });
  });
  /* A light's zones are also found by their unique ids: a light whose unique id is another light's unique id followed by _zone_ and a number is a zone of it. The parent lists
     only some of its zones when a strip has more than it reports (a strip of five zones that lists three). */
  if (entities) {
    var byUid = {};
    Object.keys(entities).forEach(function (id) {
      if (id.indexOf("light.") === 0 && entities[id].unique_id) byUid[entities[id].unique_id] = id;
    });
    Object.keys(entities).forEach(function (id) {
      var m = id.indexOf("light.") === 0 && entities[id].unique_id && /^(.+)_zone_\d+$/.exec(entities[id].unique_id);
      if (m && byUid[m[1]] && byUid[m[1]] !== id) out[id] = 1;
    });
  }
  return out;
}

/* A device of a Home Assistant area as a page holds it, or null when it is not one a page lists on its own. */
function areaDevice(areaId, id) {
  var kind = DOMKIND[dom(id)];
  if (
    areaIdOf(id) !== areaId ||
    ["light", "switch", "fan", "climate", "media", "vacuum", "camera"].indexOf(kind) < 0 ||
    (kind === "camera" && isVacuumMap(id))
  )
    return null;
  var nm = A(id).friendly_name || id;
  return { id: id, name: nm, icon: defIcon(kind, nm, id), kind: kind };
}

/* The devices of a Home Assistant area, for suggesting what a page could hold. */
function areaDevices(areaId) {
  var h = H(),
    zones = zoneLightIds(h.states, h.entities),
    out = [];
  Object.keys(h.states).forEach(function (id) {
    var e = h.entities[id];
    if (zones[id] || (e && (e.entity_category || e.hidden || e.disabled_by))) return;
    var d = areaDevice(areaId, id);
    if (d) out.push(d);
  });
  return out;
}

var ENTRE = /^[a-z_]+\.[a-z0-9_]+$/,
  POPRE = /^[a-z0-9_:.-]{0,60}$/;

function cleanMeta(m) {
  m = m || {};
  var s = function (v, n, d) {
    return typeof v === "string" && v.length <= n ? v : d;
  };
  var out = {
    homeTab: s(m.homeTab, 16, _T("home")) || _T("home"),
    homeTitle: s(m.homeTitle, 40, _T("app_title")) || _T("app_title"),
    eyebrow: s(m.eyebrow, 30, _T("app_title")),
    clock: m.clock !== false,
    greet: m.greet === true,
    sky: m.sky !== false,
    hdr: cleanHdr(m.hdr),
  };
  /* no Advanced settings button anywhere on the dashboard (app/advanced.js) */
  if (m.noadv) out.noadv = 1;
  /* a new dashboard that has not been set up yet (app/setup.js) */
  if (m.setup) out.setup = true;
  return out;
}

function cleanHdr(a) {
  var out = [];
  (Array.isArray(a) ? a : []).slice(0, 4).forEach(function (x) {
    if (!x || ["weather", "people", "lights", "alerts", "entity"].indexOf(x.k) < 0) return;
    var o = { k: x.k };
    if (typeof x.id === "string" && ENTRE.test(x.id)) o.id = x.id;
    if (typeof x.l === "string" && x.l && x.l.length <= 24) o.l = x.l;
    if (x.show === true || x.show === false) o.show = x.show;
    if (x.k === "entity" && !o.id) return;
    out.push(o);
  });
  return out;
}

/* A custom remote's grid (app/remote.js): the number of columns and up to 60 buttons, each an entity of a kind that can be pressed, an icon, a short label and how many columns it takes. */
/* What a button of a remote does (app/remote.js): press an entity (a script, a button, a scene, a switch), send a key to a remote entity (`remote.send_command`), control a media player (volume, play, power) or select one of its sources. Anything else is dropped. A key may repeat while it is held (volume, channels). */
var RM_ENT_DOMS = ["script", "button", "input_button", "scene", "switch"];
var RM_MEDIA = ["volume_up", "volume_down", "volume_mute", "play_pause", "play", "pause", "stop", "next", "previous", "turn_on", "turn_off", "toggle"];

function cleanRmAct(a) {
  /* a room of a robot vacuum appliance, on its map picture */
  if (a && a.t === "room") return typeof a.r === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(a.r) ? { t: "room", r: a.r } : null;
  if (!a || typeof a !== "object" || typeof a.e !== "string" || !ENTRE.test(a.e)) return null;
  var d = a.e.split(".")[0];
  if (!a.t || a.t === "ent") return RM_ENT_DOMS.indexOf(d) >= 0 ? { t: "ent", e: a.e } : null;
  if (a.t === "key") {
    if (d !== "remote" || typeof a.c !== "string" || !/^[A-Za-z0-9_ .,:+\-]{1,40}$/.test(a.c)) return null;
    var k = { t: "key", e: a.e, c: a.c };
    if (a.r) k.r = 1;
    /* How long the key is held (seconds), and a media player that is turned on instead while it is off (a TV's power key needs the TV to listen). */
    if (typeof a.hs === "number" && a.hs >= 0.5 && a.hs <= 5) k.hs = Math.round(a.hs * 2) / 2;
    if (typeof a.w === "string" && ENTRE.test(a.w) && a.w.split(".")[0] === "media_player") k.w = a.w;
    return k;
  }
  if (a.t === "media") {
    if (d !== "media_player" || RM_MEDIA.indexOf(a.m) < 0) return null;
    var m = { t: "media", e: a.e, m: a.m };
    if (a.r) m.r = 1;
    return m;
  }
  if (a.t === "webos") return d === "media_player" && typeof a.b === "string" && /^[A-Z0-9_]{1,20}$/.test(a.b) ? (a.r ? { t: "webos", e: a.e, b: a.b, r: 1 } : { t: "webos", e: a.e, b: a.b }) : null;
  if (a.t === "src") return d === "media_player" && typeof a.v === "string" && a.v && a.v.length <= 60 ? { t: "src", e: a.e, v: a.v } : null;
  return null;
}

/* A ready-made remote's own button settings (app/remotebuttons.js): hidden, an action of the remote builder, or an entity that fills it. Null when nothing is left. */
function cleanRbx(o) {
  var out = {};
  if (!o || typeof o !== "object") return null;
  ["power", "settings", "mute", "back", "home", "playpause", "volup", "voldown", "chup", "chdown", "keyboard", "brightness", "apps"].forEach(function (role) {
    var c = o[role],
      doms = { keyboard: ["remote", "media_player", "text", "input_text", "script"], brightness: ["number", "input_number"], apps: ["media_player", "select", "input_select"] }[role];
    if (!c || typeof c !== "object") return;
    if (c.off) out[role] = { off: 1 };
    else if (doms) {
      if (typeof c.e === "string" && ENTRE.test(c.e) && doms.indexOf(c.e.split(".")[0]) >= 0) out[role] = { e: c.e };
    } else {
      var a = cleanRmAct(c.a);
      if (a && a.t !== "room") out[role] = { a: a };
    }
  });
  return Object.keys(out).length ? out : null;
}

/* The remote of a device: a grid of buttons (width and height in cells, gaps, five-way pads) or a picture with touch areas over it. */
function cleanRemote(r) {
  var cols = r && typeof r.cols === "number" ? Math.max(2, Math.min(12, Math.round(r.cols))) : 3,
    out = { cols: cols, btns: [] },
    img = r && r.img,
    num = function (v, lo, hi, def) {
      return typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def;
    },
    act = function (x) {
      /* A button made before actions had a kind has the entity on the button itself. */
      return cleanRmAct(x && x.a ? x.a : x && x.e ? { t: "ent", e: x.e } : null);
    };
  /* A picture of the remote: one of the integration's uploads or a file under /local/, with touch areas in percent of the picture. */
  if (img && typeof img.u === "string" && /^(\/home_control_remotes\/[a-f0-9]{12}\.(png|jpg|webp)|\/local\/[A-Za-z0-9_\-./]{1,150})(\?[A-Za-z0-9=_\-]{1,20})?$/.test(img.u) && img.u.indexOf("..") < 0) {
    var pct = function (v, lo, hi) {
      return typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : lo;
    };
    out.img = { u: img.u, hs: [] };
    (Array.isArray(img.hs) ? img.hs : []).slice(0, 120).forEach(function (h) {
      var a = h && act(h);
      if (!a) return;
      var w = pct(h.w, 1, 100),
        hh = pct(h.h, 1, 100);
      out.img.hs.push({ x: pct(h.x, 0, 100 - w), y: pct(h.y, 0, 100 - hh), w: w, h: hh, r: h.r === "ellipse" ? "ellipse" : "rect", a: a });
    });
    if (r.v === "i") out.v = "i";
  }
  (r && Array.isArray(r.btns) ? r.btns : []).slice(0, 150).forEach(function (x) {
    if (!x || typeof x !== "object") return;
    var s = num(x.s, 1, cols, 1),
      h = num(x.h, 1, 8, 1);
    if (x.a && x.a.t === "gap") {
      out.btns.push({ a: { t: "gap" }, i: "info", l: "", s: s, h: h });
      return;
    }
    /* A five-way pad (arrows and OK) or a touchpad (swipes, a tap and a hold): the action of each part. */
    if (x.a && (x.a.t === "dpad" || x.a.t === "touch")) {
      var pad = { t: x.a.t },
        any = false;
      ["u", "d", "l", "r", "o"].concat(x.a.t === "touch" ? ["h"] : []).forEach(function (k) {
        var a = act(x.a[k] ? { a: x.a[k] } : null);
        if (a) {
          pad[k] = a;
          any = true;
        }
      });
      if (any) out.btns.push({ a: pad, i: "info", l: "", s: num(x.s, 2, cols, Math.min(x.a.t === "touch" ? cols : 3, cols)), h: num(x.h, 2, 8, x.a.t === "touch" ? 4 : 3) });
      return;
    }
    /* Parts that show a media player's state or a number: the now-playing card, the source menu, a keyboard button and a slider. */
    if (x.a && ["now", "source", "text", "slider"].indexOf(x.a.t) >= 0) {
      var ce = typeof x.a.e === "string" && ENTRE.test(x.a.e) ? x.a.e.split(".")[0] : "";
      if (x.a.t === "slider" ? ["number", "input_number"].indexOf(ce) < 0 : ce !== "media_player") return;
      var comp = { a: { t: x.a.t, e: x.a.e }, i: iconOk(x.i) ? x.i : x.a.t === "text" ? "keyboard" : x.a.t === "slider" ? "bright" : "info", l: typeof x.l === "string" ? x.l.slice(0, 24) : "", s: s, h: h };
      /* The now-playing card can hold the apps menu (a tap opens it); a slider can be a round button that opens its slider. */
      if ((x.a.t === "now" && x.a.m === "apps") || (x.a.t === "slider" && x.a.m === "pop")) comp.a.m = x.a.m;
      out.btns.push(comp);
      return;
    }
    var a = act(x);
    if (!a) return;
    var label = typeof x.l === "string" ? x.l.slice(0, 24) : "",
      btn = { a: a, i: iconOk(x.i) ? x.i : x.i === "" && label ? "" : "info", l: label, s: s, h: h };
    if (x.q) btn.q = 1;
    if (["red", "green", "yellow", "blue"].indexOf(x.k) >= 0) btn.k = x.k;
    out.btns.push(btn);
  });
  /* the grid drawn as the built-in remotes are */
  if (r && r.look === "native") out.look = "native";
  return out;
}

/* An appliance's slots (app/appliance.js): its type, the entity bound to each known slot (only slots the dashboard knows, only kinds of entity that fit them) and up to 12 free extra rows with a label. */
function cleanAppliance(a) {
  var slotDoms = {
      state: ["sensor", "binary_sensor", "select", "input_select"],
      program: ["select", "input_select"],
      temperature: ["number", "input_number", "select", "input_select"],
      duration: ["number", "input_number", "input_datetime", "select", "input_select"],
      start: ["button", "input_button", "script", "switch", "input_boolean"],
      stop: ["button", "input_button", "script", "switch", "input_boolean"],
      progress: ["sensor", "number", "input_number"],
      current: ["sensor", "number", "input_number"],
      remaining: ["sensor", "input_datetime"],
      door: ["binary_sensor", "sensor"],
      permission: ["binary_sensor", "switch", "input_boolean"],
      level: ["number", "input_number", "select", "input_select"],
      vacuum: ["vacuum"],
      battery: ["sensor"],
      map: ["camera", "image"],
      position: ["sensor"],
      no_go: ["sensor"],
      walls: ["sensor"],
      dock: ["button", "input_button", "script"],
    },
    extraDoms = ["select", "input_select", "number", "input_number", "switch", "input_boolean", "binary_sensor", "sensor", "button", "input_button", "script"],
    out = { type: "other", slots: {}, extra: [] };
  if (a && ["oven", "washer", "dryer", "dishwasher", "coffee", "fridge", "projector", "vacuum", "other"].indexOf(a.type) >= 0) out.type = a.type;
  Object.keys(slotDoms).forEach(function (k) {
    var e = a && a.slots && a.slots[k];
    if (typeof e === "string" && ENTRE.test(e) && slotDoms[k].indexOf(e.split(".")[0]) >= 0) out.slots[k] = e;
  });
  /* A name given to a slot on this appliance (a projector's Program is its Source). */
  if (a && a.names && typeof a.names === "object")
    Object.keys(slotDoms).forEach(function (k) {
      var n = a.names[k];
      if (typeof n === "string" && n.trim()) {
        out.names = out.names || {};
        out.names[k] = n.trim().slice(0, 24);
      }
    });
  /* Rows of any entity that can be read or set, each with a label, an optional group heading, and whether it is shown on the appliance's page or behind its Details line. */
  (a && Array.isArray(a.extra) ? a.extra : []).slice(0, 40).forEach(function (x) {
    if (x && typeof x.e === "string" && ENTRE.test(x.e) && extraDoms.indexOf(x.e.split(".")[0]) >= 0) {
      var row = { e: x.e, l: typeof x.l === "string" ? x.l.slice(0, 30) : "" };
      if (typeof x.g === "string" && x.g.trim()) row.g = x.g.trim().slice(0, 24);
      if (x.o) row.o = 1;
      out.extra.push(row);
    }
  });
  if (out.type === "vacuum" || (a && a.vac)) out.vac = cleanVac(a && a.vac);
  return out;
}

/* A robot vacuum appliance's own configuration (app/appliancevac.js): rooms, settings and what Start does. */
function cleanVac(v) {
  var word = function (s, re) {
      return typeof s === "string" && re.test(s) ? s : "";
    },
    label = function (s) {
      return typeof s === "string" ? s.slice(0, 24) : "";
    },
    list = function (x, n) {
      return Array.isArray(x) ? x.slice(0, n) : [];
    };
  v = v && typeof v === "object" ? v : {};
  var out = { rooms: [], sets: [], run: [] };
  if (v.nost) out.nost = 1;
  if (v.nopr) out.nopr = 1;
  var z = v.zones,
    plainData = function (x) {
      return x && typeof x === "object" && !Array.isArray(x) && JSON.stringify(x).length <= 1000;
    };
  if (z && word(z.action, /^[a-z_]+\.[a-z0-9_]+$/)) {
    out.zones = { action: z.action, data: plainData(z.data) ? JSON.parse(JSON.stringify(z.data)) : {} };
    ["no_go", "walls"].forEach(function (k) {
      var path = word(z[k], /^[A-Za-z0-9_*|.-]{1,200}$/);
      if (path) out.zones[k] = path;
    });
  }
  list(v.rooms, 40).forEach(function (r) {
    var k = r && word(r.k, /^[A-Za-z0-9_-]{1,24}$/);
    if (k && !out.rooms.some(function (x) { return x.k === k; })) out.rooms.push({ k: k, l: label(r.l) });
  });
  list(v.sets, 6).forEach(function (s) {
    var k = s && word(s.k, /^[A-Za-z0-9_]{1,40}$/);
    if (!k || out.sets.some(function (x) { return x.k === k; })) return;
    var o = { k: k, l: label(s.l), o: list(s.o, 8).filter(function (x) { return word(x, /^[A-Za-z0-9 &_-]{1,40}$/); }) };
    if (word(s.e, /^(input_)?select\.[a-z0-9_]+$/)) o.e = s.e;
    /* only for single rooms; the number the vacuum knows each value by, and the value used when none is chosen */
    if (s.r) o.r = 1;
    if (s.c && typeof s.c === "object") {
      var codes = {};
      Object.keys(s.c).slice(0, 8).forEach(function (n) {
        if (word(n, /^[A-Za-z0-9 &_-]{1,40}$/) && typeof s.c[n] === "number" && isFinite(s.c[n])) codes[n] = s.c[n];
      });
      if (Object.keys(codes).length) o.c = codes;
    }
    if (word(s.d, /^[A-Za-z0-9 &_-]{1,40}$/)) o.d = s.d;
    out.sets.push(o);
  });
  list(v.run, 4).forEach(function (r) {
    var action = r && word(r.action, /^[a-z_]+\.[a-z0-9_]+$/);
    if (!action || !r.data || typeof r.data !== "object" || Array.isArray(r.data) || JSON.stringify(r.data).length > 1000) return;
    var step = { action: action, data: JSON.parse(JSON.stringify(r.data)) };
    if (r.each) step.each = 1;
    if (r.expect && typeof r.expect === "object") {
      var expect = {};
      Object.keys(r.expect).slice(0, 4).forEach(function (n) {
        var x = r.expect[n];
        if (/^[A-Za-z0-9_]{1,40}$/.test(n) && (typeof x === "boolean" || (typeof x === "number" && isFinite(x)) || (typeof x === "string" && x.length <= 40))) expect[n] = x;
      });
      if (Object.keys(expect).length) step.expect = expect;
    }
    out.run.push(step);
  });
  return out;
}

/* The map of a vacuum belongs in that vacuum's popup, not on a page: a camera that is bound as a vacuum's map (app/profiles.js), or that sits on the same Home Assistant device as a vacuum
   (how Roborock, Dreame and Xiaomi add a vacuum's map), is a map and not a camera of the house. */
function vacuumMapOf(vacuumId) {
  var h = H(),
    d = UIDEV[vacuumId];
  if (d && d.vx && d.vx.map) return d.vx.map;
  var e = h.entities && h.entities[vacuumId];
  if (!e || !e.device_id) return null;
  return (
    Object.keys(h.states).filter(function (id) {
      var c = h.entities[id];
      return id.indexOf("camera.") === 0 && c && c.device_id === e.device_id;
    })[0] || null
  );
}

function isVacuumMap(id) {
  if (id.indexOf("camera.") !== 0) return false;
  var h = H();
  return Object.keys(h.states).some(function (v) {
    return v.indexOf("vacuum.") === 0 && vacuumMapOf(v) === id;
  });
}

/* The type of a media player (a TV, a receiver or a speaker) and of a fan (a fan or an air purifier) decides what its setup page offers. It is chosen in the device's settings; a device that has none yet gets one guessed once from its icon, name and id, and keeps it from then on. */
var DEVTYPES = { media: ["tv", "receiver", "speaker"], fan: ["fan", "purifier"] };

function guessDevType(d) {
  if (d.kind === "media") return d.icon === "tv" ? "tv" : /speaker|homepod|sonos|cast|echo/i.test(d.icon + " " + d.id) ? "speaker" : "receiver";
  if (d.kind === "fan") return /purif|air/i.test(d.icon + " " + d.name + " " + d.id) ? "purifier" : "fan";
  return "";
}

function cleanDev(d) {
  if (
    !d ||
    typeof d !== "object" ||
    typeof d.name !== "string" ||
    !d.name ||
    d.name.length > 40 ||
    KINDS.indexOf(d.kind) < 0
  )
    return null;
  var id = typeof d.id === "string" ? d.id : "";
  if (id && !ENTRE.test(id)) return null;
  if (!id && ["special", "remote", "appliance", "cscene", "scenes", "widget"].indexOf(d.kind) < 0) return null;
  if (d.kind === "cscene" && !(typeof d.sid === "string" && /^[a-z0-9_-]{1,24}$/.test(d.sid))) return null;
  if (d.kind === "scene" && id.split(".")[0] !== "scene") return null;
  if (d.kind === "appliance" && !(typeof d.aid === "string" && /^[a-z0-9_-]{1,24}$/.test(d.aid))) return null;
  if (d.kind === "remote" && !(typeof d.rid === "string" && /^[a-z0-9_-]{1,24}$/.test(d.rid))) return null;
  var c = { id: id, name: d.name, icon: iconOk(d.icon) ? d.icon : "plug", kind: d.kind };
  /* A widget's type, id and settings, and the size of a widget or of a device that can take one (decision D-25). */
  if ((d.kind === "widget" || d.sz) && !(typeof cleanWidgetDev === "function" ? cleanWidgetDev(d, c) : d.kind !== "widget")) return null;
  if (typeof d.pop === "string" && POPRE.test(d.pop) && d.pop) c.pop = d.pop;
  if (d.sub) c.sub = 1;
  if (d.setup) c.setup = 1;
  if (DEVTYPES[d.kind]) c.dt = DEVTYPES[d.kind].indexOf(d.dt) >= 0 ? d.dt : guessDevType(d);
  if (Array.isArray(d.links)) {
    var ls = d.links.filter(function (x, i) {
      return typeof x === "string" && ENTRE.test(x) && x !== id && d.links.indexOf(x) === i;
    });
    if (ls.length) c.links = ls.slice(0, 12);
  }
  /* Extras bound to a device (app/profiles.js): a vacuum's map, rooms, modes and care values; a camera's intercom and push to talk; a light's scenes entity. */
  var ent = function (e, doms) {
    return typeof e === "string" && ENTRE.test(e) && doms.indexOf(e.split(".")[0]) >= 0 ? e : null;
  };
  if (d.kind === "vacuum" && d.vx && typeof d.vx === "object") {
    var vx = {},
      m = ent(d.vx.map, ["camera", "image"]);
    if (m) vx.map = m;
    var rooms = (Array.isArray(d.vx.rooms) ? d.vx.rooms : [])
      .filter(function (x) {
        return x && ent(x.e, ["button", "input_button", "script", "scene", "switch"]);
      })
      .slice(0, 40)
      .map(function (x) {
        return { e: x.e, l: typeof x.l === "string" ? x.l.slice(0, 24) : "" };
      });
    if (rooms.length) vx.rooms = rooms;
    [["modes", ["select", "input_select", "number", "input_number", "switch", "input_boolean"]], ["care", ["sensor", "binary_sensor", "number", "input_number"]]].forEach(function (g) {
      var l = (Array.isArray(d.vx[g[0]]) ? d.vx[g[0]] : [])
        .filter(function (e, i, a) {
          return ent(e, g[1]) && a.indexOf(e) === i;
        })
        .slice(0, 40);
      if (l.length) vx[g[0]] = l;
    });
    if (Object.keys(vx).length) c.vx = vx;
  }
  if (d.kind === "camera") {
    if (d.talk) c.talk = 1;
    if (d.ix && typeof d.ix === "object") {
      var ix = {};
      [["answer", ["button", "input_button", "script", "switch"]], ["reject", ["button", "input_button", "script", "switch"]], ["unlock", ["lock", "button", "input_button", "script", "switch"]], ["ring", ["binary_sensor", "input_boolean", "event", "sensor"]]].forEach(function (g) {
        var e = ent(d.ix[g[0]], g[1]);
        if (e) ix[g[0]] = e;
      });
      /* The door's audio during a call: a Home Assistant address that streams it (it is signed when played). */
      if (typeof d.ix.listen === "string" && /^\/api\/[A-Za-z0-9_.\/-]{1,200}$/.test(d.ix.listen) && d.ix.listen.indexOf("..") < 0)
        ix.listen = d.ix.listen;
      if (Object.keys(ix).length) c.ix = ix;
    }
  }
  if (d.kind === "light" && ent(d.sx, ["select", "input_select"])) c.sx = d.sx;
  if (d.kind === "appliance") {
    c.aid = d.aid;
    c.ap = cleanAppliance(d.ap);
    /* An appliance can carry a grid of buttons or a picture, made with the remote builder (app/remote.js): a projector's arrows and inputs. */
    if (d.rm) {
      var arm = cleanRemote(d.rm);
      if (arm.btns.length || arm.img) c.rm = arm;
    }
  }
  if (d.kind === "remote") {
    c.rid = d.rid;
    c.rm = cleanRemote(d.rm);
  }
  if (d.keep) c.keep = 1;
  if (d.hide) c.hide = 1;
  if (d.dial && d.kind === "climate") c.dial = 1;
  if (d.art && d.kind === "media") c.art = 1;
  if (d.nonp && d.kind === "media" && !c.art) c.nonp = 1;
  if (d.noslide && d.kind === "lock") c.noslide = 1;
  if (d.noadv) c.noadv = 1;
  /* A scene made on the dashboard is a device that points to it (its name and icon are the scene's); a collection of scenes takes in the scenes of pages and tags and of the areas it names (none: the page's own area). */
  if (d.kind === "cscene") c.sid = d.sid;
  if (d.kind === "scenes") {
    var idsOf = function (v, re) {
      return (Array.isArray(v) ? v : []).filter(function (x, i, a) {
        return typeof x === "string" && re.test(x) && a.indexOf(x) === i;
      }).slice(0, 40);
    };
    var sp = idsOf(d.spage, /^(page:[a-z0-9_-]{1,24}|area:[a-z0-9_-]{1,60}|hue:(@page|@lights|@rooms|[a-z0-9_-]{1,60})|group:(room|zone):[a-z0-9-]{1,60})$/),
      xt = cleanTags(d.xtag),
      st = cleanTags(d.stag);
    if (sp.length) c.spage = sp;
    if (st.length) c.stag = st;
    if (xt.length) c.xtag = xt;
    if (d.keepname) c.keepname = 1;
  }
  if ((d.kind === "vacuum" || (d.kind === "appliance" && d.ap && d.ap.type === "vacuum")) && d.map && typeof d.map === "object") {
    var m = {};
    if (d.map.m === 1) m.m = 1;
    if ([11, 16, 19].indexOf(d.map.ls) >= 0) m.ls = d.map.ls;
    if ([0, 30, 130].indexOf(d.map.fa) >= 0) m.fa = d.map.fa;
    if (d.map.lc === "acc" || d.map.lc === "room") m.lc = d.map.lc;
    if (d.map.fc === "acc") m.fc = "acc";
    if (d.map.tr === 1) m.tr = 1;
    if (d.map.nz === 1) m.nz = 1;
    if (d.map.tc === "ink") m.tc = "ink";
    if (d.map.tw === 2 || d.map.tw === 5) m.tw = d.map.tw;
    if (Object.keys(m).length) c.map = m;
  }
  return c;
}

/* A status tile as a device of a Section: the reading, as a tile. */
function statusDevice(s) {
  return { id: s.id, name: String(s.l).slice(0, 40), icon: "thermo", kind: "sensor", sz: "s" };
}

/* The Status Section of a page, a plain Section: its tiles are devices added like any other (a sensor as a tile). */
function statusSection(devs) {
  return { id: "status", k: "devs", t: _T("status"), i: "thermo", hide: false, devs: devs || [] };
}

/* Layout 8 (decision D-27): the status tiles of a page are in two independent places. In the header: the page's own list (`stat`, edited in the header's settings), shown whenever it has tiles. In the page: a plain Status Section whose tiles are
   devices. Until now one setting chose between them (`hdrStatus`), so a dashboard keeps what it showed: with the setting on, the tiles stay in the header and the Status Section is empty (and the Home page's climate tiles, which the header showed
   in place of the section, are its header tiles and the section is hidden); with it off, the tiles move into the Section and the header has none. */
function statusToSections(u) {
  if (!u.layout || typeof u.layout !== "object") return u;
  var hdr = !!(u.meta && u.meta.hdrStatus === true),
    lay = JSON.parse(JSON.stringify(u.layout)),
    stat = JSON.parse(JSON.stringify(u.stat && typeof u.stat === "object" ? u.stat : {})),
    isWidget = function (d, w) {
      return !!d && d.kind === "widget" && d.w === w;
    },
    is = function (s, w) {
      return !!s && (s.k === w || (Array.isArray(s.devs) && s.devs.some(function (d) { return isWidget(d, w); })));
    },
    changed = false;
  [["home", lay.home]]
    .concat(
      Object.keys(lay.rooms || {}).map(function (k) {
        return [k, lay.rooms[k]];
      })
    )
    .forEach(function (p) {
      (Array.isArray(p[1]) ? p[1] : []).forEach(function (s) {
        if (is(s, "status")) {
          var tiles = Array.isArray(stat[p[0]]) ? stat[p[0]] : [],
            own = (Array.isArray(s.devs) ? s.devs : []).filter(function (d) {
              return !isWidget(d, "status");
            });
          s.k = "devs";
          s.devs = hdr
            ? own
            : own.concat(
                tiles
                  .filter(function (t) {
                    return t && typeof t.id === "string" && typeof t.l === "string";
                  })
                  .map(statusDevice)
              );
          if (!hdr) stat[p[0]] = [];
          if (!s.t) s.t = _T("status");
          if (!s.i) s.i = "thermo";
          changed = true;
        }
        if (hdr && is(s, "chips")) {
          s.hide = true;
          changed = true;
        }
      });
    });
  if (hdr && Array.isArray(u.chips) && u.chips.length && !(stat.home && stat.home.length))
    stat.home = u.chips
      .filter(function (c) {
        return c && typeof c.t === "string" && typeof c.l === "string";
      })
      .map(function (c) {
        var e = { l: c.l, id: c.t, u: c.u || "°", dp: c.u ? 0 : 1 };
        if (c.h) e.h = c.h;
        return e;
      });
  return changed || hdr ? Object.assign({}, u, { layout: lay, stat: stat }) : u;
}

function cleanUI(u) {
  if (!u || typeof u !== "object") return null;
  u = statusToSections(u);
  function ok(s, n) {
    return typeof s === "string" && s.length > 0 && s.length <= n;
  }
  var o = {
    rooms: [],
    devs: {},
    chips: [],
    stat: {},
    bats: [],
    layout: { home: [], rooms: {}, cols: {} },
    caps: {},
    rbx: {},
    on: {},
    newSince: typeof u.newSince === "number" && u.newSince > 0 ? u.newSince : 0,
    ignored: Array.isArray(u.ignored)
      ? u.ignored
          .filter(function (x) {
            return typeof x === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(x);
          })
          .slice(0, 200)
      : [],
    batsOff: Array.isArray(u.batsOff)
      ? u.batsOff
          .filter(function (x) {
            return typeof x === "string" && DEVRE.test(x);
          })
          .slice(0, 200)
      : [],
    meta: cleanMeta(u.meta),
  };
  /* Devices a room's "everything off" leaves alone, by room id (app/roomoff.js). */
  if (u.offx && typeof u.offx === "object") {
    var offx = {};
    Object.keys(u.offx)
      .slice(0, 60)
      .forEach(function (r) {
        var l = Array.isArray(u.offx[r])
          ? u.offx[r]
              .filter(function (x, i, a) {
                return typeof x === "string" && ENTRE.test(x) && a.indexOf(x) === i;
              })
              .slice(0, 100)
          : [];
        if (/^[a-z0-9_-]{1,24}$/.test(r) && l.length) offx[r] = l;
      });
    if (Object.keys(offx).length) o.offx = offx;
  }
  /* Per-light "turn on" defaults: brightness 1-100 and colour temperature 2000-6500 K; either may be absent (= last used). */
  if (u.on && typeof u.on === "object")
    Object.keys(u.on)
      .slice(0, 80)
      .forEach(function (id) {
        var c = u.on[id];
        if (!/^light\.[a-z0-9_]+$/.test(id) || !c || typeof c !== "object") return;
        var x = {};
        if (typeof c.b === "number" && c.b >= 1 && c.b <= 100) x.b = Math.round(c.b);
        if (typeof c.k === "number" && c.k >= 2000 && c.k <= 6500) x.k = Math.round(c.k);
        /* A saved state made in the light popup: brightness, a colour temperature or a hue and saturation, an effect. */
        if (c.c && typeof c.c === "object") {
          var sv = {},
            col = c.c.col;
          if (typeof c.c.bri === "number" && c.c.bri >= 1 && c.c.bri <= 100) sv.bri = Math.round(c.c.bri);
          if (col && typeof col === "object") {
            if (typeof col.k === "number" && col.k >= 1000 && col.k <= 10000) sv.col = { k: Math.round(col.k) };
            else if (typeof col.h === "number" && typeof col.s === "number" && col.h >= 0 && col.h <= 360 && col.s >= 0 && col.s <= 100)
              sv.col = { h: Math.round(col.h), s: Math.round(col.s) };
          }
          if (typeof c.c.fx === "string" && c.c.fx.length <= 60) sv.fx = c.c.fx;
          if (Object.keys(sv).length) x.c = sv;
        }
        if (Object.keys(x).length) o.on[id] = x;
      });
  if (u.rbx && typeof u.rbx === "object")
    Object.keys(u.rbx)
      .slice(0, 80)
      .forEach(function (id) {
        var x = /^media_player\.[a-z0-9_]+$/.test(id) && cleanRbx(u.rbx[id]);
        if (x) o.rbx[id] = x;
      });
  if (u.caps && typeof u.caps === "object")
    Object.keys(u.caps)
      .slice(0, 80)
      .forEach(function (id) {
        var c = u.caps[id];
        if (!/^light\.[a-z0-9_]+$/.test(id) || !c || typeof c !== "object") return;
        var x = {};
        ["nb", "nw", "nc"].forEach(function (k) {
          if (c[k]) x[k] = 1;
        });
        if (Object.keys(x).length) o.caps[id] = x;
      });
  (Array.isArray(u.rooms) ? u.rooms : []).slice(0, 24).forEach(function (r) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !/^[a-z0-9_-]{1,24}$/.test(r.id) ||
      r.id === "home" ||
      !ok(r.name, 40) ||
      o.rooms.some(function (x) {
        return x.id === r.id;
      })
    )
      return;
    var room = {
      id: r.id,
      name: r.name,
      short: ok(r.short, 16) && r.short !== _T("room") ? r.short : "",
      icon: iconOk(r.icon) ? r.icon : "home",
      area: typeof r.area === "string" && r.area.length <= 40 ? r.area : "",
      hide: !!r.hide,
      img: imgOk(r.img) ? r.img : "",
    };
    if (Array.isArray(r.hscn)) {
      var hiddenScenes = r.hscn
        .filter(function (id, i, a) {
          return typeof id === "string" && /^scene\.[a-z0-9_]+$/.test(id) && a.indexOf(id) === i;
        })
        .slice(0, 400);
      if (hiddenScenes.length) room.hscn = hiddenScenes;
    }
    o.rooms.push(room);
  });
  var ids = {};
  o.rooms.forEach(function (r) {
    ids[r.id] = 1;
  });
  (Array.isArray(u.chips) ? u.chips : []).slice(0, 12).forEach(function (c) {
    if (!c || !ok(c.l, 40) || typeof c.t !== "string" || !ENTRE.test(c.t)) return;
    var o2 = { l: c.l, t: c.t };
    if (typeof c.h === "string" && ENTRE.test(c.h)) o2.h = c.h;
    if (typeof c.u === "string" && c.u.length <= 10) o2.u = c.u;
    o.chips.push(o2);
  });
  Object.keys(u.stat || {}).forEach(function (rid) {
    if ((!ids[rid] && rid !== "home") || !Array.isArray(u.stat[rid])) return;
    var out = [];
    u.stat[rid].slice(0, 6).forEach(function (s) {
      /* an Attention tile has no entity: it shows the alerts, and only while there are some */
      if (s && s.k === "alerts") {
        if (!out.some(function (x) { return x.k === "alerts"; })) out.push({ k: "alerts", l: ok(s.l, 30) ? s.l : _T("attention") });
        return;
      }
      if (!s || !ok(s.l, 30) || typeof s.id !== "string" || !ENTRE.test(s.id)) return;
      var c = { l: s.l, id: s.id };
      /* a tile of two readings, as the Home page's climate tiles are (a temperature and a humidity) */
      if (typeof s.h === "string" && ENTRE.test(s.h)) c.h = s.h;
      if (typeof s.u === "string" && s.u.length <= 10) c.u = s.u;
      if (typeof s.dp === "number") c.dp = Math.max(0, Math.min(3, Math.round(s.dp)));
      if (s.text) c.text = 1;
      out.push(c);
    });
    o.stat[rid] = out;
  });
  /* Tracked batteries are devices (app/batteries.js). A list from before that, of [name, entity] pairs, is not carried over. */
  (Array.isArray(u.bats) ? u.bats : []).slice(0, 30).forEach(function (b) {
    if (typeof b === "string" && DEVRE.test(b) && o.bats.indexOf(b) < 0) o.bats.push(b);
  });
  var lv = u.layout && u.layout.v,
    cur = lv >= 4 ? { home: u.layout.home, rooms: u.layout.rooms || {} } : { home: null, rooms: {} };
  o.layout.v = 8;
  o.layout.home = cleanLayout(cur.home || seedSections("home"));
  Object.keys(ids).forEach(function (rid) {
    o.layout.rooms[rid] = cleanLayout(cur.rooms[rid] || seedSections("room:" + rid));
  });
  o.layout.cols = {};
  ["home"].concat(Object.keys(ids)).forEach(function (k) {
    var c = u.layout && u.layout.cols && u.layout.cols[k];
    if (c === 1 || c === 2 || c === 3 || c === 4) o.layout.cols[k] = c;
  });
  devIndex(o);
  return o;
}

/* The tags of a scene: lower case words, at most 12, once each. They are for the administrator (which scenes a master or a section takes in or leaves out); nobody else sees them. */
function cleanTags(list) {
  var out = [];
  (Array.isArray(list) ? list : []).forEach(function (t) {
    t = typeof t === "string" ? t.trim().toLowerCase().replace(/\s+/g, " ") : "";
    if (/^[^\s].{0,22}[^\s]$|^[^\s]$/.test(t) && out.indexOf(t) < 0 && out.length < 12) out.push(t);
  });
  return out;
}

function scenesToDevices(s) {
  var c = Object.assign({}, s),
    devs = Array.isArray(s.devs) ? s.devs.slice() : [];
  (Array.isArray(s.scn) ? s.scn : []).forEach(function (id) {
    devs.push({ kind: "cscene", sid: id, id: "", name: "Scene", icon: "scene" });
  });
  (Array.isArray(s.sents) ? s.sents : []).forEach(function (e) {
    if (typeof e === "string" && /^scene\.[a-z0-9_]+$/.test(e))
      devs.push({ kind: "scene", id: e, name: e.split(".")[1].replace(/_/g, " ").slice(0, 40) || "Scene", icon: "scene" });
  });
  if (s.k === "scenes" || (s.scs && !(s.scn || []).length && !(s.sents || []).length) || s.spage || s.stag || s.sarea)
    devs.push({
      kind: "scenes",
      id: "",
      name: _T("scenes").slice(0, 40),
      icon: "scene",
      spage: (Array.isArray(s.spage) ? s.spage.map(function (x) { return "page:" + x; }) : []).concat(["hue:" + (s.sarea || "@page")]),
      stag: s.stag,
      xtag: s.xtag,
      keepname: s.keepname,
    });
  ["scn", "sents", "sarea", "hscn", "pord", "hord", "spage", "stag", "xtag", "keepname", "scs"].forEach(function (k) {
    delete c[k];
  });
  c.k = "devs";
  c.devs = devs;
  if (!c.t) c.t = _T("scenes").slice(0, 40);
  if (!c.i) c.i = "scene";
  return c;
}

/* The tiles of At a glance (decision D-25: they are kept on the widget): which are hidden, their order, the ones made by hand and the lights masters shown as rows. Null when there is nothing to keep. */
function cleanGlance(gl) {
  if (!gl || typeof gl !== "object") return null;
  var o;
  var cs = [];
  (Array.isArray(gl.c) ? gl.c : []).slice(0, 12).forEach(function (x) {
    if (
      x &&
      typeof x.id === "string" &&
      /^x[a-z0-9]{3,8}$/.test(x.id) &&
      cs.every(function (y) {
        return y.id !== x.id;
      }) &&
      typeof x.t === "string" &&
      x.t &&
      x.t.length <= 24 &&
      GL_DOMS.indexOf(x.dom) >= 0
    ) {
      var c = { id: x.id, t: x.t, dom: x.dom };
      if (iconOk(x.i)) c.i = x.i;
      if (typeof x.dc === "string" && /^[a-z_]{1,30}$/.test(x.dc)) c.dc = x.dc;
      cs.push(c);
    }
  });
  var okIds = GL_IDS.concat(
      cs.map(function (c) {
        return c.id;
      })
    ),
    pk = function (a) {
      return (Array.isArray(a) ? a : []).filter(function (x, i, r) {
        return okIds.indexOf(x) >= 0 && r.indexOf(x) === i;
      });
    };
  o = { o: pk(gl.o), h: pk(gl.h), c: cs };
  /* The lights masters the At a glance lights popup shows as rows ("page~master"); the lights of the others are listed one by one. */
  var lm = (Array.isArray(gl.lm) ? gl.lm : [])
    .filter(function (x, i, r) {
      return typeof x === "string" && /^[a-z0-9_-]{1,24}~[a-z][a-z0-9_]{1,14}$/.test(x) && r.indexOf(x) === i;
    })
    .slice(0, 40);
  if (lm.length) o.lm = lm;
  return o;
}

/* The keys of a lights master's settings (decision D-25: a master is a widget of a Section, its settings are the widget's). They go with it when it is moved or copied; the two that hide the section's own lights and sync (mhl, mhs) are about the section it was in. */
var LM_KEYS = ["mn", "mall", "mo", "mm", "ml", "mgl", "mtab", "lx", "mhide", "mxt", "mpw", "mps", "msync", "msyncid", "scn", "msrc", "mf", "mtop", "mgr"];
var LM_OWN = LM_KEYS.concat(["mhl", "mhs", "master"]);

/* The settings of a lights master as they are kept: its name, the lights chosen for it (manual) or none (the lights of its Section), its power button, scenes, folders and so on. `own` is a master made from its Section's lights (the one the Section's lights rows give way to). Unknown or invalid settings are dropped. */
function cleanMaster(s, id) {
  var o = { id: id, master: 1 };
  if (s.own) o.own = 1;
  if (typeof s.mn === "string" && s.mn.trim()) o.mn = s.mn.trim().slice(0, 40);
  if (s.mall) o.mall = 1;
  /* Manual: the lights chosen for the master, each with an optional name and icon. */
  if (s.mm) {
    o.mm = 1;
    o.ml = (Array.isArray(s.ml) ? s.ml : [])
      .slice(0, 100)
      .map(cleanDev)
      .filter(function (c, i, a) {
        return c && c.kind === "light" && c.id && a.findIndex(function (x) { return x && x.id === c.id; }) === i;
      });
  }
  /* Lights a master shows that no section or chosen list holds as a device (a group's own lights, for example): kept as devices so that their settings open from the master. */
  var lx = (Array.isArray(s.lx) ? s.lx : [])
    .slice(0, 100)
    .map(cleanDev)
    .filter(function (c, i, a) {
      return c && c.kind === "light" && c.id && a.findIndex(function (x) { return x && x.id === c.id; }) === i;
    });
  if (lx.length) o.lx = lx;
  if (s.mgl) o.mgl = 1;
  if (s.mhide) o.mhide = 1;
  if (["color", "white", "fx", "scenes", "sync"].indexOf(s.mtab) >= 0) o.mtab = s.mtab;
  if (s.mhl) o.mhl = 1;
  if (s.mhs) o.mhs = 1;
  if (s.mpw === "scene") {
    o.mpw = "scene";
    if (typeof s.mps === "string" && /^[a-z0-9_.-]{1,80}$/.test(s.mps)) o.mps = s.mps;
  }
  if (s.msync) o.msync = 1;
  if (typeof s.msyncid === "string" && ENTRE.test(s.msyncid)) o.msyncid = s.msyncid;
  /* The room the At a glance lights popup lists it under: the room of the page it is on (not set), or the Home Assistant room of its lights. */
  if (s.mgr === "ha") o.mgr = "ha";
  if (Array.isArray(s.mo))
    o.mo = s.mo
      .filter(function (x, i, a) {
        return typeof x === "string" && ENTRE.test(x) && a.indexOf(x) === i;
      })
      .slice(0, 100);
  /* The scenes page of the lights master: where its scenes come from, the folders the owner made and the order of the tiles outside them. */
  var key = function (x) {
    return typeof x === "string" && /^[a-z0-9_.-]{1,80}$/.test(x);
  };
  if (Array.isArray(s.msrc) || (Array.isArray(s.mpa) && s.mpa.length))
    o.msrc = (Array.isArray(s.msrc) ? s.msrc : ["hue"])
      .map(function (x) {
        /* the scenes of a plugin were one source (and areas for it, mpa); they are Hue rooms among the rooms now */
        return x === "hue" || x === "plugin" ? "hue:@lights" : x === "page" ? "page" : x;
      })
      .filter(function (x, i, a) {
        return (x === "page" || (typeof x === "string" && (/^(page:[a-z0-9_-]{1,24}|area:[a-z0-9_-]{1,60})$/.test(x) || x === "ha:@page" || /^hue:(@lights|@page|@rooms|[a-z0-9_-]{1,60})$/.test(x) || /^group:(room|zone):[a-z0-9-]{1,60}$/.test(x) || (/^tag:/.test(x) && cleanTags([x.slice(4)]).length)))) && a.indexOf(x) === i;
      })
      .slice(0, 40);
  if (Array.isArray(s.mpa) && s.mpa.length) {
    o.msrc = o.msrc.filter(function (x) {
      return x !== "hue:@lights";
    });
    s.mpa.forEach(function (a) {
      if (typeof a === "string" && /^[a-z0-9_-]{1,60}$/.test(a) && a !== "-" && o.msrc.indexOf("hue:" + a) < 0) o.msrc.push("hue:" + a);
    });
  }
  /* Scenes tagged with any of these are left out of what the sources bring in (not of the scenes made from its own +). */
  var xt = cleanTags(s.mxt);
  if (xt.length) o.mxt = xt;

  if (Array.isArray(s.mf)) {
    var folders = s.mf
      .filter(function (f) {
        return f && typeof f.id === "string" && /^[a-z0-9]{1,12}$/.test(f.id) && typeof f.n === "string" && Array.isArray(f.s);
      })
      .slice(0, 30)
      .map(function (f) {
        return { id: f.id, n: f.n.slice(0, 40), s: f.s.filter(key).slice(0, 200) };
      })
      .filter(function (f) {
        return f.s.length;
      });
    if (folders.length) o.mf = folders;
  }
  /* A folder's tile is "f:" and its id in the order. */
  if (Array.isArray(s.mtop))
    o.mtop = s.mtop
      .filter(function (x) {
        return key(x) || (typeof x === "string" && /^f:[a-z0-9]{1,12}$/.test(x));
      })
      .slice(0, 600);
  if (Array.isArray(s.scn))
    o.scn = s.scn
      .filter(function (x, i, a) {
        return typeof x === "string" && /^[a-z0-9_-]{1,24}$/.test(x) && a.indexOf(x) === i;
      })
      .slice(0, 200);
  return o;
}

/* A section that has a master (its own settings on it, or the ones it holds in masters) has them as widgets of it now (Layout 7): the section's own as the widget named for the section, so its key stays "page~section", the held ones under the id they had. */
function mastersToWidgets(s) {
  if (!s.master && !(Array.isArray(s.masters) && s.masters.length)) return s;
  var c = Object.assign({}, s),
    list = [],
    mk_ = function (id, x) {
      return { kind: "widget", id: "", w: "lmaster", wid: id, name: _T("lights_master"), icon: "lights", wx: x };
    };
  if (s.master) {
    var own = { own: 1 };
    LM_OWN.concat(["mpa"]).forEach(function (k) {
      if (s[k] !== undefined && s[k] !== null) own[k] = s[k];
    });
    list.push(mk_(s.id, own));
  }
  (Array.isArray(s.masters) ? s.masters : []).slice(0, 12).forEach(function (m) {
    /* a held master was always manual: the lights are chosen for it */
    if (m && typeof m.id === "string") list.push(mk_(m.id, Object.assign({}, m, { mm: 1 })));
  });
  LM_OWN.concat(["mpa", "masters"]).forEach(function (k) {
    delete c[k];
  });
  c.devs = list.concat(Array.isArray(s.devs) ? s.devs : []);
  return c;
}

/* Layout 7 (decision D-25): the sections that were not plain Sections become plain Sections whose devices and widgets carry what the type had. Note: a note widget. Readings: the devices as tiles. Chart: a chart
   widget with its sensors and range. Camera: the cameras at size l. The section keeps its name and icon (the type's, when none was given). */
function sectionToWidgets(s) {
  var c = Object.assign({}, s),
    devs = Array.isArray(s.devs) ? s.devs : [],
    named = function (name, icon) {
      if (!c.t) c.t = name;
      if (!c.i) c.i = icon;
    },
    widget = function (w, name, icon, wx) {
      return { kind: "widget", id: "", w: w, name: name, icon: icon, wx: wx };
    };
  if (s.k === "note") {
    named(_T("note"), "info");
    c.devs = devs.concat([widget("note", _T("note"), "info", { txt: s.txt })]);
  } else if (s.k === "read") {
    named(_T("readings"), "drop");
    c.devs = devs.map(function (d) {
      return d && d.id ? Object.assign({}, d, { sz: "s" }) : d;
    });
  } else if (s.k === "chart") {
    named(_T("chart"), "thermo");
    c.devs = [
      widget("chart", _T("chart"), "thermo", {
        ds: devs
          .filter(function (d) {
            return d && d.id && !d.hide;
          })
          .map(function (d) {
            return { id: d.id, name: d.name };
          }),
        r: s.r,
      }),
    ];
  } else if (s.k === "security") {
    named(_T("security"), "lock");
    c.devs = devs.concat([widget("security", _T("security"), "lock", {})]);
  } else if (s.k === "cameras") {
    named(_T("cameras"), "cam");
    c.devs = devs.concat([widget("cameras", _T("cameras"), "cam", {})]);
  } else if (s.k === "energy") {
    named(_T("energy_and_usage"), "plug");
    c.devs = devs.concat([widget("energy", _T("energy_and_usage"), "plug", { price: s.price, cur: s.cur })]);
  } else if (s.k === "alerts" || s.k === "rooms" || s.k === "now" || s.k === "status" || s.k === "chips") {
    var T = { alerts: ["attention", "alert"], rooms: ["rooms", "home"], now: ["on_now", "power"], status: ["status_tiles", "thermo"], chips: ["climate_overview", "thermo"] }[s.k];
    named(_T(T[0]), T[1]);
    c.devs = devs.concat([widget(s.k, _T(T[0]), T[1], {})]);
  } else if (s.k === "glance") {
    named(_T("at_a_glance"), "home");
    c.devs = devs.concat([widget("glance", _T("at_a_glance"), "home", { gl: s.gl })]);
  } else if (s.k === "pinned") {
    named(_T("pinned"), "pin");
    c.devs = devs.concat([widget("pinned", _T("pinned"), "pin", { pins: s.pins, lay: s.lay })]);
    delete c.lay;
  } else if (s.k === "link") {
    named(_T("linked_section"), "swap");
    c.devs = devs.concat([widget("link", _T("linked_section"), "swap", { ref: s.ref })]);
  } else if (s.k === "camera") {
    named(_T("camera"), "cam");
    c.devs = devs.map(function (d) {
      return d && d.kind === "camera" && d.id ? Object.assign({}, d, { sz: "l" }) : d;
    });
  }
  ["txt", "r", "price", "cur", "gl", "pins", "ref"].forEach(function (k) {
    delete c[k];
  });
  c.k = "devs";
  return c;
}

function cleanLayout(a) {
  var out = [],
    seen = {};
  (Array.isArray(a) ? a : []).slice(0, 40).forEach(function (s) {
    if (!s || typeof s.id !== "string" || !/^[a-z][a-z0-9_]{1,14}$/.test(s.id) || seen[s.id])
      return;
    seen[s.id] = 1;
    /* Layout 5: the sections that held devices (Lights, Media, Climate, Controls, Sensors, Other devices, Devices) are one kind, Section; each keeps the name and icon its type gave it. Quick actions are Scenes. */
    /* Layout 6: the scenes a Section showed (a scenes section's, or the ones kept on a Section) are devices of it now: each chosen scene, and one collection of scenes for the pages, tags and area it took in. */
    if (s.k === "scenes" || s.k === "quick" || s.scs) s = scenesToDevices(s);
    /* Layout 7: the sections that were not plain Sections but held devices or text are plain Sections with widgets (see sectionToWidgets). */
    if (["note", "read", "chart", "camera", "security", "cameras", "energy", "alerts", "rooms", "now", "status", "chips", "glance", "pinned", "link"].indexOf(s.k) >= 0) s = sectionToWidgets(s);
    if (s.master || s.masters) s = mastersToWidgets(s);
    var old = LEGACY_SECTYPES[s.k],
      k = old ? (old[2] || "devs") : typeof s.k === "string" && SECTYPES[s.k] ? s.k : "devs",
      ty = SECTYPES[k],
      o = { id: s.id, k: k, hide: !!s.hide };
    if (typeof s.t === "string" && s.t && s.t.length <= 40) o.t = s.t;
    else if (old && old[0]) o.t = old[0];
    if (iconOk(s.i)) o.i = s.i;
    else if (old && old[1]) o.i = old[1];
    var wh = s.when;
    if (
      wh &&
      typeof wh === "object" &&
      typeof wh.id === "string" &&
      ENTRE.test(wh.id) &&
      typeof wh.is === "string" &&
      wh.is.length > 0 &&
      wh.is.length <= 40
    )
      o.when = { id: wh.id, is: wh.is, not: !!wh.not };
    if (layCols(s.lay)) o.lay = s.lay;
    if (s.span === 1 || s.span === 2 || s.span === 3 || s.span === 4) o.span = s.span;
    var an = (Array.isArray(s.and) ? s.and : []).slice(0, 4).map(cleanCond).filter(Boolean);
    if (an.length) o.and = an;
    /* the contents of a Popup widget (app/popupwidget.js) */
    if (k === "devs" && typeof s.of === "string" && WIDRE.test(s.of)) o.of = s.of;
    if ((k === "scenes" || k === "devs") && Array.isArray(s.scn))
      o.scn = s.scn
        .filter(function (x, i, a) {
          return typeof x === "string" && /^[a-z0-9_-]{1,24}$/.test(x) && a.indexOf(x) === i;
        })
        .slice(0, 200);
    if (ty.own) {
      o.devs = [];
      /* A lights master is named by its id, which no other master of the page, and no section but its own, may have (the Section's own master has the Section's id). */
      var mine = {};
      (Array.isArray(s.devs) ? s.devs : []).slice(0, 200).forEach(function (d) {
        var c = cleanDev(d);
        if (c && c.kind === "widget" && c.w === "lmaster") {
          if (mine[c.wid] || (c.wid !== s.id && seen[c.wid]) || c.wid.length > 15) c = null;
          else mine[c.wid] = seen[c.wid] = 1;
        }
        if (c) o.devs.push(c);
      });
    }
    out.push(o);
  });
  return dropOrphanPopups(out);
}

/* A popup's contents go with its widget: a Section `of` a widget that is no longer on the page is dropped (and then those of popups that were inside it). */
function dropOrphanPopups(list) {
  var owners = {};
  list.forEach(function (s) {
    (s.devs || []).forEach(function (d) {
      if (d.kind === "widget" && d.w === "popup") owners[d.wid] = 1;
    });
  });
  var kept = list.filter(function (s) {
    return !s.of || owners[s.of];
  });
  return kept.length < list.length ? dropOrphanPopups(kept) : kept;
}

/* The devices of a page are whatever its sections hold. UI.devs is rebuilt from them; it is saved with the layout for the code that looks a page's devices up by room. */
function devIndex(o) {
  var idx = {};
  o.rooms.forEach(function (r) {
    var l = [],
      secs = (o.layout.rooms || {})[r.id] || [];
    /* the page's own Sections first: what is also in a popup is listed once */
    secs.filter(function (s) { return !s.of; }).concat(secs.filter(function (s) { return s.of; })).forEach(function (s) {
      var have = {};
      (s.devs || []).forEach(function (d) {
        if (d.id) have[d.id] = 1;
        if (s.of && d.id && l.some(function (x) { return x.id === d.id; })) return;
        l.push(d);
      });
      /* The lights chosen for a lights master (its own, or one the section holds) are lights of the page too: room counts, the room's everything-off and conditions see them, also when no section lists them. */
      (s.devs || []).reduce(function (a, m) {
        return m.kind === "widget" && m.w === "lmaster" && m.wx ? a.concat(m.wx.mm ? m.wx.ml || [] : []) : a;
      }, []).forEach(function (d) {
        if (d && d.id && !have[d.id] && !l.some(function (x) { return x.id === d.id; })) {
          have[d.id] = 1;
          l.push(d);
        }
      });
    });
    idx[r.id] = l;
  });
  o.devs = idx;
}

function applyUI() {
  devIndex(UI);
  accessInit();
  var mt = UI.meta || {
    homeTab: _T("home"),
    homeTitle: _T("app_title"),
    eyebrow: _T("app_title"),
    clock: true,
  };
  TITLES = { home: mt.homeTitle };
  ORDER = ["home"];
  DOCK = [["home", mt.homeTab, "home", "home"]];
  ROOMLIGHTS = {};
  LNAME = {};
  UIROOM = {};
  UIDEV = {};
  UIOWN = {};
  OWNALL = {};
  UI.rooms.forEach(function (r) {
    (UI.devs[r.id] || []).forEach(function (d) {
      if (d.id && !OWNALL[d.id]) OWNALL[d.id] = r.id;
    });
  });
  /* The batteries tracked; those of a hidden room are left out where others see them (batVisible). */
  BATLIST = (UI.bats || []).slice();
  UI.rooms.forEach(function (r) {
    if (r.hide || roomHidden(r.id)) return;
    UIROOM[r.id] = r;
    TITLES[r.id] = r.name;
    ORDER.push(r.id);
    DOCK.push([r.id, r.short || r.name.split(" ")[0].slice(0, 16), r.id, r.icon || "home"]);
    visDevs(r.id).forEach(function (d) {
      if (d.hide) return;
      if (d.id) {
        if (!UIDEV[d.id]) UIDEV[d.id] = d;
        if (!UIOWN[d.id]) UIOWN[d.id] = r.id;
      }
      if (d.kind === "light") {
        (ROOMLIGHTS[r.id] = ROOMLIGHTS[r.id] || []).push(d.id);
        LNAME[d.id] = [d.name, d.icon || "light"];
      }
    });
  });
  var secs = [UI.layout.home];
  Object.keys(UI.layout.rooms).forEach(function (k) {
    secs.push(UI.layout.rooms[k]);
  });
  secs.forEach(function (arr) {
    arr.forEach(function (s) {
      (s.devs || []).concat(s.lx || []).forEach(function (d) {
        if (d.kind === "light" && d.id && !LNAME[d.id]) LNAME[d.id] = [d.name, d.icon || "light"];
      });
    });
  });
  var eb = document.querySelector(".eyebrow"),
    ck = document.querySelector(".clock");
  if (eb) {
    eb.textContent = mt.eyebrow;
    eb.style.display = mt.eyebrow ? "" : "none";
  }
  if (ck) ck.style.display = hdrClockShown(mt) ? "" : "none";
  hdrBuild();
  if (ORDER.indexOf(VIEW) < 0) VIEW = "home";
}

function devsOf(kind) {
  var out = [];
  UI.rooms.forEach(function (r) {
    if (r.hide) return;
    visDevs(r.id).forEach(function (d) {
      if (d.hide || (kind && d.kind !== kind)) return;
      var c = {};
      for (var k in d) c[k] = d[k];
      c.room = r.id;
      out.push(c);
    });
  });
  return out;
}
