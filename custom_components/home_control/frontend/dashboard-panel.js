/* Loader for the Dashboard panel. Home Assistant gives this element its `hass` object; everything else is loaded from this folder.
 version.json is read fresh on every start; its number is put on every file below, so an update only needs that number raised, and its list of files is requested together with the rest. */
const BASE = new URL(".", import.meta.url);

const MARKUP = `<main><div class="wrap">
 <div class="hdr pane"><div><div class="eyebrow">Dashboard</div><div class="trow"><div class="title" id="tt"></div></div><div class="hchips" id="hch"></div></div><div class="rt"><div class="hb"><div class="rnd pane" id="sbtn" role="button" aria-label="Search"></div><div class="rnd pane" id="gbtn" role="button" aria-label="Settings and appearance" style="display:none"></div></div><div class="clock"><div id="clk"></div><div id="dt"></div></div></div></div>
 <div id="body"><div class="skl"><i></i><i></i><i></i></div></div>
</div></main>
<nav class="dock pane" id="dock"></nav>`;

const SCRIPTS = ["ha-adapter.js", "camera-stream.js", "dashboard-app.js"];

/* The version, and the application's files in the order they run. */
async function readRelease() {
  const res = await fetch(new URL("version.json?t=" + Date.now(), BASE), { cache: "no-store" });
  if (!res.ok) throw new Error("version.json answered " + res.status);
  const release = await res.json();
  if (!Array.isArray(release.files)) throw new Error("version.json lists no files");
  return { version: String(release.version), files: release.files };
}

/* A request lost on a weak connection is asked again, a little later each time, before the panel gives up. Nothing has run yet at this point, so asking again is safe. */
const RELEASE_RETRY_MS = [500, 1500, 4000];

async function currentRelease() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readRelease();
    } catch (e) {
      if (attempt >= RELEASE_RETRY_MS.length) throw e;
      await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_MS[attempt]));
    }
  }
}

/* Asks for a script now and keeps it for the script element that runs it later. */
function preload(href) {
  const el = document.createElement("link");
  el.rel = "preload";
  el.as = "script";
  el.href = href;
  document.head.appendChild(el);
}

function load(tag, attrs) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    el.onload = resolve;
    el.onerror = () => reject(new Error("Unable to load " + (attrs.src || attrs.href)));
    (tag === "link" ? document.head : document.body).appendChild(el);
  });
}

class DashboardPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._started = false;
  }

  /* Home Assistant gives the panel its config: the version of the integration, shown in Settings. */
  set panel(value) {
    window.HC_RELEASE = String((value && value.config && value.config.release) || "");
  }

  set hass(value) {
    this._hass = value;
    if (window.HA) window.HA.attach(value);
    if (this.isConnected) this._start();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._start();
  }

  /* Says what failed and offers to start again; the page is reloaded, because files that did run cannot be run twice. */
  _showFailure(error) {
    const body = document.getElementById("body") || this;
    body.textContent = "Dashboard could not start: " + error.message + " ";
    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "Try again";
    again.onclick = () => location.reload();
    body.appendChild(again);
  }

  async _start() {
    if (this._started || !this._hass) return;
    this._started = true;
    try {
      const { version: v, files } = await currentRelease();
      const asset = (name) => new URL(name + "?v=" + v, BASE).href;

      const viewport = document.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width,initial-scale=1";
      document.head.appendChild(viewport);
      document.documentElement.lang = "en";
      /* Everything is requested at once, here; what runs is run below in order, from what has already arrived, while the registries load. */
      const styles = load("link", { rel: "stylesheet", href: asset("dashboard.css") });
      SCRIPTS.concat(files).forEach((name) => preload(asset(name)));
      window.APP_FILES = files;
      await styles;
      this.innerHTML = MARKUP;

      await load("script", { src: asset(SCRIPTS[0]) });
      /* Attaching starts loading the registries; the application's files run meanwhile, and the application waits for the registries itself before it draws. */
      window.HA.attach(this._hass);
      for (const name of SCRIPTS.slice(1)) await load("script", { src: asset(name) });
      window.HA.onUpdate(() => window.refresh());
      window.refresh();
    } catch (e) {
      this._showFailure(e);
      console.error("[dashboard]", e);
    }
  }
}

customElements.define("dashboard-panel", DashboardPanel);
