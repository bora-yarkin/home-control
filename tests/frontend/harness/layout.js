/* Measures a popup, a page or a menu for the faults a picture hides: a corner radius that is not the app's, padding that differs from the same kind of control elsewhere, a row
   that does not line up with the rows around it, tiles of one row with different heights, controls cut off or past the edge, an icon that is not centred in its circle, and
   a gap between rows that is not the usual one. Every finding names the control, so it can be found and fixed.
   Use from the browser (the harness loads it):
     await auditLayout(root)                       -> findings for one element
     await auditSurfaces([{ key: "settings" }, { key: "manage-dev:~r_living~lights:0" }, { page: "r_living" }, ...])
         -> { findings: { "<surface>": [...] }, classes: { ".pill": { radius: { "14px": 120 }, padding: { "8px 18px 8px 8px": 118, ... } } } } */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Round controls: their radius is half their size. */
const ROUND = ".rnd,.ic,.chev,.ck,.dk,.wg-ck,.ap-sb,.rb-g,.sh-h .rnd";
/* Boxes that carry the app's row radius (--r-row). */
const ROWLIKE = ".pill,.sel,.sqw,.erow,.rbtn,.gb,.ap-step,.ap-list,.ap-bar,.notec,.chartc,.tile,.qa,.wg-t,.menu,.idd-row";
/* Cards and controls that hold text: they need padding. */
const PADDED = ".np,.wcard,.gb,.notec,.chartc,.rbtn,.sel,.sqw,.erow";
/* Cards and controls that must not touch each other: a gap of at least 4px between neighbours. */
const APART = ".rnd,.ck,.pill,.sel,.rbtn,.gb,.sqw,.erow,.np,.wcard,.notec,.chartc,.vidbox,.room,.opt,.hs";
/* A row of controls whose members should be the same size. */
const GRIDS = ".ap-grid,.grid2,.grid3,.glance,.rrow,.seg,.wg,.cbtns";

const num = (v) => parseFloat(v) || 0;

function name(el) {
  const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
  const text = (el.innerText || el.getAttribute("aria-label") || cls || el.tagName || "").toString().trim().replace(/\s+/g, " ");
  return (cls ? "." + cls.split(" ")[0] : el.tagName.toLowerCase()) + " “" + text.slice(0, 24) + "”";
}

function visible(el) {
  const r = el.getBoundingClientRect(),
    cs = getComputedStyle(el);
  return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
}

function radiusOf(el) {
  return getComputedStyle(el).borderTopLeftRadius;
}

