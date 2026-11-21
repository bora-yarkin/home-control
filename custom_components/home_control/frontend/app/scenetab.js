/* The Scenes page of a lights master's light popup (the palette tab next to Effects): the scenes of the Lights section as round tiles of their colours, in two rows that scroll sideways, as the Hue Plus room view has them. A tile dropped on another makes a folder (opened in place, named with its pen);
   the scene that plays has a pen and three dots beside it. Which scenes are in it is the section's own choice (`msrc`, with the scenes made from its + in `scn`), not the scenes sections': removing a scenes section changes nothing here.
   What the section keeps (app/model.js): scn (the scenes made here), msrc (where else they come from), mf (the folders: { id, n, s: [keys] }) and mtop (the order of the tiles that are outside folders). */

/* The section a lights master popup is for: the page it is on and its settings. */
function mscSection(root) {
  var sid = String((root && root.key) || "").replace(/^m:/, ""),
    scope = LMASTER_SCOPE[sid],
    e = scope ? secById(scope, sid) : null;
  return e && e.k === "lights" ? { scope: scope, e: e } : null;
}

/* Where the scenes of a section come from when it has not chosen: the Hue scenes of its lights' areas, as the Effects page used to list them. */
var MSC_DEFAULT_SRC = ["hue"];

/* The scenes of the section, each as { key, kind: "hue" | "live" | "classic", id, name, sc }: the ones made from its + first, then the sources it has chosen. */
function mscItems(S) {
  var ref = mscSection(S.root);
  if (!ref) return [];
  var e = ref.e,
    seen = {},
    out = [];
  var page = UIROOM[ref.scope] || {};
  function add(key, kind, name, sc) {
    if (seen[key]) return;
    /* A Hue scene is named after its room ("Bathroom Dim"); the page's name, or the area's, is left out as in a scenes section. */
    if (kind === "hue") name = sceneShortName(name, { name: page.name, area: page.area }, e);
    seen[key] = 1;
    out.push({ key: key, kind: kind, id: key, name: name, sc: sc || null });
  }
  function stored(sc) {
    add(sc.id, sc.live ? "live" : "classic", sc.name, sc);
  }
  (e.scn || [])
    .map(sceneById)
    .filter(function (sc) {
      return sc && sceneAllowed(sc);
    })
    .forEach(stored);
  (e.msrc || MSC_DEFAULT_SRC).forEach(function (src) {
    if (src === "hue")
      lpFxOf(S.root).scenes.forEach(function (id) {
        add(id, "hue", A(id).friendly_name || A(id).name || id);
      });
    else if (src === "page")
      STORE.scenes
        .filter(function (sc) {
          return (ref.scope === "home" || sc.room === ref.scope) && sceneAllowed(sc);
        })
        .forEach(stored);
    else if (src.indexOf("sec:") === 0) {
      /* The scenes of a scenes section of the page, as it shows them now. */
      var other = secById(ref.scope, src.slice(4)),
        more = other && other.k === "scenes" && ref.scope !== "home" ? lightingScenesExtra(ref.scope) : null;
      if (!other || other.k !== "scenes") return;
      secScenes(other).forEach(stored);
      if (more)
        (more(other) || []).forEach(function (x) {
          if (x.kind) add(x.id, "hue", A(x.id).friendly_name || A(x.id).name || x.id);
        });
    }
  });
  return out;
}

function mscKindLabel(it) {
  return it.kind === "hue" ? _T("scene_kind_hue") : it.kind === "live" ? _T("live_scene") : _T("classic_scene");
}

/* The colours of a scene's round tile: a Hue scene's from the bridge, a live scene's palette, a classic scene's lights. cb gets the CSS colours (a Hue scene's come later). */
function mscColours(it, cb) {
  function css(c) {
    if (c.k) return cssRgb(kelvinRgb(c.k));
    var hs = c.hs || [c.h, c.s];
    return hs && typeof hs[0] === "number" ? cssRgb(hsv2rgb(hs[0], hs[1])) : null;
  }
  if (it.kind === "hue") {
    var kind = pluginSceneKind(it.id);
    if (kind && kind.palette) kind.palette(it.id, cb);
    return;
  }
  var list = it.kind === "live" ? (it.sc.live && it.sc.live.palette) || [] : (it.sc.acts || []).map(function (a) {
      return a.col;
    });
  cb(
    list
      .map(function (c) {
        return c ? css(c) : null;
      })
      .filter(Boolean)
      .slice(0, 6)
  );
}

