/* The add popup of a page or a section: what is chosen is checked, and the checkmark (or the question on closing) adds every checked device at once. On the lights list the first entry,
   Light group, turns the checked lights into one group (a Home Assistant helper made for them, app/lightgroups.js) whose settings open as soon as it is saved. */

/* One chosen entity put on the page; a TV or a camera is linked to what belongs to it. Gives the device and whether its setup page is worth opening. */
function addCandidate(rid, c) {
  /* A scene made on the dashboard is a device that points to it. */
  if (c.id.indexOf("dscene:") === 0) {
    var sc = sceneById(c.id.slice(7)),
      sd = { id: "", sid: c.id.slice(7), name: _T("scene_default_name"), icon: (sc && sc.icon) || "scene", kind: "cscene" };
    return { d: sd, at: placeDevice(rid, sd), wizard: false };
  }
  var kind = DOMKIND[dom(c.id)] || "sensor",
    d = { id: c.id, name: c.name, icon: defIcon(kind, c.name, c.id), kind: kind };
  if (kind === "media" && d.icon === "tv") d.sub = 1;
  var at = placeDevice(rid, d),
    setupKind = devSetupKind(d),
    found = setupKind ? kAuto(d) : 0;
  return { d: d, at: at, wizard: !!(setupKind && (found || devSetupAlways(setupKind))) };
}

/* Puts a device where the popup was opened: in the section it was opened from, or, from the page's own Add, in the first section of the device's kind. Gives where it went. */
function placeDevice(rid, d) {
  if (rid.charAt(0) === "~") {
    var list = devList(rid);
    list.push(d);
    return { rid: rid, i: list.length - 1 };
  }
  return addDevToPage(rid, d);
}

/* The add popup. Its state `f` is shared by the functions below: { rid, st (type, search, group, area), picked, order (what is checked, in the order it was), box (the list), count, redraw() }. */
function devAdd(b, rid) {
  var pre = ADDPRE;
  ADDPRE = null;
  var f = {
      rid: rid,
      st: { dom: ADDPRE_IX[pre] || 0, q: "", group: false, area: "" },
      picked: {},
      order: [],
      count: mk("div", "hint"),
      box: mk("div"),
    },
    inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search"));
  f.redraw = function () {
    redrawBox(f.box, function () {
      addList(f);
    });
  };
  inp.type = "text";
  inp.placeholder = _T("search_devices");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  inp.addEventListener("input", function () {
    f.st.q = inp.value;
    f.redraw();
  });
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(addFilters(f));
  b.appendChild(mk("div", "sepline"));
  b.appendChild(f.count);
  b.appendChild(f.box);
  addCount(f);
  f.redraw();
  guardUnsaved({
    dirty: function () {
      return f.order.length > 0 || f.st.group;
    },
    save: function (leave) {
      return addSave(f, leave);
    },
  });
}

/* The line that says how many are checked (and that they become one group). */
function addCount(f) {
  var n = f.order.length;
  f.count.textContent = n ? _T("add_selected", { x: n }) + (f.st.group ? " · " + _T("lg_as_one_group") : "") : "";
  f.count.style.display = n ? "" : "none";
}

function addToggle(f, c) {
  if (f.picked[c.id]) {
    delete f.picked[c.id];
    f.order.splice(f.order.indexOf(c.id), 1);
  } else {
    f.picked[c.id] = c;
    f.order.push(c.id);
  }
  addCount(f);
}

