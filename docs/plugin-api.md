# The plugin API (version 1)

A "plus" integration expands what Home Control does for the lights of one brand (decision D-13): Hue Plus is the first. This page is for writing one. Nothing is
imported in either direction: the integration declares itself in a file and provides services, and, to add pages to the dashboard, serves one script.

## `home_control.json`

A file of that name in the integration's folder (`custom_components/<domain>/home_control.json`), read when Home Control starts. See
`custom_components/home_control/live/providers.py` for every field and what it checks.

```json
{
  "schema": 1,
  "name": "Govee Plus",
  "lights": { "govee_plus": { "group": "govee", "rate": 10.0, "effects": true, "parent": "_segment_[0-9]+$" } },
  "effects": ["aurora"],
  "play_effect": "play_effect",
  "set_effect": "set_effect",
  "menu": { "url": "/govee_plus_static/menu.js" },
  "replaces": [],
  "separate_zones": {"service": "set_style", "field": "light", "data": {"style": "segmented"}},
  "catalogue": { "groups": [], "effects": [] }
}
```

| Field | What it does |
|---|---|
| `lights` | Which entity registry platforms are this brand's, how many commands per second their hub takes (`rate`, shared by a `group`), whether their own effects can be played through your service (`effects`), and how to cut the unique id of a part of a light (a gradient segment) to get the light's (`parent`). |
| `effects`, `play_effect` | The ids of the effects that can be played *with a colour*, and your service (`entity_id`, `effect`, `xy`, `brightness`, `speed`) that plays one. Live scenes use it. |
| `set_effect` | Your service (`lights`, `effect`, `hs_color` or `kelvin`, `speed`) that starts an effect with a colour and a speed. The effects page uses it. |
| `catalogue` | The effects' groups, labels, pictures, defaults and colour variants, in the syntax of `docs/effects-file.md` (pictures, `art`, are allowed here). |
| `separate_zones` | How to make every zone of a strip (a light made of zones) a light of its own, for a brand whose bridge blends some zones in some styles: `{service, field, data}`, the service of yours to call, the field that takes the entity id of one of the strip's zones, and its other data (Hue Plus: `set_style`, `light`, `{"style": "segmented"}`). A live scene plays all the zones of a strip in order, as separate lights next to each other, and calls it first when some of them are unavailable. The strip's zones are the lights of your platform whose unique id, with your `parent` pattern cut from it, is the strip's. |
| `replaces` | The integrations whose entities yours makes its own entity for (the same domain and unique id): the dashboard shows only yours, and leaves out an entity of a replaced integration when an enabled one of yours stands in for it. One yours has no entity for stays. Hue Plus: `["hue"]`. |
| `menu` | The script below. Its url must be a `.js` file under `/<domain>_static/`, which your integration serves itself (`hass.http.async_register_static_paths`). Anything else is refused. |

A declaration with a mistake is ignored and logged: it never stops Home Control. Without a plus integration Home Control plays every light through `light.turn_on` and shows
the effects the light reports.

## The script

Home Control loads the script of each loaded plus integration **for administrators only**, once, when the dashboard opens. It runs in the dashboard's page with the signed-in
administrator's access, as any custom integration's code does on the Home Assistant side: only install integrations you trust. The script uses the dashboard only through
`window.HomeControl`; if `HomeControl.version` is not `1`, do nothing.

```js
(function () {
  var HC = window.HomeControl;
  if (!HC || HC.version !== 1) return;
  HC.addStrings({ gv_title: "Govee Plus" });
  HC.registerPage("gv-home", "gv_title", "lights", function (body, id) {
    body.appendChild(HC.row("lights", "A row", { sub: function () { return "what it says"; }, tap: function () { HC.toast("tapped"); } }));
  });
  HC.registerSettings({ id: "govee", title: "gv_title", icon: "lights", page: "gv-home", visible: function () { return HC.isAdmin; } });
})();
```

### What `HomeControl` offers