/* Findings for one element (a sheet, the page, a menu). `classes` collects, across calls, which radius and padding each kind of control has. */
export function auditLayout(root, classes) {
  const out = [];
  const rr = root.getBoundingClientRect();
  const tag = (kind, el, text) => out.push(`${kind}: ${name(el)} ${text}`);

  // Radius: round controls are round; boxes carry the row radius; and every kind is recorded for the comparison across surfaces.
  root.querySelectorAll(ROUND).forEach((el) => {
    if (!visible(el) || el instanceof SVGElement) return;
    const r = el.getBoundingClientRect(),
      half = Math.min(r.width, r.height) / 2;
    if (num(radiusOf(el)) < half - 1 && !String(radiusOf(el)).includes("%")) tag("radius", el, `is not round (${radiusOf(el)} on ${Math.round(r.width)}×${Math.round(r.height)})`);
  });
  root.querySelectorAll(ROWLIKE).forEach((el) => {
    if (!visible(el)) return;
    const cls = "." + (el.className.split(" ").filter((c) => ROWLIKE.split(",").some((s) => s === "." + c))[0] || el.className.split(" ")[0]);
    const cs = getComputedStyle(el);
    if (classes) {
      const c = (classes[cls] ||= { radius: {}, padding: {}, height: {} });
      c.radius[radiusOf(el)] = (c.radius[radiusOf(el)] || 0) + 1;
      const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(" ");
      c.padding[pad] = (c.padding[pad] || 0) + 1;
      const h = Math.round(el.getBoundingClientRect().height);
      c.height[h] = (c.height[h] || 0) + 1;
    }
    if (radiusOf(el) !== "14px" && !el.matches(".menu,.idd-row,.room,.wg-t,.tile,.qa") && !String(radiusOf(el)).includes("%") && num(radiusOf(el)) < 999) tag("radius", el, `has ${radiusOf(el)}, not the row radius 14px`);
  });

  // A card has rounded corners: every .pane is one, so a square one is a fault (a card that forgot its radius), whatever it is called.
  root.querySelectorAll(".pane").forEach((el) => {
    if (!visible(el) || el instanceof SVGElement || el.matches(".sheet,.asheet")) return;
    if (num(radiusOf(el)) === 0) tag("radius", el, "is a card with square corners");
  });

  // A card or control with text has room around its content: the text and icons are at least 6px from every edge (padding, or the centring of a flex box: what is measured is the room, not the property).
  root.querySelectorAll(PADDED).forEach((el) => {
    if (!visible(el) || el.matches(".snap,.stk") || !(el.innerText || "").trim()) return;
    const r = el.getBoundingClientRect(),
      parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || getComputedStyle(n.parentElement).visibility === "hidden") continue;
      /* text cut with an ellipsis on purpose is as wide as its box: the box is what is measured */
      let box = null;
      for (let p = n.parentElement; p && p !== el; p = p.parentElement) if (getComputedStyle(p).textOverflow === "ellipsis" && p.scrollWidth > p.clientWidth) box = p.getBoundingClientRect();
      if (box) parts.push(box);
      else {
        const range = document.createRange();
        range.selectNodeContents(n);
        parts.push(...[...range.getClientRects()].filter((c) => c.width > 0 && c.height > 0));
      }
    }
    el.querySelectorAll("svg,img,.ic").forEach((i) => {
      const b = i.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) parts.push(b);
    });
    if (!parts.length) return;
    const left = Math.min(...parts.map((c) => c.left)),
      right = Math.max(...parts.map((c) => c.right)),
      top = Math.min(...parts.map((c) => c.top)),
      bottom = Math.max(...parts.map((c) => c.bottom)),
      least = Math.round(Math.min(left - r.left, r.right - right, top - r.top, r.bottom - bottom));
    if (least < 6) tag("padding", el, `has its content ${least}px from an edge (at least 6px is needed)`);
  });

  // Alignment: rows that span the container line up with each other, and with the container's edges.
  const containers = [root, ...root.querySelectorAll("div")];
  containers.forEach((c) => {
    const cr = c.getBoundingClientRect();
    if (cr.width < 120 || !visible(c) || getComputedStyle(c).display === "grid" || getComputedStyle(c).display === "flex") return;
    const kids = [...c.children].filter((k) => visible(k) && k.getBoundingClientRect().width > cr.width * 0.7 && k.matches(ROWLIKE + ",.seg,.grid2,.grid3,.ap-grid,.glance,.dial,.pre,.wg,.rrow,.vidbox") && !k.matches(".sep,.hint,.scrim,.edtb,.sh-h,.sec-h,.dprev"));
    if (kids.length < 2) return;
    const lefts = kids.map((k) => Math.round(k.getBoundingClientRect().left)),
      rights = kids.map((k) => Math.round(k.getBoundingClientRect().right));
    const mode = (arr) => arr.sort((a, b) => arr.filter((v) => v === b).length - arr.filter((v) => v === a).length)[0];
    const ml = mode([...lefts]),
      mr = mode([...rights]);
    kids.forEach((k, i) => {
      if (Math.abs(lefts[i] - ml) > 1 || Math.abs(rights[i] - mr) > 1) tag("alignment", k, `is ${lefts[i] - ml}px/${rights[i] - mr}px off the other rows (left/right)`);
    });
  });

  // Rows of tiles: the members of one grid row have the same height.
  root.querySelectorAll(GRIDS).forEach((g) => {
    if (!visible(g)) return;
    const kids = [...g.children].filter(visible);
    const byTop = {};
    kids.forEach((k) => (byTop[Math.round(k.getBoundingClientRect().top / 4)] ||= []).push(k));
    Object.values(byTop).forEach((row) => {
      if (row.length < 2) return;
      const hs = row.map((k) => Math.round(k.getBoundingClientRect().height));
      if (Math.max(...hs) - Math.min(...hs) > 1) tag("height", row[0], `shares a row with ${row.length - 1} tile(s) of other heights (${hs.join("/")}px)`);
    });
  });

  // Cut off, past the edge, icon not centred.
  root.querySelectorAll(".nm,.sb,.vl,.as-t,.as-b").forEach((el) => {
    if (visible(el) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== "ellipsis" && getComputedStyle(el).overflow !== "visible") tag("cut off", el, "text is cut off");
  });
  root.querySelectorAll(".pill,.sel,.rbtn,.gb,.sqw,.erow,.seg,.ap-grid,.glance").forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > rr.right + 1 || r.left < rr.left - 1) tag("overflow", el, `goes past the edge of its container by ${Math.round(Math.max(r.right - rr.right, rr.left - r.left))}px`);
  });
  root.querySelectorAll(".ic").forEach((el) => {
    const s = el.querySelector("svg");
    if (!s || !visible(el)) return;
    const a = el.getBoundingClientRect(),
      b = s.getBoundingClientRect();
    const dx = (a.left + a.width / 2) - (b.left + b.width / 2),
      dy = (a.top + a.height / 2) - (b.top + b.height / 2);
    if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) tag("icon", el, `icon is ${dx.toFixed(1)}/${dy.toFixed(1)}px off centre`);
  });

  // The icon picker's list: the icon of every row starts at the same place.
  root.querySelectorAll(".idd-list").forEach((l) => {
    const rows = [...l.children].filter((r) => r.classList.contains("idd-row") && visible(r));
    const lefts = rows.map((r) => Math.round(r.querySelector(".ic").getBoundingClientRect().left));
    const mode = lefts.sort((a, b) => lefts.filter((v) => v === b).length - lefts.filter((v) => v === a).length)[0];
    rows.forEach((r) => {
      const l0 = Math.round(r.querySelector(".ic").getBoundingClientRect().left);
      if (Math.abs(l0 - mode) > 1) tag("alignment", r, `its icon is ${l0 - mode}px off the others in the icon list`);
    });
  });

  // Overlaps: two controls drawn over each other (a trash button on a check, a label on an icon). A control inside another is not an overlap.
  const leaves = [...root.querySelectorAll(".rnd,.ck,.wg-ck,.ap-sb,.chev,.pill,.sel,.rbtn,.seg>*,.gb,.sqw,.erow,.edgrip,.hs")].filter(visible).filter((e) => !e.closest(".menu,.asheet,.scrim"));
  for (let i = 0; i < leaves.length; i++)
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i],
        b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(),
        rb = b.getBoundingClientRect(),
        ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left),
        oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 4 && oy > 4) {
        let fixed = false;
        for (let p = a; p && p !== document.body; p = p.parentElement) if (["fixed", "sticky"].includes(getComputedStyle(p).position)) fixed = true;
        if (!fixed) tag("overlap", a, `overlaps ${name(b)} by ${Math.round(ox)}×${Math.round(oy)}px`);
      }
    }

  // Touching: two controls or cards side by side or one above the other with less than 4px between them (a missing margin or padding). Members of a segmented control touch by design.
  const near = [...root.querySelectorAll(APART)].filter(visible).filter((e) => !e.closest(".menu,.asheet,.scrim,.seg,.edtb"));
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const a = near[i],
        b = near[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(),
        rb = b.getBoundingClientRect(),
        ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left),
        oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top),
        gx = Math.max(rb.left - ra.right, ra.left - rb.right),
        gy = Math.max(rb.top - ra.bottom, ra.top - rb.bottom);
      if ((oy > 4 && gx > -1 && gx < 4) || (ox > 4 && gy > -1 && gy < 4)) tag("touching", a, `touches ${name(b)} (${Math.round(Math.max(gx, gy))}px apart)`);
    }

  // Inside a list of rows: the icon, the text and the trailing control start and end at the same place in every row, and the icon is centred in its row.
  const lists = [root, ...root.querySelectorAll("div")].filter((c) => visible(c));
  lists.forEach((c) => {
    const all = [...c.children].filter((k) => visible(k) && k.matches(".pill,.sel,.erow,.sqw") && k.getBoundingClientRect().width > 120);
    ["pill", "sel", "erow", "sqw"].forEach((cl) => innerRows(all.filter((k) => k.classList.contains(cl))));
  });
  function innerRows(rows) {
    if (rows.length < 2) return;
    const lefts = (sel) => rows.map((r) => (r.querySelector(sel) && visible(r.querySelector(sel)) ? Math.round(r.querySelector(sel).getBoundingClientRect().left - r.getBoundingClientRect().left) : null));
    const rights = (sel) => rows.map((r) => (r.querySelector(sel) && visible(r.querySelector(sel)) ? Math.round(r.getBoundingClientRect().right - r.querySelector(sel).getBoundingClientRect().right) : null));
    const check = (what, arr) => {
      const vals = arr.filter((v) => v !== null);
      if (vals.length < 2) return;
      const mode = vals.sort((a, b) => vals.filter((v) => v === b).length - vals.filter((v) => v === a).length)[0];
      arr.forEach((v, i) => {
        if (v !== null && Math.abs(v - mode) > 1) tag("alignment", rows[i], `${what} is ${v - mode}px from where it is in the other rows`);
      });
    };
    check("its icon", lefts(".ic"));
    check("its text", lefts(".nm"));
    check("its trailing control", rights(".chev,.ck,.vl"));
    rows.forEach((r) => {
      const ic = r.querySelector(".ic");
      if (ic && visible(ic)) {
        const a = r.getBoundingClientRect(),
          b = ic.getBoundingClientRect(),
          d = a.top + a.height / 2 - (b.top + b.height / 2);
        if (Math.abs(d) > 2) tag("alignment", r, `its icon is ${d.toFixed(1)}px off the vertical centre of the row`);
      }
    });
  }

  // Gaps between consecutive rows of the page: the app's gap, or flagged.
  const sp = num(getComputedStyle(document.documentElement).getPropertyValue("--sp")) || 10;
  const rows = [...root.querySelectorAll(".pill,.sel,.sqw,.erow,.seg,.grid2,.grid3,.ap-grid,.ap-list,.ap-act,.ap-bar,.glance,.dial,.wg,.rrow")]
    .filter((el) => visible(el) && el.getBoundingClientRect().width > rr.width * 0.5 && !el.closest(".sh-h"))
    .filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const between = [...root.querySelectorAll(".sep,.hint,.sec-h,.as-t")].filter(visible).map((e) => e.getBoundingClientRect());
  for (let i = 1; i < rows.length; i++) {
    const top = rows[i - 1].getBoundingClientRect().bottom,
      bottom = rows[i].getBoundingClientRect().top;
    /* A heading or a hint between two rows is its own spacing, not a gap. */
    if (between.some((b) => b.top >= top - 1 && b.bottom <= bottom + 1)) continue;
    const gap = Math.round(bottom - top);
    if (gap < 0 ? gap < -1 : [0, sp, sp + 2, 12, 14].indexOf(gap) < 0 && Math.abs(gap - sp) > 4 && gap < 40) tag("gap", rows[i], `is ${gap}px below ${name(rows[i - 1])} (the app's gap is ${sp}px)`);
  }
  return out;
}

