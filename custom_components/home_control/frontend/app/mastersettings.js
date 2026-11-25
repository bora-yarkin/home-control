/* What a Lights section's lights master can be set to beyond its name: which lights it controls (the section's own, or lights chosen for it, with their names and icons), what its power button does (switch the lights, or run a scene), and whether its light popup has the sync tab. The master is named "page~section" everywhere (the same section id is on every page).
   What the section keeps (app/model.js): mm (manual lights), ml (the chosen lights, devices like those of a section: { id, name, icon, kind }), mpw ("scene": the power button runs a scene), mps (the key of that scene, see scenetab.js), msync (the sync tab is on) and msyncid (which sync, when there are several). */

/* The section of a lights master, by its name. */
function masterSec(sid) {
  var at = String(sid).split("~");
  return at.length === 2 ? masterById(at[0], at[1]) : null;
}

/* The lights it controls. Automatic: every light of its section, also the ones hidden in the section (hiding is for the page; the master still has them), except what this person may not see. Manual: the lights chosen for it. */
function masterLightIds(sec) {
  return sec.mm
    ? (sec.ml || [])
        .map(function (m) {
          return m.id;
        })
        .filter(function (id) {
          return H().states[id];
        })
    : (sec.devs || [])
        .filter(function (d) {
          return d.id && d.kind === "light" && modeOf(d.id).mode !== "hide";
        })
        .map(function (d) {
          return d.id;
        });
}

/* The names and icons of the lights of a manual master: { entity: { n, i } }. */
function masterMeta(sec) {
  var out = {};
  (sec.mm ? sec.ml || [] : []).concat(sec.lx || []).forEach(function (m) {
    if (!out[m.id]) out[m.id] = { n: m.name || "", i: m.icon || "" };
  });
  return out;
}

/* A light as a device the master keeps: the same record the section keeps for a light, so its popup is the device popup. */
function masterDevice(id) {
  var nm = (A(id).friendly_name || id).slice(0, 40);
  return { id: id, name: nm, icon: defIcon("light", nm, id), kind: "light" };
}

/* The syncs the light popup of a master can have as a tab: the devices a plugin says are one (Hue Plus's Spotify sync). */
function masterSyncDevices() {
  return Object.keys(H().states).filter(function (id) {
    var k = pluginDeviceKind(id);
    return k && k.sync;
  });
}

/* The sync of a master, or null when it has none or the tab is off. */
function masterSyncOf(sec) {
  if (!sec || !sec.msync) return null;
  var all = masterSyncDevices();
  return all.indexOf(sec.msyncid) >= 0 ? sec.msyncid : all[0] || null;
}

/* What the power button does: with "scene" it runs the chosen scene when the lights are off and switches them off when they are on; otherwise it switches the lights. */
function masterPower(sid) {
  var sec = masterSec(sid),
    ids = LMASTER[sid] || [];
  if (sec && sec.mpw === "scene" && sec.mps && !countOn(lightUnits(ids))) {
    var S0 = { root: { key: "m:" + sid, cmd: lightUnits(ids) } },
      it = mscItems(S0).filter(function (x) {
        return x.key === sec.mps;
      })[0];
    if (it) return mscPlay(S0, it);
  }
  lightsMasterToggle(ids);
}

/* The settings of the master that are about what it is, drawn into `box` by lightsMasterSettings. `redraw` draws the page again. */
function masterModeRows(box, sec, scope, redraw) {
  var key = scope + ":" + sec.id,
    sid = scope + "~" + sec.id,
    held = !!masterHost(scope, sec.id);
  box.appendChild(sep(_T("master_lights"), "lights"));
  /* A master that a section holds always has the lights chosen for it. */
  function modeSeg() {
    return seg(
      [
        ["auto", _T("master_auto")],
        ["manual", _T("master_manual")],
      ],
      sec.mm ? "manual" : "auto",
      function (v) {
        if (v === "manual") {
          sec.mm = 1;
          /* It starts from the lights it has now. */
          if (!sec.ml)
            sec.ml = (sec.devs || [])
              .filter(function (d) {
                return d.id && d.kind === "light";
              })
              .map(function (d) {
                return JSON.parse(JSON.stringify(d));
              });
        } else delete sec.mm;
        uiChanged();
        redraw();
      }
    );
  }
  if (!held) box.appendChild(modeSeg());
  box.appendChild(hintRow(sec.mm ? _T("master_manual_hint") : _T("master_auto_hint")));
  /* The list of lights below follows it: with it on a group is one row that opens, with it off every light is a row. */
  var grouped = flagPill("lights", _T("master_groups_as_one"), sec, "mgl", function (on) {
    return on ? _T("master_groups_as_one_on") : _T("master_groups_as_one_off");
  });
  grouped.addEventListener("click", function () {
    setTimeout(redraw, 60);
  });
  box.appendChild(grouped);
  if (sec.mm)
    box.appendChild(
      pill("plus", _T("master_choose_lights"), {
        sub: function () {
          return (sec.ml || []).length + " " + _T("lights").toLowerCase();
        },
        tap: function () {
          showPopup("lmaster-lights:" + key, true);
        },
      })
    );
  masterLightList(box, sec, scope, redraw);
}

