/* Auto scenes and scene tags.
   An auto scene is up to ten colours, each with a brightness, and nothing else. Played on the lights of a lights master (or of a page), it gives every light one of the colours at random, and playing it again gives them out again.
   A tag is a lower case word on a scene. Tags are for the administrator: a lights master or a scenes section takes in the scenes that have a tag, or leaves them out. The tags of the home are the tags the scenes have; a tag no scene has is gone. */

/* The colours an auto scene is made from: [label key, colour or white] for the swatches. */
var AUTO_HUES = [0, 15, 30, 45, 60, 90, 120, 150, 170, 190, 210, 230, 250, 270, 290, 310, 330, 345];
var AUTO_WHITES = [2200, 2700, 3500, 4500, 6000];

function autoCss(c) {
  return c.k ? cssRgb(kelvinRgb(c.k)) : cssRgb(hsv2rgb(c.h, c.s));
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

/* Opens the editor of an auto scene: a new one for a page (and put in a scenes section or master), or an existing one. */
function autoSceneNew(scope, target) {
  AUTOED = { room: scope, target: target || null, isNew: true, draft: { id: "", name: "", icon: "scene", colors: [], tags: [] } };
  showPopup("scene-auto", true);
}

function autoSceneEdit(sc) {
  AUTOED = { room: sc.room, target: null, isNew: false, draft: { id: sc.id, name: sc.name, icon: sc.icon, colors: JSON.parse(JSON.stringify(sc.auto.colors)), tags: (sc.tags || []).slice() } };
  showPopup("scene-auto", true);
}

function autoSceneEditor(b) {
  var d = AUTOED.draft,
    box = mk("div");
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
  b.appendChild(box);
  function draw() {
    box.innerHTML = "";
    box.appendChild(sep(_T("auto_colours") + " · " + d.colors.length + " / 10", "palette"));
    box.appendChild(hintRow(_T("auto_hint")));
    d.colors.forEach(function (c, i) {
      var row = pill("palette", _T("auto_colour") + " " + (i + 1), {
        sub: function () {
          return c.b + "%";
        },
      });
      tintIcon(row, null);
      row.querySelector(".ic").style.background = autoCss(c);
      var step = seg(
        [20, 40, 60, 80, 100].map(function (v) {
          return [String(v), v + "%"];
        }),
        String([20, 40, 60, 80, 100].reduce(function (a, v) {
          return Math.abs(v - c.b) < Math.abs(a - c.b) ? v : a;
        }, 100)),
        function (v) {
          c.b = +v;
          draw();
        }
      );
      box.appendChild(row);
      box.appendChild(step);
      row.appendChild(
        (function () {
          var x = mk("div", "rnd pane sm", svg("trash"));
          x.setAttribute("role", "button");
          x.addEventListener("click", function (e) {
            e.stopPropagation();
            d.colors.splice(i, 1);
            draw();
          });
          return x;
        })()
      );
    });
    if (d.colors.length < 10) {
      box.appendChild(sep(_T("auto_add_colour"), "plus"));
      var grid = mk("div", "pre pgrid autogrid");
      grid.style.gridTemplateColumns = "repeat(6,1fr)";
      function add(c) {
        if (d.colors.length >= 10) return;
        d.colors.push(Object.assign({ b: 100 }, c));
        draw();
      }
      AUTO_HUES.forEach(function (h) {
        grid.appendChild(swatch({ h: h, s: 100 }, { tap: function () { add({ h: h, s: 100 }); } }));
      });
      AUTO_HUES.slice(0, 12).forEach(function (h) {
        grid.appendChild(swatch({ h: h, s: 45 }, { tap: function () { add({ h: h, s: 45 }); } }));
      });
      AUTO_WHITES.forEach(function (k) {
        grid.appendChild(swatch({ k: k }, { tap: function () { add({ k: k }); } }));
      });
      box.appendChild(grid);
    }
    box.appendChild(sep(_T("auto_tags"), "tune"));
    box.appendChild(sceneTagsRow(d));
    box.appendChild(
      pill("check", _T("auto_save"), {
        tap: function () {
          autoSceneSave();
        },
      })
    );
    if (!AUTOED.isNew)
      box.appendChild(
        pill("trash", _T("auto_delete"), {
          tap: function () {
            confirmDlg(_T("delete") + d.name + "”?", function () {
              var sc = sceneById(d.id);
              if (sc) sceneDeleteEverywhere(sc);
              closeSheet();
            }, _T("delete"));
          },
        })
      );
  }
  draw();
}

function autoSceneSave() {
  var d = AUTOED.draft,
    name = String(d.name || "").trim();
  if (!name) return toast(_T("give_the_scene_a_name"));
  if (!d.colors.length) return toast(_T("auto_choose_a_colour"));
  var sc = cleanScene({
    id: d.id || "s" + Date.now().toString(36),
    name: name,
    room: AUTOED.room,
    icon: d.icon,
    acts: [],
    auto: { colors: d.colors },
    tags: d.tags,
  });
  if (!sc) return toast(_T("couldn_t_save_this_scene"));
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== sc.id;
  });
  STORE.scenes.push(sc);
  if (AUTOED.isNew && AUTOED.target) {
    var te = secById(AUTOED.target.scope, AUTOED.target.sid);
    if (te) scnToggle(te, sc.id);
  }
  uiChanged();
  toast(_T("scene_saved"));
  closeSheet();
}

