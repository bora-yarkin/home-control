/* Auto scenes and scene tags.
   An auto scene is up to ten static colours, each with a brightness, and nothing else: no lights of its own and no room of its own. Played from a lights master or a page, it gives every light there one of the colours at random, and playing it again gives them out again. The same scene can be put in any number of rooms and masters, and changes only the lights of the one it is played from. It is made with the colour wheel of the light popups, and is tagged "auto scene" when it is made.
   A tag is a lower case word on a scene. Tags are for the administrator: a lights master or a scenes section takes in the scenes that have a tag, or leaves them out. The tags of the home are the tags the scenes have; a tag no scene has is gone. */

var AUTO_TAG = "auto scene";

/* The lights an auto scene played from a page takes: that page's, and the whole home's from Home. */
function autoPageLights(page) {
  return lightUnits(page === "home" || !page ? allLights() : ROOMLIGHTS[page] || []);
}

/* Gives each light one colour of the scene at random: the lights in a random order, the colours handed out in turn, so every colour is used when there are lights enough. Lights that cannot show a colour keep to the brightness. */
function autoScenePlay(sc, ids) {
  var lights = lightIndividuals(ids || []).filter(function (id) {
    return V_(id) !== "unavailable";
  });
  if (!sc.auto || !lights.length) {
    toast(_T("auto_no_lights"));
    return;
  }
  gate(lights, function () {
    var order = lights.slice(),
      colours = sc.auto.colors.slice();
  [order, colours].forEach(function (list) {
      for (var i = list.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)),
          t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
    });
    liveStopOn(lights);
    var groups = {};
    order.forEach(function (id, i) {
      var c = colours[i % colours.length],
        key = JSON.stringify(c),
        caps = lightCaps(id),
        d = { brightness_pct: c.b };
      if (c.k) {
        if (!caps.white && !caps.color) key += "|b";
        else d.color_temp_kelvin = c.k;
      } else if (caps.color) {
        d.hs_color = [c.h, c.s];
      } else key += "|b";
      var g = groups[key] || (groups[key] = { d: d, ids: [] });
      g.ids.push(id);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      call("light", "turn_on", Object.assign({ entity_id: g.ids }, g.d));
    });
    toast(_T("running_2") + sc.name + "”");
  });
}

/* ---- the editor ---- */

var AUTOED = null;

/* A new auto scene starts with two colours. */
var AUTO_START = [
  { h: 0, s: 100, b: 100 },
  { h: 240, s: 100, b: 100 },
];

/* Opens the editor of an auto scene: a new one for a page (and put in a scenes section or master), or an existing one. */
function autoSceneNew(scope, target) {
  AUTOED = { room: scope, target: target || null, isNew: true, draft: { id: "", name: "", icon: "scene", colors: JSON.parse(JSON.stringify(AUTO_START)), tags: [AUTO_TAG] } };
  showPopup("scene-auto", true);
}

function autoSceneEdit(sc) {
  AUTOED = { room: sc.room, target: null, isNew: false, draft: { id: sc.id, name: sc.name, icon: sc.icon, colors: JSON.parse(JSON.stringify(sc.auto.colors)), tags: (sc.tags || []).slice() } };
  showPopup("scene-auto", true);
}

/* The scene's colours as the colour lights of the dashboard take them, and back. */
function autoPalette(colors) {
  return colors.map(function (c) {
    return c.k ? { k: c.k, b: c.b } : { hs: [c.h, c.s], b: c.b };
  });
}

function autoColours(palette) {
  return palette.map(function (c) {
    var b = c.b || 100;
    if (c.k) return { k: c.k, b: b };
    var hs = c.hs || liveXyHs(c.xy[0], c.xy[1]);
    return { h: Math.round(hs[0]), s: Math.round(hs[1]), b: b };
  });
}

/* What the editor holds now, to tell whether leaving it would lose something. */
function autoSig() {
  var d = AUTOED.draft;
  return JSON.stringify([d.name, d.icon, (d.tags || []).slice().sort(), autoColours(vcolPalette())]);
}

