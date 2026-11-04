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
];

/* The starting layout when nothing is saved yet: one room per Home Assistant area with its controllable devices,
 temperature and humidity tiles, and every battery sensor tracked. Built from Home Assistant, so it fits any home. */
/* The lights that are the zones of another light (a gradient tube is one light with a light for each of its colour zones). They are not put on a page by themselves: the main light controls its zones, and one can still be added by hand. */
function zoneLightIds(states) {
  var out = {};
  Object.keys(states).forEach(function (id) {
    var a = states[id].attributes || {};
    if (id.indexOf("light.") === 0 && Array.isArray(a.zone_colors) && Array.isArray(a.entity_id))
      a.entity_id.forEach(function (m) {
        if (m !== id) out[m] = 1;
      });
  });
  return out;
}

function seedUI() {
  var h = H(),
    rooms = [],
    devs = {},
    stat = {},
    chips = [],
    bats = [],
    all = Object.keys(h.states),
    zones = zoneLightIds(h.states),
    ids = all.filter(function (id) {
      var e = h.entities[id];
      return !zones[id] && !(e && (e.entity_category || e.hidden || e.disabled_by));
    });
  function inArea(a, id) {
    return areaIdOf(id) === a;
  }
  function byClass(a, c) {
    return ids.filter(function (id) {
      return inArea(a, id) && dom(id) === "sensor" && A(id).device_class === c;
    })[0];
  }
  Object.values(h.areas || {}).forEach(function (a) {
    var rid = ("r_" + a.area_id).replace(/[^a-z0-9_-]/g, "").slice(0, 24),
      list = [],
      t = byClass(a.area_id, "temperature"),
      hu = byClass(a.area_id, "humidity");
    ids.forEach(function (id) {
      var kind = DOMKIND[dom(id)];
      if (
        !inArea(a.area_id, id) ||
        ["light", "switch", "fan", "climate", "media", "vacuum", "camera"].indexOf(kind) < 0
      )
        return;
      var nm = A(id).friendly_name || id;
      list.push({ id: id, name: nm, icon: defIcon(kind, nm, id), kind: kind });
    });
    rooms.push({
      id: rid,
      name: a.name,
      short: a.name.split(" ")[0].slice(0, 16),
      icon: "home",
      area: a.area_id,
    });
    devs[rid] = list;
    stat[rid] = [];
    if (t) {
      stat[rid].push({ l: _T("temperature"), id: t, u: TEMPU(), dp: 1 });
      var c = { l: a.name, t: t };
      if (hu) c.h = hu;
      chips.push(c);
    }
    if (hu) stat[rid].push({ l: _T("humidity"), id: hu, u: "%", dp: 0 });
  });
  all.forEach(function (id) {
    if ((dom(id) === "sensor" || dom(id) === "binary_sensor") && A(id).device_class === "battery")
      bats.push([(A(id).friendly_name || id).replace(/\s*battery\s*$/i, "").slice(0, 40), id]);
  });
  return {
    rooms: rooms,
    devs: devs,
    chips: chips.slice(0, 4),
    stat: stat,
    bats: bats.slice(0, 30),
    layout: { home: [], rooms: {}, cols: {} },
    meta: {
      homeTab: _T("home"),
      homeTitle: _T("app_title"),
      eyebrow: _T("app_title"),
      clock: true,
    },
  };
}

var ENTRE = /^[a-z_]+\.[a-z0-9_]+$/,
  POPRE = /^[a-z0-9_:.-]{0,60}$/;

function cleanMeta(m) {
  m = m || {};
  var s = function (v, n, d) {
    return typeof v === "string" && v.length <= n ? v : d;
  };
  return {
    homeTab: s(m.homeTab, 16, _T("home")) || _T("home"),
    homeTitle: s(m.homeTitle, 40, _T("app_title")) || _T("app_title"),
    eyebrow: s(m.eyebrow, 30, _T("app_title")),
    clock: m.clock !== false,
    clockSlim: m.clockSlim === true,
    size: m.size === "slim" ? "slim" : "regular",
    greet: m.greet === true,
    hdr: cleanHdr(m.hdr),
  };
}

