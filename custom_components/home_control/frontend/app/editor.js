/* The page editor: edit mode, drag and drop, section and device editors, undo. */

var EDIT = false;

/* ---- Page editor ----
 Settings → Edit this page (admins). While editing, items on the page are edited where they are: tapping one opens its
 settings instead of using it, its grip drags it to a new place, and each section has its own "add" button.
 Outside edit mode none of these controls exist. Everything is saved through uiChanged()/storeChanged() as before. */
var EDRAG = false;

function editing() {
  return EDIT && ISADMIN;
}

/* A trash button on an item that can be removed, so removing is a visible action instead of a hidden tap. */
function edDel(el, fn, label) {
  if (!el || !editing()) return el;
  var b = mk("div", "eddel edok", svg("trash"));
  b.tabIndex = 0;
  b.setAttribute("role", "button");
  b.setAttribute("aria-label", label || _T("remove_2"));
  b.title = label || _T("remove_2");
  b.addEventListener("click", function (e) {
    e.stopPropagation();
    fn();
  });
  b.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  });
  el.classList.add("ed-del");
  el.appendChild(b);
  return el;
}

function edMark(el, open, hidden) {
  if (!el || !editing()) return el;
  el._ed = open;
  el.classList.add("ed-t");
  if (hidden) {
    el.classList.add("ed-h");
    var tg = mk("span", "edtag");
    tg.textContent = _T("hidden");
    el.appendChild(tg);
  }
  return el;
}

function edAdd(label, fn, icon) {
  var p = pill(icon || "plus", label, { tap: fn });
  p.classList.add("ed-add", "edok");
  return p;
}

/* Arrow keys on a drag grip move its item one step, so reordering never needs a pointer. */
function gripKeys(g, el, items, onDone) {
  g.tabIndex = 0;
  g.setAttribute("role", "button");
  g.setAttribute("aria-label", _T("drag_to_move"));
  g.addEventListener("keydown", function (e) {
    var d =
        e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowDown" || e.key === "ArrowRight"
            ? 1
            : 0,
      i = items.indexOf(el);
    if (d && i + d >= 0 && i + d < items.length) {
      e.preventDefault();
      onDone(i, i + d);
    }
  });
}

function edSort(items, onDone) {
  if (!editing() || items.length < 2) return;
  items.forEach(function (el) {
    var g = mk("div", "edgrip edok", svg("drag"));
    gripKeys(g, el, items, onDone);
    g.addEventListener("pointerdown", function (e) {
      edDrag(e, el, items, onDone);
    });
    el.appendChild(g);
  });
}

/* Drag in two dimensions: the item follows the pointer and the others slide into the slot order it would land in,
 so the same code reorders lists and grids. Positions are measured once when the drag starts. */
/* One drag engine for everything that can be reordered: page items, sections and lists in popups.
 The real layout is reordered while dragging (apply), and every other element animates from where it was to
 its new place (FLIP), so neighbours make room live and the drop never jumps. By default an element returns to
 the slot of the item it displaced, so items may live in different containers; sections pass their own apply,
 which re-runs the column layout. */
