/* Icons: the built-in icon set, drawing an icon, loading Material Design Icons from ./mdi, and the icon picker. */

var IC = {
  light:
    "<path d='M9 18h6M10 21h4'/><path d='M8 14a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z'/>",
  lamp: "<path d='M8 21h8M12 21v-6'/><path d='M7 15h10l-2-9H9z'/>",
  floor: "<path d='M12 21v-9M9 21h6'/><path d='M7 12l2-8h6l2 8z'/>",
  ceiling: "<path d='M12 3v4'/><path d='M4 14l3-7h10l3 7z'/><path d='M9 18v1M12 18v2M15 18v1'/>",
  strip: "<path d='M3 8h18v8H3z'/><path d='M6 11v2M10 11v2M14 11v2M18 11v2'/>",
  tv: "<rect x='3' y='5' width='18' height='12' rx='2'/><path d='M8 21h8'/>",
  apps: "<rect x='4' y='4' width='6.500' height='6.500' rx='1.500'/><rect x='13.500' y='4' width='6.500' height='6.500' rx='1.500'/><rect x='4' y='13.500' width='6.500' height='6.500' rx='1.500'/><rect x='13.500' y='13.500' width='6.500' height='6.500' rx='1.500'/>",
  apple:
    "<g transform='translate(2.4 2.4) scale(.8)' stroke-width='2'><path d='M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'/></g>",
  speaker:
    "<rect x='6' y='3' width='12' height='18' rx='3'/><circle cx='12' cy='14' r='3'/><path d='M10 7h4'/>",
  ac: "<path d='M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9'/>",
  fan: "<circle cx='12' cy='12' r='1.8'/><path d='M12 10.2C12 6 14.5 4 17 5.2c-.8 2.6-2.4 4-5 5zM13.8 12c4.2 0 6 2.5 4.8 5-2.6-.8-4-2.4-4.8-5zM12 13.8c0 4.2-2.5 6-5 4.8.8-2.6 2.4-4 5-4.8zM10.2 12c-4.2 0-6-2.5-4.8-5 2.6.8 4 2.4 4.8 5z'/>",
  purifier: "<rect x='5' y='3' width='14' height='18' rx='3'/><circle cx='12' cy='12' r='3'/>",
  scene:
    "<circle cx='12' cy='12' r='9'/><circle cx='9' cy='10' r='1.4'/><circle cx='14.5' cy='8.8' r='1.4'/><circle cx='15.5' cy='14.5' r='1.4'/>",
  vac: "<circle cx='12' cy='12' r='8'/><circle cx='12' cy='12' r='3'/>",
  cam: "<rect x='3' y='7' width='13' height='10' rx='2'/><path d='M16 11l5-3v8l-5-3'/>",
  printer: "<rect x='5' y='9' width='14' height='8' rx='2'/><path d='M8 9V4h8v5M8 17v3h8v-3'/>",
  plug: "<rect x='6' y='5' width='12' height='14' rx='3'/><path d='M10 9v2M14 9v2M10 15h4'/>",
  battery: "<rect x='7' y='6' width='10' height='15' rx='2'/><path d='M10 3h4v3h-4z'/>",
  cog: "<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/>",
  sparkle:
    "<path d='M9 3l1.8 4.7L15.5 9.5l-4.7 1.8L9 16l-1.8-4.7L2.5 9.5l4.7-1.8z'/><path d='M18 13l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z'/>",
  bright:
    "<circle cx='12' cy='12' r='4'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'/>",
  thermo: "<path d='M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z'/>",
  palette:
    "<path d='M12 3a9 9 0 1 0 0 18c1.500 0 2-1 1.500-2s0-2 1.500-2h2a4 4 0 0 0 4-4c0-5-4-10-9-10z'/><circle cx='8' cy='10' r='1'/><circle cx='12' cy='7' r='1'/><circle cx='16' cy='10' r='1'/>",
  power: "<path d='M12 3v8'/><path d='M7 6.500a8 8 0 1 0 10 0'/>",
  mute: "<path d='M4 9v6h4l5 4V5L8 9z'/><path d='M17 9l5 6M22 9l-5 6'/>",
  volup:
    "<path d='M4 9v6h4l5 4V5L8 9z'/><path d='M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11'/>",
  voldown: "<path d='M4 9v6h4l5 4V5L8 9z'/><path d='M16 9a4 4 0 0 1 0 6'/>",
  back: "<path d='M19 12H5M11 6l-6 6 6 6'/>",
  home: "<path d='M4 11l8-7 8 7v9H4z'/>",
  playpause: "<path d='M4 5l6 7-6 7zM14 5v14M19 5v14'/>",
  chup: "<path d='M6 15l6-6 6 6'/>",
  chdown: "<path d='M6 9l6 6 6-6'/>",
  prev: "<path d='M6 5v14M18 5L8 12l10 7z'/>",
  next: "<path d='M18 5v14M6 5l10 7-10 7z'/>",
  play: "<path d='M7 5l12 7-12 7z'/>",
  pause: "<path d='M8 5v14M16 5v14'/>",
  stop: "<rect x='6' y='6' width='12' height='12' rx='1'/>",
  tune: "<path d='M4 7h10M18 7h2M4 17h4M12 17h8'/><circle cx='16' cy='7' r='2'/><circle cx='10' cy='17' r='2'/>",
  swap: "<path d='M7 7h12l-3-3M17 17H5l3 3'/>",
  wrench: "<path d='M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z'/>",
  rec: "<circle cx='12' cy='12' r='6'/>",
  mic: "<rect x='9' y='3' width='6' height='11' rx='3'/><path d='M5 11a7 7 0 0 0 14 0M12 18v3'/>",
  walk: "<circle cx='13' cy='5' r='2'/><path d='M12 21l2-7-3-3 2-3 3 3h3M9 14l-2 7'/>",
  motion: "<circle cx='12' cy='12' r='2'/><path d='M6 12a6 6 0 0 1 12 0M3 12a9 9 0 0 1 18 0'/>",
  person: "<circle cx='12' cy='8' r='4'/><path d='M4 20c1-4 4-6 8-6s7 2 8 6'/>",
  restart: "<path d='M20 12a8 8 0 1 1-3-6.200M20 4v5h-5'/>",
  undo: "<path d='M9 14 4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 0 1 0 11H11'/>",
  axis: "<path d='M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3'/>",
  clock: "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>",
  lock: "<rect x='5' y='11' width='14' height='9' rx='2'/><path d='M8 11V8a4 4 0 0 1 8 0v3'/>",
  bell: "<path d='M6 17h12l-1.500-2V11a4.500 4.500 0 0 0-9 0v4z'/><path d='M10 20a2 2 0 0 0 4 0'/>",
  playc: "<circle cx='12' cy='12' r='9'/><path d='M10 8l6 4-6 4z'/>",
  broom: "<path d='M14 4l6 6M12 6l6 6-8 8H4v-6z'/>",
  rug: "<rect x='3' y='7' width='18' height='10' rx='1'/><path d='M3 10h18M3 14h18'/>",
  repeat: "<path d='M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4'/>",
  pin: "<circle cx='12' cy='10' r='3'/><path d='M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z'/>",
  filter: "<path d='M4 6h16l-6 7v6l-4-2v-4z'/>",
  sofa: "<path d='M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12h18v6H3z'/>",
  bed: "<path d='M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6'/>",
  bedking: "<path d='M3 19V6M21 19V6M3 14h18M6 14v-3h5v3M13 14v-3h5v3'/>",
  bedsingle: "<path d='M4 19V7M4 14h16v5M20 14v-2a3 3 0 0 0-3-3H9v5'/>",
  lights:
    "<path d='M9 18h6M10 21h4'/><path d='M8 14a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z'/>",
  media: "<rect x='3' y='5' width='18' height='12' rx='2'/><path d='M8 21h8'/>",
  moon: "<path d='M20 14A8 8 0 1 1 10 4a6.500 6.500 0 0 0 10 10z'/>",
  up: "<path d='M12 19V5M6 11l6-6 6 6'/>",
  down: "<path d='M12 5v14M6 13l6 6 6-6'/>",
  left: "<path d='M19 12H5M11 6l-6 6 6 6'/>",
  right: "<path d='M5 12h14M13 6l6 6-6 6'/>",
  cctv: "<path d='M3 8l12-3 2 6-12 3zM17 10l4-1M9 15v4h6'/>",
  chev: "<path d='M6 9l6 6 6-6'/>",
  close: "<path d='M6 6l12 12M18 6L6 18'/>",
  info: "<circle cx='12' cy='12' r='9'/><path d='M12 11v6M12 7.500v.5'/>",
  sd: "<path d='M7 3h8l4 4v14H7z'/><path d='M10 7v3M13 7v3'/>",
  flood: "<path d='M4 6h16v4H4zM8 14l-2 6M12 14v6M16 14l2 6'/>",
  camoff: "<path d='M4 7h11v10H4zM15 11l5-3v8l-5-3M3 3l18 18'/>",
  target: "<circle cx='12' cy='12' r='8'/><circle cx='12' cy='12' r='3'/>",
  drop: "<path d='M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z'/>",
  keyboard:
    "<rect x='2' y='6' width='20' height='12' rx='2'/><path d='M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10'/>",
  expand: "<path d='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
  minus: "<path d='M5 12h14'/>",
  edit: "<path d='M4 20l4-1 11-11-3-3L5 16z'/><path d='M14 6l3 3'/>",
  trash: "<path d='M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'/>",
  eye: "<path d='M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z'/><circle cx='12' cy='12' r='3'/>",
  eyeoff:
    "<path d='M3 3l18 18'/><path d='M10.6 6.2A9.5 9.5 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.4 7.9A16.6 16.6 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4-.9'/><path d='M9.9 9.9a3 3 0 0 0 4.2 4.2'/>",
  check: "<path d='M5 12l5 5 9-10'/>",
  drag: "<path d='M5 8h14M5 12h14M5 16h14'/>",
  search: "<circle cx='11' cy='11' r='7'/><path d='M20 20l-4-4'/>",
  alert: "<path d='M12 4l9 16H3z'/><path d='M12 10v4M12 17v.5'/>",
  leave: "<path d='M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10'/>",
  movie:
    "<rect x='3' y='6' width='18' height='12' rx='2'/><path d='M3 10h18M8 6l-2 4M13 6l-2 4M18 6l-2 4'/>",
  powerset: "<path d='M12 3v8'/><path d='M7 6.500a8 8 0 1 0 10 0'/>",
  note: "<path d='M9 18V5l11-2v13'/><circle cx='6' cy='18' r='3'/><circle cx='17' cy='16' r='3'/>",
  syncring: "<path d='M17.500 6.500a8 8 0 1 0 2.300 5.500'/><circle cx='12' cy='12' r='3'/>",
  eq: "<path d='M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4'/>",
  pulsebars: "<path d='M4 12h.01M8 9v6M12 12h.01M16 6v12M20 12h.01'/>",
  wave1: "<path d='M2 12c2.500-1.500 4.500-1.500 7 0s4.500 1.500 7 0 4.500-1.500 6 0'/>",
  wave2: "<path d='M2 12c2.500-3 4.500-3 7 0s4.500 3 7 0 4.500-3 6 0'/>",
  wave3: "<path d='M2 12c2.500-5 4.500-5 7 0s4.500 5 7 0 4.500-5 6 0'/>",
  wave4: "<path d='M2 12c1.200-8 2.300-8 3.500 0s2.300 8 3.500 0 2.300-8 3.500 0 2.300 8 3.500 0 2.300-8 3.500 0'/>",
};

