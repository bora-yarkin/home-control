/* The Scenes page of a lights master's light popup (the palette tab next to Effects): the scenes of the Lights section as round tiles of their colours, in two rows that scroll sideways, as the Hue Plus room view has them. A tile dropped on another makes a folder (opened in place, named with its pen);
   the scene that plays has a pen and three dots beside it. Which scenes are in it is the section's own choice (`msrc`, with the scenes made from its + in `scn`), not the scenes sections': removing a scenes section changes nothing here.
   What the section keeps (app/model.js): scn (the scenes made here), msrc (where else they come from), mf (the folders: { id, n, s: [keys] }) and mtop (the order of the tiles that are outside folders). */

/* The section a lights master popup is for: the page it is on and its settings. A master is named "page~section" (a page's Lights section can have the same id as another page's). */
function mscSection(root) {
  var at = String((root && root.key) || "")
      .replace(/^m:/, "")
      .split("~"),
    e = at.length === 2 ? secById(at[0], at[1]) : null;
  return e && e.k === "lights" ? { scope: at[0], e: e } : null;
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

/* One tile: the round picture, the name and, under it, what kind of scene it is. */
function mscTile(S, it) {
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

/* A folder: the pictures of up to four of its scenes in the one tile; tapping it opens it under its row. */
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
  t.appendChild(mk("div", "lp-fxv")).textContent = entry.scenes.length + " " + _T(entry.scenes.length === 1 ? "scene_one" : "scenes").toLowerCase();
  t.dataset.key = entry.key;
  t.setAttribute("role", "button");
  t.setAttribute("aria-label", entry.folder.n);
  t.addEventListener("click", open);
  t.entry = entry;
  return t;
}

/* Tiles in four columns: each row is its own line of up to four tiles that share its width, so the pen and dots that come out beside the scene that plays take their room from the tiles of that row. */
var MSC_COLS = 4;

/* A list of tiles that can be reordered (hold, then drag: the others make room as it moves), dropped on one another to make a folder, and with the pen and dots beside the scene that plays. `tiles` are the tiles
   in their order, `plus` the tile that makes a scene (last, not movable). opts: { folder, onOrder(ids), onMerge(a, b), onOutside(key), redraw, folderCards() }. */
function mscList(S, ref, tiles, plus, opts) {
  var wrap = mk("div", "lp-scl"),
    order = tiles.slice(),
    side = null;
  wrap.order = function () {
    return order;
  };
  function activeTile() {
    return ISADMIN
      ? order.filter(function (t) {
          return t.item && mscActive(t.item);
        })[0]
      : null;
  }
  /* The pen and the three dots of the scene that plays, in its row right after its tile. */
  function sideUpdate() {
    var on = activeTile();
    if (side && (!on || side.t !== on)) {
      var gone = side.el;
      gone.classList.remove("open");
      setTimeout(function () {
        gone.remove();
      }, 320);
      side = null;
    }
    if (!on || side) return;
    var el = mk("div", "lp-fxside"),
      pen = mk("div", "lp-fxe", svg("edit")),
      dots = mk("div", "lp-fxe", svg("dots"));
    pen.setAttribute("role", "button");
    pen.setAttribute("aria-label", _T("effect_settings"));
    pen.addEventListener("click", function () {
      mscEdit(S, on.item);
    });
    dots.setAttribute("role", "button");
    dots.setAttribute("aria-label", _T("more"));
    dots.addEventListener("click", function () {
      mscMore(S, on.item, ref, opts.redraw);
    });
    el.appendChild(pen);
    el.appendChild(dots);
    on.parentNode.insertBefore(el, on.nextSibling);
    side = { t: on, el: el };
    void el.offsetWidth;
    el.classList.add("open");
  }
  /* The tiles of `list` in rows of four; a folder that is open has its card under the row its tile is in. FLIP: each tile slides from where it was to where it is now. */
  function apply(list, animate, skip) {
    var before = new Map();
    if (animate)
      list.concat(plus ? [plus] : []).forEach(function (t) {
        before.set(t, t.getBoundingClientRect());
      });
    order = list;
    if (side) {
      side.el.remove();
      side = null;
    }
    var all = list.concat(plus ? [plus] : []),
      rows = wrap.querySelectorAll(".lp-scr, .lp-foldw");
    [].forEach.call(rows, function (r) {
      r.remove();
    });
    for (var i = 0; i < all.length; i += MSC_COLS) {
      var row = mk("div", "lp-scr");
      all.slice(i, i + MSC_COLS).forEach(function (t) {
        row.appendChild(t);
        var card = t.entry && opts.cards[t.entry.folder.id];
        if (card) row.card = card;
      });
      wrap.appendChild(row);
      if (row.card) wrap.appendChild(row.card);
    }
    sideUpdate();
    if (animate)
      all.forEach(function (t) {
        var was = before.get(t),
          now = t.getBoundingClientRect();
        if (!was || t === skip) return;
        var dx = was.left - now.left,
          dy = was.top - now.top;
        if ((dx || dy) && t.animate) t.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
  }
  wrap.apply = apply;
  wrap.sideUpdate = sideUpdate;
  apply(order, false);
  if (ISADMIN)
    sceneSortable(wrap, {
      tiles: function () {
        return order;
      },
      apply: apply,
      idOf: function (el) {
        return el.dataset.key;
      },
      done: function () {
        opts.onOrder(
          order.map(function (t) {
            return t.dataset.key;
          })
        );
      },
      /* A scene dropped on another scene makes a folder of the two; dropped on a folder it goes into it (not inside a folder, and a folder is not put into another). */
      canMerge: function (a, b) {
        return !opts.folder && !a.entry && !!opts.onMerge;
      },
      merge: opts.onMerge,
      outside: opts.onOutside || null,
      bounds: opts.bounds || null,
    });
  return wrap;
}

/* The Scenes page. */
function lpScenesPane(S, pane) {
  var ref = mscSection(S.root);
  if (!ref) return;
  var e = ref.e,
    box = mk("div", "lp-fx"),
    openFolder = null,
    cards = {},
    paints = [];
  pane.appendChild(box);
  function redraw() {
    var top = box.scrollTop;
    draw();
    box.scrollTop = top;
  }
  function newTile() {
    var add = mk("div", "lp-fxt new"),
      plus = mk("div", "lp-fxs plus", svg("plus"));
    add.appendChild(plus);
    add.appendChild(mk("div", "lp-fxn")).textContent = _T("new_scene");
    add.addEventListener("click", function () {
      LPBACK = { root: S.root.key, mode: S.mode, sel: S.sel };
      showPopup("scene-new:" + ref.scope + ":" + e.id, true);
    });
    return add;
  }
  /* The card of a folder: its name with a pen, and its scenes in a list of their own. It slides open under the row of its tile, and the rows below slide down. */
  function folderCard(en) {
    var outer = mk("div", "lp-foldw"),
      card = mk("div", "lp-fold"),
      head = mk("div", "lp-fold-h"),
      name = mk("div", "lp-fold-n");
    outer.appendChild(card);
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
    var list = mscList(
      S,
      ref,
      en.scenes.map(function (it) {
        return mscTile(S, it);
      }),
      null,
      {
        folder: en.folder,
        cards: {},
        redraw: redraw,
        bounds: function () {
          return card;
        },
        onOrder: function (ids) {
          mscFoldersChange(e, function (folders) {
            folders.forEach(function (f) {
              if (f.id === en.folder.id) f.s = ids;
            });
          });
        },
        /* A scene let go outside the card of its folder is outside every folder again. */
        onOutside: function (key) {
          mscFoldersChange(e, function (folders) {
            folders.forEach(function (f) {
              f.s = f.s.filter(function (k) {
                return k !== key;
              });
            });
          });
          redraw();
        },
      }
    );
    card.appendChild(list);
    paints.push(function () {
      list.apply(list.order(), false);
    });
    return outer;
  }
  function draw() {
    box.innerHTML = "";
    paints = [];
    cards = {};
    var items = mscItems(S),
      entries = mscTop(items, e);
    if (!entries.length && !ISADMIN) {
      box.appendChild(mk("div", "lp-fx-h")).textContent = _T("no_scenes_yet");
      return;
    }
    box.appendChild(mk("div", "lp-fx-h")).textContent = _T("scenes");
    var top = null;
    function toggle(en) {
      var id = en.folder.id,
        card = cards[id];
      if (card) {
        /* closing: it slides shut, then goes */
        card.classList.remove("open");
        delete cards[id];
        openFolder = null;
        setTimeout(function () {
          card.remove();
        }, 340);
        return;
      }
      /* a folder that was open slides shut as this one opens */
      Object.keys(cards).forEach(function (other) {
        var c = cards[other];
        c.classList.remove("open");
        delete cards[other];
        setTimeout(function () {
          c.remove();
        }, 340);
      });
      openFolder = id;
      cards[id] = folderCard(en);
      top.apply(top.order(), false);
      void cards[id].offsetHeight;
      cards[id].classList.add("open");
    }
    var tiles = entries.map(function (en) {
      return en.folder
        ? mscFolderTile(en, function () {
            toggle(en);
          })
        : mscTile(S, en.item);
    });
    top = mscList(S, ref, tiles, ISADMIN ? newTile() : null, {
      cards: cards,
      redraw: redraw,
      onOrder: function (ids) {
        e.mtop = ids;
        uiChanged();
      },
      /* Dropped on another scene a folder is made of the two (opened, to be named); dropped on a folder, the scene goes into it. */
      onMerge: function (a, b) {
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
    });
    box.appendChild(top);
    if (openFolder) {
      var open = tiles.filter(function (t) {
        return t.entry && t.entry.folder.id === openFolder;
      })[0];
      if (open) {
        cards[openFolder] = folderCard(open.entry);
        top.apply(top.order(), false);
        cards[openFolder].classList.add("open");
      } else openFolder = null;
    }
    paints.push(top.sideUpdate);
    paint();
  }
  /* The tiles that play are lit, and the scene that plays has its pen and dots. */
  function paint() {
    [].forEach.call(box.querySelectorAll(".lp-fxt:not(.new)"), function (t) {
      if (t.item) t.classList.toggle("picked", mscActive(t.item));
      else if (t.entry) t.classList.toggle("picked", t.entry.scenes.some(mscActive));
    });
    [].forEach.call(box.querySelectorAll(".lp-scl"), function (l) {
      if (l.sideUpdate) l.sideUpdate();
    });
  }
  draw();
  SLIVE.push(function () {
    if (box.isConnected) paint();
  });
}

/* Hold, then drag: the tile follows the pointer and the others make room live (they slide to their new places, as on a phone's home screen); over the middle of another it is a drop onto it (opts.merge(a, b)); let go outside opts.bounds() it is taken out (opts.outside(id)).
   A press that moves before the hold is a scroll or a tap, and is left alone. opts: { tiles(), apply(list, animate, skip), idOf(el), done(), canMerge(a, b), merge, outside, bounds }. */
function sceneSortable(box, opts) {
  var HOLD = 380;
  box.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(".lp-fxt:not(.new)");
    if (!el || !box.contains(el) || e.button > 0 || !opts.tiles().length) return;
    var timer = null,
      lifted = false,
      target = null,
      sx = e.clientX,
      sy = e.clientY,
      grab = null,
      endX = 0,
      endY = 0,
      last = null,
      lastAt = 0,
      raf = 0,
      scroller = el.closest(".lp-fx");
    function inside(node, x, y) {
      var r = node.getBoundingClientRect();
      return x > r.left && x < r.right && y > r.top && y < r.bottom;
    }
    function place(ev) {
      el.style.transform = "none";
      var base = el.getBoundingClientRect();
      el.style.transform = "translate(" + (ev.clientX - grab.x - base.left) + "px," + (ev.clientY - grab.y - base.top) + "px) scale(1.04)";
    }
    function stopTouchScroll(ev) {
      ev.preventDefault();
    }
    function lift() {
      lifted = true;
      var r = el.getBoundingClientRect();
      grab = { x: sx - r.left, y: sy - r.top };
      el.classList.add("lifting");
      document.addEventListener("touchmove", stopTouchScroll, { passive: false });
      try {
        el.setPointerCapture(e.pointerId);
      } catch (x) {}
      if (navigator.vibrate) navigator.vibrate(12);
      edge();
    }
    /* Near the top or the bottom of the page the page scrolls, so a tile can be carried to a folder that is out of sight. */
    function edge() {
      if (!lifted) return;
      if (scroller && last) {
        var r = scroller.getBoundingClientRect(),
          d = last.clientY < r.top + 36 ? -8 : last.clientY > r.bottom - 36 ? 8 : 0;
        if (d) {
          scroller.scrollTop += d;
          place(last);
        }
      }
      raf = requestAnimationFrame(edge);
    }
    function move(ev) {
      last = ev;
      if (!lifted) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) stop(false);
        return;
      }
      ev.preventDefault();
      var list = opts.tiles(),
        hit = null;
      list.forEach(function (o) {
        o.classList.remove("mergeable");
        if (o === el || hit) return;
        if (inside(o, ev.clientX, ev.clientY)) hit = o;
      });
      target = null;
      if (hit) {
        var r = hit.getBoundingClientRect(),
          middle = ev.clientX > r.left + r.width * 0.3 && ev.clientX < r.right - r.width * 0.3 && ev.clientY > r.top + r.height * 0.28 && ev.clientY < r.bottom - r.height * 0.28;
        if (opts.merge && opts.canMerge(el, hit) && middle) {
          target = hit;
          hit.classList.add("mergeable");
        } else if (performance.now() - lastAt > 140) {
          /* The tile takes the place of the one it is over: before it from its left half, after it from its right. */
          var next = list.filter(function (o) {
              return o !== el;
            }),
            at = next.indexOf(hit) + (ev.clientX > r.left + r.width / 2 ? 1 : 0);
          next.splice(at, 0, el);
          if (next.some(function (o, i) {
              return o !== list[i];
            })) {
            lastAt = performance.now();
            opts.apply(next, true, el);
          }
        }
      }
      place(ev);
    }
    function stop(commit) {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("touchmove", stopTouchScroll);
      if (lifted) {
        el.classList.remove("lifting");
        /* The tile settles into its place. */
        var held = el.getBoundingClientRect();
        el.style.transform = "";
        var home = el.getBoundingClientRect();
        if (el.animate) el.animate([{ transform: "translate(" + (held.left - home.left) + "px," + (held.top - home.top) + "px) scale(1.04)" }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
        /* The click that ends a drag is not a tap. */
        var eat = function (c) {
          c.stopPropagation();
          c.preventDefault();
        };
        box.addEventListener("click", eat, { capture: true, once: true });
        setTimeout(function () {
          box.removeEventListener("click", eat, true);
        }, 60);
        opts.tiles().forEach(function (other) {
          other.classList.remove("mergeable");
        });
        if (commit && target && opts.merge) opts.merge(opts.idOf(el), opts.idOf(target));
        else if (commit && opts.outside && !inside(opts.bounds ? opts.bounds() : box, endX, endY)) opts.outside(opts.idOf(el));
        else if (commit) opts.done();
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
    if (e.target.closest(".lp-fxt")) e.preventDefault();
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
