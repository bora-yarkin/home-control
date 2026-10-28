/* The At a glance section: tiles that count devices. */

/* Custom At a glance tiles: count the devices of one type (optionally one device class) that are on, open, unlocked and so on. */
var GL_DOMS = [
    "binary_sensor",
    "light",
    "switch",
    "fan",
    "cover",
    "lock",
    "media_player",
    "climate",
    "person",
    "input_boolean",
    "vacuum",
  ],
  GL_ON = {
    binary_sensor: ["on"],
    light: ["on"],
    switch: ["on"],
    fan: ["on"],
    input_boolean: ["on"],
    cover: ["open", "opening"],
    lock: ["unlocked", "open", "opening"],
    media_player: ["playing"],
    climate: ["heat", "cool", "heat_cool", "auto", "dry", "fan_only"],
    person: ["home"],
    vacuum: ["cleaning", "returning"],
  },
  GL_ICON = {
    binary_sensor: "home",
    light: "lights",
    switch: "plug",
    fan: "fan",
    cover: "home",
    lock: "lock",
    media_player: "tv",
    climate: "ac",
    person: "person",
    input_boolean: "plug",
    vacuum: "vac",
  },
  GL_LAB = {
    binary_sensor: _T("sensors_on_or_off"),
    light: _T("lights"),
    switch: _T("switches"),
    fan: _T("fans"),
    cover: _T("covers_and_gates"),
    lock: _T("locks"),
    media_player: _T("media_players"),
    climate: _T("climate"),
    person: _T("people"),
    input_boolean: _T("toggles"),
    vacuum: _T("vacuums"),
  };

function glWord(c) {
  var dc = c.dc || "";
  if (
    c.dom === "cover" ||
    (c.dom === "binary_sensor" &&
      ["door", "window", "garage_door", "opening", "lock"].indexOf(dc) >= 0)
  )
    return _T("open_3");
  if (c.dom === "lock") return _T("unlocked_3");
  if (c.dom === "media_player") return _T("playing_2");
  if (c.dom === "person") return _T("home");
  if (c.dom === "vacuum") return _T("cleaning_2");
  if (c.dom === "climate") return _T("running_3");
  if (c.dom === "binary_sensor") {
    if (["motion", "occupancy", "presence", "moving"].indexOf(dc) >= 0) return _T("active_2");
    if (
      ["smoke", "gas", "moisture", "problem", "safety", "carbon_monoxide", "tamper"].indexOf(dc) >=
      0
    )
      return _T("detected_2");
  }
  return _T("on_3");
}

function glEnts(c) {
  var h = H();
  if (!h) return [];
  var ids = Object.keys(h.states)
    .filter(function (id) {
      if (dom(id) !== c.dom) return false;
      if (!ISADMIN && modeOf(id).mode === "hide") return false;
      var e = h.entities && h.entities[id];
      if (e && (e.entity_category || e.hidden)) return false;
      if (c.dc && A(id).device_class !== c.dc) return false;
      return true;
    })
    .sort(function (a, b) {
      return entName(a).localeCompare(entName(b));
    });
  return c.dom === "light" ? lightUnits(ids) : ids;
}

function glCount(c) {
  var on = GL_ON[c.dom] || ["on"];
  return glEnts(c).filter(function (id) {
    return on.indexOf(V_(id)) >= 0;
  }).length;
}

function glanceCustomTile(c) {
  return tile(
    c.i && iconOk(c.i) ? c.i : GL_ICON[c.dom],
    c.t,
    function () {
      return glEnts(c).length ? glCount(c) + " " + glWord(c) : _T("none_found");
    },
    function () {
      return glCount(c) > 0;
    },
    function () {
      showPopup("g-custom:" + c.id, false);
    }
  );
}

function glCustomPage(b, id) {
  var c = glanceCfg().c.filter(function (x) {
    return x.id === id;
  })[0];
  if (!c) return;
  var on = GL_ON[c.dom] || ["on"];
  var ids = glEnts(c);
  if (!ids.length) {
    b.appendChild(
      pill("info", _T("nothing_found"), {
        sub: function () {
          return _T("no_devices_of_this_type_yet_change_t");
        },
      })
    );
    return;
  }
  ids.forEach(function (i) {
    b.appendChild(
      pill(sensorIcon(i), entName(i), {
        on: function () {
          return on.indexOf(V_(i)) >= 0;
        },
        val: function () {
          return cap(String(V_(i)).replace(/_/g, " "));
        },
      })
    );
  });
}