function sheetOf() {
  const l = document.querySelectorAll(".sheet");
  return l.length ? l[l.length - 1] : null;
}

/* Opens each surface in turn and audits it. A surface is { key } (a popup), { page } (a page of the dashboard), { menu: "<selector of a dropdown to open>" } or { fn } (opens something). */
export async function auditSurfaces(list, wait = 1500) {
  const findings = {},
    classes = {};
  for (const s of list) {
    const label = s.label || s.key || s.page || s.menu || "?";
    try {
      closeSheet();
      closeMenu(true);
      await sleep(450);
      let root;
      if (s.page) {
        go(s.page);
        await sleep(900);
        root = document.getElementById("body");
      } else if (s.fn) {
        await s.fn();
        await sleep(wait);
        root = sheetOf() || document.getElementById("body");
      } else {
        showPopup(s.key, true);
        await sleep(wait);
        root = sheetOf();
        if (s.menu) {
          const t = root && root.querySelector(s.menu);
          if (t) {
            t.click();
            await sleep(500);
            root = document.querySelector(".menu") || root;
          }
        }
      }
      /* `within` audits each element of the surface that matches it, and finding none is a failure (nothing was measured). */
      const roots = root && s.within ? [...root.querySelectorAll(s.within)] : root ? [root] : [];
      findings[label] = roots.length ? roots.flatMap((r) => auditLayout(r, classes)) : [s.within ? "nothing matched " + s.within : "no surface opened"];
    } catch (e) {
      findings[label] = ["error: " + (e && e.message)];
    }
  }
  closeSheet();
  return { findings, classes };
}

