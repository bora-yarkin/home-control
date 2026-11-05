# Dashboard panel

A Home Assistant custom panel (`panel_custom`, `embed_iframe: true`). It shows and controls the home; it does not replace
Home Assistant. Anything that Home Assistant does well (automations, helpers, groups, templates) stays there.

## Files

| File | What it is |
| --- | --- |
| `dashboard-panel.js` | The panel element Home Assistant loads. Reads `version.json`, requests every file at once, runs them in order, passes `hass` on. |
| `ha-adapter.js` | The only code that talks to Home Assistant. No other file sends a websocket message, calls a REST path or reads the connection; everything else calls `window.HA`. |
| `camera-stream.js` | Live camera playback: WebRTC, then HLS, with black-picture and stall recovery. Uses `HA.camera`. |
| `dashboard-app.js` | The entry of the application. It runs the files below, in the order of `files` in `version.json`. |
| `app/*.js` | The application, split by feature (`lights.js`, `vacuum.js`, `editor.js`, ...). They share one global scope and run in the order of `files` in `version.json`; the first line of each file says what it holds. `app/main.js` is last and starts the app. They reach Home Assistant only through `window.HA` and integration specifics only through `window.Integrations`. |
| `app/lighteditor.js` | The light popup as part of an editor: opens the dashboard's own light popup (colour wheel, groups separated into single lights, effects) with a tick in place of the close button; a tick keeps what the lights show, leaving any other way puts them back. Used by the classic scene editor. |
| `app/scenenew.js` | Making a scene: the + of a scenes section (administrators), the question classic or live, the areas of a live scene, and `guardUnsaved`, the Save / Discard question every editor asks before changes are lost. |
| `app/staticmaker.js` | Classic scenes: the editor (a light opens the light popup, other devices slide open in place, live scenes can be added), saving, deleting. |
| `app/vlights.js` | Lights that exist only in the dashboard: the Colors light of the live scene maker and its colours (up to 10), which answer to the light popup like a light made of zones. `core.js` reads them before Home Assistant's states and `callRaw` gives them the commands meant for them. |
| `app/huemenu.js` | The Hue Plus menu in Settings, laid out like the settings of the Hue app (see *Hue Plus in Settings*). `hueplus.js` keeps what it shares with the area editor. |
| `app/livemaker.js` | The live scene maker: the light popup with the Colors light, the lights of the chosen areas, the effects and settings of the whole scene, preview and saving. `livescenes.js` keeps playing, sharing with Hue Plus and the scene's popup. |
| `app/kinds.js` | Guided setup of a device that has other entities (a TV's remote, a camera's second stream, pan/tilt, privacy and detection entities): finds them by itself, offers a searchable list for the rest, keeps the links with the device, and says whether a TV gets the full or the basic remote. Add a kind of device in `DEVSETUP`. |
| `integrations.js` | Everything that is specific to one integration (xiaomi_miot, robot_vacuum_map, samsungtv_smart, apple_tv, androidtv_remote, hue, hue_plus sync module, hue_plus sync box). It draws nothing and reads nothing from the page. |
| `dashboard.css` | Styles. |
| `mdi/` | Material Design Icons 7.4.47 (Apache 2.0, see `mdi/LICENSE.txt`): `index.json` is the list the icon picker searches, `a.json` to `z.json` hold the drawing paths by first letter. Same data as the npm package `@mdi/svg@7.4.47`. Nothing is fetched from the internet or from Home Assistant's own files. |
| `vendor/hls.min.js` | hls.js 1.5.13, loaded only when HLS is needed. Same bytes as cdnjs (`sha512-bqtMkEqGSOPPb8qbYSd9gHwR7C5mgmN+Z5Uaquvhana/U9H3zppGvlLV9HOdM7eYHF/GzzhS1lOGzCMhUvYcjQ==`, source map comment removed). |
| `version.json` | `{"version": N, "files": [...]}`. Raise N after changing any other file. `files` lists the files `dashboard-app.js` runs, in order; the panel requests them all together with the stylesheet while the registries load. |

