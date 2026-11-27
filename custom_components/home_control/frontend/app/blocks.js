/* Blocks for popups and pages (decision D-47): a button that runs any action, and a text Home Assistant works out from a template. Both are widgets, so they go on a page, in a
   Popup widget or among the blocks added to a device's popup. */

registerWidget("action", {
  title: _T("blk_action"),
  icon: "play",
  desc: _T("blk_action_desc"),
  sizes: [],
  size: "row",
  clean: function (x) {
    var a = cleanRmAct(x.a),
      out = {};
    if (a && a.t !== "room") out.a = a;
    if (x.q) out.q = 1;
    return out;
  },
  draw: function (d, x, ed) {
    if (!x.a && !ed && !ISADMIN) return null;
    return pill(d.icon || "play", d.name, {
      sub: function () {
        return x.a ? (rmUsable(x.a) ? rmActName(x.a) : _T("rm_not_available_right_now")) : _T("blk_not_set");
      },
      tap: function () {
        if (x.a) remotePress({ a: x.a, q: x.q, l: d.name });
      },
    });
  },
  settings: function (box, d, save) {
    box.appendChild(
      pill("play", d.wx.a ? rmActName(d.wx.a) : _T("blk_not_set"), {
        sub: function () {
          return _T("rm_change_what_it_does");
        },
        tap: function () {
          RM.vacuum = null;
          rmChooseAction(function (a) {
            d.wx.a = a;
            save();
            return null;
          });
        },
      })
    );
    box.appendChild(
      flagPill("info", _T("act_ask"), d.wx, "q", function (on) {
        return on ? _T("on_cap") : _T("off");
      })
    );
  },
});

/* One subscription per template, kept while the dashboard is open: Home Assistant sends the text again when what it reads changes. */
var TEMPLATES = {},
  TEMPLATE_MAX = 60;

function templateResult(text) {
  var t = TEMPLATES[text];
  if (t) return t;
  if (Object.keys(TEMPLATES).length >= TEMPLATE_MAX) return { error: _T("blk_tpl_many") };
  t = TEMPLATES[text] = { value: "", error: "" };
  window.HA.template(text, function (m) {
    if (m && m.error !== undefined) {
      if (m.level !== "WARNING") t.error = String(m.error);
    } else {
      var r = m ? m.result : "";
      t.error = "";
      t.value = r !== null && typeof r === "object" ? JSON.stringify(r) : String(r);
    }
    templatePaint();
  }).catch(function (e) {
    t.error = String((e && e.message) || e);
    templatePaint();
  });
  return t;
}

var TEMPLATE_PAINT = 0;

/* A new answer redraws what is on screen, once for a burst of them. */
function templatePaint() {
  if (TEMPLATE_PAINT) return;
  TEMPLATE_PAINT = setTimeout(function () {
    TEMPLATE_PAINT = 0;
    refresh();
  }, 50);
}

registerWidget("template", {
  title: _T("blk_tpl"),
  icon: "edit",
  desc: _T("blk_tpl_desc"),
  sizes: [],
  size: "row",
  clean: function (x) {
    return { t: typeof x.t === "string" ? x.t.slice(0, 500) : "" };
  },
  draw: function (d, x) {
    return pill(d.icon || "edit", d.name, {
      sub: function () {
        if (!x.t) return _T("blk_not_set");
        var r = templateResult(x.t);
        return r.error ? _T("blk_tpl_error", { x: r.error.slice(0, 120) }) : r.value.slice(0, 200);
      },
    });
  },
  settings: function (box, d, save) {
    box.appendChild(
      areaRow(
        _T("blk_tpl_ph"),
        d.wx.t || "",
        function (v) {
          d.wx.t = v.slice(0, 500);
          save();
        },
        500
      )
    );
    box.appendChild(hintRow(_T("blk_tpl_hint")));
  },
});
