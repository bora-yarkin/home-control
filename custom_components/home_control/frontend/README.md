# Dashboard panel

A Home Assistant custom panel (`panel_custom`, `embed_iframe: true`). It shows and controls the home; it does not replace
Home Assistant. Anything that Home Assistant does well (automations, helpers, groups, templates) stays there.

## Files

| File | What it is |
| --- | --- |
| `dashboard-panel.js` | The panel element Home Assistant loads. Reads `version.json`, loads the files below, passes `hass` on. |
| `ha-adapter.js` | The only code that talks to Home Assistant. No other file sends a websocket message, calls a REST path or reads the connection; everything else calls `window.HA`. |
| `camera-stream.js` | Live camera playback: WebRTC, then HLS, with black-picture and stall recovery. Uses `HA.camera`. |
| `dashboard-app.js` | The entry of the application. It only loads the files below, in the order listed in `APP_FILES`. |
| `app/*.js` | The application, split by feature (`lights.js`, `vacuum.js`, `editor.js`, ...). They share one global scope and run in the order listed in `dashboard-app.js`; the first line of each file says what it holds. `app/main.js` is last and starts the app. They reach Home Assistant only through `window.HA` and integration specifics only through `window.Integrations`. |
| `app/kinds.js` | Guided setup of a device that has other entities (a TV's remote, a camera's second stream, pan/tilt, privacy and detection entities): finds them by itself, offers a searchable list for the rest, keeps the links with the device, and says whether a TV gets the full or the basic remote. Add a kind of device in `DEVSETUP`. |
| `integrations.js` | Everything that is specific to one integration (xiaomi_miot, robot_vacuum_map, samsungtv_smart, apple_tv, androidtv_remote, hue, hue_plus sync module). It draws nothing and reads nothing from the page. |
| `dashboard.css` | Styles. |
| `mdi/` | Material Design Icons 7.4.47 (Apache 2.0, see `mdi/LICENSE.txt`): `index.json` is the list the icon picker searches, `a.json` to `z.json` hold the drawing paths by first letter. Same data as the npm package `@mdi/svg@7.4.47`. Nothing is fetched from the internet or from Home Assistant's own files. |
| `vendor/hls.min.js` | hls.js 1.5.13, loaded only when HLS is needed. Same bytes as cdnjs (`sha512-bqtMkEqGSOPPb8qbYSd9gHwR7C5mgmN+Z5Uaquvhana/U9H3zppGvlLV9HOdM7eYHF/GzzhS1lOGzCMhUvYcjQ==`, source map comment removed). |
| `version.json` | `{"version": N}`. Raise N after changing any other file. |

## Updating

1. Edit the file(s).
2. Raise `version` in `version.json`. Every file, including the ones `dashboard-app.js` loads, is requested as `file?v=N`, and `version.json` itself is fetched with a unique
   address each time, so browsers and Cloudflare never serve an old file.
3. Reload the panel.

To add a file, put it in `app/` and add it to `APP_FILES` in `dashboard-app.js`; no change to the panel configuration is needed.

`dashboard-panel.js` is requested by Home Assistant itself with the `?v=` from `panel_custom` in `configuration.yaml`.
Only a change to this one file needs that number raised (and a Home Assistant restart).

## What it needs from Home Assistant

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
- `call_service` with `return_response` (`HA.serviceResponse`; xiaomi_miot only, see below)

REST: `POST` and `DELETE` `config/automation/config/<id>` (notification rules; the same call the automation editor makes),
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