/* The light popup's own colour wheel and white temperature, on lights that exist only here: one for each colour of the scene, each with its own brightness. Nothing is sent to a real light while editing. */
function autoSceneEditor(b) {
  var d = AUTOED.draft;
  /* The colour lights are made once for an editor: coming back from the tags keeps what was chosen. */
  if (!AUTOED.loaded) {
    vcolLoad(autoPalette(d.colors));
    VLIGHT[VCOL_GROUP].attributes.separate = true;
    AUTOED.loaded = true;
  }
  var w = mk("div", "sqw pane", svg("scene")),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.maxLength = 40;
  inp.placeholder = _T("scene_name");
  inp.value = d.name;
  inp.addEventListener("input", function () {
    d.name = inp.value;
  });
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(
    iconPick(QAICONS, d.icon || "scene", function (n) {
      d.icon = n;
    })
  );
  b.appendChild(sceneTagsRow(d));
  b.appendChild(sep(_T("auto_colours"), "palette"));
  b.appendChild(hintRow(_T("auto_hint")));
  var root = lpMasterNode("auto", [VCOL_GROUP]),
    colorNode = lpFind(root, VCOL_GROUP),
    stepper = mk("div");
  AUTOED.S = null;
  lightPanel(b, root, {
    maker: true,
    still: true,
    ready: function (S) {
      AUTOED.S = S;
      S.ex[root.key] = true;
      S.ex[colorNode.key] = true;
      S.sel = colorNode.key;
    },
  });
  b.appendChild(stepper);
  liveMakerColours(stepper, root, colorNode, AUTOED);
  b.appendChild(
    pill("check", _T("auto_save"), {
      tap: function () {
        autoSceneSave(closeSheet);
      },
    })
  );
  if (!AUTOED.isNew)
    b.appendChild(
      pill("trash", _T("auto_delete"), {
        tap: function () {
          confirmDlg(_T("delete") + d.name + "”?", function () {
            var sc = sceneById(d.id);
            if (sc) sceneDeleteEverywhere(sc);
            POPGUARD = null;
            closeSheet();
          }, _T("delete"));
        },
      })
    );
  if (AUTOED.saved === undefined) AUTOED.saved = autoSig();
  guardUnsaved({
    dirty: function () {
      return autoSig() !== AUTOED.saved;
    },
    save: autoSceneSave,
    discard: function () {},
    done: closeSheet,
  });
}

function autoSceneSave(leave) {
  var d = AUTOED.draft,
    name = String(d.name || "").trim();
  if (!name) {
    toast(_T("give_the_scene_a_name"));
    return false;
  }
  var sc = cleanScene({
    id: d.id || "s" + Date.now().toString(36),
    name: name,
    room: AUTOED.room,
    icon: d.icon,
    acts: [],
    auto: { colors: autoColours(vcolPalette()) },
    tags: d.tags,
  });
  if (!sc) {
    toast(_T("couldn_t_save_this_scene"));
    return false;
  }
  if (!sceneFits(sc.id)) return false;
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== sc.id;
  });
  STORE.scenes.push(sc);
  if (AUTOED.isNew && AUTOED.target) {
    sceneTargetAdd(AUTOED.target, sc.id);
  }
  uiChanged();
  toast(_T("scene_saved"));
  AUTOED.saved = autoSig();
  POPGUARD = null;
  leave();
  return true;
}

/* ---- tags ---- */