## Updating

1. Edit the file(s).
2. Raise `version` in `version.json`. Every file, including the ones `dashboard-app.js` loads, is requested as `file?v=N`, and `version.json` itself is fetched with a unique
   address each time, so browsers and Cloudflare never serve an old file.
3. Reload the panel.

To add a file, put it in `app/` and add it to `files` in `version.json` (a test fails when the two differ); no change to the panel configuration is needed.

`dashboard-panel.js` is requested by Home Assistant itself with the `?v=` from `panel_custom` in `configuration.yaml`.
Only a change to this one file needs that number raised (and a Home Assistant restart).

## What it needs from Home Assistant

When entities belong to the `hue_plus` integration, `ha-adapter.js` leaves an entity of the `hue` integration out of the registry it hands to the panel when a Hue Plus entity with the same domain and unique id stands in for it (`withoutHue`); a Hue entity Hue Plus has none for stays. This holds whether Hue Plus hid and renamed the Hue entities or left them alone and ended its own in `_plus`. Hue Plus's scenes are then the Hue scenes, started with `hue_plus.activate_scene`.

If an update to Home Assistant breaks the panel, these are the only places to look, and every one is used only from
`ha-adapter.js`.

From the `hass` object that Home Assistant gives a custom panel: `states`, `services`, `config`, `user`, `locale`,
`connected`, `callService`, `callApi` (the REST paths below) and `connection` (`sendMessagePromise`, `subscribeMessage`,
`subscribeEvents`, `addEventListener`).

Websocket commands:

