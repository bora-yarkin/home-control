/* The guided setup (decision D-39): a new dashboard starts empty and is built from what the person picks, step by step. Nothing is put on a page that was not chosen here.
   setupSource reads Home Assistant, setupDefaults suggests, setupBuild makes the dashboard from the choices; the popup only changes the choices. */

var SETUP = null;

var SETUP_STEPS = ["welcome", "rooms", "lights", "master", "scenes", "media", "devices", "readings", "home", "review"];

/* The kinds of the "other devices" step: [domain, its text, suggested]. Switches are mostly settings of other things, so none is suggested. */
var SETUP_OTHER = [
  ["climate", "climate", true],
  ["fan", "fans", true],
  ["cover", "setup_covers", true],
  ["lock", "setup_locks", true],
  ["vacuum", "vacuum", true],
  ["camera", "cameras", true],
  ["switch", "switches", false],
];

var SETUP_HOME = [
  ["alerts", "attention"],
  ["glance", "at_a_glance"],
  ["rooms", "rooms"],
  ["scenes", "scenes"],
  ["weather", "setup_hdr_weather"],
  ["people", "setup_hdr_people"],
  ["lights", "setup_hdr_lights"],
];

/* An empty dashboard that asks to be set up (meta.setup). */
function setupEmpty() {
  return {
    rooms: [],
    devs: {},
    chips: [],
    stat: {},
    bats: [],
    layout: { v: 8, home: [], rooms: {}, cols: {} },
    meta: { homeTab: _T("home"), homeTitle: _T("app_title"), eyebrow: _T("app_title"), clock: true, setup: true },
  };
}

/* What Home Assistant has, by area: every entity a page could hold. Hidden, disabled, diagnostic and configuration entities are left out, and the zones of a light. */
function setupSource() {
  var h = H(),
    zones = zoneLightIds(h.states, h.entities),
    members = {},
    areas = Object.keys(h.areas || {})
      .map(function (id) {
        return { id: id, name: h.areas[id].name, items: {} };
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      }),
    by = {};
  areas.forEach(function (a) {
    by[a.id] = a;
  });
  Object.keys(h.states).forEach(function (id) {
    var e = h.entities[id],
      a = h.states[id].attributes || {},
      d = dom(id),
      area = by[areaIdOf(id)];
    if (!area || zones[id] || (e && (e.entity_category || e.hidden || e.disabled_by))) return;
    if (d === "sensor") {
      if (a.device_class !== "temperature" && a.device_class !== "humidity") return;
      d = a.device_class;
    }
    if (d === "light" && Array.isArray(a.entity_id))
      a.entity_id.forEach(function (m) {
        if (m !== id) members[m] = id;
      });
    if (d === "camera" && isVacuumMap(id)) return;
    (area.items[d] = area.items[d] || []).push({ id: id, name: setupName(a.friendly_name || id, area.name), platform: (e && e.platform) || "" });
  });
  areas.forEach(function (a) {
    Object.keys(a.items).forEach(function (d) {
      a.items[d].sort(function (x, y) {
        return x.name.localeCompare(y.name);
      });
    });
  });
  return { areas: areas, members: members };
}