/* What to add and where it is: two dropdowns. The area is any area of Home Assistant, all of them to begin with. */
function addFilters(f) {
  var typeTile = selectTile(
      _T("add_type"),
      function () {
        return ADDDOMS.map(function (x, i) {
          return String(i);
        });
      },
      function () {
        return String(f.st.dom);
      },
      function (v) {
        f.st.dom = +v;
        typeTile.refresh();
        f.redraw();
      },
      "tune",
      function (v) {
        return ADDDOMS[+v][0];
      }
    ),
    areaTile = selectTile(
      _T("add_area"),
      function () {
        var ids = Object.keys(H().areas || {}).sort(function (x, y) {
          return String(H().areas[x].name).localeCompare(H().areas[y].name);
        });
        return ["all"].concat(ids);
      },
      function () {
        return f.st.area || "all";
      },
      function (v) {
        f.st.area = v === "all" ? "" : v;
        areaTile.refresh();
        f.redraw();
      },
      "home",
      function (v) {
        return v === "all" ? _T("all_areas") : (H().areas[v] || {}).name || v;
      }
    ),
    filters = mk("div", "ap-grid");
  typeTile.classList.add("selrow");
  areaTile.classList.add("selrow");
  typeTile.refresh();
  areaTile.refresh();
  filters.appendChild(typeTile);
  filters.appendChild(areaTile);
  return filters;
}

/* The list under the filters: what a remote or an appliance is made of, or the entities of the chosen type that are not on the page yet. */
function addList(f) {
  var kind = ADDDOMS[f.st.dom][1][0];
  if (kind === "__remote") return addRemoteEntry(f);
  if (kind === "__appliance") return addApplianceEntries(f);
  if (kind === "__widget") return addWidgetEntries(f);
  addEntities(f);
}

/* A remote is not an entity: it is made here, then filled with buttons. */
/* Remotes: a ready-made one (any media player is chosen; its popup is the remote), the Remote master, and one built by hand. */
function addRemoteEntry(f) {
  f.box.appendChild(
    pill("tv", _T("rm_ready"), {
      sub: function () {
        return _T("rm_ready_sub");
      },
      tap: function () {
        pickEntity(_T("rm_ready"), ["media_player"], null, function (id) {
          addReadyRemote(f.rid, id);
        });
      },
    })
  );
  f.box.appendChild(addWidgetEntry(f, "rmaster"));
  f.box.appendChild(
    pill("media", _T("rm_new_remote"), {
      sub: function () {
        return _T("rm_new_remote_sub");
      },
      tap: function () {
        var d = remoteNew();
        devList(f.rid).push(d);
        uiChanged();
        showPopup("remote-build:" + d.rid, true);
      },
    })
  );
}

/* Puts the chosen player where the Add popup was opened, as a TV. A player with no remote entity of its own is asked which one sends its keys (a cast player's box often has its
   remote under another integration); without one it keeps the plain media controls. */
function addReadyRemote(rid, id) {
  var name = String(A(id).friendly_name || id).slice(0, 40),
    list = devList(rid),
    d = list.filter(function (x) {
      return x.id === id;
    })[0],
    at;
  if (d) at = { rid: rid, i: list.indexOf(d) };
  else {
    var made = addCandidate(rid, { id: id, name: name });
    d = made.d;
    at = made.at;
    d.icon = "tv";
    d.dt = "tv";
    uiChanged();
    toast(_T("added", { x: name }));
  }
  if (tvRemoteOf(id)) return showPopup("manage-dev:" + at.rid + ":" + at.i, false);
  setTimeout(function () {
    toast(_T("rm_ready_choose_remote"));
    pickEntity(_T("rm_ready_choose_remote"), ["remote"], null, function (remote) {
      d.links = [remote].concat(d.links || []).slice(0, 12);
      uiChanged();
    });
  }, 0);
}

/* One widget type of the registry as a row that adds it and opens its settings. */
function addWidgetEntry(f, w) {
  var def = WIDGETS[w];
  return pill(def.icon, def.title, {
    sub: function () {
      return def.desc || "";
    },
    tap: function () {
      var at = placeDevice(f.rid, newWidgetDev(w));
      uiChanged();
      POPGUARD = null;
      showPopup("manage-dev:" + at.rid + ":" + at.i, false);
    },
  });
}

function addWidgetEntries(f) {
  /* the Remote master is with the remotes */
  Object.keys(WIDGETS)
    .filter(function (w) {
      return w !== "rmaster";
    })
    .forEach(function (w) {
      f.box.appendChild(addWidgetEntry(f, w));
    });
}

