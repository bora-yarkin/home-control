/* Custom remotes: a device made of a grid of buttons, each one an entity (a script, a button, an input button, a scene or a switch) with an icon and an optional label. A remote is made in the page editor (Add device, Remote); an administrator fills the grid with a "+" tile that asks for the entity and then the icon. */

var REMOTE_DOMS = ["script", "button", "input_button", "scene", "switch"];
var REMOTE_ACT = {
  script: ["script", "turn_on"],
  button: ["button", "press"],
  input_button: ["input_button", "press"],
  scene: ["scene", "turn_on"],
  switch: ["switch", "toggle"],
};
var RM = { edit: {}, pic: {}, sel: null };

/* The remote device with this id, wherever the layout keeps it. */
function remoteFind(rid) {
  var found = null;
  function look(d) {
    if (d.kind === "remote" && d.rid === rid) found = d;
  }
  allSectionLists().forEach(function (secs) {
    secs.forEach(function (s) {
      (s.devs || []).forEach(look);
    });
  });
  Object.keys(UI.devs || {}).forEach(function (r) {
    (UI.devs[r] || []).forEach(look);
  });
  return found;
}

function remoteNew() {
  return {
    id: "",
    rid: "rm" + Date.now().toString(36).slice(-7),
    name: _T("remote"),
    icon: "media",
    kind: "remote",
    rm: { cols: 3, btns: [] },
  };
}

/* A button has no state until it is first pressed ("unknown" is what Home Assistant shows for one that works), so only "unavailable" holds it back; for anything else "unknown" means no reading. */
function remoteUsable(e) {
  var s = H().states[e];
  if (!s || s.state === "unavailable") return false;
  return s.state !== "unknown" || ["button", "input_button", "scene", "script"].indexOf(dom(e)) >= 0;
}

function remotePress(b) {
  var a = REMOTE_ACT[dom(b.e)];
  if (!a) return;
  if (!remoteUsable(b.e)) {
    toast(_T("rm_not_available_right_now"));
    return;
  }
  /* A command that fails says so (callRaw shows the error); a command that goes through says nothing. */
  call(a[0], a[1], { entity_id: b.e });
}

function remoteRow(d) {
  return pill(d.icon || "media", d.name, {
    tap: function () {
      showPopup("remote:" + d.rid, true);
    },
  });
}