function mscActive(it) {
  if (it.kind === "hue") {
    var kind = pluginSceneKind(it.id);
    return !!(kind && kind.active(it.id));
  }
  return it.kind === "live" ? !!liveRun(it.sc) : sceneActive(it.sc);
}

function mscDynamic(it) {
  return it.kind === "live" || (it.kind === "hue" && !!pluginSceneKind(it.id).dynamic(it.id));
}

/* Starts it (or stops it, when it plays and can be stopped), on the lights of the master. */
function mscPlay(S, it) {
  if (it.kind === "live") return liveToggle(it.sc);
  if (it.kind === "classic") return runScene(it.sc);
  var kind = pluginSceneKind(it.id);
  if (kind.dynamic(it.id)) {
    if (kind.active(it.id)) kind.toggle(it.id);
    else kind.start(it.id);
  } else {
    liveStopOn(S.root.cmd);
    call("scene", "turn_on", { entity_id: it.id });
  }
}

/* Opens the page that edits it, over the panel: the panel comes back when it is left, on this page. */
function mscEdit(S, it) {
  LPBACK = { root: S.root.key, mode: S.mode, sel: S.sel };
  if (it.kind === "live") liveMakerEdit(it.sc);
  else if (it.kind === "classic") staticOpen(it.sc.room, it.sc);
  else showPopup(pluginSceneKind(it.id).popup + ":" + it.id, true);
}

/* The three dots: what can be done with the scene besides playing and editing it. */
function mscMore(S, it, ref, redraw) {
  var list = [],
    fold = (ref.e.mf || []).filter(function (f) {
      return f.s.indexOf(it.key) >= 0;
    })[0],
    kind = it.kind === "hue" ? pluginSceneKind(it.id) : null;
  if (fold)
    list.push({
      label: _T("scene_take_out_of_folder"),
      fn: function () {
        mscFoldersChange(ref.e, function (folders) {
          folders.forEach(function (f) {
            f.s = f.s.filter(function (k) {
              return k !== it.key;
            });
          });
        });
        redraw();
      },
    });
  if ((ref.e.scn || []).indexOf(it.key) >= 0)
    list.push({
      label: _T("scene_remove_from_list"),
      fn: function () {
        ref.e.scn = ref.e.scn.filter(function (k) {
          return k !== it.key;
        });
        uiChanged();
        redraw();
      },
    });
  if (it.kind === "hue" ? kind && kind.remove : true)
    list.push({
      label: _T("delete_scene"),
      danger: true,
      fn: function () {
        if (it.kind === "hue")
          confirmDlg(_T("delete_scene") + ": " + it.name + "?", function () {
            Promise.resolve(kind.remove(it.id)).then(redraw);
          });
        else sceneDeleteEverywhere(it.sc);
      },
    });
  if (list.length) askSheet(it.name, list);
}

/* The folders and the order of the tiles outside them are changed through this, so what was made of a scene that is gone is cleaned up and a folder with no scene is not kept. */
function mscFoldersChange(e, change) {
  var folders = (e.mf || []).map(function (f) {
    return { id: f.id, n: f.n, s: f.s.slice() };
  });
  change(folders);
  folders = folders.filter(function (f) {
    return f.s.length;
  });
  if (folders.length) e.mf = folders;
  else delete e.mf;
  uiChanged();
}

/* The tiles outside folders, in the order the owner gave them; what is new comes last, in the order the scenes are listed. */
function mscTop(items, e) {
  var inFolder = {};
  (e.mf || []).forEach(function (f) {
    f.s.forEach(function (k) {
      inFolder[k] = 1;
    });
  });
  var byKey = {};
  items.forEach(function (it) {
    byKey[it.key] = it;
  });
  var entries = [];
  (e.mf || []).forEach(function (f) {
    var scenes = f.s
      .map(function (k) {
        return byKey[k];
      })
      .filter(Boolean);
    if (scenes.length) entries.push({ key: "f:" + f.id, folder: f, scenes: scenes });
  });
  items.forEach(function (it) {
    if (!inFolder[it.key]) entries.push({ key: it.key, item: it });
  });
  var order = e.mtop || [];
  return entries.sort(function (a, b) {
    var x = order.indexOf(a.key),
      y = order.indexOf(b.key);
    return (x < 0 ? 1e6 : x) - (y < 0 ? 1e6 : y);
  });
}

