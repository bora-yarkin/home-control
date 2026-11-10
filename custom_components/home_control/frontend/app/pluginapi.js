/* The plugin API (version 1): what a plus integration's own script uses to add pages to the dashboard (decision D-13, `docs/plugin-api.md`).
 An integration that declares a `menu` script in its home_control.json has it loaded for administrators; the script finds `window.HomeControl` and uses nothing else of the
 dashboard. Every function is looked up when it is called, so the order the dashboard's files load in never matters. */

/* Pages a plugin registered: key -> [title (a string key, or a function of the id that gives the text), icon, builder(body, id)]. A key may carry an id after a colon ("hue-light:light.desk_lamp"). */
var PLUGIN_PAGES = {};

/* Categories of Settings a plugin registered: id -> { title, icon, page, sub(), visible(), keywords }. */
var PLUGIN_SETTINGS = {};

/* What a plugin does in the area editor, by plugin id: { importRow(box, room), actions(box, draft), lights(), save(leave) }. An area a plugin owns (one it opened
 with `areas.openExternal`) is edited with its `lights` and saved with its `save`. */
var PLUGIN_AREA = {};

/* Scene entities a plugin owns (Hue's): { match(id), icon, popup (a page key), active(id), toggle(id), start(id), dynamic(id), palette(id, done) }. The dashboard lists them
 with the room's scenes, runs them and shows their popup; what a scene does is the plugin's. */
var PLUGIN_SCENE_KINDS = [];

/* Ways of making a scene a plugin offers in the new-scene popup: { id, title, sub (string keys), icon, available(scope), start(scope, target) }. `scope` is the page's key (a room or "home"), `target` { scope, sid } the section the scene goes in. */
var PLUGIN_SCENE_MAKERS = [];

/* Places a scene can be imported from: { id, title, sub (string keys), available(), list(): [{id, name, group}], read(id): a promise of { name, palette, speed, brightness, lights } }. With classic: true the scene becomes a classic scene and read(id) gives { name, lights: [{ entity_id, on, brightness (1 to 255), xy or k }] }. */
var PLUGIN_SCENE_IMPORTS = [];

/* Devices of a kind the dashboard does not know, shown as rows of the Lights section: { match(id), pop (a page key), row(device), search (a domain) }. */
var PLUGIN_DEVICE_KINDS = [];

/* What plays on a light that the light itself does not say (Hue's Spotify sync): { plays(id): { entity, label, pct } or null }. */
var PLUGIN_PLAYBACK = [];

/* A style a light panel offers for some lights (Hue's gradient styles): { applies(id), icon(id): svg markup, popup(body, id), blends(id) (optional: whether the zones are drawn blended into a line, the default) }. */
var PLUGIN_STYLES = [];

function pluginFind(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].match(id)) return list[i];
  return null;
}

function pluginSceneKind(id) {
  return pluginFind(PLUGIN_SCENE_KINDS, id);
}

function pluginDeviceKind(id) {
  return id ? pluginFind(PLUGIN_DEVICE_KINDS, id) : null;
}

/* The playback a plugin reports on a light: { entity, label, pct } or null. */
function pluginPlays(id) {
  for (var i = 0; i < PLUGIN_PLAYBACK.length; i++) {
    var p = PLUGIN_PLAYBACK[i].plays(id);
    if (p) return p;
  }
  return null;
}

function pluginStyle(id) {
  for (var i = 0; i < PLUGIN_STYLES.length; i++) if (PLUGIN_STYLES[i].applies(id)) return PLUGIN_STYLES[i];
  return null;
}

function pluginLate(name) {
  return function () {
    return window[name].apply(null, arguments);
  };
}

function pluginAreaEach(hook, a, b) {
  Object.keys(PLUGIN_AREA).forEach(function (id) {
    if (typeof PLUGIN_AREA[id][hook] === "function") PLUGIN_AREA[id][hook](a, b);
  });
}

/* The hooks of the plugin that owns the area being edited. */
function pluginAreaOwner() {
  return (EAD && EAD.external && PLUGIN_AREA[EAD.external.plugin]) || {};
}