- `config/entity_registry/list`, `config/device_registry/list`, `config/area_registry/list`, `config/floor_registry/list`
- events `entity_registry_updated`, `device_registry_updated`, `area_registry_updated`, `floor_registry_updated`
- `frontend/get_user_data`, `frontend/set_user_data`, `frontend/get_system_data`, `frontend/set_system_data`, `frontend/subscribe_system_data` (dashboard changes made by anyone arrive as they happen and are applied to the open page in place; nothing reloads or rebuilds the page)
- `history/history_during_period`, `logbook/get_events`, `recorder/statistics_during_period`
- `config/auth/list` (administrators only)
- `camera/webrtc/get_client_config`, `camera/webrtc/offer`, `camera/webrtc/candidate`, `camera/stream`
- `auth/sign_path` (a camera intercom's Listen button plays the stream at `ix.listen` from an address signed for a minute)
- `call_service` with `return_response` (`HA.serviceResponse`; xiaomi_miot only, see below)

REST: `POST` and `DELETE` `config/automation/config/<id>` (notification rules; the same call the automation editor makes) and `config/script/config/<id>` (the room-off scripts, see below),
`/api/camera_proxy/<entity>?token=` (snapshot behind the live picture).

What the adapter offers the rest of the panel: `HA.hass()` (a plain-data view of Home Assistant plus `callService`, not the `hass` object itself), `HA.data.get/set`, `HA.history`,
`HA.logbook`, `HA.statistics`, `HA.users`, `HA.entityRegistry`, `HA.serviceResponse`, `HA.onConnection`, `HA.camera.*`,
`HA.route`, `HA.automations`.

Services called: `light`, `switch`, `fan`, `climate`, `cover`, `lock`, `siren`, `vacuum`, `media_player`, `remote`, `scene`,
`number`, `select`, `button`, `homeassistant.update_entity`.

## Integration-specific parts (`integrations.js`)

When an integration changes a service or an attribute, fix it in this file only.

- **xiaomi_miot** (robot vacuum): `xiaomi_miot.call_action` and `xiaomi_miot.get_properties` with the vacuum's own `siid`/`piid`/`aiid`
  numbers (room settings, room cleaning, no-go zones, virtual walls), the `vacuum_extend.room_info` attribute, and its
  "stop and go charge" button.
- **robot_vacuum_map**: the map image entity and its `calibration_points`, plus the `_vacuum_position` sensor.
- **samsungtv_smart**: `media_player.play_media` with type `send_text` (typing on the TV). The built-in `samsungtv` has none,
  so the keyboard button only shows for `samsungtv_smart` entities.
- **apple_tv**: `apple_tv.set_keyboard_text`.
- **androidtv_remote**: only the remote layout; commands go out as `remote.send_command`.

## Spotify sync (`hue_plus sync module`, optional)

The Spotify sync popup (`app/hsync.js`) needs the separate `hue_plus sync module` custom integration. It opens from that integration's
switch (`devPop` returns `hsync:<switch>`), and finds the rest of its entities by their registry `unique_id` (`<account>_<key>`,
keys: `sync`, `now_playing`, `brightness`, `light_delay`, `intensity`, `palette`, `style`, `area`; see `Integrations.huesync`).
It reads:

- the switch (state `on`/`off`/`unavailable`) and `switch.turn_on` / `turn_off`;
- the `now_playing` sensor: state = track name, attributes `artists`, `album`, `album_art_url` (shown only when it is an
  `https://*.scdn.co/` address), `is_playing`, `playback_device`;
- the `number` entities `brightness` (1-100) and `light_delay` (whole seconds, 0-10) with `number.set_value`;
- the `select` entities `intensity`, `palette`, `style`, `area` (attribute `options`; the palette also has `colors`, a map from palette
  name to [r,g,b] lists; the area also has `light_ids`, the Hue ids of the lights in the chosen area) with `select.select_option`.

The switch is shown as a light-style row (`hsyncRow`, also offered under the Lights chip of the add list), and while it is on, the lights
of its area (matched by the Hue id: a Hue light's registry `unique_id`, or the `hue_light_id` of a Hue gradient zones light) show as on and
playing in their rows. The "turn all lights off" button of a Lights section only sends the entities that are lights.

## Scene engine (`scene_engine`, optional)

Live scenes and Hue scene import need the Philips Hue Plus integration (scenes module). Nothing else in the panel does.

- **Needs it:** starting, stopping, pausing and freezing a live scene, the live-scene editor's changes while it runs, "identify"
  on the area editor, and importing a Hue scene (`scene_engine.start`, `stop`, `play`, `freeze`, `update`, `identify`, and
  `read_hue_scene` with a response). Live scenes are also shown as running from its `sensor.*` entities.
- **Setup:** install and add the integration in Home Assistant; the panel finds it by its sensors and needs no setting of its own.
- **Without it:** the panel works as usual; live scenes and Hue import show "Scene engine is not installed" when used, and
  ordinary scenes, lights and everything else are unaffected.

## The address bar

The panel runs in a frame that Home Assistant owns. The current page is kept in the `#` part of Home Assistant's address using
`window.parent` (`HA.route`). If the parent is not reachable it falls back to `sessionStorage`.

## Stored data

Pages, rooms and devices are in Home Assistant system data `dashboard`; per-user options in user data `dashboard_prefs`.
Local preferences use `localStorage` keys beginning `db_` and `dh_`.

## Hue Play HDMI Sync Box (`hue_plus`, optional)

`app/hsbox.js` draws the box like the Spotify sync: a row that looks like a light (the bar is the brightness, the icon starts and stops
the sync) and a popup, both made of the shared controls only. The user adds the box's sync switch to a page like any device. Its entities are
found by their registry `unique_id` (`<box>_syncbox_<key>`, keys: `sync`, `mode`, `source`, `intensity`, `brightness`, `hdmi_signal`; see
`Integrations.huesyncbox`). The box's brightness runs from 0 to 200, where 100 is the lights' normal brightness.

## Hue Plus in Settings (`hue_plus`, optional)

`app/huemenu.js` is the Settings category *Hue Plus*, shown only when the integration is installed with its bridge module. It is laid out like the settings of the Hue app:
a first page of labelled groups (*In this home*: Devices, Bridges, MotionAware areas, Entertainment areas, Routines and automations, Smart home, Software update;
*Advanced*: Applications), then one page for each: lights as tiles (a tap opens the dashboard's light popup, the gear the light's set-up), the set-up of a light (function, power
on, orientation, timed effects), switches (each button's press and long press as in the Hue app: scene cycle, single scene, brighten, dim, lights off, do nothing, smart on/off), the bridge (status, id, software, settings), software update (firmware of the bridge and of each device, automatic updates),
Matter, applications, routines, entertainment areas (what the lights do when a sync stops) and MotionAware areas. A choice is a checklist page (`hue-fn`, `hue-pw`, `hue-or`, `hue-od`,
`hue-end`). The pieces are `hmRow`, `hmGroup`, `hmLabel`, `hmTitle`, `hmInfo`, `hmButton`, `hmCallout`, `hmChips` and the tiles, all drawn under the `.hm` class in `dashboard.css`, so nothing else on the dashboard
changes; names and values from a device or the bridge are always set as text. Lists the bridge itself holds come from `hue_plus.get_resources` (`Integrations.hueplus.resources`); everything
else from the integration's entities, found by their registry `unique_id` (`Integrations.hueplus.bridge/lights/forLight/updates`). Pages are keyed `stg-hue` and `hue-*` in `HP_PAGES`. What is
experimental in the integration (light set-up, streaming, the end state of an area) says so on its page. `app/hueplus.js` keeps what the menu and the area editor share (is Hue Plus there,
asking the bridge, the exchange of areas with the bridge).

### Areas and the bridge's entertainment areas

The bridge's area page (Hue Plus → Entertainment areas → an area) has *Light placement*: the placement editor opens on the bridge's own area (`hpEditOnBridge`): its lights are the Hue Plus lights, there are no things in the room, each light has a brightness balance, and *Save to the bridge* writes the area through `hue_plus.update_entertainment_area`. A light of the area that Home Assistant has no entity for is kept and sent back unchanged. The bridge's `y` runs the other way round from the editor's (`hpFlip`), so a light is turned over on the way in and on the way out. Nothing in the dashboard's own areas changes.

The dashboard's areas (Settings → Areas) hold any light and work without Hue Plus. When Hue Plus runs next to the Hue integration it says so in `get_library` (`hue_only`) and the area editor then offers Hue Plus's lights only. With it installed (administrators only) a room's list of areas gets
*Import from the Hue bridge* (a bridge area opens in the editor as a new area, with the lights that are in the room), and the editor gets *Send to the Hue bridge*
(the area's Hue lights and positions go to the bridge's area of the same name, or a new one; other lights stay on the dashboard) and *Read from the Hue bridge*
(positions for the lights already there). The code is in `app/hueplus.js`; `areas.js` only calls `hpAreaImport` and `hpAreaActions`.

## Trying a change

`tests/frontend/harness/` runs the real panel against a pretend Home Assistant that writes nothing; see its README.

## Everything off in a room (`app/roomoff.js`)

A round power button sits first in the header's group of buttons (before search and settings) on every room's page that has something to switch off. It turns off every device on that room's pages (lights, media players, climate, fans, switches; hidden devices are left out; a light group and its lights count once), stops live scenes on those lights, and respects each person's view-only and confirm settings like a scene does.

The dashboard also keeps one script per room in Home Assistant, `script.home_control_<room id>_off` (the room id is the one in the dashboard's layout, for example `r_living_room`), built from the same list, so an automation, a physical button or a voice assistant can run it. An administrator's dashboard writes the scripts when it starts and 3 seconds after any layout change: it reads each script first and writes only what differs, creates a missing one, and removes the script of a room that is gone or empty, but only one whose description carries the dashboard's mark (`home_control_room_off`). Edit the room's devices in the dashboard, not the script: changes made to the script are overwritten.

