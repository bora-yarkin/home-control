/* Hue Play HDMI Sync Box (an entry of the Philips Hue Plus integration): its row, which looks like a light, and its popup. Built from the shared controls only. */

/* The brightness of the box runs from 0 to 200, where 100 is the normal brightness of the lights. */
var HB_MAX = 200;

function hbNumber(id) {
  var v = V_(id);
  return v !== "unknown" && v !== "unavailable" && v !== "" && !isNaN(Number(v)) ? Number(v) : null;
}

function hbBrightness(E, name, icon, onTap) {
  return sliderRow({
    onTap: onTap,
    name: name,
    icon: icon,
    min: 0,
    max: HB_MAX,
    step: 1,
    fmt: function (v) {
      return v + "%";
    },
    get: function () {
      return hbNumber(E.brightness);
    },
    on: function () {
      return isOn(E.sync);
    },
    live: function (v) {
      callLive("hb-bri", "number", "set_value", { entity_id: E.brightness, value: v });
    },
    commit: function (v) {
      call("number", "set_value", { entity_id: E.brightness, value: v });
    },
  });
}

/* The box as a row of the Lights section. The bar is the brightness, the icon starts and stops the sync, the rest of the row opens the popup. */
function hsboxRow(d) {
  var id = d.id,
    E = Integrations.huesyncbox.entities(H(), id),
    pk = "hsbox:" + id,
    icon = d.icon || "syncring";
  if (!E)
    return pill(icon, d.name, {
      tap: function () {
        showPopup(pk, true);
      },
    });
  var r = hbBrightness(E, d.name, icon, function (t) {
    if (t && t.closest && t.closest(".ic")) toggleEnt(id);
    else showPopup(pk, true);
  });
  r.dataset.pin = JSON.stringify(pinPop(pk, id, d.name, icon));
  return r;
}

function hsboxSelect(E, key, label, icon) {
  var t = dropRow(
    label,
    function () {
      return A(E[key]).options || [];
    },
    function () {
      return V_(E[key]);
    },
    function (v) {
      call("select", "select_option", { entity_id: E[key], option: v });
    },
    icon
  );
  return t;
}

/* The brightness of the box in the popup: the button of the light popup with the slider that rises from it, as on the Spotify sync. The slider is in percent of the box's range (0 to 200, where the middle is the normal brightness of the lights), and the number it shows is the box's own. */
function hbBrightnessButton(E, root) {
  var g = mk("div", "hs-set one"),
    col = mk("div", "hs-col");
  function toBox(v) {
    return Math.round((v * HB_MAX) / 100);
  }
  col.appendChild(mk("div", "hs-cap")).textContent = _T("brightness");
  col.appendChild(
    briControl({
      pct: function () {
        return Math.round(((hbNumber(E.brightness) || 0) * 100) / HB_MAX);
      },
      lit: function () {
        return isOn(E.sync);
      },
      fmt: function (v) {
        return toBox(v) + "%";
      },
      live: function (v) {
        callLive("hb-bri", "number", "set_value", { entity_id: E.brightness, value: toBox(v) });
      },
      commit: function (v) {
        call("number", "set_value", { entity_id: E.brightness, value: toBox(v) });
      },
      stage: function () {
        return root;
      },
    })
  );
  g.appendChild(col);
  return g;
}

function hsboxPopup(b, id) {
  var E = Integrations.huesyncbox.entities(H(), id);
  if (!E) {
    b.appendChild(pill("info", _T("nothing_found"), {}));
    return;
  }
  /* `hs` is what dims the rest of the popup while the brightness slider is open. */
  var root = mk("div", "hs");
  b.appendChild(root);
  root.appendChild(switchPill("syncring", _T("sync"), E.sync));
  root.appendChild(hsboxSelect(E, "mode", _T("mode"), "tv"));
  root.appendChild(hsboxSelect(E, "source", _T("hdmi_input"), "plug"));
  /* The box keeps an intensity for video, game and music only, so there is nothing to choose in the other modes. */
  var intensity = hsboxSelect(E, "intensity", _T("intensity"), "wave3");
  root.appendChild(intensity);
  reg(function () {
    intensity.style.display = V_(E.intensity) === "unavailable" ? "none" : "";
  });
  root.appendChild(hbBrightnessButton(E, root));
  root.appendChild(
    pill("tv", _T("hdmi_signal"), {
      val: function () {
        return isOn(E.hdmi_signal) ? _T("on_2") : _T("off");
      },
    })
  );
}
