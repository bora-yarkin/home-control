/* The plugin API (version 1): what a plus integration's own script uses to add pages to the dashboard (decision D-13, `docs/plugin-api.md`).
 An integration that declares a `menu` script in its home_control.json has it loaded for administrators; the script finds `window.HomeControl` and uses nothing else of the
 dashboard. Every function is looked up when it is called, so the order the dashboard's files load in never matters. */

/* Pages a plugin registered: key -> [title (a string key), icon, builder(body, id)]. A key may carry an id after a colon ("hue-light:light.desk_lamp"). */
var PLUGIN_PAGES = {};

/* Categories of Settings a plugin registered: id -> { title, icon, page, sub(), visible(), keywords }. */
var PLUGIN_SETTINGS = {};

/* What a plugin does in the area editor, by plugin id: { importRow(box, room), actions(box, draft), lights(), save(leave) }. An area a plugin owns (one it opened
 with `areas.openExternal`) is edited with its `lights` and saved with its `save`. */
var PLUGIN_AREA = {};

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
        document.head.appendChild(s);
      });
    },
    function () {}
  );
}