| | |
|---|---|
| `version` | `1`. |
| `hass()` | The state of Home Assistant: `states`, `services`, `config`, `user`, `entities` (the registry, by entity id), `devices`, `areas`, `callService`. |
| `attrs(id)`, `state(id)`, `isOn(id)`, `registry(id)` | The attributes, the state, whether it is on, and the registry entry of an entity. |
| `isAdmin` | Whether the person is an administrator. |
| `call(domain, service, data)`, `callRaw(...)`, `toggle(id)`, `toast(text)`, `refresh()` | Calling a service (shows an error when it fails), switching an entity, a message, drawing the page again. |
| `el(tag, class, html)`, `icon(name)`, `row(icon, name, options)`, `count(n, one, many)`, `confirm(text, fn)` | Building a page the way the dashboard does (the same rows, icons and questions). |
| `open(key, layer)`, `back()`, `closeLayer()` | Opening a registered page (a layer over this one when `layer` is true; a key may carry an id after a colon), going back, closing the layers. |
| `guard({dirty, save, discard, done, inner})`, `popGuard`, `sheet` | Making a page one that asks "Unsaved changes" when it is left with changes that are not saved, with the checkmark next to the close button. |
| `t(key)`, `addStrings({key: text})` | The dashboard's text for a key, and adding yours (a key that exists is not replaced). |
| `registerPage(key, titleKey, icon, builder(body, id))` | A page. `titleKey` is a text key, or a function of the id that returns the title. |
| `registerSettings({id, title, icon, page, sub(), visible(), keywords})` | A category in Settings (and its search). |
| `registerAreaHooks(plugin, {importRow(box, room), actions(box, draft), lights(), save(leave), lightRows()})` | What the area editor shows for areas your integration owns (a bridge's own areas). |
| `areas.open(room, area, seed)`, `areas.openExternal(plugin, draft, extra)`, `areas.editor`, `areas.rebuild()`, `areas.roomLights(room)`, `areas.clamp(v)`, `areas.identifyOff()` | The area editor: opening it on a new area (or one made from a draft), on an area your integration owns (`extra` holds the integration's own `id`, a `note` shown at the top and anything else it wants back), reading what is being edited, drawing it again. |

### Making your own scenes, devices and lights part of the dashboard

Registered once when your script runs. The dashboard asks them whenever it draws the thing they are about; each answers only for entities it owns.

| | |
|---|---|
| `registerSceneKind({match(id), icon, popup, active(id), toggle(id), start(id), dynamic(id), palette(id, done)})` | Scene entities your integration owns (Hue's). They are listed with the room's scenes, the icon switches one on or off (`toggle`), a tap opens the page named by `popup` (a page you registered; it gets `<scene id>` or `<scene id>~<room id>`), and the light panel shows them as tiles (`start` runs one, `dynamic` says whether it plays by itself, `palette(id, done)` calls `done` with CSS colours for the tile). |
| `registerSceneImport({id, title, sub, unavailable, empty, failed, available(), list(), read(id)})` | A place a live scene can be imported from: `list()` gives `[{id, name, group}]`, `read(id)` a promise of `{name, palette, speed (0 to 1), brightness (1 to 255), lights}` (the palette entries are `{xy: [x, y]}` or `{k: kelvin}`, with `b` when dimmer than full). The texts are keys of your own strings. The dashboard offers *Import a live scene* in a scenes section, makes the list page and opens its editor with the result. |
| `scenes.importFrom(sourceId, sceneId)` | The same import, started from a page of yours. |
| `registerDeviceKind({match(id), pop, icon, search, row(device)})` | A switch your integration makes into something else (Hue's Spotify sync): `row(device)` is the row in the Lights section, `pop` the page a tap opens, `icon` the icon in the device lists and `search` the domain the device lists file it under. |
| `registerPlayback({plays(id)})` | What plays on a light that the light does not report itself: `plays(id)` gives `{entity, label, pct()}` (the switch that stops it, the words to show, the brightness) or `null`. While it does, the light's row shows the stop button. |
| `registerLightStyle({applies(id), icon(id), popup(body, id), blends(id)})` | A style button on the light panel for a light made of zones, when `applies(id)` is true; `popup` is the page the button opens. `blends(id)` (optional) says whether the zones are drawn blended into a line (the default) or each as a colour of its own. |
| `scenes.hidden(room, sceneId)`, `scenes.setHidden(room, sceneId, hide)`, `room(id)`, `editing()` | The rooms' hidden scenes (the administrator's choice, kept with the room), a room by its id, and whether the page is being edited. |
| `serviceResponse(domain, service, data)` | A service call that gives a response, as a promise. |
| `addStyles(css)` | Adds styles to the page. Name your classes with a prefix of your own. |
| `ui.attachSlide`, `ui.briControl`, `ui.callLive`, `ui.cap`, `ui.closeSheet`, `ui.cssRgb`, `ui.cssToRgb`, `ui.deviceGet`, `ui.deviceSet`, `ui.dom`, `ui.dropRow`, `ui.ic`, `ui.inkRow`, `ui.kelvinRgb`, `ui.lightMembers`, `ui.liveStopOn`, `ui.liveXyRgb`, `ui.pinPop`, `ui.pop`, `ui.sep`, `ui.sliderRow`, `ui.switchPill`, `ui.pageFill` | The controls and helpers the dashboard's own pages are made of, so a plugin's page looks and behaves the same: sliders and brightness controls, a light's colour, a drop-down row, the section heading, pinning a page. Read the dashboard's sources (`frontend/app/widgets.js`, `core.js`, `lights.js`) for what each takes; they change only with a new `version`. |

A later version of the API adds to this list and changes nothing in it; one that has to change something increments `version`.

## What Hue Plus does with it

`frontend/src` in the Hue Plus repository is the real example: its menu, its entertainment-area editing, Hue's scenes, the Spotify sync and sync box, the gradient styles and their texts, built into one `menu.js`.