/* The lights of the master in one list, in the order of its row: the lights the master has (the section's lights when it is automatic, the chosen ones when it is manual), each with a grip to drag it. With "grouped lights as one light" a group is one row with a button that slides its lights open, which are ordered inside it; without, every light is its own row. A manual master's light is edited with a tap. */
var MLOPEN = {};

function masterLightList(box, sec, scope, redraw) {
  var sid = scope + "~" + sec.id;
  LMASTER_META[sid] = masterMeta(sec);
  var root = lpMasterNode(sid, masterLightIds(sec)),
    own = {};
  /* The lights a tap edits (name, icon, which controls it shows): the chosen ones of a manual master, the section's own devices of an automatic one. */
  var base = "~" + scope + "~" + sec.id,
    ownRid = sec.mm ? base + "~ml" : base;
  (sec.mm ? sec.ml || [] : sec.devs || []).forEach(function (m) {
    if (m.id) own[m.id] = m;
  });
  /* Any light of the list opens its settings (name, icon, features, turn-on state, and for a group its group settings). A light the master has no record of gets one, in `lx`. */
  function editLight(n) {
    return function () {
      var rid = ownRid,
        d = own[n.key];
      if (!d) {
        d = (sec.lx || []).filter(function (x) {
          return x.id === n.key;
        })[0];
        rid = base + "~lx";
        if (!d) {
          d = { id: n.key, name: n.name, icon: n.icon || "light", kind: "light" };
          sec.lx = (sec.lx || []).concat([d]);
          uiChanged();
        }
      }
      devEditor(rid, d)();
    };
  }
  box.appendChild(sep(_T("order_of_the_lights"), "drag"));
  box.appendChild(hintRow(sec.mo ? _T("drag_a_light_to_move_it_the_row_follows_this_order") : _T("the_lights_are_in_alphabetical_order_drag_one_to_set_your_own")));
  /* Putting the lights of one list in a new order keeps the order of every other list. */
  function saved(nodes, from, to) {
    var keys = nodes.map(function (n) {
      return n.key;
    });
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    sec.mo = (sec.mo || []).filter(function (k) {
      return keys.indexOf(k) < 0;
    }).concat(keys);
    uiChanged();
    setTimeout(redraw, 250);
  }
  function fill(into, nodes) {
    var items = [];
    nodes.forEach(function (n) {
      var wrap = mk("div", "ml-item"),
        group = sec.mgl && lpIsGroup(n),
        edit = n.key.indexOf("light.") === 0 ? editLight(n) : null,
        row = pill(n.icon || "light", n.name, {
          kind: "light",
          sub: function () {
            return group ? lpCount(n) + " " + _T("lights").toLowerCase() : n.key;
          },
          tap: edit,
        });
      wrap.appendChild(row);
      if (nodes.length > 1) {
        var g = mk("div", "grip", svg("drag"));
        g.addEventListener("click", function (e) {
          e.stopPropagation();
        });
        gripKeys(g, wrap, items, function (f, t) {
          saved(nodes, f, t);
        });
        g.addEventListener("pointerdown", function (e) {
          edDrag(e, wrap, items, function (f, t) {
            saved(nodes, f, t);
          });
        });
        row.appendChild(g);
      }
      if (group) {
        var more = mk("div", "ml-more"),
          kids = mk("div", "ml-kids"),
          chev = mk("div", "chev", svg("chev")),
          shut = !MLOPEN[sid + n.key];
        fill(kids, lpSortLights(n.kids, sec.mo));
        more.appendChild(kids);
        more.style.height = shut ? "0px" : "";
        row.classList.toggle("open", !shut);
        row.insertBefore(chev, row.querySelector(".grip"));
        chev.addEventListener("click", function (e) {
          e.stopPropagation();
          var open = !MLOPEN[sid + n.key];
          MLOPEN[sid + n.key] = open;
          row.classList.toggle("open", open);
          var h = kids.offsetHeight;
          more.style.height = open ? "0px" : h + "px";
          more.getBoundingClientRect();
          more.style.height = open ? h + "px" : "0px";
          if (open)
            setTimeout(function () {
              if (MLOPEN[sid + n.key]) more.style.height = "";
            }, 260);
        });
        wrap.appendChild(more);
      }
      items.push(wrap);
    });
    items.forEach(function (w) {
      into.appendChild(w);
    });
  }
  var list = mk("div", "ml-list");
  box.appendChild(list);
  fill(list, lpSortLights(sec.mgl ? root.kids : lpLeaves(root), sec.mo));
  if (sec.mo)
    box.appendChild(
      pill("restart", _T("back_to_alphabetical_order"), {
        tap: function () {
          delete sec.mo;
          uiChanged();
          redraw();
        },
      })
    );
}

