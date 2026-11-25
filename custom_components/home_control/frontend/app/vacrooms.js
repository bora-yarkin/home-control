/* Rooms for any robot vacuum (decision D-32): a map you tap, room tiles, the vacuum's modes as choices, Start, Pause and Dock. A vacuum that reports its own rooms with room
   settings (Xiaomi) has its own card in vacuum.js; this is for every other one.

   The rooms come from one of two places. Room buttons bound to the vacuum (`vx.rooms`: a button, script or scene each) are chosen one at a time, as a press of one starts that
   room. Without them, a vacuum Home Assistant can clean by area (`vacuum.clean_area`) offers the areas its segments are mapped to, and several can be chosen. A bound room may
   have shapes on the map (`s`: rectangles in percent of the picture) and settings of its own (`o`: select entities), shown while it is chosen. Choosing never starts anything. */

var VACR_AREA = 16384; /* VacuumEntityFeature.CLEAN_AREA */

function vacExtras(id) {
  var d = UIDEV[id];
  return (d && d.vx) || {};
}

/* Whether this card is the one for a vacuum: it has bound rooms, or Home Assistant can clean it by area. */
function vacRoomsFor(id) {
  if (!H().states[id]) return false;
  var rooms = (vacExtras(id).rooms || []).filter(function (x) {
    return H().states[x.e];
  });
  return rooms.length > 0 || ((A(id).supported_features || 0) & VACR_AREA) !== 0;
}

/* The bound rooms as the card takes them. */
function vacBoundRooms(id) {
  return (vacExtras(id).rooms || [])
    .filter(function (x) {
      return H().states[x.e];
    })
    .map(function (x) {
      return { id: x.e, name: x.l || A(x.e).friendly_name || x.e, shapes: x.s || [], opts: x.o || [], press: x };
    });
}

/* The areas a vacuum's segments are mapped to, as rooms. */
function vacAreaRooms(mapping) {
  var areas = H().areas || {};
  return Object.keys(mapping || {})
    .filter(function (a) {
      return areas[a] && (mapping[a] || []).length;
    })
    .map(function (a) {
      return { id: a, name: areas[a].name, shapes: [], opts: [], area: a };
    })
    .sort(function (x, y) {
      return x.name.localeCompare(y.name);
    });
}

/* "vacuum_then_mop" and "Auto Mode" read as words. */
function vacWord(v) {
  return cap(String(v).replace(/_/g, " "));
}

/* A select as a row of choices, as the Xiaomi card shows its modes. */
function vacChoice(box, ent) {
  if (!H().states[ent] || dom(ent) !== "select" && dom(ent) !== "input_select") return;
  var head = mk("div", "rb-sec", "<span></span><b></b>"),
    g = mk("div", "opts");
  g.setAttribute("data-k", "clean");
  head.firstChild.textContent = advName(ent);
  (A(ent).options || []).forEach(function (v) {
    var o = mk("div", "opt", ic(RBICON[v] || "drop") + "<span></span>");
    o.lastChild.textContent = vacWord(v);
    o._v = v;
    o.setAttribute("role", "button");
    o.addEventListener("click", function () {
      if (V_(ent) === "unavailable") return toast(_T("rm_not_available_right_now"));
      call(dom(ent), "select_option", { entity_id: ent, option: v });
    });
    g.appendChild(o);
  });
  function paint() {
    var c = V_(ent);
    head.lastChild.textContent = c === "unavailable" || c === "unknown" ? _T("unavailable") : vacWord(c);
    Array.prototype.forEach.call(g.children, function (o) {
      o.classList.toggle("on", o._v === c);
    });
  }
  reg(paint);
  paint();
  box.appendChild(head);
  box.appendChild(g);
}

/* The map picture: a drawn one (`vx.pic`), else the vacuum's map camera or image. */
function vacMapUrl(id) {
  var vx = vacExtras(id);
  if (vx.pic) return vx.pic;
  var m = vacuumMapOf(id);
  if (!m || !H().states[m]) return "";
  var u = A(m).entity_picture || "";
  return mapPicOk(u) ? u : "";
}