var ICON_RE = /^(mdi:[a-z0-9-]{1,50}|custom:[a-z0-9_-]{1,24})$/;

function iconOk(n) {
  return typeof n === "string" && (!!IC[n] || ICON_RE.test(n));
}

function pathOk(d) {
  return (
    typeof d === "string" && d.length >= 8 && d.length <= 4000 && /^[0-9A-Za-z\s.,+-]+$/.test(d)
  );
}

function svg(n) {
  if (IC[n]) return "<svg viewBox='0 0 24 24'>" + IC[n] + "</svg>";
  var p = STORE.icons && STORE.icons[n];
  if (p && pathOk(p))
    return "<svg viewBox='0 0 24 24'><path fill='currentColor' stroke='none' d='" + p + "'/></svg>";
  return "<svg viewBox='0 0 24 24'>" + IC.info + "</svg>";
}

function ic(n) {
  return "<span class='ic'>" + svg(n) + "</span>";
}

var ICONSHARD = {};

function iconShard(key) {
  var c = /^[a-z]/.test(key) ? key[0] : "0";
  return (
    ICONSHARD[c] ||
    (ICONSHARD[c] = fetch(appFile("mdi/" + c + ".json")).then(function (r) {
      if (!r.ok) throw new Error("missing");
      return r.json();
    }))
  );
}