/* The settings that are about the popup: what the power button does, and the sync tab. */
function masterPopupRows(box, sec, scope, redraw) {
  var key = scope + ":" + sec.id,
    sid = scope + "~" + sec.id;
  /* The tab its light popup opens on. */
  var tabs = ["", "color", "white", "fx", "scenes", "sync"],
    tabName = {
      "": _T("master_open_default"),
      color: _T("colour"),
      white: _T("white"),
      fx: _T("effects"),
      scenes: _T("scenes"),
      sync: _T("master_sync_tab"),
    };
  box.appendChild(
    dropRow(
      _T("master_open_tab"),
      tabs,
      function () {
        return sec.mtab || "";
      },
      function (v) {
        if (v) sec.mtab = v;
        else delete sec.mtab;
        uiChanged();
      },
      "tune",
      function (v) {
        return tabName[v];
      }
    )
  );
  box.appendChild(sep(_T("master_power_button"), "power"));
  box.appendChild(
    seg(
      [
        ["lights", _T("master_power_lights")],
        ["scene", _T("master_power_scene")],
      ],
      sec.mpw === "scene" ? "scene" : "lights",
      function (v) {
        if (v === "scene") sec.mpw = "scene";
        else delete sec.mpw;
        uiChanged();
        redraw();
      }
    )
  );
  box.appendChild(hintRow(sec.mpw === "scene" ? _T("master_power_scene_hint") : _T("master_power_lights_hint")));
  if (sec.mpw === "scene") {
    var S0 = { root: { key: "m:" + sid, cmd: lightUnits(masterLightIds(sec)) } },
      cur = mscItems(S0).filter(function (x) {
        return x.key === sec.mps;
      })[0];
    box.appendChild(
      pill("scene", _T("master_power_scene_pick"), {
        val: function () {
          return cur ? cur.name : sec.mps ? A(sec.mps).friendly_name || sec.mps : _T("none");
        },
        tap: function () {
          showPopup("lmaster-pscene:" + key, true);
        },
      })
    );
  }
  var syncs = masterSyncDevices();
  if (syncs.length) {
    box.appendChild(
      flagPill("syncring", _T("master_sync_tab"), sec, "msync", function (on) {
        return on ? _T("master_sync_tab_on") : _T("master_sync_tab_off");
      })
    );
    if (sec.msync && syncs.length > 1)
      box.appendChild(
        dropRow(
          _T("master_sync_which"),
          syncs,
          function () {
            return syncs.indexOf(sec.msyncid) >= 0 ? sec.msyncid : syncs[0];
          },
          function (v) {
            sec.msyncid = v;
            uiChanged();
          },
          "syncring",
          function (v) {
            return A(v).friendly_name || v;
          }
        )
      );
  }
}

/* The settings that are about the section the master is in: the section can leave out what the master has, only in the section (the master keeps them). */
function masterSectionRows(box, sec) {
  box.appendChild(sep(_T("master_in_section"), "lights"));
  box.appendChild(
    flagPill("lights", _T("master_hide_lights"), sec, "mhl", function (on) {
      return on ? _T("master_hide_lights_on") : _T("master_hide_lights_off");
    })
  );
  box.appendChild(
    flagPill("syncring", _T("master_hide_sync"), sec, "mhs", function (on) {
      return on ? _T("master_hide_sync_on") : _T("master_hide_sync_off");
    })
  );
}