/* ---- tags ---- */

/* Rows that leave out the scenes with a tag: `key` names the list on `obj` (mxt on a master, xtag on a scenes section). */
function sceneTagLeaveOutRows(box, obj, key, redraw) {
  if (!sceneTags().length) return;
  box.appendChild(sep(_T("tags_leave_out"), "tune"));
  box.appendChild(hintRow(_T("tags_leave_out_hint")));
  sceneTags().forEach(function (t) {
    box.appendChild(
      pill("tune", t, {
        check: function () {
          return (obj[key] || []).indexOf(t) >= 0;
        },
        tap: function () {
          var cur = (obj[key] || []).slice(),
            at = cur.indexOf(t);
          if (at >= 0) cur.splice(at, 1);
          else cur.push(t);
          if (cur.length) obj[key] = cur;
          else delete obj[key];
          uiChanged();
          redraw();
        },
      })
    );
  });
}

/* The pages of the dashboard that have scenes made for them, with how many: Home first, then the rooms. */
function scenePages() {
  var pages = [{ id: "home", name: TITLES.home || _T("home") }].concat(
    UI.rooms.map(function (r) {
      return { id: r.id, name: r.name };
    })
  );
  pages.forEach(function (p) {
    p.count = STORE.scenes.filter(function (sc) {
      return sc.room === p.id;
    }).length;
  });
  return pages;
}

/* A scenes section's pages: the scenes made for these pages are in the section. */
function scenePageSectionRows(box, e, redraw) {
  box.appendChild(sep(_T("src_pages"), "home"));
  scenePages().forEach(function (p) {
    box.appendChild(
      pill("scene", p.name, {
        sub: function () {
          return cntS(p.count, _T("scene_lc"), _T("scenes_lc"));
        },
        check: function () {
          return (e.spage || []).indexOf(p.id) >= 0;
        },
        tap: function () {
          var cur = (e.spage || []).slice(),
            at = cur.indexOf(p.id);
          if (at >= 0) cur.splice(at, 1);
          else cur.push(p.id);
          if (cur.length) e.spage = cur;
          else delete e.spage;
          uiChanged();
          redraw();
        },
      })
    );
  });
}

/* A scenes section's tags: the tags it takes in, and the ones it leaves out. */
function sceneTagSectionRows(box, e, redraw) {
  var tags = sceneTags();
  scenePageSectionRows(box, e, redraw);
  box.appendChild(sep(_T("tags_take_in"), "tune"));
  if (!tags.length) box.appendChild(hintRow(_T("tags_none_used")));
  tags.forEach(function (t) {
    box.appendChild(
      pill("tune", t, {
        sub: function () {
          return _T("tags_take_in_sub");
        },
        check: function () {
          return (e.stag || []).indexOf(t) >= 0;
        },
        tap: function () {
          var cur = (e.stag || []).slice(),
            at = cur.indexOf(t);
          if (at >= 0) cur.splice(at, 1);
          else cur.push(t);
          if (cur.length) e.stag = cur;
          else delete e.stag;
          uiChanged();
          redraw();
        },
      })
    );
  });
  sceneTagLeaveOutRows(box, e, "xtag", redraw);
}

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