/* Two rows that scroll sideways: the first half of the tiles along the top, the rest along the bottom (as the Hue app and Hue Plus fill them). */
function mscRows(grid) {
  var tiles = grid.querySelectorAll(".lp-fxt:not(.new)"),
    all = grid.querySelectorAll(".lp-fxt"),
    /* A few tiles stay in one row; more are split over two. */
    half = all.length > 4 ? Math.ceil(all.length / 2) : all.length;
  Array.prototype.forEach.call(all, function (t, i) {
    t.style.gridRow = i < half ? "1" : "2";
    t.style.gridColumn = String((i < half ? i : i - half) + 1);
  });
  return tiles;
}

/* One tile: the round picture, the name and, under it, what kind of scene it is. */
function mscTile(S, it, ref) {
  var t = mk("div", "lp-fxt"),
    sw = mk("div", "lp-fxs");
  sw.style.background = "var(--f-raise)";
  sw.appendChild(mk("div", "lp-fxstop", "<i></i>"));
  t.appendChild(sw);
  t.appendChild(mk("div", "lp-fxn")).textContent = it.name;
  t.appendChild(mk("div", "lp-fxv")).textContent = mscKindLabel(it);
  t.dataset.key = it.key;
  t.setAttribute("role", "button");
  t.setAttribute("aria-label", it.name);
  mscColours(it, function (stops) {
    if (!stops || !stops.length) return;
    sw.style.background = "linear-gradient(135deg," + (stops.length > 1 ? stops : [stops[0], stops[0]]).join(",") + ")";
    var rgb = /(\d+),(\d+),(\d+)/.exec(stops[0]);
    if (rgb) t.style.setProperty("--fh", hsvOf([+rgb[1], +rgb[2], +rgb[3]])[0]);
  });
  t.addEventListener("click", function () {
    mscPlay(S, it);
  });
  t.item = it;
  return t;
}

/* A folder: the pictures of up to four of its scenes in the one tile; tapping it opens it in place under the rows. */
function mscFolderTile(entry, open) {
  var t = mk("div", "lp-fxt fold"),
    sw = mk("div", "lp-fxs");
  entry.scenes.slice(0, 4).forEach(function (it) {
    var dot = mk("i");
    dot.style.background = "var(--f-line2)";
    mscColours(it, function (stops) {
      if (stops && stops.length) dot.style.background = "linear-gradient(135deg," + (stops.length > 1 ? stops : [stops[0], stops[0]]).join(",") + ")";
    });
    sw.appendChild(dot);
  });
  t.appendChild(sw);
  t.appendChild(mk("div", "lp-fxn")).textContent = entry.folder.n;
  t.appendChild(mk("div", "lp-fxv")).textContent = entry.scenes.length + " " + _T("scenes").toLowerCase();
  t.dataset.key = entry.key;
  t.setAttribute("role", "button");
  t.setAttribute("aria-label", entry.folder.n);
  t.addEventListener("click", open);
  t.entry = entry;
  return t;
}

/* The pen and the three dots of the scene that plays: they come out of its tile to the right, and the tiles of its row after it slide over. */
var MSC_SIDE_W = 46;