/* Puts devices of every kind on the living room page so their popups can be opened: an oven, a washer, a remote, a vacuum with extras, three wall photos. */
export async function prepareKit() {
  go("r_living");
  await sleep(700);
  const other = UI.layout.rooms.r_living.filter((s) => s.k === "other")[0];
  other.devs = other.devs || [];
  const ap = (type, name, aid, slots, extra) => {
    const d = apNew(type);
    d.name = name;
    d.aid = aid;
    Object.assign(d.ap.slots, slots);
    d.ap.extra = extra || [];
    other.devs.push(d);
  };
  ap("oven", "Oven", "apoven01", { program: "select.oven_program", temperature: "number.oven_setpoint_temperature", current: "sensor.oven_current_temperature", duration: "number.oven_duration", start: "button.oven_start", stop: "button.oven_stop", state: "sensor.oven_operation_state", progress: "sensor.oven_program_progress", remaining: "sensor.oven_remaining_program_time", door: "binary_sensor.oven_door" }, [{ e: "switch.washer_power", l: "Child lock" }, { e: "sensor.washer_program_progress", l: "Cooking progress" }]);
  ap("washer", "Washer", "apwash01", { program: "select.washer_program", state: "sensor.washer_operation_state", remaining: "sensor.washer_remaining_program_time", progress: "sensor.washer_program_progress", door: "binary_sensor.washer_door", start: "button.washer_start", stop: "button.washer_stop" });
  const rem = remoteNew();
  rem.rid = "rmtest01";
  rem.name = "Scenes remote";
  rem.rm.btns = [{ e: "script.movie_mode", l: "Movie", i: "media", s: 1 }, { e: "input_button.garage_door", l: "Garage", i: "info", s: 1, q: 1 }];
  other.devs.push(rem);
  const v = other.devs.filter((d) => d.kind === "vacuum")[0];
  if (v) v.vx = { rooms: [{ e: "button.hallway_clean_kitchen", l: "Kitchen" }], modes: ["select.hallway_mop_mode", "number.hallway_suction"], care: ["sensor.hallway_filter_left"] };
  const photo = (c1, c2) => {
    const cv = document.createElement("canvas");
    cv.width = 160;
    cv.height = 120;
    const x = cv.getContext("2d"),
      g = x.createLinearGradient(0, 0, 160, 120);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    x.fillStyle = g;
    x.fillRect(0, 0, 160, 120);
    return cv.toDataURL("image/jpeg", 0.7);
  };
  STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { wallPhotos: [photo("#e96", "#a42"), photo("#4a9", "#136"), photo("#69e", "#225")], wallOff: [1] }));
  uiChanged();
  refresh();
  await sleep(600);
}