/* The picture layout: the picture of a real remote with touch areas over it. In use a touch area is invisible, glows for a moment when pressed and runs its entity. In editing a tap on the picture adds a touch area (after choosing its entity), a touch area is dragged to move and by its corner to resize, and the selected one has its shape, entity and removal below. */
function remotePicture(box, d, edit, redraw) {
  var img = d.rm.img;
  if (!img) {
    if (!edit) return;
    var file = mk("input");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp";
    file.style.display = "none";
    file.addEventListener("change", function () {
      if (!file.files[0]) return;
      HA.remotePictures.upload(file.files[0]).then(
        function (url) {
          d.rm.img = { u: url, hs: [] };
          d.rm.v = "i";
          uiChanged();
          redraw();
        },
        function (e) {
          toast((e && e.message) || _T("rm_the_picture_could_not_be_uploaded"));
        }
      );
    });
    box.appendChild(file);
    box.appendChild(
      pill("plus", _T("rm_upload_a_picture"), {
        sub: function () {
          return _T("rm_upload_a_picture_sub");
        },
        tap: function () {
          file.click();
        },
      })
    );
    box.appendChild(
      textRow(
        "edit",
        _T("rm_or_a_file_path"),
        "",
        function (v) {
          if (!v) return;
          var c = cleanRemote({ cols: d.rm.cols, btns: [], img: { u: v, hs: [] } });
          if (!c.img) {
            toast(_T("rm_that_path_is_not_allowed"));
            return;
          }
          d.rm.img = c.img;
          d.rm.v = "i";
          uiChanged();
          redraw();
        },
        150
      )
    );
    return;
  }
  var wrap = mk("div", "rm-img"),
    pic = mk("img");
  pic.src = img.u;
  pic.alt = d.name;
  pic.draggable = false;
  wrap.appendChild(pic);
  var sel = RM.sel && RM.sel.rid === d.rid ? RM.sel.i : -1;
  function place(el, h) {
    el.style.left = h.x + "%";
    el.style.top = h.y + "%";
    el.style.width = h.w + "%";
    el.style.height = h.h + "%";
    el.style.borderRadius = h.r === "ellipse" ? "50%" : "10%";
  }
  img.hs.forEach(function (h, i) {
    var t = mk("div", "rm-hs" + (remoteUsable(h.e) ? "" : " na") + (edit ? " ed" : "") + (edit && i === sel ? " sel" : ""));
    t.setAttribute("role", "button");
    t.tabIndex = 0;
    t.setAttribute("aria-label", A(h.e).friendly_name || h.e);
    place(t, h);
    if (!edit) {
      function press() {
        remotePress(h);
        t.classList.add("pulse");
        setTimeout(function () {
          t.classList.remove("pulse");
        }, 400);
      }
      t.addEventListener("click", press);
      t.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          press();
        }
      });
    } else {
      t.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        e.preventDefault();
        RM.sel = { rid: d.rid, i: i };
        var r = wrap.getBoundingClientRect(),
          sx = e.clientX,
          sy = e.clientY,
          ox = h.x,
          oy = h.y,
          moved = false;
        t.setPointerCapture(e.pointerId);
        t.onpointermove = function (m) {
          moved = true;
          h.x = Math.max(0, Math.min(100 - h.w, Math.round((ox + ((m.clientX - sx) / r.width) * 100) * 100) / 100));
          h.y = Math.max(0, Math.min(100 - h.h, Math.round((oy + ((m.clientY - sy) / r.height) * 100) * 100) / 100));
          place(t, h);
        };
        t.onpointerup = t.onpointercancel = function () {
          t.onpointermove = t.onpointerup = t.onpointercancel = null;
          if (moved) uiChanged();
          redraw();
        };
      });
      if (i === sel) {
        var grip = mk("span", "rm-grip");
        grip.addEventListener("pointerdown", function (e) {
          e.stopPropagation();
          e.preventDefault();
          var r = wrap.getBoundingClientRect(),
            sx = e.clientX,
            sy = e.clientY,
            ow = h.w,
            oh = h.h;
          grip.setPointerCapture(e.pointerId);
          grip.onpointermove = function (m) {
            h.w = Math.max(3, Math.min(100 - h.x, Math.round((ow + ((m.clientX - sx) / r.width) * 100) * 100) / 100));
            h.h = Math.max(3, Math.min(100 - h.y, Math.round((oh + ((m.clientY - sy) / r.height) * 100) * 100) / 100));
            place(t, h);
          };
          grip.onpointerup = grip.onpointercancel = function () {
            grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
            uiChanged();
            redraw();
          };
        });
        t.appendChild(grip);
      }
    }
    wrap.appendChild(t);
  });
  if (edit)
    wrap.addEventListener("click", function (e) {
      if (e.target !== pic || img.hs.length >= 60) return;
      var r = wrap.getBoundingClientRect(),
        px = ((e.clientX - r.left) / r.width) * 100,
        py = ((e.clientY - r.top) / r.height) * 100;
      pickEntity(_T("rm_choose_what_the_button_runs"), REMOTE_DOMS, null, function (id) {
        var h = { x: Math.max(0, Math.min(86, px - 7)), y: Math.max(0, Math.min(92, py - 4)), w: 14, h: 8, r: "rect", e: id };
        img.hs.push(h);
        RM.sel = { rid: d.rid, i: img.hs.length - 1 };
        uiChanged();
        redraw();
      });
    });
  box.appendChild(wrap);
  if (!edit) return;
  if (!img.hs.length) {
    var hint = mk("div", "hint");
    hint.textContent = _T("rm_tap_the_picture_to_add_a_touch_area");
    box.appendChild(hint);
  }
  var h = img.hs[sel];
  if (h) {
    box.appendChild(
      seg(
        [
          ["rect", _T("rm_rectangle")],
          ["ellipse", _T("rm_ellipse")],
        ],
        h.r,
        function (v) {
          h.r = v;
          uiChanged();
          redraw();
        }
      )
    );
    box.appendChild(
      pill("plug", A(h.e).friendly_name || h.e, {
        sub: function () {
          return h.e;
        },
        tap: function () {
          pickEntity(_T("rm_choose_what_the_button_runs"), REMOTE_DOMS, null, function (id) {
            h.e = id;
            uiChanged();
            redraw();
          });
        },
      })
    );
    box.appendChild(
      pill("trash", _T("rm_remove_touch_area"), {
        tap: function () {
          img.hs.splice(sel, 1);
          RM.sel = null;
          uiChanged();
          redraw();
        },
      })
    );
  }
  box.appendChild(
    pill("trash", _T("rm_remove_the_picture"), {
      tap: function () {
        var u = img.u;
        delete d.rm.img;
        delete d.rm.v;
        RM.sel = null;
        uiChanged();
        if (/^\/home_control_remotes\//.test(u)) HA.remotePictures.remove(u).catch(function () {});
        redraw();
      },
    })
  );
}