function edDrag(e, el, items, onDone, apply, after) {
  e.preventDefault();
  e.stopPropagation();
  dragging++;
  EDRAG = true;
  var from = items.indexOf(el),
    order = items.slice(),
    sp = scrollParent(el) || document.querySelector("main"),
    sx = e.clientX,
    sy = e.clientY,
    g0 = el.getBoundingClientRect(),
    R = [],
    lastSwap = 0,
    lastP = null,
    lx = sx,
    ly = sy,
    swx = sx,
    swy = sy,
    raf = 0,
    live = true;
  var marks = null;
  if (!apply) {
    marks = items.map(function (x) {
      var m = document.createComment("");
      x.parentNode.insertBefore(m, x);
      return m;
    });
    apply = function (o) {
      o.forEach(function (x, k) {
        marks[k].parentNode.insertBefore(x, marks[k].nextSibling);
      });
    };
  }
  function measure() {
    var st = sp.scrollTop;
    R = order.map(function (x) {
      var r = x.getBoundingClientRect();
      return { x: r.left, y: r.top + st, w: r.width, h: r.height };
    });
  }
  function follow() {
    var l = R[order.indexOf(el)];
    el.style.transform =
      "translate(" +
      (g0.left + lx - sx - l.x) +
      "px," +
      (g0.top + ly - sy - (l.y - sp.scrollTop)) +
      "px) scale(1.012)";
  }
  /* The others slide from where they were to where they now are, so nothing jumps; the dragged one keeps following the pointer. */
  function flip(next) {
    var first = order.map(function (x) {
      return x.getBoundingClientRect();
    });
    order.forEach(function (x) {
      x.style.transition = "none";
      x.style.transform = "";
    });
    var prev = order;
    order = next;
    apply(order);
    if (after) after();
    measure();
    prev.forEach(function (x, k) {
      if (x === el) return;
      var l = x.getBoundingClientRect(),
        dx = first[k].left - l.left,
        dy = first[k].top - l.top;
      if (dx || dy) x.style.transform = "translate(" + dx + "px," + dy + "px)";
    });
    follow();
    void document.body.offsetWidth;
    order.forEach(function (x) {
      if (x === el) return;
      x.style.transition = "transform .24s cubic-bezier(.2,.8,.2,1)";
      x.style.transform = "";
    });
  }
  /* Runs every frame: scrolls while the pointer is near an edge, keeps the dragged item under the pointer and swaps when it covers another one. */
  function work(scroll) {
    if (!live) return;
    if (scroll) {
      var r = sp.getBoundingClientRect(),
        v = 0;
      if (ly < r.top + 80) v = -Math.min(20, (r.top + 80 - ly) / 4 + 2);
      else if (ly > r.bottom - 120) v = Math.min(20, (ly - (r.bottom - 120)) / 4 + 2);
      if (v) sp.scrollTop += v;
    }
    follow();
    /* After a swap the layout settles first and the pointer has to move on, so one movement cannot trigger a chain of swaps. */
    if (Date.now() - lastSwap >= 260 && Math.hypot(lx - swx, ly - swy) >= 10) {
      var cx = lx,
        cy = ly,
        st = sp.scrollTop,
        cur = order.indexOf(el),
        hit = -1;
      R.forEach(function (q, k) {
        if (k !== cur && cx >= q.x && cx <= q.x + q.w && cy >= q.y - st && cy <= q.y - st + q.h)
          hit = k;
      });
      /* The item just swapped with must be left before it can swap again, otherwise the two trade places back and forth. */
      if (lastP) {
        var qi = order.indexOf(lastP),
          q = R[qi];
        if (q && !(cx >= q.x && cx <= q.x + q.w && cy >= q.y - st && cy <= q.y - st + q.h))
          lastP = null;
      }
      if (hit >= 0 && !(lastP && order[hit] === lastP)) {
        var partner = order[hit],
          next = order.slice();
        next.splice(cur, 1);
        next.splice(hit, 0, el);
        lastSwap = Date.now();
        swx = lx;
        swy = ly;
        lastP = partner;
        flip(next);
      }
    }
  }
  function step() {
    if (!live) return;
    work(true);
    raf = requestAnimationFrame(step);
  }
  function move(ev) {
    lx = ev.clientX;
    ly = ev.clientY;
    work(false);
  }
  function up() {
    live = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    var to = order.indexOf(el);
    el.classList.remove("ed-drag");
    el.style.transition = "transform .2s cubic-bezier(.2,.8,.2,1)";
    el.style.transform = "";
    setTimeout(function () {
      order.forEach(function (x) {
        x.style.transition = "";
        x.style.transform = "";
        x.style.willChange = "";
      });
      el.style.width = "";
      if (marks)
        marks.forEach(function (m) {
          m.remove();
        });
      dragging--;
      EDRAG = false;
      if (to !== from) onDone(from, to);
    }, 210);
  }
  order.forEach(function (x) {
    x.style.willChange = "transform";
  });
  el.style.width = g0.width + "px";
  el.classList.add("ed-drag");
  el.style.transition = "none";
  measure();
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
  raf = requestAnimationFrame(step);
}

/* Moves one item of a filtered view (a section's devices, one floor's rooms, one room's scenes) inside the full list,
 keeping every other item where it was. */
function edReorder(full, view, from, to) {
  var slots = view.map(function (x) {
      return full.indexOf(x);
    }),
    moved = view.slice();
  moved.splice(to, 0, moved.splice(from, 1)[0]);
  slots.forEach(function (s, k) {
    full[s] = moved[k];
  });
}

/* While editing, page items do not act: taps open the item's settings (or do nothing), so sliders, toggles and
 links cannot fire by accident. Edit controls (.edok, the edit bar and section toolbars) work normally. */
function edInit() {
  var b = document.getElementById("body");
  ["pointerdown", "pointerup", "click"].forEach(function (t) {
    b.addEventListener(
      t,
      function (e) {
        if (!editing() || EDRAG) return;
        var n = e.target;
        if (n.closest && n.closest(".edok,.edtb")) return;
        e.stopPropagation();
        if (t !== "click") return;
        e.preventDefault();
        var x = n;
        while (x && x !== b && !x._ed) x = x.parentNode;
        if (x && x._ed) x._ed();
      },
      true
    );
  });
}

