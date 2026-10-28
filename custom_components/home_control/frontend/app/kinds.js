/* Guided setup of a device: the other entities that belong to it (a TV's remote, a camera's second stream and its pan/tilt controls), found by themselves where Home Assistant says they belong together and chosen with a searchable list where it does not. What is linked is kept with the device (`links`) and is what the Advanced settings of that device list. */

/* A kind of device that has other entities, and what each of them is for. `domains` are the entity types that fit, `re` narrows them by name, `many` allows more than one. */
var DEVSETUP = {
  tv: {
    label: "tv",
    slots: [
      { key: "remote", domains: ["remote"], hint: "tv_remote_hint" },
      { key: "extras", domains: ["select", "switch", "button"], re: /app|source|input|picture|sound|game|ambient|mute|menu|home|back/i, many: 1, hint: "tv_extras_hint" },
    ],
  },
  camera: {
    label: "camera",
    slots: [
      { key: "stream", domains: ["camera"], hint: "camera_stream_hint" },
      { key: "ptz", domains: ["button", "select", "number", "cover"], re: /ptz|\bpan\b|tilt|zoom|preset|patrol|cruise|move[_ ](up|down|left|right)|\b(up|down|left|right)\b|calibrat/i, many: 1, hint: "camera_ptz_hint" },
      { key: "privacy", domains: ["switch"], re: /privacy|lens[_ ]mask|shutter|\bsleep\b|\bcover(ed)?\b/i, hint: "camera_privacy_hint" },
      { key: "motion", domains: ["binary_sensor"], re: /motion|person|human|\bpet\b|vehicle|animal|baby|cry|detect|alarm|tamper/i, many: 1, hint: "camera_motion_hint" },
    ],
  },
};

/* The setup a device has, or null (a plain device has none). */
function devSetupKind(d) {
  if (!d || !d.id) return null;
  if (d.kind === "camera") return "camera";
  if (d.kind === "media" && d.icon === "tv") return "tv";
  return null;
}

function kName(eid) {
  return A(eid).friendly_name || eid;
}

/* Entities Home Assistant says belong with this one: on the same device, or (when it has no device) named like it in the same area. */
function kNear(id) {
  var h = H(),
    e = h.entities && h.entities[id];
  if (!e) return [];
  var base = String(A(id).friendly_name || id).toLowerCase().split(/[\s_]+/)[0];
  return Object.keys(h.entities).filter(function (k) {
    var x = h.entities[k];
    if (k === id || !h.states[k] || x.disabled_by || x.hidden) return false;
    if (e.device_id) return x.device_id === e.device_id;
    return base.length >= 3 && areaIdOf(k) === areaIdOf(id) && kName(k).toLowerCase().indexOf(base) === 0;
  });
}

function kFits(slot, eid) {
  return slot.domains.indexOf(dom(eid)) >= 0 && (!slot.re || slot.re.test(eid + " " + kName(eid)));
}

/* Which slot an entity linked to the device is for. */
function kSlotOf(kind, eid) {
  var slots = DEVSETUP[kind].slots;
  for (var i = 0; i < slots.length; i++) if (kFits(slots[i], eid)) return slots[i];
  return null;
}

function kLinked(d, slot) {
  return (d.links || []).filter(function (eid) {
    return kSlotOf(devSetupKind(d), eid) === slot;
  });
}

function kLink(d, slot, eid) {
  d.links = (d.links || []).filter(function (x) {
    return x !== eid && (slot.many || kSlotOf(devSetupKind(d), x) !== slot);
  });
  d.links.push(eid);
  d.links = d.links.slice(-12);
}

function kUnlink(d, eid) {
  d.links = (d.links || []).filter(function (x) {
    return x !== eid;
  });
  if (!d.links.length) delete d.links;
}

/* Links what is found for every slot that has nothing yet. Returns how many were added. */
function kAuto(d) {
  var kind = devSetupKind(d);
  if (!kind) return 0;
  var near = kNear(d.id),
    n = 0;
  DEVSETUP[kind].slots.forEach(function (slot) {
    if (kLinked(d, slot).length) return;
    near
      .filter(function (eid) {
        return kFits(slot, eid) && (slot.re || !slot.many);
      })
      .slice(0, slot.many ? 8 : 1)
      .forEach(function (eid) {
        kLink(d, slot, eid);
        n++;
      });
  });
  return n;
}

/* What a TV can be asked to do through its media player, and so whether the full remote can be shown or only the basic one. */
var KTV = [
  [1, "pause"],
  [4, "volume"],
  [8, "mute"],
  [128, "power_on"],
  [256, "power_off"],
  [512, "play_media"],
  [2048, "source"],
];