/* The two dropdowns that say where scenes come from, side by side, put in `box`: Rooms and Tags. Rooms are the pages of the dashboard (the scenes made for them); None clears them. Tags are the tags of the scenes of the rooms ticked (all of them when no room is ticked); a second tap on a tag leaves its scenes out instead. When a room ticked has scenes a plugin owns in its Home Assistant area, Tags also offers "Hue": ticked, those scenes are taken in too. `rooms` is { get(): tokens ("page:<id>" for a room, "hue:..." for Hue), set(tokens) } and `tags` is { inc(): tags, exc(): tags, set(inc, exc) }. */
function sceneSourceTiles(box, rooms, tags) {
  var pages = scenePages(),
    grid = mk("div", "ap-grid");
  /* The rooms ticked, as tokens: "page:<id>" (a page) or "area:<id>" (an area of Home Assistant that no page has). */
  function roomTokens() {
    return rooms.get().filter(function (t) {
      return t.indexOf("page:") === 0 || t.indexOf("area:") === 0;
    });
  }
  function pageIds() {
    return roomTokens()
      .filter(function (t) {
        return t.indexOf("page:") === 0;
      })
      .map(function (t) {
        return t.slice(5);
      });
  }
  function hueTokens() {
    return rooms.get().filter(function (t) {
      return t.indexOf("hue:") === 0;
    });
  }
  /* The groups (Hue's rooms and zones) ticked. */
  function groupTokens() {
    return rooms.get().filter(function (t) {
      return t.indexOf("group:") === 0;
    });
  }
  /* Hue is offered when a room ticked (any room, when none is) has plugin scenes in its area, and while it is ticked. */
  function hueOffered() {
    if (hueTokens().length) return true;
    var ticked = roomTokens();
    return pages.some(function (p) {
      return (!ticked.length || ticked.indexOf(p.token) >= 0) && sceneRoomHueIds(p.token).length;
    });
  }
  /* The groups worth offering: those with scenes in the rooms ticked (all of them when none is), and the ones already ticked. */
  function groupOptions() {
    var ticked = roomTokens(),
      near = null;
    if (ticked.length)
      near = ticked.reduce(function (acc, t) {
        return acc.concat(sceneRoomHueIds(t));
      }, []);
    return sceneGroups().filter(function (g) {
      return (
        !near ||
        groupTokens().indexOf(g.token) >= 0 ||
        g.ids.some(function (id) {
          return near.indexOf(id) >= 0;
        })
      );
    });
  }
  /* The tags worth offering: those of the scenes of the rooms ticked; all of them when none is ticked; and the ones already chosen. */
  function tagOptions() {
    var ids = pageIds(),
      out = sceneTags().filter(function (t) {
        return (
          !ids.length ||
          STORE.scenes.some(function (sc) {
            return ids.indexOf(sc.room) >= 0 && (sc.tags || []).indexOf(t) >= 0;
          })
        );
      });
    tags.inc().concat(tags.exc()).forEach(function (t) {
      if (out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }
  grid.appendChild(
    multiTile(
      _T("src_pages"),
      function () {
        return [["-", _T("none")]].concat(
          pages.map(function (p) {
            return [p.token, p.name + " · " + p.count];
          })
        );
      },
      function (v) {
        return v === "-" ? roomTokens().length === 0 : roomTokens().indexOf(v) >= 0;
      },
      function (v) {
        var cur = roomTokens(),
          at = cur.indexOf(v);
        if (v === "-") cur = [];
        else if (at >= 0) cur.splice(at, 1);
        else cur.push(v);
        rooms.set(hueTokens().concat(cur));
      },
      "scene",
      function () {
        var n = pages
          .filter(function (p) {
            return roomTokens().indexOf(p.token) >= 0;
          })
          .map(function (p) {
            return p.name;
          });
        return n.length ? n.join(", ") : _T("none");
      }
    )
  );
  grid.appendChild(
    multiTile(
      _T("src_tags"),
      function () {
        var o = [["-", _T("none")]];
        if (hueOffered()) o.push(["@hue", _T("src_hue")]);
        groupOptions().forEach(function (g) {
          o.push(["@" + g.token, g.label + " · " + g.ids.length]);
        });
        return o.concat(
          tagOptions().map(function (t) {
            return [t, t];
          })
        );
      },
      function () {
        return false;
      },
      function (v) {
        if (v.indexOf("@group:") === 0) {
          var all = rooms.get(),
            g = v.slice(1),
            at = all.indexOf(g);
          /* a group is narrower than Hue as a whole (all the scenes of the rooms): choosing one stops taking in all of them, or the choice would filter nothing */
          rooms.set(
            at >= 0
              ? all.filter(function (t) {
                  return t !== g;
                })
              : all
                  .filter(function (t) {
                    return t !== "hue:@lights" && t !== "hue:@rooms" && t !== "hue:@page";
                  })
                  .concat([g])
          );
          return;
        }
        if (v === "@hue") {
          rooms.set(
            rooms.get().filter(function (t) {
              return t.indexOf("hue:") !== 0;
            }).concat(hueTokens().length ? [] : ["hue:@rooms"])
          );
          return;
        }
        var inc = tags.inc().slice(),
          exc = tags.exc().slice();
        if (v === "-") {
          inc = [];
          exc = [];
          rooms.set(
            rooms.get().filter(function (t) {
              return t.indexOf("hue:") !== 0 && t.indexOf("group:") !== 0;
            })
          );
        } else if (inc.indexOf(v) >= 0) {
          inc.splice(inc.indexOf(v), 1);
          exc.push(v);
        } else if (exc.indexOf(v) >= 0) exc.splice(exc.indexOf(v), 1);
        else inc.push(v);
        tags.set(inc, exc);
      },
      "tune",
      function () {
        var inc = tags.inc(),
          exc = tags.exc(),
          picked = sceneGroups()
            .filter(function (g) {
              return groupTokens().indexOf(g.token) >= 0;
            })
            .map(function (g) {
              return g.label;
            }),
          n = (hueTokens().length ? [_T("src_hue")] : []).concat(picked, inc, exc.map(function (t) { return "– " + t; }));
        if (!n.length) return sceneTags().length || hueOffered() || groupOptions().length ? _T("none") : _T("src_no_tags");
        return n.join(", ");
      },
      function (v) {
        if (v === "@hue") return hueTokens().length ? 1 : 0;
        if (v.indexOf("@group:") === 0) return groupTokens().indexOf(v.slice(1)) >= 0 ? 1 : 0;
        if (v === "-") return tags.inc().length || tags.exc().length || hueTokens().length || groupTokens().length ? 0 : 1;
        return tags.inc().indexOf(v) >= 0 ? 1 : tags.exc().indexOf(v) >= 0 ? 2 : 0;
      }
    )
  );
  box.appendChild(grid);
  box.appendChild(hintRow(_T("src_tags_hint")));
}

/* The scene entities a plugin owns (Hue) in the Home Assistant area of a room: a page ("page:<id>", the area it is set to) or an area of its own ("area:<id>"). */
function sceneRoomHueIds(token) {
  var area = token.indexOf("area:") === 0 ? token.slice(5) : (UIROOM[token.slice(5)] || {}).area;
  if (!area || !PLUGIN_SCENE_KINDS.length) return [];
  return sceneIds(area)
    .map(function (x) {
      return x[0];
    })
    .filter(function (id) {
      return !!pluginSceneKind(id);
    });
}

/* The group a scene a plugin owns is in, as { type: "room" | "zone", name, token }, or null: the plugin's scene entities say it in their `group_type` and `group_name` attributes (Hue's rooms and zones; see docs/plugin-api.md).
   The token, "group:<type>:<name as lower case words joined by hyphens>", is how a master or a collection of scenes says it takes in the scenes of that group. */
function groupSlug(name) {
  return (
    String(name)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "group"
  );
}

function sceneGroupOf(id) {
  var a = A(id),
    name = typeof a.group_name === "string" ? a.group_name.trim() : "";
  if (!name || (a.group_type !== "room" && a.group_type !== "zone") || !pluginSceneKind(id)) return null;
  return { type: a.group_type, name: name, token: "group:" + a.group_type + ":" + groupSlug(name) };
}

/* "Hue · Zone · Bed Storage": a group named in full. */
function sceneGroupLabel(g) {
  return _T("src_hue") + " · " + _T(g.type === "zone" ? "src_group_zone" : "src_group_room") + " · " + g.name;
}

/* Scenes of different groups can have one name (a room's "Relax" and the "Relax" of a zone in it). For the scenes of a list whose names are the same, a word that tells them apart, as { id: " · Zone" }: the kind of their group, with the
   name of the group too where two of them are of one kind. A scene with a name of its own, or in no group, gets none. */
function sceneNameSuffixes(ids) {
  var byName = {},
    out = {};
  ids.forEach(function (id) {
    var n = A(id).friendly_name || id;
    if (sceneGroupOf(id)) (byName[n] = byName[n] || []).push(id);
  });
  Object.keys(byName).forEach(function (n) {
    var list = byName[n];
    if (list.length < 2) return;
    var kind = function (id) {
        return _T(sceneGroupOf(id).type === "zone" ? "src_group_zone" : "src_group_room");
      },
      count = {};
    list.forEach(function (id) {
      count[kind(id)] = (count[kind(id)] || 0) + 1;
    });
    list.forEach(function (id) {
      out[id] = " · " + kind(id) + (count[kind(id)] > 1 ? " · " + sceneGroupOf(id).name : "");
    });
  });
  return out;
}

/* Every group the scenes of plugins are in, rooms before zones and each by name: [{ token, type, name, label ("Hue · Zone · Bed Storage"), ids }]. */
function sceneGroups() {
  var by = {};
  if (!PLUGIN_SCENE_KINDS.length) return [];
  Object.keys(H().states).forEach(function (id) {
    if (id.indexOf("scene.") !== 0) return;
    var g = sceneGroupOf(id);
    if (!g) return;
    (by[g.token] = by[g.token] || { token: g.token, type: g.type, name: g.name, label: sceneGroupLabel(g), ids: [] }).ids.push(id);
  });
  return Object.keys(by)
    .map(function (k) {
      return by[k];
    })
    .sort(function (a, b) {
      return (a.type === b.type ? 0 : a.type === "room" ? -1 : 1) || a.name.localeCompare(b.name);
    });
}

/* The scenes of plugins in the group a token names. */
function sceneGroupIds(token) {
  return sceneGroups()
    .filter(function (g) {
      return g.token === token;
    })
    .reduce(function (acc, g) {
      return acc.concat(g.ids);
    }, []);
}

/* The pages of the dashboard that have scenes made for them, with how many: Home first, then the rooms. */
function scenePages() {
  var pages = [{ id: "home", name: TITLES.home || _T("home") }].concat(
    UI.rooms.map(function (r) {
      return { id: r.id, name: r.name };
    })
  );
  pages.forEach(function (p) {
    p.token = "page:" + p.id;
    p.count =
      STORE.scenes.filter(function (sc) {
        return sc.room === p.id;
      }).length + sceneRoomHueIds(p.token).length;
  });
  /* An area of Home Assistant with plugin scenes that no page is set to is a room of its own. */
  var used = {};
  UI.rooms.forEach(function (r) {
    used[r.area] = 1;
  });
  Object.keys(H().areas || {})
    .sort(function (x, y) {
      return String(H().areas[x].name).localeCompare(H().areas[y].name);
    })
    .forEach(function (a) {
      var n = sceneRoomHueIds("area:" + a).length;
      if (!used[a] && n) pages.push({ id: "", name: H().areas[a].name, token: "area:" + a, count: n });
    });
  return pages;
}

/* The settings of a collection of scenes (a device of a Section): the areas, the rooms and the tags it takes its scenes from, and whether the area's name stays in their names. */
function sceneCollectionSettings(box, d) {
  box.appendChild(sep(_T("scene_collection_sources"), "scene"));
  sceneSourceTiles(
    box,
    {
      get: function () {
        return (d.spage || []).slice();
      },
      set: function (ids) {
        if (ids.length) d.spage = ids;
        else delete d.spage;
        uiChanged();
      },
    },
    {
      inc: function () {
        return (d.stag || []).slice();
      },
      exc: function () {
        return (d.xtag || []).slice();
      },
      set: function (inc, exc) {
        if (inc.length) d.stag = inc;
        else delete d.stag;
        if (exc.length) d.xtag = exc;
        else delete d.xtag;
        uiChanged();
      },
    }
  );
  box.appendChild(
    flagPill("edit", _T("scene_names_without_area"), d, "keepname", function (on) {
      return on ? _T("scene_names_without_area_on") : _T("scene_names_without_area_off");
    }, true)
  );
}

/* ---- tags ---- */

var TAGOBJ = null;

/* A row that opens the tags of a scene or of a draft (anything with `tags`): the tags it has, and the picker. */
function sceneTagsRow(obj) {
  return pill("tune", _T("auto_tags_row"), {
    sub: function () {
      return (obj.tags || []).length ? obj.tags.join(", ") : _T("none");
    },
    tap: function () {
      TAGOBJ = obj;
      showPopup("scene-tags", true);
    },
  });
}

/* The picker: a search box over the tags of the home. A tap adds or takes off a tag; when nothing matches, the search itself can be added as a new tag. Search ignores case, and a tag is kept in lower case. */
function sceneTagsPage(b) {
  var obj = TAGOBJ;
  if (!obj) return;
  var inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search")),
    box = mk("div");
  inp.type = "text";
  inp.placeholder = _T("tags_search");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(box);
  function has(t) {
    return (obj.tags || []).indexOf(t) >= 0;
  }
  function flip(t) {
    obj.tags = obj.tags || [];
    var i = obj.tags.indexOf(t);
    if (i >= 0) obj.tags.splice(i, 1);
    else if (obj.tags.length < 12) obj.tags.push(t);
    if (obj.id !== undefined && obj.room && sceneById(obj.id) === obj) uiChanged();
    else if (obj.id && sceneById(obj.id)) {
      sceneById(obj.id).tags = obj.tags.slice();
      uiChanged();
    }
  }
  function draw() {
    box.innerHTML = "";
    var q = inp.value.trim().toLowerCase(),
      all = sceneTags().concat((obj.tags || []).filter(function (t) {
        return sceneTags().indexOf(t) < 0;
      })),
      hits = all.filter(function (t) {
        return !q || t.indexOf(q) >= 0;
      });
    hits.forEach(function (t) {
      box.appendChild(
        pill("tune", t, {
          check: function () {
            return has(t);
          },
          tap: function () {
            flip(t);
            draw();
          },
        })
      );
    });
    if (q && all.indexOf(q) < 0 && cleanTags([q]).length)
      box.appendChild(
        pill("plus", _T("tags_add") + " “" + q + "”", {
          tap: function () {
            flip(cleanTags([q])[0]);
            inp.value = "";
            draw();
          },
        })
      );
    if (!hits.length && !q) box.appendChild(hintRow(_T("tags_none_yet")));
  }
  inp.addEventListener("input", draw);
  draw();
}