/* Page editor toolbar: fixed at the top while editing. Page-level settings (details, access, presets, hidden sections, reset) live in its Page settings popup, so the page itself only shows the page. */
var EDHIST = [],
  EDSKIP = false;

function edScope() {
  return VIEW === "home" ? "home" : "room:" + VIEW;
}

function edToolbar() {
  hdrEdit();
  var t = document.getElementById("edtool"),
    on = document.body.classList.contains("editing");
  if (!on) {
    if (t) t.remove();
    EDHIST.length = 0;
    return;
  }
  if (!t) {
    t = mk("div", "edtool pane");
    t.id = "edtool";
    document.body.appendChild(t);
  }
  t.innerHTML = "";
  var tt = mk("div", "et-t", "<b></b><span></span>");
  var rm = UIROOM[VIEW];
  tt.querySelector("b").textContent =
    VIEW === "home" ? UI.meta.homeTab || TITLES.home : (rm && rm.name) || TITLES[VIEW] || "";
  tt.querySelector("span").textContent =
    _T("editing") + " · " + _T("tap_an_item_to_change_it_drag_its_ha");
  t.appendChild(tt);
  var u = rbtn("undo", edUndo, _T("undo_2"));
  u.classList.add("et-undo");
  u.classList.toggle("dis", !EDHIST.length);
  t.appendChild(u);
  t.appendChild(
    rbtn(
      "plus",
      function () {
        edAddSection(edScope());
      },
      _T("add_section")
    )
  );
  t.appendChild(
    rbtn(
      "drag",
      function () {
        showPopup("ed-order:" + VIEW, true);
      },
      _T("reorder_sections")
    )
  );
  t.appendChild(
    rbtn(
      "tune",
      function () {
        showPopup("edit-page:" + VIEW, true);
      },
      _T("page_settings")
    )
  );
  var dn = rbtn(
    "check",
    function () {
      EDIT = false;
      render();
    },
    _T("done")
  );
  dn.classList.add("act");
  t.appendChild(dn);
}

function edUndo() {
  var j = EDHIST.pop();
  if (!j) return;
  var c = cleanStore(JSON.parse(j));
  if (!c.ui) return;
  EDSKIP = true;
  STORE = c;
  UI = c.ui;
  STORE_VER++;
  LOGNEXT = true;
  storeSave();
  EDSKIP = false;
  applyUI();
  buildDock();
  render();
  toast(_T("change_undone"));
}

/* Puts a page back to the sections it starts with; widgets are kept and sorted into the matching sections. */
function resetPage(sc) {
  var old = secOrder(sc),
    devs = [];
  old.forEach(function (x) {
    (x.devs || []).forEach(function (d) {
      devs.push(d);
    });
  });
  var fresh = seedSections(sc);
  if (sc === "home") {
    if (devs.length) {
      var e = secAdd0(fresh, "devs");
      e.devs = devs;
    }
  } else
    devs.forEach(function (d) {
      var want = d.kind === "camera" ? "camera" : secOf(d),
        t =
          fresh.filter(function (x) {
            return x.id === want;
          })[0] || fresh[fresh.length - 1];
      t.devs.push(d);
    });
  old.forEach(function (x) {
    if (!x.pins && !x.scn) return;
    var t = fresh.filter(function (y) {
      return y.k === x.k && !y.pins && !y.scn;
    })[0];
    if (t) {
      if (x.pins) t.pins = x.pins;
      if (x.scn) t.scn = x.scn;
    }
  });
  setSecOrder(sc, fresh);
  uiChanged();
}

function secAdd0(arr, k) {
  var e = { id: newSecId(arr), k: k, hide: false, devs: [] };
  arr.push(e);
  return e;
}

function edAddSection(sc) {
  showPopup("sec-types:" + (sc === "home" ? "home" : sc.slice(5)), true);
}

/* Adds a section of the chosen type to a page and returns it. A type that exists once per page keeps its own name as id. */
function secAdd(sc, k) {
  var arr = secOrder(sc),
    ty = SECTYPES[k];
  if (!ty) return null;
  if (
    ty.one &&
    arr.some(function (x) {
      return x.k === k;
    })
  ) {
    toast(_T("this_page_already_has_one"));
    return null;
  }
  var e = {
    id:
      ty.one &&
      !arr.some(function (x) {
        return x.id === k;
      })
        ? k
        : newSecId(arr),
    k: k,
    hide: false,
  };
  if (ty.own) e.devs = [];
  if (k === "chart") e.r = "24h";
  arr.push(e);
  setSecOrder(sc, arr);
  uiChanged();
  return e;
}

