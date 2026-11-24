/* Exports a snapshot of your own home for the harness ("Your own home" in README.md): run this in the console of the Home Assistant page (any dashboard page; you must be signed in as an administrator) while
   `python3 tests/frontend/harness/snapshot_receiver.py` is waiting. It only reads: the states, the entity, device and area registries, the dashboard's saved data (its layout, scenes and settings), the plugins'
   answers, and the service names. It leaves out what looks secret (access tokens, coordinates, addresses, network names) and posts the result to your own computer, 127.0.0.1 port 8768; it is written to
   tests/frontend/harness/local/home.json, which git does not track. Nothing here is committed or sent anywhere else. */
(async () => {
  const hass = document.querySelector("home-assistant").hass;
  const once = (msg) => hass.connection.sendMessagePromise(msg).catch(() => null);
  /* A registry that comes back empty is asked for again once. */
  const ws = async (msg) => (await once(msg)) ?? (await once(msg));
  const SECRET_KEYS = /^(access_token|token|api_key|apikey|password|secret|latitude|longitude|gps_accuracy|ssid|bssid|mac|mac_address|ip_address|wan_ip|lan_ip|ip|host)$/i;
  const SECRET_ENTITIES = /(wan_ip|lan_ip|_ssid|mac_address|ip_address|_bssid)/i;
  const clean = (attrs) => {
    const out = {};
    for (const [k, v] of Object.entries(attrs || {})) {
      if (SECRET_KEYS.test(k)) continue;
      out[k] = k === "entity_picture" && typeof v === "string" ? v.replace(/([?&])(token|access_token)=[^&]*/g, "$1").replace(/[?&]$/, "") : v;
    }
    return out;
  };
  const states = Object.values(hass.states).map((s) => ({
    entity_id: s.entity_id,
    state: SECRET_ENTITIES.test(s.entity_id) || s.entity_id.startsWith("device_tracker.") ? "unknown" : s.state,
    attributes: clean(s.attributes),
    last_changed: s.last_changed,
    last_updated: s.last_updated,
    context: {},
  }));
  const service = (domain, name, data = {}) => ws({ type: "call_service", domain, service: name, service_data: data, return_response: true }).then((r) => (r && r.response) || null);
  const userData = async (scope, key) => (await ws({ type: `frontend/get_${scope}_data`, key }))?.value ?? null;
  const services = {};
  for (const [domain, list] of Object.entries(hass.services || {})) services[domain] = Object.fromEntries(Object.keys(list).map((n) => [n, {}]));
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    states,
    entities: await ws({ type: "config/entity_registry/list" }),
    devices: await ws({ type: "config/device_registry/list" }),
    areas: await ws({ type: "config/area_registry/list" }),
    floors: await ws({ type: "config/floor_registry/list" }),
    config: { unit_system: hass.config.unit_system, time_zone: hass.config.time_zone, language: hass.config.language },
    user: { is_admin: !!hass.user.is_admin, is_owner: !!hass.user.is_owner },
    locale: hass.locale,
    services,
    system: { dashboard: await userData("system", "dashboard"), dashboard_log: await userData("system", "dashboard_log") },
    userData: { dashboard_prefs: await userData("user", "dashboard_prefs") },
    plugins: await ws({ type: "home_control/plugins" }),
    effects: await ws({ type: "home_control/effects" }),
    library: await service("home_control", "get_library"),
    hueResources: hass.services.hue_plus ? await service("hue_plus", "get_resources") : null,
  };
  const body = JSON.stringify(snapshot);
  const r = await fetch("http://127.0.0.1:8768/", { method: "POST", body, headers: { "content-type": "text/plain" } });
  return `${r.status} ${await r.text()} (${states.length} states, ${(snapshot.entities || []).length} entities, ${body.length} bytes)`;
})();