window.HomeControl = {
  version: 1,
  /* What is known: the state of Home Assistant (states, services, config, user, entities, devices, areas), the attributes and the state of an entity, whether it is on. */
  hass: pluginLate("H"),
  /* The dashboard's own text for a key. */
  t: pluginLate("_T"),
  attrs: pluginLate("A"),
  state: pluginLate("V_"),
  isOn: pluginLate("isOn"),
  registry: pluginLate("reg"),
  get isAdmin() {
    return !!window.ISADMIN;
  },
  /* What is done: a service call (call shows an error, callRaw gives a promise-like result), toggling an entity, a message, redrawing the page. */
  call: pluginLate("call"),
  callRaw: pluginLate("callRaw"),
  toggle: pluginLate("toggleEnt"),
  toast: pluginLate("toast"),
  refresh: pluginLate("refresh"),
  /* How a page is drawn: an element with a class, an icon, a row, how many ("3 lights"), a question. */
  el: pluginLate("mk"),
  icon: pluginLate("svg"),
  row: pluginLate("pill"),
  count: pluginLate("cntS"),
  confirm: pluginLate("confirmDlg"),
  /* Pages: open one (a layer over this one when the second argument is true), go back, close the layers, and guard changes that are not saved (see docs/plugin-api.md). */
  open: pluginLate("showPopup"),
  back: pluginLate("popBack"),
  closeLayer: pluginLate("closeLayer"),
  guard: pluginLate("guardUnsaved"),
  get sheet() {
    return window.SHEET;
  },
  get popGuard() {
    return window.POPGUARD;
  },
  set popGuard(value) {
    window.POPGUARD = value;
  },
  /* Whether the administrator is editing the page. */
  editing: pluginLate("editing"),
  /* Controls and helpers the dashboard's own pages are made of, for plugin pages that look and behave the same. */
  ui: {
    attachSlide: pluginLate("attachSlide"),
    briControl: pluginLate("briControl"),
    callLive: pluginLate("callLive"),
    cap: pluginLate("cap"),
    closeSheet: pluginLate("closeSheet"),
    cssRgb: pluginLate("cssRgb"),
    cssToRgb: pluginLate("cssToRgb"),
    deviceGet: pluginLate("deviceGet"),
    deviceSet: pluginLate("deviceSet"),
    dom: pluginLate("dom"),
    dropRow: pluginLate("dropRow"),
    ic: pluginLate("ic"),
    inkRow: pluginLate("inkRow"),
    kelvinRgb: pluginLate("kelvinRgb"),
    lightMembers: pluginLate("lightMembers"),
    liveStopOn: pluginLate("liveStopOn"),
    liveXyRgb: pluginLate("liveXyRgb"),
    pinPop: pluginLate("pinPop"),
    pop: pluginLate("pop"),
    sep: pluginLate("sep"),
    sliderRow: pluginLate("sliderRow"),
    switchPill: pluginLate("switchPill"),
    get pageFill() {
      return window.PAGEFILL;
    },
  },
  /* The dashboard's rooms and scenes. */
  room: pluginLate("roomById"),
  serviceResponse: function (domain, service, data) {
    return HA.serviceResponse(domain, service, data);
  },
  scenes: {
    /* A scene entity hidden from a room's page (the administrator's choice, kept with the room). */
    hidden: pluginLate("sceneEntHidden"),
    setHidden: pluginLate("sceneEntSetHidden"),
    /* Imports a live scene from a registered source into the live scene editor. */
    importFrom: pluginLate("liveImportFrom"),
    /* The light popup of several lights as an editor: `{ name, icon, lights, onSave(acts), after }`. The lights follow every change; the checkmark calls onSave with what each light shows (see app/lighteditor.js). */
    editLights: pluginLate("openLightsEditor"),
    /* The lights of a page (a room's, or the home's), by the page's key. */
    roomLights: pluginLate("scopeLights"),
  },
  /* The area editor, for a plugin that owns areas of its own. */
  areas: {
    roomLights: pluginLate("eaRoomLights"),
    /* Opens the editor on a new area of a room, or on one that exists; seed is a draft to start from. */
    open: pluginLate("eaOpen"),
    clamp: pluginLate("eaClamp"),
    identifyOff: pluginLate("eaIdentifyOff"),
    rebuild: function () {
      eaBuild();
      eaTray();
      eaInfo();
      eaActions();
    },
    get editor() {
      return window.EAD;
    },
    /* Opens the editor on an area the plugin owns: draft is { id, name, lights, dummies }, note is shown at the top, and `plugin` is the id the hooks are registered under. */
    openExternal: function (plugin, draft, extra) {
      window.EAD = { room: "", isNew: false, sel: null, draft: draft, external: Object.assign({ plugin: plugin }, extra || {}) };
      showPopup("area-edit", true);
    },
  },
  /* Registration. */
  addStrings: function (dict) {
    Object.keys(dict).forEach(function (k) {
      if (EN[k] === undefined) EN[k] = dict[k];
    });
  },
  registerPage: function (key, titleKey, icon, builder) {
    PLUGIN_PAGES[key] = [titleKey, icon, builder];
  },
  registerSettings: function (def) {
    PLUGIN_SETTINGS[def.id] = def;
    var at = CATS.length - 1; /* before the last one (Backup and about) */
    CATS.splice(at, 0, [def.id, _T(def.title), def.page, def.icon, def.visible || null]);
    STG_INDEX.push([_T(def.title), def.keywords || "", def.id, null]);
  },
  /* Adds a plugin's own styles to the page. */
  addStyles: function (css) {
    var el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
  },
  registerSceneKind: function (def) {
    PLUGIN_SCENE_KINDS.push(def);
  },
  registerSceneMaker: function (def) {
    PLUGIN_SCENE_MAKERS.push(def);
  },
  registerSceneImport: function (def) {
    PLUGIN_SCENE_IMPORTS.push(def);
  },
  registerDeviceKind: function (def) {
    PLUGIN_DEVICE_KINDS.push(def);
  },
  registerPlayback: function (def) {
    PLUGIN_PLAYBACK.push(def);
  },
  registerLightStyle: function (def) {
    PLUGIN_STYLES.push(def);
  },
  registerAreaHooks: function (plugin, hooks) {
    PLUGIN_AREA[plugin] = hooks;
  },
};

/* ---- loading the plugins' scripts ---- */

var PLUGINS_LOADED = {};

/* Loads the script of each plus integration that has one, once, for administrators only: what a plugin adds is for the people who change things. */
function pluginsLoad() {
  if (!ISADMIN) return;
  HA.plugins().then(
    function (list) {
      (Array.isArray(list) ? list : []).forEach(function (p) {
        if (PLUGINS_LOADED[p.id] || !/^\/[a-z0-9_]+_static\/[A-Za-z0-9_.\/-]+\.js$/.test(p.menu) || p.menu.indexOf("..") >= 0) return;
        PLUGINS_LOADED[p.id] = true;
        var s = document.createElement("script");
        s.src = p.menu + (p.version ? "?v=" + encodeURIComponent(p.version) : "");
        s.async = false;
        /* What the plugin registered (scenes, devices, styles) was not there when the page was first drawn: draw it again once it is. */
        s.onload = function () {
          if (BOOTED) rerender();
        };
        document.head.appendChild(s);
      });
    },
    function () {}
  );
}