/* Changes a section to another type; widgets stay when both types hold widgets. */
function secSetKind(sc, sid, v, done) {
  var arr = secOrder(sc),
    e = arr.filter(function (x) {
      return x.id === sid;
    })[0],
    to = SECTYPES[v];
  if (!e || !to || e.k === v) return done && done();
  if (
    to.one &&
    arr.some(function (x) {
      return x !== e && x.k === v;
    })
  ) {
    toast(_T("this_page_already_has_one"));
    return;
  }
  function go() {
    e.k = v;
    if (v !== "link") delete e.ref;
    if (to.own) {
      if (!e.devs) e.devs = [];
    } else delete e.devs;
    if (v === "chart") {
      if (!e.r) e.r = "24h";
    } else delete e.r;
    if (v !== "note") delete e.txt;
    if ((!to.own && v !== "pinned") || v === "read" || v === "camera") delete e.lay;
    setSecOrder(sc, arr);
    uiChanged();
    if (done) done();
  }
  if (!to.own && (e.devs || []).length) confirmDlg(_T("changing_the_type_removes_the_widget"), go);
  else go();
}

function secTypesPage(b, scopeId) {
  var sc = scopeKey(scopeId),
    have = secOrder(sc);
  b.appendChild(mkHint(_T("choose_what_the_new_section_shows_yo")));
  SEC_PICK.forEach(function (k) {
    var ty = SECTYPES[k],
      ex = ty.one
        ? have.filter(function (x) {
            return x.k === k;
          })[0]
        : null;
    if (ex && !ex.hide) return;
    if (ex) {
      b.appendChild(
        pill(ty.i, ty.t, {
          sub: function () {
            return _T("already_on_this_page_hidden_tap_to_s");
          },
          tap: function () {
            ex.hide = false;
            setSecOrder(sc, have);
            uiChanged();
            closeSheet();
          },
        })
      );
      return;
    }
    b.appendChild(
      pill(ty.i, ty.t, {
        sub: function () {
          return ty.d;
        },
        tap: function () {
          var e = secAdd(sc, k);
          if (!e) return;
          STACK.pop();
          CURRENT = null;
          showPopup("manage-sec:" + scopeId + ":" + e.id, true);
        },
      })
    );
  });
}

function secTypePage(b, key) {
  var p = key.split(":"),
    scopeId = p[0],
    sid = p[1],
    sc = scopeKey(scopeId),
    arr = secOrder(sc),
    e = arr.filter(function (x) {
      return x.id === sid;
    })[0];
  if (!e) return;
  SEC_PICK.forEach(function (k) {
    var ty = SECTYPES[k];
    if (
      ty.one &&
      arr.some(function (x) {
        return x !== e && x.k === k;
      })
    )
      return;
    b.appendChild(
      pill(ty.i, ty.t, {
        on: function () {
          return e.k === k;
        },
        sub: function () {
          return ty.d;
        },
        tap: function () {
          secSetKind(sc, sid, k, function () {
            STACK.pop();
            CURRENT = null;
            showPopup("manage-sec:" + key, false);
          });
        },
      })
    );
  });
}

/* Back to the popup that opened this one, or closed if it was opened directly. */
function popBack() {
  if (POPGUARD && POPGUARD(popBack)) return;
  var prev = STACK.pop();
  CURRENT = null;
  if (prev) showPopup(prev, false);
  else if (LAYERS.length) closeLayer();
  else closeSheet();
}

function mkHint(t) {
  var h = mk("div", "hint");
  h.textContent = t;
  return h;
}