function iconFetchPath(name) {
  if (ICONPATH[name]) return Promise.resolve(ICONPATH[name]);
  var key = name.slice(4);
  return iconShard(key).then(function (shard) {
    var d = shard[key];
    if (!pathOk(d)) throw new Error("missing");
    ICONPATH[name] = d;
    return d;
  });
}

var ICONQ = [],
  ICONBUSY = 0,
  ICONLOADING = null;

function iconPump() {
  while (ICONBUSY < 6 && ICONQ.length) {
    (function (j) {
      ICONBUSY++;
      iconFetchPath(j[0])
        .then(j[1], j[2])
        .then(function () {
          ICONBUSY--;
          iconPump();
        });
    })(ICONQ.shift());
  }
}

function iconPathQ(name) {
  return new Promise(function (res, rej) {
    ICONQ.push([name, res, rej]);
    iconPump();
  });
}

function iconListLoad(cb) {
  if (ICONLIST) return cb(ICONLIST);
  if (ICONLOADING) {
    ICONLOADING.push(cb);
    return;
  }
  ICONLOADING = [cb];
  fetch(appFile("mdi/index.json"))
    .then(function (r) {
      return r.json();
    })
    .then(function (l) {
      ICONLIST = (Array.isArray(l) ? l : [])
        .filter(function (x) {
          return Array.isArray(x) && typeof x[0] === "string" && /^[a-z0-9-]{1,50}$/.test(x[0]);
        })
        .map(function (x) {
          return { name: x[0], kw: String(x[1] || "") };
        });
    })
    .catch(function () {
      ICONLIST = [];
    })
    .then(function () {
      var q = ICONLOADING;
      ICONLOADING = null;
      q.forEach(function (f) {
        f(ICONLIST);
      });
    });
}