function cleanHdr(a) {
  var out = [];
  (Array.isArray(a) ? a : []).slice(0, 4).forEach(function (x) {
    if (!x || ["weather", "people", "lights", "entity"].indexOf(x.k) < 0) return;
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
function cleanRemote(r) {
  var cols = r && typeof r.cols === "number" ? Math.max(2, Math.min(6, Math.round(r.cols))) : 3,
    out = { cols: cols, btns: [] },
    img = r && r.img;
  /* A picture of the remote: one of the integration's uploads or a file under /local/, with touch areas in percent of the picture. */
  if (img && typeof img.u === "string" && /^(\/home_control_remotes\/[a-f0-9]{12}\.(png|jpg|webp)|\/local\/[A-Za-z0-9_\-./]{1,150})(\?[A-Za-z0-9=_\-]{1,20})?$/.test(img.u) && img.u.indexOf("..") < 0) {
    var pct = function (v, lo, hi) {
      return typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : lo;
    };
    out.img = { u: img.u, hs: [] };
    (Array.isArray(img.hs) ? img.hs : []).slice(0, 60).forEach(function (h) {
      if (!h || typeof h.e !== "string" || !ENTRE.test(h.e)) return;
      if (["script", "button", "input_button", "scene", "switch"].indexOf(h.e.split(".")[0]) < 0) return;
      var w = pct(h.w, 3, 100),
        hh = pct(h.h, 3, 100);
      out.img.hs.push({ x: pct(h.x, 0, 100 - w), y: pct(h.y, 0, 100 - hh), w: w, h: hh, r: h.r === "ellipse" ? "ellipse" : "rect", e: h.e });
    });
    if (r.v === "i") out.v = "i";
  }
  (r && Array.isArray(r.btns) ? r.btns : []).slice(0, 60).forEach(function (x) {
    if (!x || typeof x.e !== "string" || !ENTRE.test(x.e)) return;
    if (["script", "button", "input_button", "scene", "switch"].indexOf(x.e.split(".")[0]) < 0) return;
    var s = typeof x.s === "number" ? Math.round(x.s) : 1;
    out.btns.push({
      e: x.e,
      i: iconOk(x.i) ? x.i : "info",
      l: typeof x.l === "string" ? x.l.slice(0, 24) : "",
      s: Math.max(1, Math.min(cols, 2, s)),
    });
  });
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
      remaining: ["sensor", "input_datetime"],
      door: ["binary_sensor", "sensor"],
      permission: ["binary_sensor", "switch", "input_boolean"],
    },
    extraDoms = ["select", "input_select", "number", "input_number", "switch", "input_boolean", "binary_sensor", "sensor", "button", "input_button", "script"],
    out = { type: "other", slots: {}, extra: [] };
  if (a && ["oven", "washer", "dryer", "dishwasher", "other"].indexOf(a.type) >= 0) out.type = a.type;
  Object.keys(slotDoms).forEach(function (k) {
    var e = a && a.slots && a.slots[k];
    if (typeof e === "string" && ENTRE.test(e) && slotDoms[k].indexOf(e.split(".")[0]) >= 0) out.slots[k] = e;
  });
  (a && Array.isArray(a.extra) ? a.extra : []).slice(0, 12).forEach(function (x) {
    if (x && typeof x.e === "string" && ENTRE.test(x.e) && extraDoms.indexOf(x.e.split(".")[0]) >= 0)
      out.extra.push({ e: x.e, l: typeof x.l === "string" ? x.l.slice(0, 30) : "" });
  });
  return out;
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
  if (!id && d.kind !== "special" && d.kind !== "remote" && d.kind !== "appliance") return null;
  if (d.kind === "appliance" && !(typeof d.aid === "string" && /^[a-z0-9_-]{1,24}$/.test(d.aid))) return null;
  if (d.kind === "remote" && !(typeof d.rid === "string" && /^[a-z0-9_-]{1,24}$/.test(d.rid))) return null;
  var c = { id: id, name: d.name, icon: iconOk(d.icon) ? d.icon : "plug", kind: d.kind };
  if (typeof d.pop === "string" && POPRE.test(d.pop) && d.pop) c.pop = d.pop;
  if (d.sub) c.sub = 1;
  if (d.setup) c.setup = 1;
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
  if (d.split && d.kind === "light") c.split = 1;
  if (d.noadv) c.noadv = 1;
  if (d.noslide && d.kind === "lock") c.noslide = 1;
  if (d.kind === "vacuum" && d.map && typeof d.map === "object") {
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

function cleanUI(u) {
  if (!u || typeof u !== "object") return null;
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
            return typeof x === "string" && ENTRE.test(x);
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
        if (Object.keys(x).length) o.on[id] = x;
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
        .slice(0, 80);
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
      if (!s || !ok(s.l, 30) || typeof s.id !== "string" || !ENTRE.test(s.id)) return;
      var c = { l: s.l, id: s.id };
      if (typeof s.u === "string" && s.u.length <= 10) c.u = s.u;
      if (typeof s.dp === "number") c.dp = Math.max(0, Math.min(3, Math.round(s.dp)));
      if (s.text) c.text = 1;
      out.push(c);
    });
    o.stat[rid] = out;
  });
  (Array.isArray(u.bats) ? u.bats : []).slice(0, 30).forEach(function (b) {
    if (Array.isArray(b) && ok(b[0], 40) && typeof b[1] === "string" && ENTRE.test(b[1]))
      o.bats.push([b[0], b[1]]);
  });
  var lv = u.layout && u.layout.v,
    cur = lv >= 3 ? { home: u.layout.home, rooms: u.layout.rooms || {} } : migrateLayout(u, ids);
  o.layout.v = lv >= 4 ? 4 : 3;
  o.layout.home = cleanLayout(cur.home);
  Object.keys(ids).forEach(function (rid) {
    o.layout.rooms[rid] = cleanLayout(cur.rooms[rid] || seedSections("room:" + rid));
  });
  o.layout.cols = {};
  ["home"].concat(Object.keys(ids)).forEach(function (k) {
    var c = u.layout && u.layout.cols && u.layout.cols[k];
    if (c === 1 || c === 2 || c === 3) o.layout.cols[k] = c;
  });
  devIndex(o);
  return o;
}