function kTier(d) {
  var feat = A(d.id).supported_features || 0,
    missing = KTV.filter(function (f) {
      return !(feat & f[0]);
    }).map(function (f) {
      return f[1];
    }),
    remote = d.links && d.links.some(function (e) {
      return dom(e) === "remote";
    }),
    e = H().entities[d.id],
    plat = e ? e.platform : "";
  /* The core Samsung integration offers little; the HACS one offers the apps, sources and keys. */
  var better = plat === "samsungtv" && !Object.keys(H().entities).some(function (k) {
    return H().entities[k].platform === "samsungtv_smart";
  });
  var full = missing.indexOf("source") < 0 && missing.indexOf("volume") < 0 && missing.indexOf("power_off") < 0;
  return { tier: full || remote ? "full" : "basic", missing: missing, remote: !!remote, suggest: better ? "samsungtv_smart" : null };
}

/* ---- the setup page of a device ---- */

function kwizPage(b, key) {
  var d = devAt(key),
    kind = devSetupKind(d);
  if (!d || !kind) {
    b.appendChild(mk("div", "hint")).textContent = _T("nothing_to_set_up");
    return;
  }
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    redrawBox(box, function () {
      var t = kind === "tv" ? kTier(d) : null;
      if (t) {
        box.appendChild(
          pill(t.tier === "full" ? "check" : "info", t.tier === "full" ? _T("full_remote") : _T("basic_remote"), {
            sub: function () {
              return t.tier === "full" ? _T("this_tv_offers_everything_needed") : _T("this_tv_does_not_report_some_features") + t.missing.join(", ");
            },
          })
        );
        if (t.suggest)
          box.appendChild(
            pill("info", _T("more_features_with_samsung_tv_smart"), {
              sub: function () {
                return _T("install_samsung_tv_smart_from_hacs");
              },
            })
          );
      }
      DEVSETUP[kind].slots.forEach(function (slot) {
        var have = kLinked(d, slot);
        box.appendChild(sep(_T(slot.key + "_title"), "tune"));
        have.forEach(function (eid) {
          box.appendChild(
            pill(defIcon(DOMKIND[dom(eid)] || "sensor", kName(eid), eid), kName(eid), {
              sub: function () {
                return eid;
              },
              tap: function () {
                kUnlink(d, eid);
                uiChanged();
                draw();
              },
            })
          );
        });
        box.appendChild(
          pill("plus", have.length && !slot.many ? _T("choose_another") : _T("choose_an_entity"), {
            sub: function () {
              return _T(slot.hint);
            },
            tap: function () {
              showPopup("kpick:" + key + ":" + slot.key, true);
            },
          })
        );
      });
      box.appendChild(
        pill("search", _T("find_automatically"), {
          tap: function () {
            var n = kAuto(d);
            uiChanged();
            toast(n ? _T("linked") + n : _T("nothing_new_found"));
            draw();
          },
        })
      );
    });
  }
  d.setup = 1;
  draw();
}

/* ---- the searchable list of entities for one slot ---- */

function kpickPage(b, key) {
  var p = key.split(":"),
    slotKey = p.pop(),
    d = devAt(p.join(":")),
    kind = devSetupKind(d),
    slot = kind && DEVSETUP[kind].slots.filter(function (s) {
      return s.key === slotKey;
    })[0];
  if (!slot) return;
  var st = { q: "" },
    inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search")),
    box = mk("div"),
    near = kNear(d.id);
  inp.type = "text";
  inp.placeholder = _T("search_entities");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(box);
  function matches(eid) {
    var hay = norm(kName(eid) + " " + eid + " " + areaName(eid));
    return norm(st.q)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every(function (x) {
        return hay.indexOf(x) >= 0;
      });
  }
  function row(eid) {
    return pill(defIcon(DOMKIND[dom(eid)] || "sensor", kName(eid), eid), kName(eid), {
      sub: function () {
        return (areaName(eid) ? areaName(eid) + " · " : "") + eid;
      },
      tap: function () {
        kLink(d, slot, eid);
        uiChanged();
        if (STACK.length) popBack();
        else closeSheet();
      },
    });
  }
  function list() {
    redrawBox(box, function () {
      var all = Object.keys(H().states).filter(function (eid) {
          var x = H().entities[eid];
          return slot.domains.indexOf(dom(eid)) >= 0 && eid !== d.id && !(x && (x.disabled_by || x.hidden)) && matches(eid);
        }),
        mine = all.filter(function (eid) {
          return near.indexOf(eid) >= 0;
        }),
        rest = all.filter(function (eid) {
          return near.indexOf(eid) < 0;
        });
      if (mine.length) {
        box.appendChild(sep(_T("on_the_same_device"), "target"));
        mine.slice(0, 40).forEach(function (eid) {
          box.appendChild(row(eid));
        });
      }
      if (rest.length) {
        box.appendChild(sep(_T("everything_else"), "search"));
        rest.slice(0, 40).forEach(function (eid) {
          box.appendChild(row(eid));
        });
        if (rest.length > 40) box.appendChild(mk("div", "hint")).textContent = rest.length - 40 + _T("more_type_to_narrow_the_list");
      }
      if (!all.length) box.appendChild(mk("div", "hint")).textContent = _T("nothing_matches");
    });
  }
  inp.addEventListener("input", function () {
    st.q = inp.value;
    list();
  });
  list();
}