/* A device's name without its room's in front: "Living room floor lamp" on the Living room page is "Floor lamp". */
function setupName(name, room) {
  var n = String(name);
  if (room && n.toLowerCase().indexOf(room.toLowerCase() + " ") === 0) {
    var rest = n.slice(room.length + 1).trim();
    if (rest) n = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return n.slice(0, 40);
}

function setupItems(area, d) {
  return area.items[d] || [];
}

/* What is suggested: rooms with something to control; light groups rather than their lights; players that are not a second entity of a box already listed; no switches. */
function setupDefaults(src) {
  var c = { rooms: {}, on: {}, row: {}, master: true, min: 3, scenes: "master", home: { alerts: true, glance: true, rooms: true, scenes: true, weather: true, people: true, lights: true } };
  src.areas.forEach(function (a) {
    c.rooms[a.id] = ["light", "climate", "media_player", "fan", "cover", "lock", "vacuum"].some(function (d) {
      return setupItems(a, d).length;
    });
    setupItems(a, "light").forEach(function (x) {
      c.on[x.id] = !src.members[x.id];
    });
    var players = setupItems(a, "media_player"),
      real = players.filter(function (x) {
        return x.platform !== "cast" && x.platform !== "dlna_dmr";
      });
    players.forEach(function (x) {
      c.on[x.id] = !real.length || real.indexOf(x) >= 0;
    });
    SETUP_OTHER.forEach(function (k) {
      setupItems(a, k[0]).forEach(function (x) {
        c.on[x.id] = k[2];
      });
    });
    setupItems(a, "scene").forEach(function (x) {
      c.on[x.id] = true;
    });
    ["temperature", "humidity"].forEach(function (d) {
      setupItems(a, d).forEach(function (x, i) {
        c.on[x.id] = i === 0;
      });
    });
  });
  return c;
}

function setupChosen(area, d, c) {
  return setupItems(area, d).filter(function (x) {
    return c.on[x.id];
  });
}

function setupRooms(src, c) {
  return src.areas.filter(function (a) {
    return c.rooms[a.id];
  });
}

function setupHasMaster(area, c) {
  return c.master && setupChosen(area, "light", c).length >= c.min;
}

/* Whether a room's scenes are in a section of their own: asked for, or there is no master to hold them. */
function setupSceneSection(area, c) {
  return c.scenes === "section" || c.scenes === "both" || (c.scenes === "master" && !setupHasMaster(area, c));
}

function setupDev(x, kind, icon) {
  return { kind: kind, id: x.id, name: x.name, icon: icon };
}

function setupWidget(w, wid, name, icon, wx) {
  return { kind: "widget", id: "", w: w, wid: wid, name: name, icon: icon, wx: wx || {} };
}

function setupSection(id, title, icon, devs) {
  return { id: id, k: "devs", t: title, i: icon, hide: false, devs: devs };
}

/* The dashboard of the choices. `old` is the dashboard now: its names, header and what is not about pages stay, and a room keeps its name, icon and picture. */
function setupBuild(src, c, old) {
  var ui = old ? JSON.parse(JSON.stringify(old)) : setupEmpty(),
    oldRooms = (old && old.rooms) || [];
  ui.rooms = [];
  ui.devs = {};
  ui.chips = [];
  ui.stat = {};
  ui.layout = { v: 8, home: [], rooms: {}, cols: {} };
  var sceneDevs = [],
    taken = {};
  setupRooms(src, c)
    .slice(0, 24)
    .forEach(function (a) {
      var had = oldRooms.filter(function (r) {
          return r.area === a.id;
        })[0],
        base = (had && had.id) || ("r_" + a.id).replace(/[^a-z0-9_-]/g, "").slice(0, 22),
        rid = base,
        n = 2;
      while (taken[rid]) rid = base.slice(0, 21) + "_" + n++;
      taken[rid] = 1;
      ui.rooms.push(had ? Object.assign({}, had, { id: rid, hide: false }) : { id: rid, name: a.name.slice(0, 40), short: a.name.split(" ")[0].slice(0, 16), icon: "home", area: a.id });

      var secs = [],
        lights = setupChosen(a, "light", c),
        scenes = setupChosen(a, "scene", c),
        master = setupHasMaster(a, c),
        inMaster = master && (c.scenes === "master" || c.scenes === "both"),
        inSection = scenes.length > 0 && setupSceneSection(a, c);

      if (lights.length) {
        var all = lights.map(function (x) {
            return setupDev(x, "light", "light");
          }),
          rows = all;
        if (master) {
          /* a manual master holds every chosen light; the section lists only those also wanted as rows of their own */
          var wx = { mm: 1, ml: all, mn: _T("all_lights") };
          wx.msrc = inMaster ? ["page", "ha:@page", "hue:@page"] : [];
          rows = [setupWidget("lmaster", "lights", _T("lights_master"), "lights", wx)].concat(
            all.filter(function (d) {
              return c.row[d.id];
            })
          );
        }
        secs.push(setupSection("lights", _T("lights"), "lights", rows));
      }
      if (inSection)
        secs.push(
          setupSection(
            "scenes",
            _T("scenes"),
            "scene",
            scenes.map(function (x) {
              return setupDev(x, "scene", "scene");
            })
          )
        );
      var media = setupChosen(a, "media_player", c).map(function (x) {
        return setupDev(x, "media", /tv|television/i.test(x.id + " " + x.name) ? "tv" : "speaker");
      });
      if (media.length) secs.push(setupSection("media", _T("media"), "tv", media));
      function pick(domains, kind, icon) {
        return domains.reduce(function (out, d) {
          return out.concat(
            setupChosen(a, d, c).map(function (x) {
              return setupDev(x, kind || d, icon || d);
            })
          );
        }, []);
      }
      var climate = pick(["climate"], "climate", "ac").concat(pick(["fan"], "fan", "fan"));
      if (climate.length) secs.push(setupSection("climate", _T("climate"), "ac", climate));
      var rest = pick(["cover"], "cover", "swap").concat(pick(["lock"], "lock", "lock"), pick(["vacuum"], "vacuum", "vac"), pick(["switch"], "switch", "plug"));
      if (rest.length) secs.push(setupSection("other", _T("other_devices"), "plug", rest));
      var cams = pick(["camera"], "camera", "cam").map(function (d) {
        d.sz = "l";
        return d;
      });
      if (cams.length) secs.push(setupSection("camera", _T("cameras"), "cam", cams));
      if (!secs.length) secs.push(setupSection("main", _T("section"), "tune", []));
      ui.layout.rooms[rid] = secs;

      var temp = setupChosen(a, "temperature", c),
        hum = setupChosen(a, "humidity", c);
      ui.stat[rid] = temp
        .map(function (x) {
          return { l: _T("temperature"), id: x.id };
        })
        .concat(
          hum.map(function (x) {
            return { l: _T("humidity"), id: x.id };
          })
        )
        .slice(0, 6);
      if (scenes.length) sceneDevs.push("page:" + rid);
    });

  var home = [];
  if (c.home.alerts) home.push(setupSection("alerts", _T("attention"), "info", [setupWidget("alerts", "walerts", _T("attention"), "info")]));
  if (c.home.glance) home.push(setupSection("glance", _T("at_a_glance"), "home", [setupWidget("glance", "wglance", _T("at_a_glance"), "home")]));
  if (c.home.rooms) home.push(setupSection("rooms", _T("rooms"), "home", [setupWidget("rooms", "wrooms", _T("rooms"), "home")]));
  if (c.home.scenes && c.scenes !== "none")
    home.push(setupSection("scenes", _T("scenes"), "scene", [{ id: "", kind: "scenes", name: _T("scenes"), icon: "scene", spage: ["page:home"] }]));
  ui.layout.home = home;
  var meta = Object.assign({}, ui.meta);
  delete meta.setup;
  meta.hdr = ["weather", "people", "lights"]
    .filter(function (k) {
      return c.home[k];
    })
    .map(function (k) {
      return { k: k };
    });
  ui.meta = meta;
  return ui;
}

/* ---- the popup ---- */

function setupOpen() {
  if (!ISADMIN) return;
  var src = setupSource();
  SETUP = { src: src, c: setupDefaults(src), step: 0 };
  showPopup("setup", true);
}

/* Replaces the pages with those of the choices. A dashboard that already has pages is saved to a file first. */
function setupApply() {
  var had = UI.rooms.length > 0,
    next = cleanUI(setupBuild(SETUP.src, SETUP.c, UI));
  function put() {
    UI = next;
    STORE.ui = UI;
    uiChanged();
    closeSheet();
    render();
    toast(_T("setup_done"));
  }
  if (!had) return put();
  confirmDlg(
    _T("setup_replace_ask"),
    function () {
      downloadBackup("dashboard-before-setup").then(put);
    },
    _T("setup_create")
  );
}

/* Nothing is built: the dashboard stays as it is and does not ask again. */
function setupSkip() {
  if (UI.meta && UI.meta.setup) {
    delete UI.meta.setup;
    uiChanged();
  }
  closeSheet();
}

var SETUP_ICON = { light: "light", scene: "scene", media_player: "tv", climate: "ac", fan: "fan", cover: "swap", lock: "lock", vacuum: "vac", camera: "cam", switch: "plug", sensor: "thermo" };

/* A row to tick; its icon says what it is, the mark at its end whether it is chosen. */
function setupCheck(box, name, sub, isOn, flip, icon) {
  var row = pill(icon || "home", name, {
    check: isOn,
    sub: sub
      ? function () {
          return sub;
        }
      : undefined,
    tap: function () {
      flip();
      row.refresh();
    },
  });
  box.appendChild(row);
}

/* A checklist of one kind or more, room by room. */
function setupList(box, domains, rooms, onKey) {
  var c = SETUP.c,
    any = false;
  rooms.forEach(function (a) {
    var items = domains.reduce(function (out, d) {
      return out.concat(setupItems(a, d));
    }, []);
    if (!items.length) return;
    any = true;
    box.appendChild(sep(a.name, "home"));
    items.forEach(function (x) {
      var map = c[onKey || "on"];
      setupCheck(box, x.name, x.id, function () {
        return !!map[x.id];
      }, function () {
        map[x.id] = !map[x.id];
      }, SETUP_ICON[dom(x.id)]);
    });
  });
  if (!any) box.appendChild(hintRow(_T("setup_nothing_here")));
}

function setupStep(box, name, redraw) {
  var c = SETUP.c,
    src = SETUP.src,
    rooms = setupRooms(src, c);
  box.appendChild(hintRow(_T("setup_" + name + "_hint")));
  if (name === "rooms") {
    if (!src.areas.length) box.appendChild(hintRow(_T("setup_no_areas")));
    src.areas.forEach(function (a) {
      var count = Object.keys(a.items).reduce(function (n, d) {
        return n + a.items[d].length;
      }, 0);
      setupCheck(box, a.name, count + " " + _T("setup_things"), function () {
        return !!c.rooms[a.id];
      }, function () {
        c.rooms[a.id] = !c.rooms[a.id];
      });
    });
  } else if (name === "lights") setupList(box, ["light"], rooms);
  else if (name === "master") {
    box.appendChild(
      seg(
        [
          [true, _T("setup_master_yes")],
          [false, _T("setup_master_no")],
        ],
        c.master,
        function (v) {
          c.master = v;
          redraw();
        }
      )
    );
    if (!c.master) return;
    segField(
      box,
      _T("setup_master_min"),
      [2, 3, 4, 5, 6].map(function (n) {
        return [n, String(n)];
      }),
      c.min,
      function (v) {
        c.min = v;
        redraw();
      }
    );
    var with_ = rooms.filter(function (a) {
      return setupHasMaster(a, c);
    });
    if (!with_.length) return box.appendChild(hintRow(_T("setup_master_none")));
    box.appendChild(hintRow(_T("setup_master_rows")));
    with_.forEach(function (a) {
      box.appendChild(sep(a.name, "lights"));
      setupChosen(a, "light", c).forEach(function (x) {
        setupCheck(box, x.name, "", function () {
          return !!c.row[x.id];
        }, function () {
          c.row[x.id] = !c.row[x.id];
        }, "light");
      });
    });
  } else if (name === "scenes") {
    box.appendChild(
      seg(
        (c.master ? [["master", _T("setup_in_master")]] : []).concat([["section", _T("setup_in_section")]], c.master ? [["both", _T("setup_in_both")]] : [], [["none", _T("none")]]),
        !c.master && c.scenes !== "none" ? "section" : c.scenes,
        function (v) {
          c.scenes = v;
          redraw();
        }
      )
    );
    /* a master shows all of its room's scenes: only the scenes of a section are picked one by one */
    var listed = c.scenes === "none" ? [] : rooms.filter(function (a) {
      return setupSceneSection(a, c);
    });
    if (listed.length) setupList(box, ["scene"], listed);
  } else if (name === "media") setupList(box, ["media_player"], rooms);
  else if (name === "devices") {
    SETUP_OTHER.forEach(function (k) {
      if (
        !rooms.some(function (a) {
          return setupItems(a, k[0]).length;
        })
      )
        return;
      box.appendChild(sep(_T(k[1]), "plug"));
      rooms.forEach(function (a) {
        setupItems(a, k[0]).forEach(function (x) {
          setupCheck(box, x.name, a.name, function () {
            return !!c.on[x.id];
          }, function () {
            c.on[x.id] = !c.on[x.id];
          }, SETUP_ICON[k[0]]);
        });
      });
    });
  } else if (name === "readings") setupList(box, ["temperature", "humidity"], rooms);
  else if (name === "home")
    SETUP_HOME.forEach(function (k) {
      setupCheck(box, _T(k[1]), "", function () {
        return !!c.home[k[0]];
      }, function () {
        c.home[k[0]] = !c.home[k[0]];
      });
    });
  else if (name === "review")
    rooms.forEach(function (a) {
      var n = ["light", "media_player", "scene"].concat(SETUP_OTHER.map(function (k) { return k[0]; })).reduce(function (sum, d) {
        return sum + (d === "scene" && (c.scenes === "none" || !setupSceneSection(a, c)) ? 0 : setupChosen(a, d, c).length);
      }, 0);
      box.appendChild(
        pill("home", a.name, {
          sub: function () {
            return n + " " + _T("setup_things") + (setupHasMaster(a, c) ? " · " + _T("lights_master") : "");
          },
        })
      );
    });
}

function setupPage(b) {
  if (!SETUP) return;
  var box = mk("div");
  b.appendChild(box);
  function go(step) {
    SETUP.step = Math.max(0, Math.min(SETUP_STEPS.length - 1, step));
    redrawBox(box, draw);
    var sheet = box.closest(".sheet");
    if (sheet) sheet.scrollTop = 0;
  }
  function draw() {
    var name = SETUP_STEPS[SETUP.step];
    box.appendChild(sep(_T("setup_" + name) + (SETUP.step ? " · " + SETUP.step + "/" + (SETUP_STEPS.length - 1) : ""), "tune"));
    if (name === "welcome") {
      box.appendChild(hintRow(_T("setup_welcome_hint")));
      box.appendChild(pill("play", _T("setup_start"), { tap: function () { go(1); } }));
      box.appendChild(pill("close", _T("setup_skip"), { sub: function () { return _T("setup_skip_sub"); }, tap: setupSkip }));
      return;
    }
    setupStep(box, name, function () {
      redrawBox(box, draw);
    });
    var nav = mk("div", "ap-grid");
    nav.appendChild(pill("back", _T("back"), { tap: function () { go(SETUP.step - 1); } }));
    nav.appendChild(
      name === "review"
        ? pill("check", _T("setup_create"), { tap: setupApply })
        : pill("play", _T("setup_next"), { tap: function () { go(SETUP.step + 1); } })
    );
    box.appendChild(nav);
  }
  redrawBox(box, draw);
}
