/* Search: finds devices, scenes and settings, and runs commands typed in it. */

/* search */
function norm(s) {
  return String(s).toLowerCase().replace(/[’']/g, "");
}

function searchItems() {
  var it = [];
  ORDER.forEach(function (k) {
    var d = DOCK.filter(function (x) {
      return x[0] === k;
    })[0];
    it.push({
      n: k === "home" ? UI.meta.homeTab : TITLES[k],
      r: _T("open"),
      i: d ? d[3] : "home",
      k: "go",
      v: k,
    });
  });
  devsOf().forEach(function (d) {
    var rn = TITLES[d.room],
      i = d.icon || "plug";
    if (!ISADMIN && modeOf(d.id, d.room).mode === "view") return;
    if (d.kind === "light" && LNAME[d.id]) it.push({ n: d.name, r: rn, i: i, k: "light", v: d.id });
    else if ((d.kind === "fan" || d.kind === "switch") && !d.pop)
      it.push({ n: d.name, r: rn, i: i, k: "toggle", v: d.id });
    else if (d.kind === "camera") it.push({ n: d.name, r: rn, i: i, k: "go", v: d.room });
    else it.push({ n: d.name, r: rn, i: i, k: "pop", v: devPop(d) });
  });
  if (BATLIST.length)
    it.push({ n: _T("batteries"), r: _T("overview"), i: "battery", k: "pop", v: "g-batteries" });
  UI.rooms.forEach(function (r) {
    if (r.hide || !r.area || (!ISADMIN && ["view", "hide"].indexOf(modeOf("", r.id).mode) >= 0))
      return;
    sceneIds(r.area).forEach(function (s) {
      var nm = A(s[0]).friendly_name || s[0];
      if (nm.indexOf(r.name) === 0) nm = nm.slice(r.name.length).replace(/^\s+/, "");
      it.push({ n: nm, r: _T("scene") + r.name, i: "palette", k: "scene", v: s[0] });
    });
  });
  STORE.scenes.forEach(function (sc) {
    if (!sceneAllowed(sc)) return;
    it.push({
      n: sc.name,
      r: sc.room === "home" ? _T("quick_action") : _T("scene") + (TITLES[sc.room] || ""),
      i: sc.icon || "scene",
      k: "cscene",
      v: sc.id,
    });
  });
  /* Settings are searchable too, so the search is one place for everything. */
  if (ISADMIN) {
    CATS.forEach(function (c) {
      it.push({ n: c[1], r: _T("settings"), i: c[3], k: "pop", v: c[2] });
    });
    [
      [_T("backup_and_restore"), "manage-backup", "sd"],
      [_T("change_log"), "manage-log", "clock"],
      [_T("layout_check"), "manage-check", "tune"],
    ].forEach(function (p) {
      it.push({ n: p[0], r: _T("settings"), i: p[2], k: "pop", v: p[1] });
    });
  }
  return it;
}

function searchRow(x) {
  if (x.k === "cscene") {
    var sc = sceneById(x.v);
    return pill(x.i, x.n, {
      sub: function () {
        return x.r;
      },
      tap: function () {
        if (sc) runScene(sc);
      },
    });
  }
  if (x.k === "light") return lightRow(x.v, true);
  if (x.k === "toggle")
    return pill(x.i, x.n, {
      on: function () {
        return isOn(x.v);
      },
      sub: function () {
        return x.r + " · " + stAgo(x.v);
      },
      tap: function () {
        toggleEnt(x.v);
      },
      pin: { id: x.v, name: x.n, icon: x.i },
    });
  if (x.k === "scene")
    return pill(x.i, x.n, {
      sub: function () {
        return x.r;
      },
      tap: function () {
        call("scene", "turn_on", { entity_id: x.v });
      },
    });
  if (x.k === "go")
    return pill(x.i, x.n, {
      sub: function () {
        return x.r;
      },
      tap: function () {
        closeSheet();
        go(x.v);
      },
    });
  return pill(x.i, x.n, {
    sub: function () {
      return x.r;
    },
    tap: function () {
      showPopup(x.v, true);
    },
    pin: { kind: "pop", key: x.v, name: x.n, icon: x.i, room: x.r },
  });
}

function parseCmd(q) {
  q = q.trim();
  var m = q.match(/^(?:turn\s+)?(on|off)\s+(.+)$/i) || q.match(/^(.+?)\s+(on|off)$/i);
  if (!m) return { q: q, verb: null };
  return /^(on|off)$/i.test(m[1])
    ? { verb: m[1].toLowerCase(), q: m[2] }
    : { verb: m[2].toLowerCase(), q: m[1] };
}

function actOn(x, verb) {
  if (x.k === "cscene") {
    var sc = sceneById(x.v);
    if (sc) {
      runScene(sc);
      closeSheet();
    }
    return;
  }
  if (x.k === "scene") {
    call("scene", "turn_on", { entity_id: x.v });
    closeSheet();
    return;
  }
  if (x.k === "go") {
    closeSheet();
    go(x.v);
    return;
  }
  if (x.k === "light" || x.k === "toggle") {
    if (verb === "on" && dom(x.v) === "light") lightOn(x.v);
    else if (verb) call(dom(x.v), verb === "on" ? "turn_on" : "turn_off", { entity_id: x.v });
    else toggleEnt(x.v);
    toast(x.n + (verb ? " " + verb : ""));
    return;
  }
  showPopup(x.v, true);
}

function searchPopup(b) {
  var w = mk("div", "sqw pane", svg("search")),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.placeholder = _T("search_or_type_a_command");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  inp.setAttribute("autocorrect", "off");
  inp.setAttribute("enterkeyhint", "go");
  w.appendChild(inp);
  b.appendChild(w);
  var hint = mk("div", "hint");
  hint.textContent = _T("press_enter_to_open_or_run_the_first");
  b.appendChild(hint);
  var res = mk("div"),
    cur = [];
  b.appendChild(res);
  function show(live) {
    var prev = CUR,
      P = parseCmd(inp.value),
      tk = norm(P.q).trim(),
      list = searchItems()
        .filter(function (x) {
          if (!tk) return x.k === "go";
          if (P.verb && x.k !== "light" && x.k !== "toggle") return false;
          var h = norm(x.n + " " + x.r);
          return tk.split(/\s+/).every(function (q) {
            return h.indexOf(q.replace(/s$/, "")) >= 0;
          });
        })
        .slice(0, 8);
    cur = list;
    if (live) {
      SLIVE.length = 0;
    }
    CUR = SLIVE;
    res.innerHTML = "";
    list.forEach(function (x) {
      res.appendChild(searchRow(x));
    });
    if (!list.length) res.appendChild(pill("info", _T("no_matches"), {}));
    CUR = prev;
    if (live) refresh();
  }
  inp.addEventListener("input", function () {
    show(true);
  });
  inp.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (cur[0]) {
      actOn(cur[0], parseCmd(inp.value).verb);
    }
  });
  show(false);
  setTimeout(function () {
    try {
      inp.focus();
    } catch (e) {}
  }, 380);
}

function initSearchBtn() {
  var s = document.getElementById("sbtn");
  if (!s) return;
  s.innerHTML = svg("search");
  s.addEventListener("click", function () {
    showPopup("search", false);
  });
  var g = document.getElementById("gbtn");
  if (g) {
    g.style.display = "";
    g.innerHTML = svg("cog");
    g.addEventListener("click", function () {
      showPopup(ISADMIN ? "settings" : "appearance", false);
    });
  }
}