/* Choosing the device, for the page `rid`. */
function apDevicePage(b, rid) {
  var h = H(),
    w = mk("div", "sqw pane", svg("search")),
    inp = mk("input", "sq"),
    box = mk("div"),
    list = Object.keys(h.devices || {})
      .map(function (id) {
        var dv = h.devices[id],
          area = dv.area_id && h.areas && h.areas[dv.area_id];
        return { id: id, name: String(dv.name_by_user || dv.name || ""), area: area ? area.name : "", n: apDeviceEntities(id).length };
      })
      .filter(function (x) {
        return x.name && x.n;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
  inp.type = "text";
  inp.placeholder = _T("search");
  inp.setAttribute("aria-label", _T("search"));
  inp.setAttribute("autocomplete", "off");
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(box);
  function draw() {
    var words = norm(inp.value).trim().split(/\s+/).filter(Boolean),
      found = list.filter(function (x) {
        var hay = norm(x.name + " " + x.area);
        return words.every(function (t) {
          return hay.indexOf(t) >= 0;
        });
      });
    found.slice(0, 60).forEach(function (x) {
      box.appendChild(
        pill("plug", x.name, {
          sub: function () {
            return (x.area ? x.area + " · " : "") + _T("px_entities", { n: x.n });
          },
          tap: function () {
            var d = apFromDevice(x.id);
            devList(rid).push(d);
            uiChanged();
            showPopup("ap-edit:" + d.aid, false);
          },
        })
      );
    });
    if (found.length > 60) box.appendChild(hintRow(_T("act_more_found", { n: found.length - 60 })));
    if (!found.length) box.appendChild(hintRow(_T("nothing_found")));
  }
  inp.addEventListener("input", function () {
    redrawBox(box, draw);
  });
  redrawBox(box, draw);
}

function addApplianceEntries(f) {
  f.box.appendChild(
    pill("plug", _T("ap_whole"), {
      sub: function () {
        return _T("ap_whole_sub");
      },
      tap: function () {
        showPopup("ap-device:" + f.rid, true);
      },
    })
  );
  Object.keys(AP_TYPES).forEach(function (t) {
    f.box.appendChild(
      pill(AP_TYPES[t].icon, _T(AP_TYPES[t].l), {
        sub: function () {
          return _T("ap_choose_what_it_is_made_of");
        },
        tap: function () {
          var d = apNew(t);
          devList(f.rid).push(d);
          uiChanged();
          showPopup("ap-edit:" + d.aid, true);
        },
      })
    );
  });
}

function addEntities(f) {
  var items = candidates(ADDDOMS[f.st.dom][1], f.rid, f.st.q, f.st.area),
    isScenes = ADDDOMS[f.st.dom][1][0] === "scene";
  /* Scenes: the scenes made on the dashboard are in the list with the scene entities (a checked one is a scene of the Section), the first entry is a collection of scenes that fills itself in, and the next makes a new scene. */
  if (isScenes) {
    var have = devList(f.rid),
      q = String(f.st.q || "").toLowerCase();
    STORE.scenes.forEach(function (sc) {
      if (!sceneAllowed(sc) || (q && sc.name.toLowerCase().indexOf(q) < 0)) return;
      if (have.some(function (d) { return d.kind === "cscene" && d.sid === sc.id; })) return;
      items.unshift({ id: "dscene:" + sc.id, name: sc.name, area: TITLES[sc.room] || "", dashboard: true });
    });
  }
  var shown = items.slice(0, 40);
  if (isScenes && ISADMIN) {
    var sh = f.rid.charAt(0) === "~" ? sectionOfList(f.rid) : null;
    if (sh && sh.k === "devs") {
      f.box.appendChild(
        pill("scene", _T("scene_collection"), {
          sub: function () {
            return _T("scene_collection_sub");
          },
          tap: function () {
            var d = { id: "", name: _T("scene_collection"), icon: "scene", kind: "scenes" },
              at = placeDevice(f.rid, d);
            uiChanged();
            POPGUARD = null;
            showPopup("manage-dev:" + at.rid + ":" + at.i, false);
          },
        })
      );
      f.box.appendChild(
        pill("plus", _T("new_scene"), {
          sub: function () {
            return _T("add_new_scene_sub");
          },
          tap: function () {
            showPopup("scene-new:" + f.rid.split("~")[1] + ":" + sh.id + ":s", true);
          },
        })
      );
    }
  }
  /* Lights only: the first entry makes a lights master (when it is a Lights section that is being added to), the next one makes the checked lights one group. */
  if (ADDDOMS[f.st.dom][1][0] === "light" && ISADMIN) {
    var host = f.rid.charAt(0) === "~" ? sectionOfList(f.rid) : null;
    if (host && host.k === "devs")
      f.box.appendChild(
        pill("lights", _T("lights_master"), {
          sub: function () {
            return _T("lm_add_item_sub");
          },
          tap: function () {
            showPopup("lmaster-add:" + f.rid.split("~")[1] + ":" + host.id, true);
          },
        })
      );
    var g = pill("lights", _T("lg_light_group"), {
      check: function () {
        return f.st.group;
      },
      sub: function () {
        return _T("lg_light_group_sub");
      },
      tap: function () {
        f.st.group = !f.st.group;
        g.refresh();
        addCount(f);
      },
    });
    f.box.appendChild(g);
    f.box.appendChild(mk("div", "sepline"));
  }
  if (!items.length)
    f.box.appendChild(
      pill("info", _T("nothing_to_add_here"), {
        sub: function () {
          return _T("everything_of_this_type_is_already_i");
        },
      })
    );
  shown.forEach(function (c) {
    var kind = c.dashboard ? "scene" : DOMKIND[dom(c.id)] || "sensor",
      row = pill(defIcon(kind, c.name, c.id), c.group ? c.name + " · " + _T("lg_group") : c.name, {
        check: function () {
          return !!f.picked[c.id];
        },
        sub: function () {
          return c.dashboard ? (c.area ? c.area + " · " : "") + _T("add_dashboard_scene") : (c.area ? c.area + " · " : "") + c.id;
        },
        tap: function () {
          addToggle(f, c);
          row.refresh();
        },
      });
    f.box.appendChild(row);
  });
  if (items.length > shown.length) f.box.appendChild(hintRow(_T("more_type_to_narrow_the_list", { x: items.length - shown.length })));
}

/* Adds what is checked. With Light group checked the checked lights are not added one by one: the new group form opens for them, and the group is made when that is saved. */
function addSave(f, leave) {
  var chosen = f.order.map(function (id) {
      return f.picked[id];
    }),
    isLight = function (c) {
      return dom(c.id) === "light";
    },
    lights = chosen.filter(isLight),
    rest = chosen.filter(function (c) {
      return !(f.st.group && isLight(c));
    });
  if (!chosen.length && !f.st.group) {
    leave();
    return true;
  }
  if (f.st.group && lights.length < 2) {
    toast(_T("lg_check_two_lights"));
    return false;
  }
  function addRest() {
    var wizard = null;
    rest.forEach(function (c) {
      var r = addCandidate(f.rid, c);
      if (r.wizard) wizard = r.at;
    });
    if (rest.length) {
      uiChanged();
      toast(rest.length === 1 ? _T("added", { x: rest[0].name }) : _T("added_n", { n: rest.length }));
    }
    return rest.length === 1 && wizard ? wizard : null;
  }
  if (!f.st.group) {
    var wiz = addRest();
    POPGUARD = null;
    if (wiz) showPopup("kwiz:" + wiz.rid + ":" + wiz.i, false);
    else leave();
    return true;
  }
  /* The group is not made yet: its form opens in place of this popup, and Home Assistant is asked only when the form is saved with a name. */
  LGNEW = {
    rid: f.rid,
    lights: lights.map(function (c) {
      return c.id;
    }),
  };
  addRest();
  POPGUARD = null;
  showPopup("lgnew", false);
  return true;
}
