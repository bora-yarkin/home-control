/* Appliance popups: the dial at the top. An oven's dial sets its temperature (drawn like the air conditioner's dial, dashboard.css .dial); a washer's, dryer's or dishwasher's ring only
   shows the cycle: time left in the middle, how far along it is around it. The dial knows nothing of appliances: it draws what the caller's functions answer. */

/* o.label: what it is, for screen readers. o.big(): the large text; o.small(): the line under it; o.note(): a third line.
   o.set = { min, max, step, get(): number or null, commit(value) } makes it a dial to turn; without it the dial is a ring that shows o.ring(): 0 to 1 or null.
   o.mark(): a number on the same scale to show as a small dot (the oven's temperature now). */
function apDial(o) {
  var CX = 110,
    CY = 110,
    R = 82,
    START = 150,
    SPAN = 240,
    set = o.set || null,
    c = mk("div", "dial ap-dial pane" + (set ? "" : " ring"));
  c.innerHTML =
    "<svg viewBox='0 0 220 200'><path class='dtr'/><path class='dv'/><circle class='dc' r='4'/><circle class='dk' r='11'/>" +
    "<text class='dt' x='110' y='118' text-anchor='middle'></text><text class='ds' x='110' y='142' text-anchor='middle'></text><text class='dm' x='110' y='164' text-anchor='middle'></text></svg>";
  var sv = c.querySelector("svg"),
    tr = c.querySelector(".dtr"),
    dv = c.querySelector(".dv"),
    dk = c.querySelector(".dk"),
    dc = c.querySelector(".dc"),
    dt = c.querySelector(".dt"),
    ds = c.querySelector(".ds"),
    dm = c.querySelector(".dm"),
    drag = false,
    hold = 0,
    val = null;
  sv.setAttribute("role", set ? "slider" : "img");
  sv.setAttribute("aria-label", o.label);
  function pt(d) {
    var r = (Math.PI * d) / 180;
    return [CX + R * Math.cos(r), CY + R * Math.sin(r)];
  }
  function arc(a, b) {
    var p = pt(a),
      q = pt(b);
    return "M" + p[0].toFixed(1) + " " + p[1].toFixed(1) + "A" + R + " " + R + " 0 " + (b - a > 180 ? 1 : 0) + " 1 " + q[0].toFixed(1) + " " + q[1].toFixed(1);
  }
  tr.setAttribute("d", arc(START, START + SPAN));
  /* A fraction of the track, or null for none. */
  function fill(f) {
    if (f === null || !isFinite(f)) {
      dv.setAttribute("d", "");
      dk.setAttribute("cx", pt(START)[0].toFixed(1));
      dk.setAttribute("cy", pt(START)[1].toFixed(1));
      return;
    }
    f = Math.max(0, Math.min(1, f));
    var ang = START + SPAN * f,
      p = pt(ang);
    dv.setAttribute("d", f <= 0.001 ? "" : arc(START, Math.max(START + 0.5, ang)));
    dk.setAttribute("cx", p[0].toFixed(1));
    dk.setAttribute("cy", p[1].toFixed(1));
  }
  function frac(v) {
    return (v - set.min) / (set.max - set.min);
  }
  function text(big) {
    dt.textContent = big;
    dt.setAttribute("class", "dt" + (big.length > 6 ? " sm" : ""));
  }
  function fromEvent(e) {
    var r = sv.getBoundingClientRect(),
      x = ((e.clientX - r.left) / r.width) * 220 - CX,
      y = ((e.clientY - r.top) / r.height) * 200 - CY,
      ang = (Math.atan2(y, x) * 180) / Math.PI;
    ang = ((ang % 360) + 360) % 360;
    var rel = (ang - START + 360) % 360;
    if (rel > SPAN) rel = rel - SPAN < (360 - SPAN) / 2 ? SPAN : 0;
    var v = set.min + (rel / SPAN) * (set.max - set.min);
    v = Math.round((v - set.min) / set.step) * set.step + set.min;
    return Math.max(set.min, Math.min(set.max, Number(v.toFixed(2))));
  }
  function live(v) {
    fill(frac(v));
    text(set.fmt ? set.fmt(v) : String(v));
    sv.setAttribute("aria-valuenow", v);
  }
  if (set) {
    sv.setAttribute("tabindex", "0");
    sv.addEventListener("pointerdown", function (e) {
      if (c.classList.contains("inert")) return;
      drag = true;
      capturePointer(sv, e);
      val = fromEvent(e);
      live(val);
    });
    sv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      val = fromEvent(e);
      live(val);
    });
    sv.addEventListener("pointerup", function () {
      if (!drag) return;
      drag = false;
      hold = Date.now() + 700;
      set.commit(val);
    });
    sv.addEventListener("pointercancel", function () {
      drag = false;
    });
    sv.addEventListener("keydown", function (e) {
      var dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (!dir || c.classList.contains("inert")) return;
      e.preventDefault();
      var cur = set.get();
      var n = Math.max(set.min, Math.min(set.max, (typeof cur === "number" ? cur : set.min) + dir * set.step));
      live(n);
      hold = Date.now() + 700;
      set.commit(n);
    });
  }
  c.refresh = function () {
    var cur = set ? set.get() : null;
    if (set) {
      c.classList.toggle("inert", cur === null);
      sv.setAttribute("tabindex", cur === null ? "-1" : "0");
    }
    ds.textContent = o.small ? o.small() : "";
    dm.textContent = o.note ? o.note() : "";
    if (set) {
      if (!drag && Date.now() > hold) {
        fill(cur === null ? null : frac(cur));
        text(o.big());
      }
    } else {
      fill(o.ring());
      text(o.big());
    }
    var m = o.mark ? o.mark() : null;
    if (set && typeof m === "number" && isFinite(m)) {
      var p = pt(START + SPAN * Math.max(0, Math.min(1, frac(m))));
      dc.setAttribute("cx", p[0].toFixed(1));
      dc.setAttribute("cy", p[1].toFixed(1));
      dc.style.display = "";
    } else dc.style.display = "none";
  };
  c.refresh();
  reg(c.refresh);
  return c;
}
