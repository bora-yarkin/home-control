/* Pinned items and quick actions. */

/* pins: kept per device in localStorage */

function cleanPins(a) {
  var out = [];
  (Array.isArray(a) ? a : []).slice(0, 12).forEach(function (p) {
    if (!p || typeof p.name !== "string" || !p.name || p.name.length > 40) return;
    var o = {
      name: p.name,
      icon: iconOk(p.icon) ? p.icon : "plug",
      room: typeof p.room === "string" && p.room.length <= 40 ? p.room : "",
    };
    if (p.kind === "cscene") {
      if (typeof p.sid !== "string" || !/^[a-z0-9_-]{1,24}$/.test(p.sid)) return;
      o.kind = "cscene";
      o.sid = p.sid;
    } else {
      if (typeof p.id !== "string" || !ENTRE.test(p.id)) return;
      o.id = p.id;
      if (p.kind === "pop") {
        if (typeof p.key !== "string" || p.key.length > 80) return;
        o.kind = "pop";
        o.key = p.key;
      }
    }
    out.push(o);
  });
  return out;
}

function pinKey(p) {
  return p.kind === "cscene" ? "scene:" + p.sid : p.kind === "pop" ? "pop:" + p.key : p.id;
}

function popOn(p) {
  var d = p.id ? dom(p.id) : "";
  if (d === "media_player") return mediaOn(p.id);
  if (d === "climate") return ["off", "unknown", "unavailable"].indexOf(V_(p.id)) < 0;
  if (d === "vacuum") return ["cleaning", "returning"].indexOf(V_(p.id)) >= 0;
  if (d === "fan" || d === "light" || d === "switch") return isOn(p.id);
  return false;
}

/* A pinned entity behaves exactly like the same device in a section: the row toggles it and opens its popup. */
function pinDev(p) {
  return { id: p.id, name: p.name, icon: p.icon, kind: DOMKIND[dom(p.id)] || "switch" };
}

function pinOpen(p) {
  var k = p.kind === "pop" ? p.key : p.id ? devPop(pinDev(p)) : "";
  if (k) showPopup(k, true);
}

function pinRow(p) {
  if (p.id && modeOf(p.id).mode === "hide") return null;
  if (p.kind === "cscene") {
    var sc = sceneById(p.sid);
    if (!sc || !sceneAllowed(sc)) return null;
    return pill("scene", sc.name, {
      sub: function () {
        return p.room || "";
      },
      tap: function () {
        runScene(sc);
      },
      pin: p,
    });
  }
  if (p.id && dom(p.id) === "light" && LNAME[p.id]) return lightRow(p.id, true);
  if (p.id) {
    var r = devRow(pinDev(p));
    if (r) r.dataset.pin = JSON.stringify(p);
    return r;
  }
  if (p.kind === "pop")
    return pill(p.icon || "plug", p.name, {
      on: function () {
        return popOn(p);
      },
      sub: function () {
        return p.room || "";
      },
      tap: function () {
        showPopup(p.key, true);
      },
      pin: p,
    });
  return null;
}

function pinsSection() {
  var e = CURSEC,
    scope = secKey(),
    src = [],
    a = [];
  (e.pins || []).forEach(function (p) {
    var r = pinRow(p);
    if (r) {
      a.push(r);
      src.push(p);
    }
  });
  /* An empty Pinned section is only shown while editing, where it offers "Add item". */
  if (!a.length && !editing()) return null;
  var g = mk("div", e.lay === "list" ? "gridl" : e.lay === "grid3" ? "gridl g3" : "grid2");
  a.forEach(function (r, i) {
    g.appendChild(
      edDel(
        edMark(r, function () {
          pinOpen(src[i]);
        }),
        function () {
          var p = src[i];
          e.pins = e.pins.filter(function (x) {
            return pinKey(x) !== pinKey(p);
          });
          uiChanged();
        },
        _T("remove_from_this_section")
      )
    );
  });
  if (editing()) {
    edSort(a, function (f, t) {
      edReorder(e.pins, src, f, t);
      uiChanged();
    });
    var ad = edAdd(_T("add_item"), function () {
      if ((e.pins || []).length >= 12) {
        toast(_T("pin_limit_reached_12"));
        return;
      }
      showPopup("pick-pin:" + scope + ":" + e.id, true);
    });
    ad.style.gridColumn = "1 / -1";
    g.appendChild(ad);
  }
  return section(secT("pinned", _T("pinned")), secI("pinned", "pin"), [g]);
}

function seedQA() {
  return [];
}