/* `after` draws what goes between the map and the rooms (the battery and readings), so the map is first as on the Xiaomi card. */
function vacRooms(b, id, after) {
  var box = mk("div", "vrc"),
    mapBox = mk("div", "rb-map pane"),
    wrap = mk("div", "rb-mapw"),
    img = mk("img"),
    spots = mk("div", "vrc-spots"),
    head = mk("div", "rb-sec", "<span></span><span class='rb-chips'></span>"),
    tiles = mk("div", "rooms"),
    start = mk("div", "rb-start pane"),
    ctl = mk("div", "rrow rbc"),
    opts = mk("div"),
    rooms = vacBoundRooms(id),
    many = !rooms.length,
    chosen = [],
    shown = "";
  img.alt = _T("map_of_the_robot_vacuum");
  wrap.appendChild(img);
  wrap.appendChild(spots);
  mapBox.appendChild(wrap);
  tiles.setAttribute("data-k", "clean");
  start.setAttribute("role", "button");
  head.firstChild.textContent = _T("rooms_caps");

  function byId(r) {
    return rooms.filter(function (x) {
      return x.id === r;
    })[0];
  }
  function flip(r) {
    var at = chosen.indexOf(r);
    if (at >= 0) chosen.splice(at, 1);
    else if (many) chosen.push(r);
    else chosen = [r];
    paint();
  }
  function buildRooms() {
    tiles.innerHTML = "";
    spots.innerHTML = "";
    var chips = head.lastChild;
    chips.innerHTML = "";
    if (many && rooms.length > 1)
      [
        ["all", function () { chosen = rooms.map(function (r) { return r.id; }); }],
        ["clear", function () { chosen = []; }],
      ].forEach(function (c) {
        var s = mk("span", "rb-chip pane");
        s.textContent = _T(c[0]);
        s.setAttribute("role", "button");
        s.addEventListener("click", function () {
          c[1]();
          paint();
        });
        chips.appendChild(s);
      });
    rooms.forEach(function (r) {
      var t = mk("div", "room pane", ic("home") + "<span></span>");
      t.lastChild.textContent = r.name;
      t._id = r.id;
      t.setAttribute("role", "button");
      t.addEventListener("click", function () {
        flip(r.id);
      });
      tiles.appendChild(t);
      r.shapes.forEach(function (s) {
        var z = mk("div", "vrc-spot");
        z.style.cssText = "left:" + s[0] + "%;top:" + s[1] + "%;width:" + s[2] + "%;height:" + s[3] + "%";
        z._id = r.id;
        z.setAttribute("role", "button");
        z.setAttribute("aria-label", r.name);
        z.addEventListener("click", function () {
          flip(r.id);
        });
        spots.appendChild(z);
      });
    });
    head.style.display = tiles.style.display = rooms.length ? "" : "none";
  }

  function paint() {
    [tiles, spots].forEach(function (list) {
      Array.prototype.forEach.call(list.children, function (t) {
        t.classList.toggle("on", chosen.indexOf(t._id) >= 0);
      });
    });
    var u = vacMapUrl(id);
    if (u && img.getAttribute("src") !== u) img.src = u;
    mapBox.style.display = u ? "" : "none";
    /* settings: those of the one room chosen, else the vacuum's own */
    var one = chosen.length === 1 ? byId(chosen[0]) : null,
      list = one && one.opts.length ? one.opts : (vacExtras(id).modes || []).filter(function (e) {
        return dom(e) === "select" || dom(e) === "input_select";
      }),
      sig = list.join(",");
    if (sig !== shown) {
      shown = sig;
      opts.innerHTML = "";
      list.forEach(function (e) {
        vacChoice(opts, e);
      });
    }
    var s = V_(id),
      working = s === "cleaning" || s === "paused" || s === "returning",
      gone = s === "unavailable";
    start.classList.toggle("dis", working || gone);
    start.innerHTML = svg("play") + "<span></span>";
    start.lastChild.textContent = working
      ? _T(s === "returning" ? "returning" : "cleaning")
      : !chosen.length
        ? _T("start_all_rooms")
        : chosen.length === 1
          ? _T("start") + " · " + byId(chosen[0]).name
          : _T("start_on_selected_rooms");
    bPause.style.display = s === "cleaning" ? "" : "none";
    bResume.style.display = s === "paused" ? "" : "none";
    bDock.style.display = s !== "docked" && !gone ? "" : "none";
    var n = [bPause, bResume, bDock].filter(function (x) {
      return x.style.display !== "none";
    }).length;
    ctl.style.display = n ? "" : "none";
    ctl.style.gridTemplateColumns = "repeat(" + (n || 1) + ",1fr)";
  }

  function run() {
    var s = V_(id);
    if (s === "cleaning" || s === "returning" || s === "paused" || s === "unavailable") return;
    if (!chosen.length) call("vacuum", "start", { entity_id: id });
    else if (many) call("vacuum", "clean_area", { entity_id: id, cleaning_area_id: chosen.slice() });
    else remotePress(byId(chosen[0]).press);
    vacKick(id);
  }
  start.addEventListener("click", run);
  var bPause = rbtn("pause", function () { call("vacuum", "pause", { entity_id: id }); vacKick(id); }, _T("pause")),
    bResume = rbtn("play", function () { call("vacuum", "start", { entity_id: id }); vacKick(id); }, _T("resume")),
    bDock = rbtn("home", function () { call("vacuum", "return_to_base", { entity_id: id }); vacKick(id); }, _T("dock"));
  ctl.appendChild(bPause);
  ctl.appendChild(bResume);
  ctl.appendChild(bDock);

  box.appendChild(mapBox);
  b.appendChild(box);
  if (after) after();
  var card = mk("div", "vrc");
  [head, tiles, opts, ctl, start].forEach(function (x) {
    card.appendChild(x);
  });
  b.appendChild(card);
  buildRooms();
  reg(paint);
  paint();
  if (many)
    HA.vacuum.areas(id).then(function (mapping) {
      rooms = vacAreaRooms(mapping);
      buildRooms();
      paint();
    }, function () {});
}
