# Home Control

A dashboard for Home Assistant that shows and controls the home: rooms, lights and scenes, climate, media, vacuums,
cameras, a wall display, and a first-run editor to arrange it. It runs in the browser as a panel in the sidebar and uses
the connection Home Assistant gives every panel; it does not replace Home Assistant and keeps no data of its own on the
server. Layouts and settings are stored by Home Assistant for each user.

Parts that belong to one integration appear only when that integration is installed: for example, Hue effects, gradient
styles, live scenes and the Spotify sync appear when [Philips Hue Plus](../hue-plus) is installed, and nothing Hue shows
without it.

## Install

HACS: add this repository as a custom repository (category *Integration*), install, restart Home Assistant, then
*Settings → Devices & services → Add integration → Home Control*. The panel appears in the sidebar. The address, title,
icon and who may open it are options of the integration.

Without HACS: copy `custom_components/home_control` into your configuration folder and restart.

If you used the dashboard before as a `panel_custom` entry in `configuration.yaml`, remove that entry first; your layouts
and settings are kept, because they live in Home Assistant, not in the files.

## How it is built

`custom_components/home_control/frontend/` is the dashboard (plain JavaScript, no build step); `README.md` there explains each
file. The integration (`__init__.py`) serves that folder and registers the panel.

## Licence

GPL-3.0-or-later. See `LICENSE`. The bundled Material Design Icons (Apache 2.0) and hls.js (Apache 2.0) keep their own
licences in `frontend/mdi` and `frontend/vendor`. Contributions: see `.github/CONTRIBUTING.md`.
