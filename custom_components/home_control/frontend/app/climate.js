/* Air conditioners and fans: dial, sliders, modes, fan block. */

function acSlider(id, name) {
  var a0 = A(id);
  return sliderRow({
    icon: "ac",
    name: name,
    min: a0.min_temp || 16,
    max: a0.max_temp || 32,
    step: a0.target_temp_step || 1,
    get: function () {
      return A(id).temperature;
    },
    fmt: function (v) {
      return v + TEMPU();
    },
    commit: function (v) {
      call("climate", "set_temperature", { entity_id: id, temperature: v });
    },
    inert: function () {
      return V_(id) === "off" || V_(id) === "unavailable";
    },
    sub: function () {
      var a = A(id);
      return (
        (a.temperature !== undefined ? a.temperature : "—") +
        TEMPU() +
        " " +
        _T("set_2") +
        " · " +
        (a.current_temperature !== undefined ? a.current_temperature : "—") +
        TEMPU() +
        " " +
        _T("room").toLowerCase()
      );
    },
  });
}

function acDial(id) {
  var a0 = A(id),
    min = a0.min_temp || 16,
    max = a0.max_temp || 32,
    step = a0.target_temp_step || 1,
    CX = 110,
    CY = 110,
    R = 82,
    START = 150,
    SPAN = 240;
  var c = mk("div", "dial pane");
  c.innerHTML =
    "<svg viewBox='0 0 220 200' role='slider' aria-label='" +
    _T("target_temperature") +
    "'><path class='dtr'/><path class='dv'/><circle class='dk' r='11'/><text class='dt' x='110' y='122' text-anchor='middle'></text><text class='ds' x='110' y='146' text-anchor='middle'></text></svg>";
  var sv = c.querySelector("svg"),
    tr = c.querySelector(".dtr"),
    dv = c.querySelector(".dv"),
    dk = c.querySelector(".dk"),
    dt = c.querySelector(".dt"),
    ds = c.querySelector(".ds"),
    drag = false,
    hold = 0,
    val = null;
  function pt(d) {
    var r = (Math.PI * d) / 180;
    return [CX + R * Math.cos(r), CY + R * Math.sin(r)];
  }
  function arc(a, b2) {
    var p = pt(a),
      q = pt(b2);
    return (
      "M" +
      p[0].toFixed(1) +
      " " +
      p[1].toFixed(1) +
      "A" +
      R +
      " " +
      R +
      " 0 " +
      (b2 - a > 180 ? 1 : 0) +
      " 1 " +
      q[0].toFixed(1) +
      " " +
      q[1].toFixed(1)
    );
  }
  tr.setAttribute("d", arc(START, START + SPAN));
  function paint(v) {
    var f = (v - min) / (max - min);
    f = Math.max(0, Math.min(1, f));
    var ang = START + SPAN * f,
      p = pt(ang);
    dv.setAttribute("d", f <= 0.001 ? "" : arc(START, Math.max(START + 0.5, ang)));
    dk.setAttribute("cx", p[0].toFixed(1));
    dk.setAttribute("cy", p[1].toFixed(1));
    dt.textContent = v + "°";
    sv.setAttribute("aria-valuenow", v);
  }
  function fromEvent(e) {
    var r = sv.getBoundingClientRect(),
      x = ((e.clientX - r.left) / r.width) * 220 - CX,
      y = ((e.clientY - r.top) / r.height) * 200 - CY,
      ang = (Math.atan2(y, x) * 180) / Math.PI;
    ang = ((ang % 360) + 360) % 360;
    var rel = (ang - START + 360) % 360;
    if (rel > SPAN) rel = rel - SPAN < (360 - SPAN) / 2 ? SPAN : 0;
    var v = min + (rel / SPAN) * (max - min);
    v = Math.round((v - min) / step) * step + min;
    return Math.max(min, Math.min(max, Number(v.toFixed(2))));
  }
  sv.addEventListener("pointerdown", function (e) {
    drag = true;
    capturePointer(sv, e);
    val = fromEvent(e);
    paint(val);
  });
  sv.addEventListener("pointermove", function (e) {
    if (!drag) return;
    val = fromEvent(e);
    paint(val);
  });
  function end() {
    if (!drag) return;
    drag = false;
    hold = Date.now() + 700;
    call("climate", "set_temperature", { entity_id: id, temperature: val });
  }
  sv.addEventListener("pointerup", end);
  sv.addEventListener("pointercancel", function () {
    drag = false;
  });
  sv.setAttribute("tabindex", "0");
  sv.addEventListener("keydown", function (e) {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft"
    )
      return;
    if (V_(id) === "off" || V_(id) === "unavailable") return;
    e.preventDefault();
    var cur = A(id).temperature;
    if (typeof cur !== "number") cur = min;
    var n = Math.max(
      min,
      Math.min(max, cur + (e.key === "ArrowUp" || e.key === "ArrowRight" ? step : -step))
    );
    paint(n);
    hold = Date.now() + 700;
    call("climate", "set_temperature", { entity_id: id, temperature: n });
  });
  c.refresh = function () {
    var a = A(id);
    var off = V_(id) === "off" || V_(id) === "unavailable";
    c.classList.toggle("inert", off);
    sv.setAttribute("tabindex", off ? "-1" : "0");
    if (!drag && Date.now() > hold) paint(typeof a.temperature === "number" ? a.temperature : min);
    ds.textContent =
      (a.current_temperature !== undefined ? a.current_temperature + _T("c_room_2") : "") +
      cap(String(V_(id)).replace(/_/g, " "));
  };
  reg(c.refresh);
  return c;
}

