/* Custom remotes: a device made of a grid of buttons, each one an entity (a script, a button, an input button, a scene or a switch) with an icon and an optional label. A remote is made in the page editor (Add device, Remote); an administrator fills the grid with a "+" tile that asks for the entity and then the icon. */

var REMOTE_DOMS = ["script", "button", "input_button", "scene", "switch"];
var REMOTE_ACT = {
  script: ["script", "turn_on"],
  button: ["button", "press"],
  input_button: ["input_button", "press"],
  scene: ["scene", "turn_on"],
  switch: ["switch", "toggle"],
};
var RM = { edit: {} };

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
    icon: "gamepad",
    kind: "remote",
    rm: { cols: 3, btns: [] },
  };
}

function remoteUsable(e) {
  var s = H().states[e];
  return !!s && s.state !== "unavailable" && s.state !== "unknown";
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
  return pill(d.icon || "gamepad", d.name, {
    tap: function () {
      showPopup("remote:" + d.rid, true);
    },
  });
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