function quickActions() {
  var e = CURSEC,
    scope = secKey(),
    lk = "~" + scope + "~" + e.id,
    devEls = [],
    s = section(secT("quick", _T("quick_actions")), secI("quick", "scene"), []),
    box = mk("div"),
    key = null;
  s.appendChild(box);
  function build() {
    var edit = editing(),
      k = STORE_VER + "|" + edit + "|" + (e.lay || "");
    if (k === key) return;
    key = k;
    box.innerHTML = "";
    var g = mk("div", "qagrid"),
      mine = secScenes(e),
      tiles = [];
    if (e.lay)
      g.style.gridTemplateColumns =
        "repeat(" + (e.lay === "grid3" ? 3 : e.lay === "grid2" ? 2 : 1) + ",minmax(0,1fr))";
    mine.forEach(function (sc) {
      var el = mk(
        "div",
        "qa pane" + (edit ? " editing" : ""),
        ic(sc.icon || "scene") + "<span class='ql'></span><span class='qs'></span>"
      );
      var l = el.querySelector(".ql"),
        q = el.querySelector(".qs"),
        tm = null;
      l.textContent = sc.name;
      if (edit) q.textContent = _T("edit");
      el.addEventListener("click", function () {
        runScene(sc);
        q.textContent = _T("done");
        clearTimeout(tm);
        tm = setTimeout(function () {
          q.textContent = "";
        }, 2200);
      });
      edDel(
        edMark(el, function () {
          staticOpen(sc.room, sc);
        }),
        function () {
          scnToggle(e, sc.id);
          uiChanged();
        },
        _T("remove_from_this_section")
      );
      tiles.push(el);
      g.appendChild(el);
    });
    if (edit) {
      edSort(tiles, function (f, t) {
        edReorder(
          e.scn,
          mine.map(function (x) {
            return x.id;
          }),
          f,
          t
        );
        uiChanged();
      });
    }
    devEls = [];
    (e.devs || []).forEach(function (d) {
      if (!edit && (d.hide || (d.id && modeOf(d.id).mode === "hide"))) return;
      var el = mk(
        "div",
        "qa pane" + (edit ? " editing" : ""),
        ic(d.icon || "plug") + "<span class='ql'></span><span class='qs'></span>"
      );
      el.querySelector(".ql").textContent = d.name;
      if (edit) el.querySelector(".qs").textContent = _T("edit");
      el.addEventListener("click", function () {
        if (!d.id) return;
        if (["light", "switch", "fan"].indexOf(d.kind) >= 0) toggleEnt(d.id);
        else {
          var pk = devPop(d);
          if (pk) showPopup(pk, true);
        }
      });
      devEls.push({
        el: el,
        on: function () {
          return d.id && isOn(d.id);
        },
      });
      g.appendChild(
        edDel(edMark(el, devEditor(lk, d), !!d.hide), function () {
          var i = e.devs.indexOf(d);
          if (i >= 0) {
            e.devs.splice(i, 1);
            devIndex(UI);
            uiChanged();
          }
        })
      );
    });
    devEls.forEach(function (x) {
      x.el.classList.toggle("on", !!x.on());
    });
    box.appendChild(g);
    if (edit)
      box.appendChild(
        edAdd(_T("add_a_scene"), function () {
          showPopup("pick-scene:" + scope + ":" + e.id, true);
        })
      );
    s.style.display = g.children.length || edit ? "" : "none";
  }
  reg(function () {
    devEls.forEach(function (x) {
      x.el.classList.toggle("on", !!x.on());
    });
  });
  reg(build);
  build();
  return s;
}

function pinPick(b, key) {
  var q = key.split(":"),
    e = secById(q[0], q[1]);
  if (!e) return;
  var box = mk("div");
  b.appendChild(box);
  function has(p) {
    return (e.pins || []).some(function (x) {
      return pinKey(x) === pinKey(p);
    });
  }
  function toggle(p) {
    var a = (e.pins || []).slice();
    if (has(p))
      a = a.filter(function (x) {
        return pinKey(x) !== pinKey(p);
      });
    else {
      if (a.length >= 12) {
        toast(_T("pin_limit_reached_12"));
        return;
      }
      a.push(p);
    }
    e.pins = a;
    uiChanged();
    refresh();
  }
  var hint = mk("div", "hint");
  hint.textContent = _T("tap_to_pin_or_unpin_you_can_pick_sev");
  box.appendChild(hint);
  var sc = STORE.scenes.filter(sceneAllowed);
  if (sc.length) box.appendChild(sep(_T("scenes"), "scene"));
  sc.forEach(function (s) {
    var p = { kind: "cscene", sid: s.id, name: s.name, icon: s.icon || "scene", room: "" };
    box.appendChild(
      pill(s.icon || "scene", s.name, {
        on: function () {
          return has(p);
        },
        sub: function () {
          return has(p) ? _T("pinned") : "";
        },
        tap: function () {
          toggle(p);
        },
      })
    );
  });
  box.appendChild(sep(_T("devices_2"), "plug"));
  var seen = {};
  devsOf().forEach(function (d) {
    if (
      !d.id ||
      ["light", "switch", "fan", "media", "climate", "vacuum", "camera"].indexOf(d.kind) < 0
    )
      return;
    seen[d.id] = 1;
    var simple = ["light", "switch", "fan"].indexOf(d.kind) >= 0,
      p = { id: d.id, name: d.name, icon: d.icon || "plug", room: TITLES[d.room] || "" };
    if (!simple) {
      p.kind = "pop";
      p.key = devPop(d);
    }
    box.appendChild(
      pill(d.icon || "plug", d.name, {
        on: function () {
          return has(p);
        },
        sub: function () {
          return (TITLES[d.room] || "") + (has(p) ? " · " + _T("pinned") : "");
        },
        tap: function () {
          toggle(p);
        },
      })
    );
  });
  var extra = allLights().filter(function (id) {
    return !seen[id] && (ISADMIN || modeOf(id).mode !== "hide");
  });
  if (extra.length) {
    box.appendChild(sep(_T("individual_lights"), "light"));
    extra.forEach(function (id) {
      var p = { id: id, name: entName(id), icon: "light", room: roomOf(id) || "" };
      box.appendChild(
        pill("light", entName(id), {
          on: function () {
            return has(p);
          },
          sub: function () {
            return (p.room || "") + (has(p) ? " · " + _T("pinned") : "");
          },
          tap: function () {
            toggle(p);
          },
        })
      );
    });
  }
}

function pinPop(key, id, name, icon) {
  return {
    kind: "pop",
    key: key,
    id: id,
    name: name,
    icon: icon,
    room: VIEW !== "home" ? TITLES[VIEW] : roomOf(id || ""),
  };
}