/* The popup: the grid. An administrator can switch it to editing, where a tap on a tile opens its editor and a "+" tile adds a button. */
function remotePage(b, rid) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var d = remoteFind(rid);
    if (!d) return;
    var rm = d.rm,
      edit = ISADMIN && !!RM.edit[rid];
    if (ISADMIN)
      box.appendChild(
        seg(
          [
            [false, _T("rm_use")],
            [true, _T("rm_edit_buttons")],
          ],
          edit,
          function (v) {
            RM.edit[rid] = v;
            redrawBox(box, draw);
          }
        )
      );
    var picture = edit ? (RM.pic[rid] === undefined ? rm.v === "i" : RM.pic[rid]) : rm.v === "i" && !!rm.img;
    if (edit)
      box.appendChild(
        seg(
          [
            [false, _T("rm_grid")],
            [true, _T("rm_picture")],
          ],
          picture,
          function (v) {
            RM.pic[rid] = v;
            if (v && rm.img) rm.v = "i";
            else delete rm.v;
            uiChanged();
            redrawBox(box, draw);
          }
        )
      );
    if (picture) {
      remotePicture(box, d, edit, function () {
        redrawBox(box, draw);
      });
      return;
    }
    if (edit) {
      var cl = mk("div", "hint");
      cl.textContent = _T("rm_columns");
      box.appendChild(cl);
      box.appendChild(
        seg(
          [2, 3, 4, 5, 6].map(function (n) {
            return [n, String(n)];
          }),
          rm.cols,
          function (n) {
            rm.cols = n;
            rm.btns.forEach(function (x) {
              if (x.s > n) x.s = n;
            });
            uiChanged();
            redrawBox(box, draw);
          }
        )
      );
    }
    var grid = mk("div", "rm-grid");
    grid.style.setProperty("--rc", rm.cols);
    rm.btns.forEach(function (x, i) {
      var t = mk("div", "rm-t pane" + (remoteUsable(x.e) ? "" : " na") + (edit ? " ed" : ""));
      t.setAttribute("role", "button");
      t.tabIndex = 0;
      t.innerHTML = svg(x.i || "info");
      var lab = mk("span", "rm-l");
      lab.textContent = x.l || A(x.e).friendly_name || x.e;
      t.appendChild(lab);
      if (x.s > 1) t.style.gridColumn = "span " + Math.min(x.s, rm.cols);
      function act() {
        if (edit) showPopup("remote-btn:" + rid + ":" + i, true);
        else remotePress(x);
      }
      t.addEventListener("click", act);
      t.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          act();
        }
      });
      grid.appendChild(t);
    });
    if (edit && rm.btns.length < 60) {
      var plus = mk("div", "rm-t pane add", svg("plus"));
      plus.setAttribute("role", "button");
      plus.tabIndex = 0;
      plus.setAttribute("aria-label", _T("rm_add_a_button"));
      plus.addEventListener("click", function () {
        pickEntity(_T("rm_choose_what_the_button_runs"), REMOTE_DOMS, null, function (id) {
          var name = A(id).friendly_name || id;
          rm.btns.push({ e: id, i: defIcon(DOMKIND[dom(id)] || "sensor", name, id), l: "", s: 1 });
          uiChanged();
          showPopup("remote-btn:" + rid + ":" + (rm.btns.length - 1), true);
        });
      });
      grid.appendChild(plus);
    }
    if (!rm.btns.length && !edit) {
      var hint = mk("div", "hint");
      hint.textContent = ISADMIN ? _T("rm_no_buttons_yet_admin") : _T("rm_no_buttons_yet");
      box.appendChild(hint);
    }
    box.appendChild(grid);
  }
  draw();
  reg(function () {
    /* A button whose entity became unavailable (or came back) is dimmed (or not) at once. */
    box.querySelectorAll(".rm-t:not(.add)").forEach(function (t, i) {
      var d = remoteFind(rid),
        x = d && d.rm.btns[i];
      if (x) t.classList.toggle("na", !remoteUsable(x.e));
    });
  });
}