/* The built-in icons are named in one word; these are the words they stand for. */
var ICONNAMES = {
  ac: "Air conditioner",
  bedking: "Bed king",
  bedsingle: "Bed single",
  cam: "Camera",
  camoff: "Camera off",
  cctv: "CCTV",
  chdown: "Channel down",
  chev: "Chevron",
  chup: "Channel up",
  eyeoff: "Eye off",
  mic: "Microphone",
  playc: "Play circle",
  playpause: "Play pause",
  powerset: "Power set",
  prev: "Previous",
  rec: "Record",
  sd: "SD card",
  thermo: "Thermometer",
  tv: "TV",
  vac: "Vacuum",
  voldown: "Volume down",
  volup: "Volume up",
};

function iconLabel(n) {
  var s = String(n)
    .replace(/^(mdi|custom):/, "")
    .replace(/[-_]+/g, " ");
  s = ICONNAMES[s] || s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function iconSvg(p) {
  return "<svg viewBox='0 0 24 24'><path fill='currentColor' stroke='none' d='" + p + "'/></svg>";
}

var ICONLIST = null,
  ICONPATH = {};

function iconPick(list, cur, fn) {
  var wrap = mk("div", "idd"),
    isOpen = false,
    items = [],
    view = [],
    shown = 0,
    io = null,
    q = "";
  var btn = mk("div", "pill pane");
  function paintBtn() {
    btn.innerHTML =
      ic(cur && iconOk(cur) ? cur : "info") +
      "<span class='tx'><span class='nm'></span><span class='sb'></span></span><span class='chev'>" +
      svg("chev") +
      "</span>";
    btn.querySelector(".nm").textContent = cur ? iconLabel(cur) : _T("choose_an_icon");
    btn.querySelector(".sb").textContent = _T("tap_to_see_all_icons");
  }
  paintBtn();
  var panel = mk("div", "idd-panel pane");
  panel.style.display = "none";
  var sw = mk("div", "sqw pane", svg("search")),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.placeholder = _T("search_icons");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  sw.appendChild(inp);
  panel.appendChild(sw);
  var listEl = mk("div", "idd-list");
  panel.appendChild(listEl);
  var foot = mk("div", "idd-foot"),
    addBtn = mk("div", "idd-add");
  addBtn.textContent = _T("add_your_own_icon");
  foot.appendChild(addBtn);
  panel.appendChild(foot);
  var form = mk("div");
  form.style.display = "none";
  foot.appendChild(form);
  var ni = mk("input", "sq"),
    pi = mk("input", "sq");
  ni.type = "text";
  ni.maxLength = 24;
  ni.placeholder = _T("icon_name_like_garage");
  pi.type = "text";
  pi.placeholder = _T("path_data_of_a_24_by_24_svg_icon");
  [ni, pi].forEach(function (x) {
    var w2 = mk("div", "sqw pane");
    w2.appendChild(x);
    form.appendChild(w2);
  });
  var go2 = mk("div", "rbtn pane");
  go2.textContent = _T("add_and_use_this_icon");
  form.appendChild(go2);
  addBtn.addEventListener("click", function () {
    form.style.display = form.style.display === "none" ? "" : "none";
  });
  go2.addEventListener("click", function () {
    var nm = ni.value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24),
      d = pi.value.trim();
    if (!nm) {
      toast(_T("give_the_icon_a_name"));
      return;
    }
    if (!pathOk(d)) {
      toast(_T("that_path_data_isn_t_valid"));
      return;
    }
    STORE.icons = STORE.icons || {};
    if (Object.keys(STORE.icons).length >= 300) {
      toast(_T("too_many_extra_icons_remove_some_fir"));
      return;
    }
    STORE.icons["custom:" + nm] = d;
    done("custom:" + nm);
  });
  function done(n) {
    cur = n;
    fn(n);
    if (!IC[n]) storeChanged();
    paintBtn();
    close();
  }
  function choose(n) {
    if (IC[n] || (STORE.icons && STORE.icons[n])) return done(n);
    iconFetchPath(n)
      .then(function (p) {
        STORE.icons = STORE.icons || {};
        if (Object.keys(STORE.icons).length >= 300) {
          toast(_T("too_many_extra_icons_remove_some_fir"));
          return;
        }
        STORE.icons[n] = p;
        done(n);
      })
      .catch(function () {
        toast(_T("couldn_t_load_that_icon"));
      });
  }
  function build() {
    var seen = {};
    items = [];
    function add(n, kw) {
      if (seen[n]) return;
      seen[n] = 1;
      items.push({ n: n, kw: kw || "" });
    }
    list.forEach(function (n) {
      add(n);
    });
    Object.keys(IC).forEach(function (n) {
      add(n);
    });
    Object.keys(STORE.icons || {}).forEach(function (n) {
      add(n);
    });
    (ICONLIST || []).forEach(function (x) {
      add("mdi:" + x.name, x.kw);
    });
    filter();
  }
  function filter() {
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    view = toks.length
      ? items.filter(function (it) {
          var h = it.n.toLowerCase() + " " + it.kw;
          return toks.every(function (k) {
            return h.indexOf(k) >= 0;
          });
        })
      : items;
    shown = 0;
    listEl.innerHTML = "";
    listEl.scrollTop = 0;
    if (!view.length) {
      var e = mk("div", "hint");
      e.textContent = _T("no_icons_found");
      listEl.appendChild(e);
    }
    more();
  }
  function more() {
    var end = Math.min(view.length, shown + 60);
    for (var i = shown; i < end; i++) listEl.appendChild(row(view[i].n));
    shown = end;
  }
  function row(n) {
    var r = mk("div", "idd-row" + (n === cur ? " sel" : "")),
      p = (STORE.icons && STORE.icons[n]) || ICONPATH[n],
      g = mk("span", "ic", IC[n] ? svg(n) : p ? iconSvg(p) : svg("info")),
      l = mk("span", "idd-n");
    l.textContent = iconLabel(n);
    r.appendChild(g);
    r.appendChild(l);
    r.dataset.n = n;
    r.addEventListener("click", function () {
      choose(n);
    });
    if (!IC[n] && !p && io) io.observe(r);
    return r;
  }
  listEl.addEventListener("scroll", function () {
    if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 160 && shown < view.length)
      more();
  });
  if (window.IntersectionObserver)
    io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          var n = e.target.dataset.n;
          iconPathQ(n)
            .then(function (p) {
              var g = e.target.querySelector(".ic");
              if (g) g.innerHTML = iconSvg(p);
            })
            .catch(function () {
              e.target.style.opacity = ".4";
            });
        });
      },
      { root: listEl }
    );
  inp.addEventListener("input", function () {
    q = inp.value;
    filter();
  });
  function openIt() {
    isOpen = true;
    panel.style.display = "";
    build();
    iconListLoad(function () {
      if (isOpen) {
        build();
      }
    });
    setTimeout(function () {
      try {
        inp.focus();
        panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (e) {}
    }, 60);
  }
  function close() {
    isOpen = false;
    panel.style.display = "none";
    if (io) io.disconnect();
  }
  btn.addEventListener("click", function () {
    if (isOpen) close();
    else openIt();
  });
  wrap.appendChild(btn);
  wrap.appendChild(panel);
  return wrap;
}

function cleanIcons(m) {
  var o = {};
  if (m && typeof m === "object")
    Object.keys(m)
      .slice(0, 300)
      .forEach(function (k) {
        if (ICON_RE.test(k) && pathOk(m[k])) o[k] = m[k];
      });
  return o;
}