function mscSide(grid, S, ref, redraw) {
  var side = null;
  function active() {
    return [].filter.call(grid.querySelectorAll(".lp-fxt:not(.new):not(.fold)"), function (t) {
      return t.item && mscActive(t.item);
    })[0];
  }
  function make(t) {
    var el = mk("div", "lp-fxside");
    var pen = mk("div", "lp-fxe", svg("edit")),
      dots = mk("div", "lp-fxe", svg("dots"));
    pen.setAttribute("role", "button");
    pen.setAttribute("aria-label", _T("effect_settings"));
    dots.setAttribute("role", "button");
    dots.setAttribute("aria-label", _T("more"));
    pen.addEventListener("click", function () {
      mscEdit(S, t.item);
    });
    dots.addEventListener("click", function () {
      mscMore(S, t.item, ref, redraw);
    });
    el.appendChild(pen);
    el.appendChild(dots);
    return el;
  }
  return function () {
    var tiles = [].slice.call(grid.querySelectorAll(".lp-fxt"));
    var on = ISADMIN ? active() : null;
    tiles.forEach(function (t) {
      t.style.translate = "";
    });
    if (!on) {
      if (side) side.el.remove();
      side = null;
      return;
    }
    var row = on.style.gridRow,
      col = +on.style.gridColumn;
    tiles.forEach(function (t) {
      if (t.style.gridRow === row && +t.style.gridColumn > col) t.style.translate = MSC_SIDE_W + "px 0";
    });
    if (!side || side.t !== on) {
      if (side) side.el.remove();
      side = { t: on, el: make(on) };
      grid.appendChild(side.el);
    }
    side.el.style.left = on.offsetLeft + on.offsetWidth + 4 + "px";
    side.el.style.top = on.offsetTop + "px";
    side.el.style.height = on.offsetHeight + "px";
  };
}

/* The Scenes page. */
function lpScenesPane(S, pane) {
  var ref = mscSection(S.root);
  if (!ref) return;
  var e = ref.e,
    box = mk("div", "lp-fx"),
    openFolder = null,
    repaint = [];
  pane.appendChild(box);
  function redraw() {
    var top = box.scrollTop;
    draw();
    box.scrollTop = top;
  }
  /* A grid of tiles that can be reordered, and dropped on one another to make a folder (outside a folder) or taken out of it (dropped beside its card). */
  function grid(entries, where) {
    var g = mk("div", "lp-scg"),
      folder = where.folder;
    entries.forEach(function (en) {
      if (en.folder) g.appendChild(mscFolderTile(en, function () {
        openFolder = openFolder === en.folder.id ? null : en.folder.id;
        redraw();
      }));
      else g.appendChild(mscTile(S, en.item, ref));
    });
    if (!folder && ISADMIN) {
      var add = mk("div", "lp-fxt new"),
        plus = mk("div", "lp-fxs plus", svg("plus"));
      add.appendChild(plus);
      add.appendChild(mk("div", "lp-fxn")).textContent = _T("new_scene");
      add.addEventListener("click", function () {
        LPBACK = { root: S.root.key, mode: S.mode, sel: S.sel };
        showPopup("scene-new:" + ref.scope + ":" + e.id, true);
      });
      g.appendChild(add);
    }
    mscRows(g);
    var sideUpdate = mscSide(g, S, ref, redraw);
    sideUpdate();
    repaint.push(function () {
      [].forEach.call(g.querySelectorAll(".lp-fxt:not(.new)"), function (t) {
        if (t.item) t.classList.toggle("picked", mscActive(t.item));
        else if (t.entry)
          t.classList.toggle(
            "picked",
            t.entry.scenes.some(mscActive)
          );
      });
      sideUpdate();
    });
    if (ISADMIN)
      sceneSortable(
        g,
        ".lp-fxt:not(.new)",
        function (el) {
          return el.dataset.key;
        },
        function (ids) {
          if (folder)
            mscFoldersChange(e, function (folders) {
              folders.forEach(function (f) {
                if (f.id === folder.id) f.s = ids;
              });
            });
          else {
            e.mtop = ids;
            uiChanged();
          }
          redraw();
        },
        {
          live: false,
          /* Dropped on another scene a folder is made of the two; dropped on a folder, the scene goes into it. */
          merge: function (a, b) {
            if (folder || String(a).indexOf("f:") === 0) return redraw();
            if (String(b).indexOf("f:") === 0)
              mscFoldersChange(e, function (folders) {
                folders.forEach(function (f) {
                  if ("f:" + f.id === b) f.s.push(a);
                });
              });
            else {
              var made = { id: Date.now().toString(36), n: _T("scene_new_folder"), s: [b, a] };
              mscFoldersChange(e, function (folders) {
                folders.push(made);
              });
              openFolder = made.id;
            }
            redraw();
          },
          /* A scene let go outside the card of its folder is outside every folder again. */
          outside: folder
            ? function (key) {
                mscFoldersChange(e, function (folders) {
                  folders.forEach(function (f) {
                    f.s = f.s.filter(function (k) {
                      return k !== key;
                    });
                  });
                });
                redraw();
              }
            : null,
          bounds: function () {
            return card;
          },
        }
      );
    var card = null;
    g.setCard = function (c) {
      card = c;
    };
    return g;
  }
  /* The folder that is open: its name with a pen, and its scenes as a grid of their own. */
  function folderCard(en) {
    var card = mk("div", "lp-fold"),
      head = mk("div", "lp-fold-h"),
      name = mk("div", "lp-fold-n");
    name.textContent = en.folder.n;
    head.appendChild(name);
    if (ISADMIN) {
      var pen = mk("div", "lp-fxe", svg("edit"));
      pen.setAttribute("role", "button");
      pen.setAttribute("aria-label", _T("scene_folder_name"));
      pen.addEventListener("click", function () {
        var input = mk("input", "sq");
        input.type = "text";
        input.maxLength = 40;
        input.value = en.folder.n;
        head.replaceChild(input, name);
        pen.style.display = "none";
        input.focus();
        input.select();
        function done() {
          var v = input.value.trim();
          if (v && v !== en.folder.n)
            mscFoldersChange(e, function (folders) {
              folders.forEach(function (f) {
                if (f.id === en.folder.id) f.n = v;
              });
            });
          redraw();
        }
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") done();
        });
        input.addEventListener("blur", done);
      });
      head.appendChild(pen);
    }
    card.appendChild(head);
    var g = grid(
      en.scenes.map(function (it) {
        return { key: it.key, item: it };
      }),
      { folder: en.folder }
    );
    g.setCard(card);
    card.appendChild(g);
    return card;
  }
  function draw() {
    box.innerHTML = "";
    repaint = [];
    var items = mscItems(S),
      entries = mscTop(items, e);
    if (!entries.length && !ISADMIN) {
      box.appendChild(mk("div", "lp-fx-h")).textContent = _T("no_scenes_yet");
      return;
    }
    box.appendChild(mk("div", "lp-fx-h")).textContent = _T("scenes");
    box.appendChild(grid(entries, {}));
    entries.forEach(function (en) {
      if (en.folder && en.folder.id === openFolder) box.appendChild(folderCard(en));
    });
    paint();
  }
  function paint() {
    repaint.forEach(function (fn) {
      fn();
    });
  }
  draw();
  reg(function () {
    if (box.isConnected) paint();
  });
}