/* One button: what it runs, its icon, its label, how wide it is, where it sits, and removing it. */
function remoteBtnPage(b, key) {
  var p = key.split(":"),
    rid = p[0],
    i = +p[1],
    d = remoteFind(rid),
    x = d && d.rm.btns[i];
  if (!x) return;
  var box = mk("div");
  b.appendChild(box);
  function save() {
    uiChanged();
  }
  function draw() {
  box.appendChild(
    pill("plug", A(x.e).friendly_name || x.e, {
      sub: function () {
        return x.e;
      },
      tap: function () {
        pickEntity(_T("rm_choose_what_the_button_runs"), REMOTE_DOMS, null, function (id) {
          x.e = id;
          save();
          popBack();
        });
      },
    })
  );
  box.appendChild(
    iconPick(DEVICONS, x.i, function (n) {
      x.i = n;
      save();
    })
  );
  box.appendChild(
    textRow(
      "edit",
      _T("rm_label"),
      x.l,
      function (v) {
        if (v) x.l = v.slice(0, 24);
        else x.l = "";
        save();
      },
      24
    )
  );
  var widths = [[1, _T("rm_one_column")]];
  if (d.rm.cols >= 2) widths.push([2, _T("rm_two_columns")]);
  box.appendChild(
    seg(widths, Math.min(x.s, d.rm.cols), function (n) {
      x.s = n;
      save();
      redrawBox(box, draw);
    })
  );
  var row = mk("div", "pre");
  [
    [_T("rm_move_earlier"), -1],
    [_T("rm_move_later"), 1],
  ].forEach(function (m) {
    var c = mk("div", "rbtn pane keepc");
    c.textContent = m[0];
    c.addEventListener("click", function () {
      var j = i + m[1];
      if (j < 0 || j >= d.rm.btns.length) return;
      d.rm.btns.splice(j, 0, d.rm.btns.splice(i, 1)[0]);
      save();
      popBack();
    });
    row.appendChild(c);
  });
  box.appendChild(row);
  box.appendChild(
    pill("trash", _T("rm_remove_button"), {
      tap: function () {
        d.rm.btns.splice(i, 1);
        save();
        popBack();
      },
    })
  );
  }
  draw();
}