/* Choosing the lights of a manual master: every light of Home Assistant, searched by name and filtered by area; a tap adds or takes out. */
function masterLightsPage(b, key) {
  var p = key.split(":"),
    sec = masterById(p[0], p[1]);
  if (!sec) return;
  masterLightsChooser(b, sec, uiChanged);
}

/* The list to choose from, for `sec` (a master, or the draft of one that is being made: anything with `ml`). `changed` is called after each choice. */
function masterLightsChooser(b, sec, changed) {
  var st = { q: "", area: "" },
    box = mk("div"),
    inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search"));
  inp.type = "text";
  inp.placeholder = _T("search_devices");
  inp.setAttribute("autocomplete", "off");
  inp.addEventListener("input", function () {
    st.q = inp.value;
    draw();
  });
  w.appendChild(inp);
  b.appendChild(w);
  var areaTile = selectTile(
    _T("add_area"),
    function () {
      var ids = Object.keys(H().areas || {}).sort(function (x, y) {
        return String(H().areas[x].name).localeCompare(H().areas[y].name);
      });
      return ["all"].concat(ids);
    },
    function () {
      return st.area || "all";
    },
    function (v) {
      st.area = v === "all" ? "" : v;
      areaTile.refresh();
      draw();
    },
    "home",
    function (v) {
      return v === "all" ? _T("all_areas") : (H().areas[v] || {}).name || v;
    }
  );
  areaTile.classList.add("selrow");
  areaTile.refresh();
  b.appendChild(areaTile);
  b.appendChild(box);
  function has(id) {
    return (sec.ml || []).some(function (m) {
      return m.id === id;
    });
  }
  function draw() {
    box.innerHTML = "";
    var h = H(),
      zones = zoneLightIds(h.states, h.entities),
      tk = norm(st.q || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean),
      list = Object.keys(h.states)
        .filter(function (id) {
          if (id.indexOf("light.") !== 0 || zones[id]) return false;
          var e = h.entities && h.entities[id];
          if (e && (e.entity_category || e.hidden)) return false;
          if (st.area && areaIdOf(id) !== st.area) return false;
          var hay = norm((A(id).friendly_name || id) + " " + id + " " + areaName(id));
          return tk.every(function (x) {
            return hay.indexOf(x) >= 0;
          });
        })
        .sort(function (x, y) {
          return has(y) - has(x) || String(A(x).friendly_name || x).localeCompare(A(y).friendly_name || y);
        });
    list.slice(0, 60).forEach(function (id) {
      box.appendChild(
        pill("light", A(id).friendly_name || id, {
          sub: function () {
            return areaName(id);
          },
          check: function () {
            return has(id);
          },
          tap: function () {
            if (has(id))
              sec.ml = sec.ml.filter(function (m) {
                return m.id !== id;
              });
            else (sec.ml = sec.ml || []).push(masterDevice(id));
            changed();
          },
        })
      );
    });
  }
  draw();
}

/* The scene the power button runs: one of the scenes of the master's own list, or none. */
function masterSceneRunPage(b, key) {
  var p = key.split(":"),
    sec = masterById(p[0], p[1]);
  if (!sec) return;
  var S0 = { root: { key: "m:" + p[0] + "~" + p[1], cmd: lightUnits(masterLightIds(sec)) } },
    rows = [];
  function choose(k) {
    if (k) sec.mps = k;
    else delete sec.mps;
    uiChanged();
    rows.forEach(function (r) {
      r.refresh();
    });
  }
  rows.push(
    b.appendChild(
      pill("close", _T("none"), {
        check: function () {
          return !sec.mps;
        },
        tap: function () {
          choose("");
        },
      })
    )
  );
  mscItems(S0).forEach(function (it) {
    rows.push(
      b.appendChild(
        pill(it.kind === "plugin" ? "palette" : it.kind === "live" ? "sparkle" : "scene", it.name, {
          sub: function () {
            return mscKindLabel(it);
          },
          check: function () {
            return sec.mps === it.key;
          },
          tap: function () {
            choose(it.key);
          },
        })
      )
    );
  });
}
