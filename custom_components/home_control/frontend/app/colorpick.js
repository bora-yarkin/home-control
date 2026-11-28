/* The one colour picker of the dashboard (decision D-44): a "Pick a colour" row that opens the light popup's colour wheel, with brightness and a field that takes any CSS colour
   (hex with or without #, rgb(), hsl(), a name). No part of the dashboard offers a fixed set of colours to choose from. */

var CPICK = null;

function hexOf(rgb) {
  return (
    "#" +
    rgb
      .map(function (v) {
        return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
      })
      .join("")
  );
}

/* What was typed as "#rrggbb", or "" when it is not a colour. */
function colorParse(text) {
  var t = String(text || "").trim().toLowerCase();
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(t)) t = "#" + t;
  var short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (short) return "#" + short[1] + short[1] + short[2] + short[2] + short[3] + short[3];
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (!t || !window.CSS || !CSS.supports("color", t)) return "";
  var rgb = cssToRgb(t);
  return rgb ? hexOf(rgb) : "";
}

/* Hue 0-360, saturation and value 0-100 */
function hsvRgb(h, s, v) {
  var f = function (n) {
    var k = (n + h / 60) % 6;
    return (v / 100) * (1 - (s / 100) * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return [f(5), f(3), f(1)];
}

function rgbHsv(r, g, b) {
  var max = Math.max(r, g, b),
    d = max - Math.min(r, g, b),
    h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? (d / max) * 100 : 0, (max / 255) * 100];
}

/* The row that stands for a colour: its icon is that colour. `get` gives "#rrggbb" or "" (the default), `set` takes the same. */
/* `kind` is the colour group the row stands for: its icon shows that group's colour until one is chosen. */
function colorButton(label, get, set, kind) {
  var row = pill("palette", label, {
    kind: kind,
    sub: function () {
      return get() || _T("default");
    },
    tap: function () {
      CPICK = { title: label, get: get, set: set };
      showPopup("colour-pick", true);
    },
  });
  var paint = function () {
    [row].concat(Array.prototype.slice.call(row.querySelectorAll("[data-k]"))).forEach(function (el) {
      if (get()) el.style.setProperty("--kc", get());
      else el.style.removeProperty("--kc");
    });
  };
  paint();
  reg(paint);
  return row;
}

function colorPickPage(b) {
  var P = CPICK;
  if (!P) return;
  var start = P.get(),
    rgb = start ? cssToRgb(start) : [255, 255, 255],
    hsv = rgbHsv(rgb[0], rgb[1], rgb[2]),
    circ = mk("div", "lw-c col"),
    marker = lpMarker({ icon: "palette", name: "" }, false),
    down = false,
    field = null;
  marker.pin.classList.add("act");
  function hex() {
    return hexOf(hsvRgb(hsv[0], hsv[1], hsv[2]));
  }
  function place() {
    var R = circ.clientWidth / 2,
      a = (hsv[0] * Math.PI) / 180,
      d = (hsv[1] / 100) * R;
    lpPlace(marker, R + d * Math.sin(a), R - d * Math.cos(a));
    marker.dot.style.background = hex();
  }
  function show() {
    place();
    var input = field && field.querySelector("input");
    if (input && document.activeElement !== input) input.value = hex();
  }
  function keep() {
    P.set(hex());
    show();
  }
  function at(e) {
    var w = lpFinger(circ, "color", null, 1, e);
    hsv = [w.data.hs_color[0], w.data.hs_color[1], hsv[2] < 5 ? 100 : hsv[2]];
    show();
  }
  circ.appendChild(marker.dot);
  circ.appendChild(marker.pin);
  circ.addEventListener("pointerdown", function (e) {
    down = true;
    capturePointer(circ, e);
    at(e);
  });
  circ.addEventListener("pointermove", function (e) {
    if (down) at(e);
  });
  circ.addEventListener("pointerup", function () {
    if (down) keep();
    down = false;
  });
  circ.addEventListener("pointercancel", function () {
    down = false;
  });
  var view = mk("div", "lp-view");
  view.appendChild(circ);
  b.appendChild(view);
  b.appendChild(
    sliderRow({
      icon: "bright",
      name: _T("brightness"),
      min: 0,
      max: 100,
      step: 1,
      get: function () {
        return Math.round(hsv[2]);
      },
      fmt: function (v) {
        return v + "%";
      },
      commit: function (v) {
        hsv[2] = v;
        keep();
      },
    })
  );
  field = textRow(
    "edit",
    _T("colour_code"),
    start || "",
    function (v) {
      var c = colorParse(v);
      if (!c) return toast(_T("not_a_colour"));
      var x = cssToRgb(c);
      hsv = rgbHsv(x[0], x[1], x[2]);
      keep();
    },
    40
  );
  b.appendChild(field);
  b.appendChild(hintRow(_T("colour_code_hint")));
  b.appendChild(
    pill("close", _T("use_default_colour"), {
      tap: function () {
        P.set("");
        popBack();
      },
    })
  );
  requestAnimationFrame(show);
}
