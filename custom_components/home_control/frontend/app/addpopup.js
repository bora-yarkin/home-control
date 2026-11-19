/* The add popup of a page or a section: what is chosen is checked, and the checkmark (or the question on closing) adds every checked device at once. On the lights list the first entry,
   Light group, turns the checked lights into one group (a Home Assistant helper made for them, app/lightgroups.js) whose settings open as soon as it is saved. */

/* One chosen entity put on the page; a TV or a camera is linked to what belongs to it. Gives the device and whether its setup page is worth opening. */
function addCandidate(rid, c) {
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

function devAdd(b, rid) {
  var pre = ADDPRE;
  ADDPRE = null;
  var st = { dom: ADDPRE_IX[pre] || 0, q: "", group: false, area: "" },
    picked = {},
    order = [],
    inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search")),
    count = mk("div", "hint"),
    box = mk("div");
  inp.type = "text";
  inp.placeholder = _T("search_devices");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  w.appendChild(inp);
  function isLight(id) {
    return dom(id) === "light";
  }
  function drawCount() {
    var n = order.length;
    count.textContent = n ? n + _T("add_selected") + (st.group ? " · " + _T("lg_as_one_group") : "") : "";
    count.style.display = n ? "" : "none";
  }
  function toggle(c) {
    if (picked[c.id]) {
      delete picked[c.id];
      order.splice(order.indexOf(c.id), 1);
    } else {
      picked[c.id] = c;
      order.push(c.id);
    }
    drawCount();
  }
  function list() {
    redrawBox(box, function () {
      /* A remote is not an entity: it is made here, then filled with buttons. */
      if (ADDDOMS[st.dom][1][0] === "__remote") {
        box.appendChild(
          pill("media", _T("rm_new_remote"), {
            sub: function () {
              return _T("rm_new_remote_sub");
            },
            tap: function () {
              var d = remoteNew();
              devList(rid).push(d);
              uiChanged();
              RM.edit[d.rid] = true;
              showPopup("remote:" + d.rid, true);
            },
          })
        );
        return;
      }
      if (ADDDOMS[st.dom][1][0] === "__appliance") {
        Object.keys(AP_TYPES).forEach(function (t) {
          box.appendChild(
            pill(AP_TYPES[t].icon, _T(AP_TYPES[t].l), {
              sub: function () {
                return _T("ap_choose_what_it_is_made_of");
              },
              tap: function () {
                var d = apNew(t);
                devList(rid).push(d);
                uiChanged();
                showPopup("ap-edit:" + d.aid, true);
              },
            })
          );
        });
        return;
      }
      var items = candidates(ADDDOMS[st.dom][1], rid, st.q, st.area),
        shown = items.slice(0, 40);
      /* Lights only: the first entry makes the checked lights one group. */
      if (ADDDOMS[st.dom][1][0] === "light" && ISADMIN) {
        var g = pill("lights", _T("lg_light_group"), {
          check: function () {
            return st.group;
          },
          sub: function () {
            return _T("lg_light_group_sub");
          },
          tap: function () {
            st.group = !st.group;
            g.refresh();
            drawCount();
          },
        });
        box.appendChild(g);
        box.appendChild(mk("div", "sepline"));
      }
      if (!items.length)
        box.appendChild(
          pill("info", _T("nothing_to_add_here"), {
            sub: function () {
              return _T("everything_of_this_type_is_already_i");
            },
          })
        );
      shown.forEach(function (c) {
        var kind = DOMKIND[dom(c.id)] || "sensor",
          row = pill(defIcon(kind, c.name, c.id), c.group ? c.name + " · " + _T("lg_group") : c.name, {
            check: function () {
              return !!picked[c.id];
            },
            sub: function () {
              return (c.area ? c.area + " · " : "") + c.id;
            },
            tap: function () {
              toggle(c);
              row.refresh();
            },
          });
        box.appendChild(row);
      });
      if (items.length > shown.length) {
        box.appendChild(hintRow(items.length - shown.length + _T("more_type_to_narrow_the_list")));
      }
    });
  }
  inp.addEventListener("input", function () {
    st.q = inp.value;
    list();
  });
  /* What to add and where it is: two dropdowns. The area is any area of Home Assistant, all of them to begin with. */
  var typeTile = selectTile(
      _T("add_type"),
      function () {
        return ADDDOMS.map(function (x, i) {
          return String(i);
        });
      },
      function () {
        return String(st.dom);
      },
      function (v) {
        st.dom = +v;
        typeTile.refresh();
        list();
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
        return st.area || "all";
      },
      function (v) {
        st.area = v === "all" ? "" : v;
        areaTile.refresh();
        list();
      },
      "home",
      function (v) {
        return v === "all" ? _T("all_areas") : (H().areas[v] || {}).name || v;
      }
    );
  typeTile.classList.add("selrow");
  areaTile.classList.add("selrow");
  typeTile.refresh();
  areaTile.refresh();
  var filters = mk("div", "ap-grid");
  filters.appendChild(typeTile);
  filters.appendChild(areaTile);
  b.appendChild(w);
  b.appendChild(filters);
  b.appendChild(mk("div", "sepline"));
  b.appendChild(count);
  b.appendChild(box);
  drawCount();
  list();

  /* Adds what is checked. With Light group checked the checked lights are not added one by one: the new group form opens for them, and the group is made when that is saved. */
  function save(leave) {
    var chosen = order.map(function (id) {
        return picked[id];
      }),
      lights = chosen.filter(function (c) {
        return isLight(c.id);
      }),
      rest = chosen.filter(function (c) {
        return !(st.group && isLight(c.id));
      });
    if (!chosen.length && !st.group) {
      leave();
      return true;
    }
    if (st.group && lights.length < 2) {
      toast(_T("lg_check_two_lights"));
      return false;
    }
    function addRest() {
      var wizard = null;
      rest.forEach(function (c) {
        var r = addCandidate(rid, c);
        if (r.wizard) wizard = r.at;
      });
      if (rest.length) {
        uiChanged();
        toast(_T("added") + (rest.length === 1 ? rest[0].name + "”" : rest.length + _T("add_devices_word")));
      }
      return rest.length === 1 && wizard ? wizard : null;
    }
    if (!st.group) {
      var wiz = addRest();
      POPGUARD = null;
      if (wiz) showPopup("kwiz:" + wiz.rid + ":" + wiz.i, false);
      else leave();
      return true;
    }
    /* The group is not made yet: its form opens in place of this popup, and Home Assistant is asked only when the form is saved with a name. */
    LGNEW = {
      rid: rid,
      lights: lights.map(function (c) {
        return c.id;
      }),
    };
    addRest();
    POPGUARD = null;
    showPopup("lgnew", false);
    return true;
  }
  guardUnsaved({
    dirty: function () {
      return order.length > 0 || st.group;
    },
    save: save,
  });
}