function glanceAdd() {
  var id = "x" + Date.now().toString(36).slice(-6);
  glanceSave(function (x) {
    x.c = x.c || [];
    x.c.push({ id: id, t: _T("doors_open"), dom: "binary_sensor", dc: "door", i: "home" });
  });
  showPopup("manage-glance:" + id, true);
}

/* At a glance: each tile can be hidden or moved. The choice is kept on the section itself. */
var GL_IDS = ["lights", "acs", "fans", "batteries", "media", "robot"],
  GL_NAME = {
    lights: _T("lights"),
    acs: _T("acs"),
    fans: _T("fans"),
    batteries: _T("batteries"),
    media: _T("media"),
    robot: _T("robot"),
  };

function glanceCfg() {
  var e = secOrder(CURSCOPE).filter(function (x) {
      return x.k === "glance";
    })[0],
    g = (e && e.gl) || {};
  return { o: g.o || [], h: g.h || [], c: g.c || [], f: !!g.f };
}

function glanceSave(fn) {
  var o = secOrder(CURSCOPE),
    e = o.filter(function (x) {
      return x.k === "glance";
    })[0];
  e.gl = e.gl || { o: [], h: [], c: [] };
  if (!e.gl.c) e.gl.c = [];
  fn(e.gl);
  setSecOrder(CURSCOPE, o);
  uiChanged();
}

function glanceFill(g, GT) {
  var cfg = glanceCfg(),
    ed = editing();
  cfg.c.forEach(function (c) {
    GT[c.id] = glanceCustomTile(c);
  });
  var all = GL_IDS.concat(
      cfg.c.map(function (c) {
        return c.id;
      })
    ),
    ids = cfg.o
      .filter(function (id) {
        return GT[id];
      })
      .concat(
        all.filter(function (id) {
          return GT[id] && cfg.o.indexOf(id) < 0;
        })
      ),
    els = [],
    vis = [];
  ids.forEach(function (id) {
    var hid = cfg.h.indexOf(id) >= 0;
    if (hid && !ed) return;
    edMark(
      GT[id],
      function () {
        showPopup("manage-glance:" + id, true);
      },
      hid
    );
    g.appendChild(GT[id]);
    els.push(GT[id]);
    vis.push(id);
  });
  if (ed)
    edSort(els, function (f, t) {
      var v = vis.slice();
      v.splice(t, 0, v.splice(f, 1)[0]);
      glanceSave(function (x) {
        x.o = v.concat(
          ids.filter(function (i) {
            return v.indexOf(i) < 0;
          })
        );
      });
    });
}