/* Reorder sections: this page's sections in the order they appear, each with the column it sits in on this screen. A row is dragged (or moved with the arrow keys) to reorder the page. */
function secOrderPage(b, key) {
  var sc = key === "home" ? "home" : "room:" + key,
    box = mk("div");
  b.appendChild(box);
  function colMap() {
    var out = {};
    COLS.forEach(function (h) {
      if (!h.isConnected || !h._items) return;
      var its = masonVisible(h),
        n = h._n || colCount(h),
        fl = masonFlags(its, n),
        W = h.clientWidth,
        cw = (W - (n - 1) * 24) / n;
      its.forEach(function (it, j) {
        var x = parseFloat((/translate\(([-\d.]+)px/.exec(it.el.style.transform) || [0, 0])[1]);
        out[it.id] =
          fl[j] && n > 1 ? _T("full_width") : _T("column") + " " + (Math.round(x / (cw + 24)) + 1);
      });
    });
    return out;
  }
  function draw() {
    box.innerHTML = "";
    var o = secOrder(sc),
      cm = colMap(),
      hint = mk("div", "hint"),
      rows = [];
    hint.textContent = _T("drag_a_row_to_move_a_section_the_num");
    box.appendChild(hint);
    o.forEach(function (s) {
      var r = pill(secIcon(s), secName(s), {
        sub: function () {
          return s.hide ? _T("hidden") : cm[s.id] || _T("not_shown_right_now");
        },
      });
      rows.push(r);
      box.appendChild(r);
    });
    makeSortable(box, rows, function (from, to) {
      var a = secOrder(sc),
        x = a.splice(from, 1)[0];
      a.splice(to, 0, x);
      setSecOrder(sc, a);
      uiChanged();
      setTimeout(draw, 250);
    });
  }
  draw();
}

function editPageSettings(b, key) {
  var room = key === "home" ? null : key,
    sc = room ? "room:" + room : "home",
    box = mk("div");
  b.appendChild(box);
  function draw() {
    var o = secOrder(sc),
      hid = o.filter(function (s) {
        return s.hide;
      });
    if (room) {
      box.appendChild(
        pill("edit", _T("room_details"), {
          sub: function () {
            return _T("name_icon_area_and_picture");
          },
          tap: function () {
            showPopup("manage-details:" + room, true);
          },
        })
      );
      box.appendChild(
        pill("lock", _T("who_can_use_this_room"), {
          sub: function () {
            return _T("allow_ask_first_view_only_or_hide");
          },
          tap: function () {
            showPopup("manage-room-access:" + room, true);
          },
        })
      );
    } else
      box.appendChild(
        pill("edit", _T("names_and_header"), {
          sub: function () {
            return UI.meta.homeTab + " · " + UI.meta.homeTitle;
          },
          tap: function () {
            showPopup("manage-names", true);
          },
        })
      );
    box.appendChild(sep(_T("columns"), "home"));
    box.appendChild(
      seg(
        [
          ["0", _T("automatic")],
          ["1", "1"],
          ["2", "2"],
          ["3", "3"],
        ],
        String((UI.layout.cols || {})[room || "home"] || 0),
        function (v) {
          UI.layout.cols = UI.layout.cols || {};
          if (v === "0") delete UI.layout.cols[room || "home"];
          else UI.layout.cols[room || "home"] = +v;
          uiChanged();
          redrawBox(box, draw);
        }
      )
    );
    var cn = mk("div", "hint");
    cn.textContent = _T("on_wide_screens_phones_always_use_on");
    box.appendChild(cn);
    box.appendChild(sep(_T("hidden_sections"), "lock"));
    if (!hid.length) {
      var hn = mk("div", "hint");
      hn.textContent = _T("none_hide_a_section_from_its_setting");
      box.appendChild(hn);
    }
    hid.forEach(function (s) {
      box.appendChild(
        pill("plus", secName(s), {
          sub: function () {
            return _T("hidden_tap_to_show_it_again");
          },
          tap: function () {
            s.hide = false;
            setSecOrder(sc, o);
            uiChanged();
            redrawBox(box, draw);
          },
        })
      );
    });
    box.appendChild(sep(_T("share_this_page"), "sd"));
    var ta = mk("textarea", "ta");
    ta.setAttribute("spellcheck", "false");
    ta.placeholder = _T("paste_a_page_here_to_import_it");
    box.appendChild(
      pill("sd", _T("copy_this_page_as_text"), {
        sub: function () {
          return _T("sections_and_the_scenes_they_list");
        },
        tap: function () {
          var txt = pageExportJSON(sc);
          try {
            navigator.clipboard.writeText(txt).then(
              function () {
                toast(_T("copied"));
              },
              function () {
                ta.value = txt;
                ta.select();
                toast(_T("select_and_copy_the_text_below"));
              }
            );
          } catch (e) {
            ta.value = txt;
            ta.select();
            toast(_T("select_and_copy_the_text_below"));
          }
        },
      })
    );
    box.appendChild(ta);
    box.appendChild(
      pill("check", _T("replace_this_page_with_the_text_abov"), {
        tap: function () {
          if (!ta.value.trim()) {
            toast(_T("paste_a_page_first"));
            return;
          }
          pageImport(sc, ta.value);
        },
      })
    );
    box.appendChild(sep(_T("start_over"), "restart"));
    box.appendChild(
      pill("restart", _T("reset_sections"), {
        sub: function () {
          return _T("default_names_order_and_widths");
        },
        tap: function () {
          confirmDlg(_T("reset_this_page_to_the_default_secti"), function () {
            resetPage(sc);
            redrawBox(box, draw);
          });
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* The tools of a section while the page is edited: its settings, hiding it and deleting it. Sections are ordered in the Reorder sections popup. */
function editDecorate(sc, s) {
  var tb = mk("div", "edtb"),
    cg = mk("div", "rnd pane sm", svg("tune"));
  s.el.dataset.sid = s.id;
  cg.addEventListener("click", function () {
    showPopup("manage-sec:" + (sc === "home" ? "home" : sc.slice(5)) + ":" + s.id, false);
  });
  var dl = mk("div", "rnd pane sm", svg("trash"));
  dl.tabIndex = 0;
  dl.setAttribute("role", "button");
  dl.setAttribute("aria-label", _T("delete_this_section"));
  dl.title = _T("delete_this_section");
  dl.addEventListener("click", function () {
    confirmDlg(_T("delete_this_section_the_devices_stay"), function () {
      setSecOrder(
        sc,
        secOrder(sc).filter(function (x) {
          return x.id !== s.id;
        })
      );
      uiChanged();
    });
  });
  var scopeId = sc === "home" ? "home" : sc.slice(5),
    ent = function () {
      return secById(scopeId, s.id);
    },
    hid = !!(ent() && ent().hide),
    ey = mk("div", "rnd pane sm", svg(hid ? "eyeoff" : "eye"));
  ey.tabIndex = 0;
  ey.setAttribute("role", "button");
  ey.setAttribute("aria-label", hid ? _T("show_this_section") : _T("hide_this_section"));
  ey.title = hid ? _T("show_this_section") : _T("hide_this_section");
  ey.addEventListener("click", function () {
    var x = ent();
    if (!x) return;
    x.hide = !x.hide;
    setSecOrder(sc, secOrder(sc));
    uiChanged();
  });
  tb.appendChild(cg);
  tb.appendChild(ey);
  tb.appendChild(dl);
  /* The toolbar goes in the section heading, wherever the section keeps it (a section that rebuilds its content calls _attach again). */
  s.el._attach = function () {
    if (s.el.contains(tb)) return;
    var hd =
      s.el.querySelector(":scope>.sec-h") ||
      s.el.querySelector(":scope>.sec>.sec-h") ||
      s.el.querySelector(".sec-h");
    if (hd) hd.appendChild(tb);
    else s.el.insertBefore(tb, s.el.firstChild);
  };
  s.el._attach();
}

function devEditor(rid, d) {
  return function () {
    var i = devList(rid).indexOf(d);
    if (i >= 0) showPopup("manage-dev:" + rid + ":" + i, true);
  };
}

/* The device type preselected when "Add device" is tapped in a section. */
var ADDPRE = null,
  ADDPRE_IX = { lights: 0, other: 1, climate: 3, media: 4, camera: 6, sensors: 7, controls: 8 };

/* Rooms grouped by their Home Assistant floor (lowest level first), keeping the dashboard's room order inside each floor.
 Returns null when everything is on one floor, so the Home page then shows a single grid as before. */
/* Widgets live inside sections. These put a device on a page (into its first section of the matching type, creating one if needed) or take devices off. */
function addDevToPage(room, d) {
  var arr = secOrder("room:" + room),
    want = d.kind === "camera" ? "camera" : secOf(d),
    s = arr.filter(function (x) {
      return x.k === want;
    })[0];
  if (!s) {
    s = { id: newSecId(arr), k: want, hide: false, devs: [] };
    arr.push(s);
  }
  (s.devs = s.devs || []).push(d);
}

function allSectionLists() {
  return [UI.layout.home].concat(
    Object.keys(UI.layout.rooms).map(function (k) {
      return UI.layout.rooms[k];
    })
  );
}

function pageDevIds(rid) {
  var scope = rid.charAt(0) === "~" ? rid.split("~")[1] : rid,
    sc = scope === "home" ? "home" : "room:" + scope,
    out = {};
  secOrder(sc).forEach(function (s) {
    (s.devs || []).forEach(function (d) {
      if (d.id) out[d.id] = 1;
    });
  });
  return out;
}

function addRoom() {
  var id = "r" + Date.now().toString(36).slice(-6);
  UI.rooms.push({ id: id, name: _T("new_room"), short: "", icon: "home", area: "" });
  UI.layout.rooms[id] = seedSections("room:" + id);
  uiChanged();
  showPopup("manage-details:" + id, true);
}

function secEditor(b, key) {
  var p = key.split(":"),
    scope = p[0],
    sid = p[1],
    sk = scopeKey(scope),
    order = secOrder(sk),
    e = order.filter(function (x) {
      return x.id === sid;
    })[0];
  if (!e) return;
  function save() {
    setSecOrder(sk, order);
    uiChanged();
  }
  b.appendChild(
    textRow(
      "edit",
      (SECTYPES[e.k] || SECTYPES.devs).t,
      e.t || "",
      function (v) {
        if (v) e.t = v.slice(0, 40);
        else delete e.t;
        save();
      },
      40
    )
  );
  b.appendChild(
    iconPick(SECICONS, secIcon(e), function (n) {
      e.i = n;
      save();
    })
  );
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var k = e.k || "devs",
      ty = SECTYPES[k] || SECTYPES.devs;
    box.appendChild(
      pill(ty.i, ty.t, {
        sub: function () {
          return _T("section_type_tap_to_change_it");
        },
        tap: function () {
          showPopup("sec-type:" + key, true);
        },
      })
    );
    box.appendChild(
      seg(
        [
          ["auto", _T("automatic")],
          ["full", _T("full_width")],
          ["half", _T("half_width")],
        ],
        e.w || "auto",
        function (v) {
          if (v === "auto") delete e.w;
          else e.w = v;
          save();
          redrawBox(box, draw);
        }
      )
    );
    box.appendChild(
      pill("check", _T("show_this_section"), {
        on: function () {
          return !e.hide;
        },
        sub: function () {
          return e.hide ? _T("hidden") : _T("visible");
        },
        tap: function () {
          e.hide = !e.hide;
          save();
        },
      })
    );
    ruleControls(
      box,
      e,
      save,
      function () {
        redrawBox(box, draw);
      },
      key
    );
    if (k === "link") {
      var lq = (e.ref || "").split(":"),
        ls = e.ref ? secById(lq[0], lq[1]) : null;
      box.appendChild(
        pill("swap", ls ? secName(ls) : _T("no_section_chosen"), {
          sub: function () {
            return ls
              ? (TITLES[lq[0]] || lq[0]) + " · " + _T("tap_to_choose_another_2")
              : _T("tap_to_choose");
          },
          tap: function () {
            showPopup("sec-link:" + key, true);
          },
        })
      );
      if (ls && ls.k !== "link")
        box.appendChild(
          pill("plus", _T("make_an_independent_copy"), {
            sub: function () {
              return _T("stops_following_the_original_section");
            },
            tap: function () {
              var c = JSON.parse(JSON.stringify(ls));
              c.id = newSecId(order);
              delete c.ref;
              order[order.indexOf(e)] = c;
              setSecOrder(sk, order);
              uiChanged();
              popBack();
            },
          })
        );
    }
    if (k === "lights")
      box.appendChild(
        pill("power", _T("turn_all_off_button"), {
          on: function () {
            return !e.noall;
          },
          sub: function () {
            return e.noall ? _T("hidden") : _T("shown_next_to_the_title_while_a_ligh");
          },
          tap: function () {
            if (e.noall) delete e.noall;
            else e.noall = 1;
            save();
            redrawBox(box, draw);
          },
        })
      );
    if (k === "lights")
      box.appendChild(
        pill("lights", _T("lights_master"), {
          on: function () {
            return !!e.master;
          },
          sub: function () {
            return e.master ? _T("a_light_at_the_top_that_controls_every_") : _T("hidden");
          },
          tap: function () {
            if (e.master) delete e.master;
            else e.master = 1;
            save();
            redrawBox(box, draw);
          },
        })
      );
    if (k === "lights")
      box.appendChild(
        pill("palette", _T("colour_circle"), {
          on: function () {
            return !e.nowheel;
          },
          sub: function () {
            return e.nowheel ? _T("light_popup_uses_sliders") : _T("light_popup_opens_on_the_wheel");
          },
          tap: function () {
            if (e.nowheel) delete e.nowheel;
            else e.nowheel = 1;
            save();
            redrawBox(box, draw);
          },
        })
      );
    if (k === "lights")
      box.appendChild(
        pill("palette", _T("light_colour_in_popups"), {
          on: function () {
            return !e.accent;
          },
          sub: function () {
            return e.accent
              ? _T("popups_use_the_accent_colour")
              : _T("popup_sliders_are_filled_with_the_ligh");
          },
          tap: function () {
            if (e.accent) delete e.accent;
            else e.accent = 1;
            save();
            redrawBox(box, draw);
          },
        })
      );
    if (k === "lights")
    if (k === "energy") {
      box.appendChild(sep(_T("cost"), "plug"));
      box.appendChild(
        numRow(
          "plug",
          _T("price_per_kwh_empty_hides_the_cost"),
          e.price,
          function (v) {
            if (v && v > 0) e.price = Math.round(v * 10000) / 10000;
            else delete e.price;
            save();
          },
          0,
          1000
        )
      );
      box.appendChild(
        textRow(
          "edit",
          _T("currency_symbol"),
          e.cur || "",
          function (v) {
            if (v) e.cur = v.slice(0, 4);
            else delete e.cur;
            save();
          },
          4
        )
      );
    }
    if (k === "alerts") {
      box.appendChild(sep(_T("show_these_alerts"), "alert"));
      [
        ["battery", _T("low_batteries"), "battery"],
        ["vacuum", _T("robot_vacuum_needs_attention"), "vac"],
        ["camera", _T("camera_offline"), "cam"],
        ["climate", _T("air_conditioner_offline"), "ac"],
        ["lights", _T("light_unavailable"), "lights"],
      ].forEach(function (a) {
        box.appendChild(
          pill(a[2], a[1], {
            on: function () {
              return alertOn(a[0]);
            },
            tap: function () {
              var off = ((STORE.cfg && STORE.cfg.alertOff) || []).slice(),
                i = off.indexOf(a[0]);
              if (i >= 0) off.splice(i, 1);
              else off.push(a[0]);
              STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { alertOff: off }));
              storeChanged();
              refresh();
            },
          })
        );
      });
    }
    /* Sections that list items can show them in one, two or three columns. Pinned items and quick actions already had a default shape (2 columns, 4 tiles), which stays when nothing is chosen. */
    if (
      [
        "devs",
        "lights",
        "media",
        "climate",
        "controls",
        "sensors",
        "other",
        "scenes",
        "pinned",
        "quick",
      ].indexOf(k) >= 0
    ) {
      var dl0 = k === "pinned" ? "grid2" : k === "quick" ? "grid4" : "list",
        opts = [
          ["list", _T("list")],
          ["grid2", _T("2_columns")],
          ["grid3", _T("3_columns")],
        ].concat(k === "quick" ? [["grid4", _T("4_columns")]] : []);
      box.appendChild(sep(_T("layout"), "tune"));
      box.appendChild(
        seg(opts, e.lay || dl0, function (v) {
          if (v === dl0) delete e.lay;
          else e.lay = v;
          save();
          redrawBox(box, draw);
        })
      );
    }
    if (k === "chart")
      (box.appendChild(sep(_T("time_range"), "clock")),
        box.appendChild(
          seg(
            [
              ["6h", _T("6_hours")],
              ["24h", _T("24_hours")],
              ["7d", _T("7_days")],
              ["30d", _T("30_days")],
            ],
            e.r || "24h",
            function (v) {
              e.r = v;
              delete CHR[sid];
              save();
              redrawBox(box, draw);
            }
          )
        ));
    if (k === "note")
      (box.appendChild(sep(_T("text"), "edit")),
        box.appendChild(
          areaRow(
            _T("write_a_note"),
            e.txt || "",
            function (v) {
              e.txt = v.slice(0, 600);
              save();
            },
            600
          )
        ));
    if (k === "pinned")
      box.appendChild(
        pill("pin", _T("pinned_items"), {
          sub: function () {
            return (e.pins || []).length + " / 12";
          },
          tap: function () {
            showPopup("pick-pin:" + key, true);
          },
        })
      );
    if (k === "quick" || k === "scenes")
      box.appendChild(
        pill("scene", _T("scenes_in_this_section"), {
          sub: function () {
            return String(secScenes(e).length);
          },
          tap: function () {
            showPopup("pick-scene:" + key, true);
          },
        })
      );
    box.appendChild(sep(_T("this_section"), "home"));
    if (!ty.one)
      box.appendChild(
        pill("plus", _T("duplicate_this_section"), {
          tap: function () {
            var c = JSON.parse(JSON.stringify(e));
            c.id = newSecId(order);
            c.t = (e.t || ty.t).slice(0, 36) + " 2";
            order.splice(order.indexOf(e) + 1, 0, c);
            setSecOrder(sk, order);
            uiChanged();
            toast(_T("section_duplicated"));
          },
        })
      );
    box.appendChild(
      pill("trash", _T("delete_this_section"), {
        tap: function () {
          confirmDlg(_T("delete_this_section_the_devices_stay"), function () {
            setSecOrder(
              sk,
              order.filter(function (x) {
                return x.id !== sid;
              })
            );
            uiChanged();
            popBack();
          });
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* ---- drag to reorder ---- */
function makeSortable(box, items, onDone) {
  items.forEach(function (el) {
    var g = mk("div", "grip", svg("drag"));
    g.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    gripKeys(g, el, items, onDone);
    g.addEventListener("pointerdown", function (e) {
      edDrag(e, el, items, onDone);
    });
    el.appendChild(g);
  });
}

function scrollParent(el) {
  var p = el.parentNode;
  while (p && p !== document.body) {
    if (p.scrollHeight > p.clientHeight + 4) {
      var o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll") return p;
    }
    p = p.parentNode;
  }
  return null;
}
