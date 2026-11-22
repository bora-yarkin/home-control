/* Any entity as a compact piece of a popup, so a device with many entities is a few tidy groups and not a column of rows: a tile to set it (a choice, a number with minus and plus, an
   on/off tile, a press), a list of readings (label and value on one line each), and a fold that keeps the rest out of sight until it is asked for. Nothing here knows a device or a brand. */


/* A number to set: its name, its value, and minus and plus. `uiStep` is the step a tap takes (the entity's own step when it has none to give). Taps made close together are one command. */
function numberTile(id, label, o) {
  o = o || {};
  var a0 = A(id),
    min = isFinite(Number(a0.min)) ? Number(a0.min) : 0,
    max = isFinite(Number(a0.max)) ? Number(a0.max) : 100,
    step = o.uiStep || (Number(a0.step) > 0 ? Number(a0.step) : 1),
    svc = dom(id) === "input_number" ? "input_number" : "number",
    t = mk("div", "ap-step pane", "<span class='tx'><span class='nm'></span><span class='vl'></span></span>"),
    vl = t.querySelector(".vl"),
    pending = null,
    timer = 0;
  t.querySelector(".nm").textContent = label;
  function show(v) {
    vl.textContent = v === null ? "–" : o.fmt ? o.fmt(v) : v + (a0.unit_of_measurement ? " " + a0.unit_of_measurement : "");
  }
  function read() {
    var v = Number(V_(id));
    return svOk(id) && isFinite(v) ? v : null;
  }
  function bump(dir) {
    var cur = pending !== null ? pending : read();
    if (cur === null) return;
    pending = Math.max(min, Math.min(max, Number((cur + dir * step).toFixed(3))));
    show(pending);
    clearTimeout(timer);
    timer = setTimeout(function () {
      var v = pending;
      pending = null;
      call(svc, "set_value", { entity_id: id, value: v });
    }, 450);
  }
  [["minus", -1, "ap_less"], ["plus", 1, "ap_more"]].forEach(function (g) {
    var b = mk("div", "ap-sb", svg(g[0]));
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", _T(g[2]) + " " + label);
    b.addEventListener("click", function () {
      bump(g[1]);
    });
    t.appendChild(b);
  });
  t.refresh = function () {
    t.classList.toggle("inert", read() === null);
    if (pending === null) show(read());
  };
  t.refresh();
  reg(t.refresh);
  return t;
}

/* An on/off entity as a tile that lights when it is on. */
function toggleTile(id, label) {
  var t = mk("div", "sel pane ap-tog", "<span class='tx'><span class='nm'></span><span class='sb'></span></span>");
  t.querySelector(".nm").textContent = label;
  t.setAttribute("role", "button");
  t.addEventListener("click", function () {
    if (svOk(id)) call(dom(id), V_(id) === "on" ? "turn_off" : "turn_on", { entity_id: id });
  });
  t.refresh = function () {
    t.classList.toggle("on", V_(id) === "on");
    t.querySelector(".sb").textContent = !svOk(id) ? _T("ap_not_available") : V_(id) === "on" ? _T("ap_on") : _T("ap_off");
  };
  t.refresh();
  reg(t.refresh);
  return t;
}

/* A button or a script as a tile that runs it. */
function pressTile(id, label) {
  var t = mk("div", "sel pane ap-tog", "<span class='tx'><span class='nm'></span><span class='sb'></span></span>");
  t.querySelector(".nm").textContent = label;
  t.querySelector(".sb").textContent = dom(id) === "script" ? _T("run") : _T("press");
  t.setAttribute("role", "button");
  t.addEventListener("click", function () {
    if (remoteUsable(id)) remotePress({ e: id });
    else toast(_T("rm_not_available_right_now"));
  });
  return t;
}

/* The tile that fits an entity that can be set, or null for one that can only be read. */
function settingTile(id, label) {
  var d = dom(id);
  if (d === "select" || d === "input_select") {
    var s = selectEnt(id, label, null);
    s.classList.remove("selrow");
    return s;
  }
  if (d === "number" || d === "input_number") return numberTile(id, label);
  if (d === "switch" || d === "input_boolean") return toggleTile(id, label);
  if (d === "button" || d === "input_button" || d === "script") return pressTile(id, label);
  return null;
}

/* Readings in one card, a line for each: the name, then the value. `items` are [label, function that returns the value]. */
function readingsList(items) {
  var box = mk("div", "ap-list pane"),
    vals = [];
  items.forEach(function (it) {
    var row = mk("div", "", "<span class='k'></span><span class='v'></span>");
    row.querySelector(".k").textContent = it[0];
    vals.push([row.querySelector(".v"), it[1]]);
    box.appendChild(row);
  });
  box.refresh = function () {
    vals.forEach(function (v) {
      v[0].textContent = v[1]();
    });
  };
  box.refresh();
  reg(box.refresh);
  return box;
}

/* Tiles and readings of a list of entities, in two groups: what can be set as a grid of tiles, what can only be read as one list. `label(id)` names an entity. */
function entityGroups(b, ids, label, value) {
  var tiles = [],
    reads = [];
  ids.forEach(function (id) {
    var t = settingTile(id, label(id));
    if (t) tiles.push(t);
    else reads.push([label(id), value(id)]);
  });
  if (tiles.length) {
    var g = mk("div", "ap-grid");
    tiles.forEach(function (t) {
      g.appendChild(t);
    });
    b.appendChild(g);
  }
  if (reads.length) b.appendChild(readingsList(reads));
}

/* A fold: a line that says how much is behind it and opens it; the content is built the first time it is opened. */
var CTL_OPEN = {};

function foldBlock(b, key, title, count, build) {
  var head = mk("div", "sel pane ap-fold", "<span class='tx'><span class='nm'></span></span><span class='chev'>" + svg("chev") + "</span>"),
    body = mk("div", "ap-foldbody"),
    built = false;
  head.querySelector(".nm").textContent = title + " · " + count;
  head.setAttribute("role", "button");
  head.setAttribute("aria-expanded", "false");
  function open(on) {
    CTL_OPEN[key] = on;
    head.classList.toggle("open", on);
    head.setAttribute("aria-expanded", on ? "true" : "false");
    body.style.display = on ? "" : "none";
    if (on && !built) {
      built = true;
      build(body);
    }
  }
  head.addEventListener("click", function () {
    open(!CTL_OPEN[key]);
  });
  b.appendChild(head);
  b.appendChild(body);
  open(!!CTL_OPEN[key]);
}