/* Modes are listed in the order Home Assistant gives them, with the names the air conditioner's own configuration (packages/all_ac.yaml) chooses. Only the fixed Home Assistant mode id "fan_only" is shown as "Fan". */
var AC_WORDS = { fan_only: _T("fan") };

function acWord(v) {
  var k = String(v).toLowerCase();
  return AC_WORDS[k] || cap(String(v).replace(/_/g, " "));
}

function acSelects(b, id) {
  var g = mk("div", "grid3");
  g.appendChild(
    selectTile(
      _T("mode"),
      function () {
        return A(id).hvac_modes || [];
      },
      function () {
        return V_(id);
      },
      function (v) {
        call("climate", "set_hvac_mode", { entity_id: id, hvac_mode: v });
      },
      null,
      acWord
    )
  );
  g.appendChild(
    selectTile(
      _T("fan"),
      function () {
        return A(id).fan_modes || [];
      },
      function () {
        return A(id).fan_mode;
      },
      function (v) {
        call("climate", "set_fan_mode", { entity_id: id, fan_mode: v });
      },
      null,
      acWord
    )
  );
  g.appendChild(
    selectTile(
      _T("swing"),
      function () {
        return A(id).swing_modes || [];
      },
      function () {
        return A(id).swing_mode;
      },
      function (v) {
        call("climate", "set_swing_mode", { entity_id: id, swing_mode: v });
      },
      null,
      acWord
    )
  );
  b.appendChild(g);
}

/* A purifier is a fan with the preset modes of its device; its speed can only be set in the manual mode (Favorite or Manual). */
function isPurifier(id) {
  return (A(id).preset_modes || []).some(function (m) {
    return /^(favorite|manual)$/i.test(m);
  });
}

function isManualMode(id) {
  return /^(favorite|manual)$/i.test(A(id).preset_mode || "");
}

function modeWord(v) {
  return /^favorite$/i.test(v) ? _T("manual") : cap(v);
}

function fanBlock(b, id, name) {
  var box = mk("div"),
    fixed = isPurifier(id);
  b.appendChild(box);
  /* Outside manual mode the purifier sets its own speed: the row only shows it, as a button that switches the purifier. */
  function speedRow() {
    if (fixed && !isManualMode(id))
      return pill("fan", name || _T("standing_fan"), {
        on: function () {
          return isOn(id);
        },
        val: function () {
          return isOn(id) ? (A(id).percentage || 0) + "%" : _T("off");
        },
        tap: function () {
          toggleEnt(id);
        },
      });
    var sp = fanSpeed(id);
    return sliderRow({
      icon: "fan",
      name: name || _T("standing_fan"),
      min: sp.min,
      max: sp.max,
      step: sp.step,
      get: sp.get,
      fmt: sp.fmtOn,
      on: function () {
        return isOn(id);
      },
      live: sp.live,
      commit: sp.commit,
      onTap: function () {
        toggleEnt(id);
      },
    });
  }
  reg(function () {
    var k = fixed && !isManualMode(id) ? "button" : "slider";
    if (box._k === k) return;
    box._k = k;
    box.innerHTML = "";
    var row = speedRow();
    box.appendChild(row);
    /* The refresh that is running now does not reach a row made during it. */
    row.refresh();
  });
  var g = mk("div", "grid2");
  if ((A(id).supported_features || 0) & 2)
    g.appendChild(
      selectTile(
        _T("oscillation"),
        function () {
          return ["Off", "On"];
        },
        function () {
          var o = A(id).oscillating;
          return o === undefined || o === null ? undefined : o ? "On" : "Off";
        },
        function (v) {
          call("fan", "oscillate", { entity_id: id, oscillating: v === "On" });
        },
        "swap"
      )
    );
  if ((A(id).preset_modes || []).length)
    g.appendChild(
      selectTile(
        _T("mode"),
        function () {
          return A(id).preset_modes || [];
        },
        function () {
          return A(id).preset_mode;
        },
        function (v) {
          call("fan", "set_preset_mode", { entity_id: id, preset_mode: v });
        },
        "tune",
        modeWord
      )
    );
  if (g.children.length) b.appendChild(g);
}