/* Hold, then drag, to put tiles in another order; dropped on the middle of another it is a drop onto it (opts.merge(a, b)), and dropped outside opts.bounds() it is taken out (opts.outside(id)). A press that moves before the hold is a scroll or a tap, and is left alone. The same as
   Hue Plus's room view has it: done(ids) gets the new order (ids from idOf(element)). */
function sceneSortable(box, selector, idOf, done, opts) {
  opts = opts || {};
  var HOLD = 380;
  box.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(selector);
    if (!el || !box.contains(el) || e.button > 0) return;
    var timer = null,
      lifted = false,
      target = null,
      sx = e.clientX,
      sy = e.clientY,
      grab = null,
      endX = 0,
      endY = 0;
    function inside(node, x, y) {
      var r = node.getBoundingClientRect();
      return x > r.left && x < r.right && y > r.top && y < r.bottom;
    }
    function items() {
      return [].filter.call(box.children, function (c) {
        return c.matches(selector);
      });
    }
    function place(ev) {
      el.style.transform = "none";
      var base = el.getBoundingClientRect();
      el.style.transform = "translate(" + (ev.clientX - grab.x - base.left) + "px," + (ev.clientY - grab.y - base.top) + "px) scale(1.03)";
    }
    function lift() {
      lifted = true;
      var r = el.getBoundingClientRect();
      grab = { x: sx - r.left, y: sy - r.top };
      el.classList.add("lifting");
      /* The tile is carried over the whole page, not only over its own row. */
      box.style.overflow = "visible";
      try {
        el.setPointerCapture(e.pointerId);
      } catch (x) {}
      if (navigator.vibrate) navigator.vibrate(12);
    }
    function move(ev) {
      if (!lifted) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) stop(false);
        return;
      }
      ev.preventDefault();
      target = null;
      items().forEach(function (other) {
        other.classList.remove("mergeable");
        if (other === el) return;
        var r = other.getBoundingClientRect(),
          middle =
            ev.clientX > r.left + r.width * 0.3 && ev.clientX < r.right - r.width * 0.3 && ev.clientY > r.top + r.height * 0.3 && ev.clientY < r.bottom - r.height * 0.3;
        /* The middle of another item is a drop onto it; its edges make room. */
        if (opts.merge && middle) {
          target = other;
          other.classList.add("mergeable");
        }
      });
      place(ev);
    }
    /* The tile was carried over the others without them moving; where it is let go is its new place, and the tiles in between slide to theirs. */
    function dropAt(x, y) {
      var others = items().filter(function (o) {
          return o !== el;
        }),
        before = others.map(function (o) {
          return o.getBoundingClientRect();
        }),
        best = null,
        bestD = Infinity;
      others.forEach(function (o, i) {
        var r = before[i],
          d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (d < bestD) {
          bestD = d;
          best = { o: o, r: r };
        }
      });
      if (!best) return;
      var after = x > best.r.left + best.r.width / 2 && y > best.r.top - 1 ? best.o.nextSibling : best.o;
      if (y > best.r.bottom) after = best.o.nextSibling;
      box.insertBefore(el, after);
      others.forEach(function (o, i) {
        var r = o.getBoundingClientRect(),
          dx = before[i].left - r.left,
          dy = before[i].top - r.top;
        if ((dx || dy) && o.animate) o.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    }
    function stop(commit) {
      clearTimeout(timer);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      if (lifted) {
        box.style.overflow = "";
        el.classList.remove("lifting");
        el.style.transform = "";
        /* The click that ends a drag is not a tap. */
        var eat = function (c) {
          c.stopPropagation();
          c.preventDefault();
        };
        box.addEventListener("click", eat, { capture: true, once: true });
        setTimeout(function () {
          box.removeEventListener("click", eat, true);
        }, 60);
        items().forEach(function (other) {
          other.classList.remove("mergeable");
        });
        if (commit && target && opts.merge) opts.merge(idOf(el), idOf(target));
        else if (commit && opts.outside && !inside(opts.bounds ? opts.bounds() : box, endX, endY)) opts.outside(idOf(el));
        else if (commit) {
          dropAt(endX, endY);
          done(items().map(idOf));
        }
      }
    }
    function up(ev) {
      endX = ev.clientX;
      endY = ev.clientY;
      stop(true);
    }
    function cancel() {
      stop(false);
    }
    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    timer = setTimeout(lift, HOLD);
  });
  box.addEventListener("contextmenu", function (e) {
    if (e.target.closest(selector)) e.preventDefault();
  });
}

