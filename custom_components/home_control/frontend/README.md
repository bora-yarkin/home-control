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
| `app/lighteditor.js` | The light popup as part of an editor: opens the dashboard's own light popup (colour wheel, groups separated into single lights, effects) as a layer; its checkmark keeps what the lights show in the scene, and closing after a change asks whether to keep it or put the lights back. Used by the classic scene editor. |
| `app/scenenew.js` | Making a scene: the + of a scenes section (administrators), the question classic or live, the areas of a live scene, and `guardUnsaved`, the one rule for everything that saves (see *Saving*). |
| `app/staticmaker.js` | Classic scenes: the editor (a light opens the light popup, other devices slide open in place, live scenes can be added), saving, deleting. |
| `app/vlights.js` | Lights that exist only in the dashboard: the Colors light of the live scene maker and its colours (up to 10), which answer to the light popup like a light made of zones. `core.js` reads them before Home Assistant's states and `callRaw` gives them the commands meant for them. |
| `app/livemaker.js` | The live scene maker: the light popup with the Colors light, the lights of the chosen areas, the effects and settings of the whole scene, preview and saving. `livescenes.js` keeps playing, sharing with Hue Plus and the scene's popup. |
| `app/kinds.js` | Guided setup of a device that has other entities (a TV's remote, a camera's second stream, pan/tilt, privacy and detection entities): finds them by itself, offers a searchable list for the rest, keeps the links with the device, and says whether a TV gets the full or the basic remote. Add a kind of device in `DEVSETUP`. |
| `integrations.js` | Everything that is specific to one integration (xiaomi_miot, robot_vacuum_map, samsungtv_smart, apple_tv, androidtv_remote). It draws nothing and reads nothing from the page. |
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

A plus integration can declare in `home_control.json` that its entities replace another integration's (`replaces`; Hue Plus: `["hue"]`). `ha-adapter.js` then leaves an entity of the replaced integration out of the registry it hands to the panel when an enabled entity of the plus integration with the same domain and unique id stands in for it (`withoutReplaced`); one it has no entity for stays. This holds whether the plus integration hid and renamed the original entities or left them alone and ended its own in `_plus`. Home Control tells the adapter what each integration replaces (`home_control/plugins`); if it cannot, nothing is left out.

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

## Live scenes (Home Control's own integration)

Live scenes and areas are played by Home Control's integration for every light (`live/`, decision D-12); the panel keeps no engine of its own.

- **Services:** `home_control.scene_start`, `scene_update`, `scene_freeze`, `scene_play`, `scene_stop`, `scene_save`, `scene_delete`, `area_save`,
  `area_delete`, `locate_light` ("identify" on the area editor) and `get_library`. Running scenes are shown from `sensor.home_control_live_scenes`,
  which the panel finds through its integration.
- **Plus integrations (decision D-13):** a brand's plus integration (Hue Plus) declares itself in `home_control.json` and plays its own lights' own
  effects through a service of its own. Without one, every light is played through `light.turn_on`.
- **Lights that cannot fade:** a light with no transition support is given single commands at the scene's *Update rate (experimental)* (1 to 60 per second, default 2); a light that can fade gets its own smooth fade.
- **Importing a scene** from another system (*Import a live scene*) is a source a plugin registers (`registerSceneImport`): Hue Plus reads Hue's scenes from
  the bridge. Without a source the dashboard does not offer it. Nothing else about live scenes needs a plugin.

## The address bar

The panel runs in a frame that Home Assistant owns. The current page is kept in the `#` part of Home Assistant's address using
`window.parent` (`HA.route`). If the parent is not reachable it falls back to `sessionStorage`.

## Stored data

Pages, rooms and devices are in Home Assistant system data `dashboard`; per-user options in user data `dashboard_prefs`.
Local preferences use `localStorage` keys beginning `db_` and `dh_`.

## Saving

Everything that has something to save looks and behaves the same: the classic scene editor, the live scene maker, the area editor (and the bridge's light placement), the light editor and a device of the Hue Plus menu. Its popup has a **checkmark next to the close button**; the checkmark saves and goes on (the popup closes for the scene editors, one page back for the rest). Closing it in any way (the close button, the back arrow, tapping outside) after a change asks *Unsaved changes: Save / Discard changes / Cancel*, and *Save* is the checkmark. There is no other Save button. An editor registers with `guardUnsaved({dirty, save(leave), discard, done, inner})` (`scenenew.js`), which also puts the checkmark in the header (`popupCheck` in `popups.js`): `save` returns `false` when it cannot save (it says why and the editor stays open), or a promise of whether it did (the bridge). `inner` marks a page that is one step of a larger edit; it asks on closing but not on the way back.

## Plugins (`app/pluginapi.js`, `docs/plugin-api.md`)

A plus integration adds pages to the dashboard through the plugin API (`window.HomeControl`, version 1), documented in `docs/plugin-api.md`. Home Control loads the script a loaded
integration names under `menu` in its `home_control.json`, for administrators only, from that integration's own static folder. The script registers its pages (`PLUGIN_PAGES`), a category in
Settings (`PLUGIN_SETTINGS`), its texts and, for areas it owns, the hooks the area editor calls (`PLUGIN_AREA`: an import row, actions, the lights, saving, per-light rows). Hue Plus is the first:
its menu (the Settings category *Hue Plus*), the entertainment areas of the bridge and their placement, and their texts are in the Hue Plus repository (`frontend/src`, built into `menu.js`),
not here. Hue's scenes (their rows, popup and tiles in the light panel, and importing one), the Spotify sync and the Hue Play HDMI Sync Box (rows of the Lights section and their popups,
and what plays on a light) and the style button of a gradient light are Hue Plus's too, through `registerSceneKind`, `registerSceneImport`, `registerDeviceKind`, `registerPlayback` and `registerLightStyle`
(the dashboard asks `pluginSceneKind`, `pluginDeviceKind`, `pluginPlays` and `pluginStyle` when it draws); a plugin that registers after the page was drawn makes the page draw again. What a *light made of zones* is
(a light that reports `zone_colors` and lists its zone lights in `entity_id`: its markers, its place in an area and in a live scene) is the dashboard's, for any brand; only the choice of Hue's gradient styles is Hue Plus's. Everything that saves still looks and behaves the same: a checkmark next to the close button, and closing with changes that are not saved asks (`guardUnsaved`).

## Trying a change

`tests/frontend/harness/` runs the real panel against a pretend Home Assistant that writes nothing; see its README.

## Everything off in a room (`app/roomoff.js`)

A round power button sits first in the header's group of buttons (before search and settings) on every room's page that has something to switch off. It turns off every device on that room's pages (lights, media players, climate, fans, switches; hidden devices are left out; a light group and its lights count once), stops live scenes on those lights, and respects each person's view-only and confirm settings like a scene does.

The dashboard also keeps one script per room in Home Assistant, `script.home_control_<room id>_off` (the room id is the one in the dashboard's layout, for example `r_living_room`), built from the same list, so an automation, a physical button or a voice assistant can run it. An administrator's dashboard writes the scripts when it starts and 3 seconds after any layout change: it reads each script first and writes only what differs, creates a missing one, and removes the script of a room that is gone or empty, but only one whose description carries the dashboard's mark (`home_control_room_off`). Edit the room's devices in the dashboard, not the script: changes made to the script are overwritten.