function cleanLayout(a) {
  var out = [],
    seen = {};
  (Array.isArray(a) ? a : []).slice(0, 40).forEach(function (s) {
    if (!s || typeof s.id !== "string" || !/^[a-z][a-z0-9_]{1,14}$/.test(s.id) || seen[s.id])
      return;
    seen[s.id] = 1;
    var k = typeof s.k === "string" && SECTYPES[s.k] ? s.k : "devs",
      ty = SECTYPES[k],
      o = { id: s.id, k: k, hide: !!s.hide };
    if (s.w === "full" || s.w === "half") o.w = s.w;
    if (typeof s.t === "string" && s.t && s.t.length <= 40) o.t = s.t;
    if (iconOk(s.i)) o.i = s.i;
    if (k === "glance" && s.gl && typeof s.gl === "object") {
      var cs = [];
      (Array.isArray(s.gl.c) ? s.gl.c : []).slice(0, 12).forEach(function (x) {
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
      o.gl = { o: pk(s.gl.o), h: pk(s.gl.h), c: cs };
      if (s.gl.f) o.gl.f = 1;
    }
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
    if (s.lay === "grid2" || s.lay === "grid3" || (k === "pinned" && s.lay === "list"))
      o.lay = s.lay;
    if (k === "chart" && (s.r === "6h" || s.r === "24h" || s.r === "7d" || s.r === "30d"))
      o.r = s.r;
    if (k === "energy") {
      var pr = Number(s.price);
      if (isFinite(pr) && pr > 0 && pr <= 1000) o.price = pr;
      if (typeof s.cur === "string" && s.cur.length <= 4) o.cur = s.cur;
    }
    if (k === "note" && typeof s.txt === "string") o.txt = s.txt.slice(0, 600);
    var an = (Array.isArray(s.and) ? s.and : []).slice(0, 4).map(cleanCond).filter(Boolean);
    if (an.length) o.and = an;
    if (
      k === "link" &&
      typeof s.ref === "string" &&
      /^[a-z0-9_-]{1,24}:[a-z][a-z0-9_]{1,14}$/.test(s.ref)
    )
      o.ref = s.ref;
    if (k === "lights" && s.noall) o.noall = 1;
    if (k === "lights" && s.master) o.master = 1;
    if (k === "lights" && s.master && typeof s.mn === "string" && s.mn.trim()) o.mn = s.mn.trim().slice(0, 40);
    if (k === "lights" && s.master && s.mall) o.mall = 1;
    if (k === "lights" && s.nowheel) o.nowheel = 1;
    if (k === "lights" && s.accent) o.accent = 1;
    if (k === "pinned" && Array.isArray(s.pins)) o.pins = cleanPins(s.pins);
    if ((k === "quick" || k === "scenes") && Array.isArray(s.scn))
      o.scn = s.scn
        .filter(function (x, i, a) {
          return typeof x === "string" && /^[a-z0-9_-]{1,24}$/.test(x) && a.indexOf(x) === i;
        })
        .slice(0, 40);
    /* The order of the Hue scenes a scenes section shows. */
    if (k === "scenes" && Array.isArray(s.hord)) {
      var hord = s.hord
        .filter(function (x, i, a) {
          return typeof x === "string" && /^scene\.[a-z0-9_]{1,80}$/.test(x) && a.indexOf(x) === i;
        })
        .slice(0, 80);
      if (hord.length) o.hord = hord;
    }
    if (ty.own) {
      o.devs = [];
      (Array.isArray(s.devs) ? s.devs : []).slice(0, 80).forEach(function (d) {
        var c = cleanDev(d);
        if (c) o.devs.push(c);
      });
    }
    out.push(o);
  });
  return out;
}

/* Layouts saved before sections became data (v3): the built-in sections are written out explicitly and each room's devices move into them. */
function oldOrder(saved, def) {
  var out = [],
    seen = {};
  (Array.isArray(saved) ? saved : []).forEach(function (s) {
    if (!s || typeof s.id !== "string" || seen[s.id]) return;
    var custom = def.indexOf(s.id) < 0 && /^c[a-z0-9]{3,10}$/.test(s.id);
    if (!custom && def.indexOf(s.id) < 0) return;
    seen[s.id] = 1;
    out.push(s);
  });
  def.forEach(function (id) {
    if (!seen[id]) out.push({ id: id });
  });
  return out;
}

function migrateLayout(u, ids) {
  var lay = u.layout || {},
    hdef = HOME_TPL.map(function (x) {
      return x[0];
    }),
    home = oldOrder(lay.home, hdef).map(function (s) {
      var t = HOME_TPL.filter(function (x) {
          return x[0] === s.id;
        })[0],
        n = Object.assign({}, s);
      n.k = t ? t[1] : SECTYPES[s.k] ? s.k : "devs";
      delete n.custom;
      return n;
    }),
    rooms = {};
  Object.keys(ids).forEach(function (rid) {
    var arr = oldOrder((lay.rooms || {})[rid], ROOM_TPL).map(function (s) {
      var n = Object.assign({}, s),
        b = ROOM_TPL.indexOf(s.id) >= 0;
      n.k = b ? s.id : SECTYPES[s.k] ? s.k : "devs";
      delete n.custom;
      if (b && SECTYPES[n.k].own) n.devs = [];
      return n;
    });
    (u.devs && Array.isArray(u.devs[rid]) ? u.devs[rid] : []).forEach(function (d) {
      if (!d) return;
      var want = d.kind === "camera" ? "camera" : secOf(d),
        t = arr.filter(function (x) {
          return x.id === want;
        })[0];
      if (t) t.devs.push(d);
    });
    rooms[rid] = arr;
  });
  return { home: home, rooms: rooms };
}

/* The devices of a page are whatever its sections hold. UI.devs is rebuilt from them; it is saved only so that a copy of the dashboard from before sections still opens a migrated store. */
function devIndex(o) {
  var idx = {};
  o.rooms.forEach(function (r) {
    var l = [];
    ((o.layout.rooms || {})[r.id] || []).forEach(function (s) {
      (s.devs || []).forEach(function (d) {
        l.push(d);
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
  /* Battery sensors of a hidden room are left out like the room's devices. */
  BATLIST = (UI.bats || []).filter(function (x) {
    return ISADMIN || modeOf(x[1]).mode !== "hide";
  });
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
      (s.devs || []).forEach(function (d) {
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