function glancePage(b, id) {
  var c = glanceCfg().c.filter(function (x) {
    return x.id === id;
  })[0];
  function save() {
    glanceSave(function () {});
  }
  if (c) {
    var box = mk("div");
    b.appendChild(box);
    function draw() {
      box.appendChild(
        textRow(
          "edit",
          _T("tile_name"),
          c.t,
          function (v) {
            if (v) {
              c.t = v.slice(0, 24);
              save();
            }
          },
          24
        )
      );
      box.appendChild(
        iconPick(SECICONS, c.i || GL_ICON[c.dom], function (n) {
          c.i = n;
          save();
        })
      );
      box.appendChild(
        selectTile(
          _T("counts"),
          function () {
            return GL_DOMS;
          },
          function () {
            return c.dom;
          },
          function (v) {
            c.dom = v;
            delete c.dc;
            save();
            redrawBox(box, draw);
          },
          GL_ICON[c.dom],
          function (v) {
            return GL_LAB[v];
          }
        )
      );
      var cl = {};
      Object.keys(H().states).forEach(function (i) {
        if (dom(i) === c.dom && A(i).device_class) cl[A(i).device_class] = 1;
      });
      var opts = [""].concat(Object.keys(cl).sort());
      if (opts.length > 1 || c.dc)
        box.appendChild(
          selectTile(
            _T("kind"),
            function () {
              return opts;
            },
            function () {
              return c.dc || "";
            },
            function (v) {
              if (v) c.dc = v;
              else delete c.dc;
              save();
              redrawBox(box, draw);
            },
            "tune",
            function (v) {
              return v ? cap(v.replace(/_/g, " ")) : _T("any");
            }
          )
        );
      var n = glEnts(c).length,
        hn = mk("div", "hint");
      hn.textContent =
        _T("counting") +
        " " +
        n +
        " " +
        (n === 1 ? _T("device_2") : _T("devices")) +
        " · " +
        _T("shows_how_many_are") +
        " " +
        glWord(c);
      box.appendChild(hn);
      box.appendChild(
        pill("check", _T("show_this_tile"), {
          on: function () {
            return glanceCfg().h.indexOf(id) < 0;
          },
          sub: function () {
            return glanceCfg().h.indexOf(id) < 0 ? _T("visible") : _T("hidden");
          },
          tap: function () {
            glanceSave(function (x) {
              var i = x.h.indexOf(id);
              if (i >= 0) x.h.splice(i, 1);
              else x.h.push(id);
            });
          },
        })
      );
      box.appendChild(
        pill("trash", _T("delete_this_tile"), {
          tap: function () {
            glanceSave(function (x) {
              x.c = x.c.filter(function (y) {
                return y.id !== id;
              });
              x.o = x.o.filter(function (y) {
                return y !== id;
              });
              x.h = x.h.filter(function (y) {
                return y !== id;
              });
            });
            popBack();
          },
        })
      );
    }
    redrawBox(box, draw);
    return;
  }
  b.appendChild(
    pill("check", _T("show_this_tile"), {
      on: function () {
        return glanceCfg().h.indexOf(id) < 0;
      },
      sub: function () {
        return glanceCfg().h.indexOf(id) < 0 ? _T("visible") : _T("hidden");
      },
      tap: function () {
        glanceSave(function (x) {
          var i = x.h.indexOf(id);
          if (i >= 0) x.h.splice(i, 1);
          else x.h.push(id);
        });
      },
    })
  );
  if (id === "media") b.appendChild(mediaCtlPill());
  if (id === "lights")
    b.appendChild(
      pill("palette", _T("light_colour_in_popups"), {
        on: function () {
          return glanceCfg().f;
        },
        sub: function () {
          return glanceCfg().f
            ? _T("popup_sliders_are_filled_with_the_ligh")
            : _T("popups_use_the_accent_colour");
        },
        tap: function () {
          glanceSave(function (x) {
            if (x.f) delete x.f;
            else x.f = 1;
          });
        },
      })
    );
  if (id === "lights")
    gxPage(
      b,
      "lights",
      allLights().map(function (i) {
        var rm = "";
        Object.keys(ROOMLIGHTS).forEach(function (r) {
          if (!rm && ROOMLIGHTS[r].indexOf(i) >= 0) rm = TITLES[r] || "";
        });
        return { id: i, name: entName(i), icon: "light", room: rm };
      })
    );
  if (id === "acs") {
    gxPage(b, "acs", devsOf("climate").map(gxItem));
    var acl = devsOf("climate").filter(function (d) {
      return UIDEV[d.id];
    });
    if (acl.length) {
      b.appendChild(sep(_T("thermostat_dial"), "thermo"));
      var dh = mk("div", "hint");
      dh.textContent = _T("a_round_dial_instead_of_the_slider_f");
      b.appendChild(dh);
      acl.forEach(function (d) {
        b.appendChild(
          pill("thermo", d.name, {
            on: function () {
              return !!UIDEV[d.id].dial;
            },
            sub: function () {
              return (
                (TITLES[d.room] || "") + " · " + (UIDEV[d.id].dial ? _T("dial") : _T("slider"))
              );
            },
            tap: function () {
              var o = UIDEV[d.id];
              if (o.dial) delete o.dial;
              else o.dial = 1;
              uiChanged();
            },
          })
        );
      });
    }
  }
  if (id === "fans")
    gxPage(
      b,
      "fans",
      devsOf("fan")
        .filter(function (d) {
          return !d.pop;
        })
        .map(gxItem)
    );
  if (id === "media") gxPage(b, "media", devsOf("media").map(gxItem));
  if (id === "batteries")
    b.appendChild(
      pill("battery", _T("battery_sensors"), {
        sub: function () {
          return cntS(UI.bats.length, _T("sensor"), _T("sensors_2"));
        },
        tap: function () {
          showPopup("manage-bats", true);
        },
      })
    );
  var hn = mk("div", "hint");
  hn.textContent = _T("drag_the_tiles_on_the_page_to_change");
  b.appendChild(hn);
}
