/* The Popup widget: a row that opens a popup of the administrator's own choosing (decision D-40). What is in a popup is a Section of the same page marked `of` the widget's id: it is
   never drawn on the page, and everything that works on a Section's devices (adding, settings, widgets, counting) works on it. */

function popupSection(scope, wid, make) {
  var sc = scopeKey(scope),
    arr = secOrder(sc),
    s = arr.filter(function (x) {
      return x.of === wid;
    })[0];
  if (!s && make) {
    s = { id: newSecId(arr), k: "devs", hide: false, of: wid, devs: [] };
    arr.push(s);
    setSecOrder(sc, arr);
  }
  return s || null;
}

/* The page a popup widget is on, also when it is inside another popup. */
function popupScope(d) {
  return ["home"].concat(Object.keys(UIROOM)).filter(function (id) {
    return secOrder(scopeKey(id)).some(function (s) {
      return (s.devs || []).indexOf(d) >= 0;
    });
  })[0];
}

/* A popup widget moved to another page takes what is in it along, popups inside it too. */
function popupFollow(d, to) {
  if (!d || d.w !== "popup") return;
  var target = secOrder(scopeKey(to));
  ["home"].concat(Object.keys(UIROOM)).forEach(function (from) {
    if (from === to) return;
    var arr = secOrder(scopeKey(from)),
      own = arr.filter(function (s) {
        return s.of === d.wid;
      })[0];
    if (!own) return;
    setSecOrder(scopeKey(from), arr.filter(function (s) { return s !== own; }));
    if (target.some(function (s) { return s.id === own.id; })) own.id = newSecId(target);
    target.push(own);
    setSecOrder(scopeKey(to), target);
    (own.devs || []).forEach(function (x) {
      popupFollow(x, to);
    });
  });
}

function popupItems(scope, wid) {
  var s = popupSection(scope, wid);
  return ((s && s.devs) || []).filter(function (d) {
    return !d.hide && !(d.id && modeOf(d.id).mode === "hide");
  });
}

/* The popup itself: its devices and widgets drawn exactly as a Section draws them. */
function popupBody(b, scope, wid, name) {
  var s = popupSection(scope, wid),
    was = CURSCOPE,
    sec = CURSEC;
  if (!s || !popupItems(scope, wid).length) {
    b.appendChild(hintRow(_T("popup_empty")));
    if (ISADMIN)
      b.appendChild(
        pill("plus", _T("popup_add"), {
          tap: function () {
            popupAddTo(scope, wid, name);
          },
        })
      );
    return;
  }
  CURSCOPE = scopeKey(scope);
  CURSEC = s;
  try {
    var rows = [];
    popupItems(scope, wid).forEach(function (d) {
      var r = deviceItem(d, false);
      if (r) rows.push(r);
    });
    var wide = rows.some(function (r) {
        return r.classList.contains("wgt");
      }),
      box = mk("div", wide ? "wgrid" : "");
    rows.forEach(function (r) {
      box.appendChild(r);
    });
    b.appendChild(box);
  } finally {
    CURSCOPE = was;
    CURSEC = sec;
  }
}

function popupAddTo(scope, wid, name) {
  var s = popupSection(scope, wid, true);
  /* the Add popup names where it adds to */
  if (name) s.t = String(name).slice(0, 40);
  uiChanged();
  showPopup("manage-add:~" + scope + "~" + s.id, true);
}

/* The widget's settings: what is in the popup, in its order, and Add. */
function popupSettings(box, d, redraw) {
  var scope = popupScope(d);
  if (!scope) return;
  var s = popupSection(scope, d.wid),
    items = (s && s.devs) || [],
    list = mk("div"),
    rows = [];
  box.appendChild(hintRow(_T("popup_settings_hint")));
  items.forEach(function (x, i) {
    var r = pill(x.icon || "plug", x.name, {
      sub: function () {
        return x.hide ? _T("hidden") : x.id || "";
      },
      tap: function () {
        showPopup("manage-dev:~" + scope + "~" + s.id + ":" + i, true);
      },
    });
    rows.push(r);
    list.appendChild(r);
  });
  box.appendChild(list);
  if (rows.length > 1)
    makeSortable(list, rows, function (from, to) {
      items.splice(to, 0, items.splice(from, 1)[0]);
      uiChanged();
      setTimeout(redraw, 250);
    });
  box.appendChild(
    pill("plus", _T("popup_add"), {
      tap: function () {
        popupAddTo(scope, d.wid, d.name);
      },
    })
  );
}

registerWidget("popup", {
  title: _T("popup_widget"),
  icon: "apps",
  desc: _T("popup_widget_desc"),
  sizes: [],
  size: "row",
  clean: function () {
    return {};
  },
  draw: function (d) {
    var scope = secKey(),
      lit = function () {
        return popupItems(scope, d.wid).filter(function (x) {
          return x.id && /^(light|switch|fan|media_player|input_boolean)\./.test(x.id) && isOn(x.id);
        }).length;
      };
    return pill(d.icon || "apps", d.name, {
      on: function () {
        return lit() > 0;
      },
      sub: function () {
        var n = popupItems(scope, d.wid).length,
          on = lit();
        return cntS(n, _T("popup_item"), _T("popup_items")) + (on ? " · " + on + " " + _T("on_3") : "");
      },
      tap: function () {
        showPopup("wpop:" + scope + ":" + d.wid, true);
      },
    });
  },
  settings: popupSettings,
});