const deviceKey = (match) => {
  let out = null;
  UI.layout.rooms.r_living.forEach((s) => (s.devs || []).forEach((d, i) => !out && (d.id === match || d.aid === match || d.rid === match) && (out = `~r_living~${s.id}:${i}`)));
  return out;
};

const deviceTab = (key, tab) => async () => {
  showPopup("manage-dev:" + key, true);
  await sleep(900);
  const b = [...document.querySelectorAll(".sheet .seg .rbtn")].filter((x) => x.textContent === tab)[0];
  if (b) {
    b.click();
    await sleep(450);
  }
};

/* The surfaces worth measuring: the pages, every kind of popup that exists, and the questions and menus. */
export function standardSurfaces({ full = true } = {}) {
  const pop = (...keys) => keys.map((key) => ({ key }));
  const list = [{ page: "home" }, { page: "r_living" }, { label: "edit-mode", fn: async () => { go("r_living"); await sleep(500); EDIT = true; render(); await sleep(900); } }];
  list.push(...pop("settings", "stg-access", "stg-areas", "stg-data", "stg-dev", "stg-effects", "stg-hist", "stg-notify", "stg-wall", "appearance", "manage-about", "manage-access", "manage-backup", "manage-bats", "manage-glance", "manage-header", "manage-names", "manage-new", "manage-wallphotos", "edit-page:r_living", "ed-order:r_living", "sec-types:r_living", "manage-sec:r_living:lights", "manage-sec:r_living:scenes", "manage-details:r_living", "areas", "search", "scene-new:r_living", "g-lights", "g-tvs"));
  ["light.living_room", "light.gradient_tube", "media_player.living_tv", "camera.door_station", "vacuum.hallway", "apoven01", "rmtest01"].forEach((id) => {
    const k = deviceKey(id);
    if (k) (full ? ["Look", "Options", "Placement", "More"] : ["Look", "Options"]).forEach((t) => list.push({ label: `dev:${id}:${t}`, fn: deviceTab(k, t) }));
  });
  list.push(...pop("ap-edit:apoven01", "appliance:apoven01", "appliance:apwash01", "remote:rmtest01", "remote-btn:rmtest01:0", "lgroup:light.living_room", "light:light.desk_lamp", "light:light.gradient_tube", "media:media_player.living_tv", "vac:vacuum.hallway"));
  /* The Showcase page: every device of it, its settings and its popup. */
  if (UI.layout.rooms.showcase) {
    list.push({ page: "showcase" });
    UI.layout.rooms.showcase.forEach((s) =>
      (s.devs || []).forEach((d, i) => {
        list.push({ label: `showcase:${d.name}:settings`, key: `manage-dev:~showcase~${s.id}:${i}` });
        const pop = devPop(d);
        if (pop) list.push({ label: `showcase:${d.name}:popup`, key: pop });
      }),
    );
  }
  list.push({ key: "kwiz:" + deviceKey("media_player.living_tv") });
  list.push({ label: "lgnew", fn: async () => { LGNEW = { rid: "~r_living~lights", lights: ["light.desk_lamp", "light.shelf_strip"] }; showPopup("lgnew", true); } });
  list.push({ key: "manage-add:~r_living~lights", label: "add:lights" }, { key: "manage-add:~r_living~lights", menu: ".sel.selrow", label: "add:type-menu" });
  list.push({ label: "icon-picker", fn: async () => { showPopup("manage-dev:" + deviceKey("light.gradient_tube"), true); await sleep(1000); const b = document.querySelector(".sheet .idd > .pill"); if (b) { b.click(); await sleep(700); } } });
  list.push({ label: "confirm", fn: async () => confirmDlg("Delete the group Reading corner?", () => {}, "Delete") }, { label: "unsaved", fn: async () => askSheet("Unsaved changes", [{ label: "Save" }, { label: "Discard changes" }]) }, { label: "keyboard", fn: async () => kbDlg(() => {}) });
  return list;
}

/* The markup of each surface, for comparing two versions of the code: a change that should not alter what a popup looks like leaves these the same. Ids that change between runs are left out. */
const hash = (t) => {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return t.length + ":" + (h >>> 0).toString(36);
};

export async function snapshotSurfaces(list, wait = 900) {
  const out = {};
  for (const s of list) {
    const label = s.key || s.page || s.menu || s.label || "?";
    try {
      closeSheet();
      closeMenu(true);
      await sleep(450);
      if (s.fn) await s.fn();
      else if (s.page) go(s.page);
      else showPopup(s.key, true);
      await sleep(wait);
      const root = s.page ? document.getElementById("body") : sheetOf();
      out[label] = root ? hash(root.outerHTML.replace(/\s(style|id)="[^"]*"/g, "").replace(/class="([^"]*)"/g, (m, c) => 'class="' + c.split(" ").filter((t) => !["in", "open", "tabin"].includes(t)).join(" ") + '"')) : "none";
    } catch (e) {
      out[label] = "error: " + e.message;
    }
  }
  closeSheet();
  return out;
}