/* In the settings of the lights master: where its scenes come from. The scenes made from its + are always in it; the Hue scenes of its lights' areas, every classic and live scene of the page and the scenes of each scenes section of the page can be added. */
function mscSourceRows(box, sec, scope, redraw) {
  var src = sec.msrc || MSC_DEFAULT_SRC;
  function row(key, title, sub) {
    return pill("scene", title, {
      sub: function () {
        return sub;
      },
      check: function () {
        return (sec.msrc || MSC_DEFAULT_SRC).indexOf(key) >= 0;
      },
      tap: function () {
        var cur = (sec.msrc || MSC_DEFAULT_SRC).slice(),
          at = cur.indexOf(key);
        if (at >= 0) cur.splice(at, 1);
        else cur.push(key);
        sec.msrc = cur;
        uiChanged();
        redraw();
      },
    });
  }
  box.appendChild(sep(_T("scenes_in_the_light_popup"), "palette"));
  box.appendChild(hintRow(_T("scenes_in_the_light_popup_hint")));
  box.appendChild(row("hue", _T("scene_source_hue"), _T("scene_source_hue_sub")));
  box.appendChild(row("page", _T("scene_source_page"), _T("scene_source_page_sub")));
  var n = 0;
  secOrder(scopeKey(scope)).forEach(function (s) {
    if (s.k !== "scenes" || scope === "home") return;
    n++;
    box.appendChild(row("sec:" + s.id, s.t || _T("scenes") + (n > 1 ? " " + n : ""), _T("scene_source_section_sub")));
  });
  return src;
}
