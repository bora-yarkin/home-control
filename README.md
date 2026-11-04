# Home Control

A dashboard for Home Assistant that shows and controls the home: rooms, lights and scenes, climate, media, vacuums,
cameras, a wall display, and a first-run editor to arrange it. It runs in the browser as a panel in the sidebar and uses
the connection Home Assistant gives every panel; it does not replace Home Assistant and keeps no data of its own on the
server. Layouts and settings are stored by Home Assistant for each user.

Parts that belong to one integration appear only when that integration is installed: for example, Hue effects, gradient
styles, live scenes and the Spotify sync appear when [Philips Hue Plus](https://github.com/bora-yarkin/hue-plus) is installed, and nothing Hue shows
without it.

## Install

Marketplace (Home Assistant 2026.11 and later; this repository is not in its default list, so add it yourself): *Settings → Marketplace → Add from link*, `https://github.com/bora-yarkin/home-control`; download *Home Control* (older versions: HACS, *Custom repositories*, category *Integration*), restart Home Assistant, then
*Settings → Devices & services → Add integration → Home Control*. The panel appears in the sidebar. The address, title,
icon and who may open it are options of the integration.

Adding it changes nothing else on your Home Assistant: your own dashboards, your default dashboard and your Hue setup stay as they are. The dashboard
appears in the sidebar; to open it first, choose it under *Profile, Default dashboard* (a setting of each browser, which an integration cannot change).

With [Philips Hue Plus](https://github.com/bora-yarkin/hue-plus) installed, the dashboard shows Hue Plus's lights, scenes and sensors and leaves out the
Hue integration's copies of them (matched by unique id), whether Hue Plus hid the Hue entities or left them alone. Without Hue Plus it shows the
Hue integration's as usual.

Without the Marketplace: copy `custom_components/home_control` into your configuration folder and restart.

If you used the dashboard before as a `panel_custom` entry in `configuration.yaml`, remove that entry first; your layouts
and settings are kept, because they live in Home Assistant, not in the files.

## How it is built

`custom_components/home_control/frontend/` is the dashboard (plain JavaScript, no build step); `README.md` there explains each
file. The integration (`__init__.py`) serves that folder and registers the panel.

## Licence

GPL-3.0-or-later. See `LICENSE`. The bundled Material Design Icons (Apache 2.0) and hls.js (Apache 2.0) keep their own
licences in `frontend/mdi` and `frontend/vendor`. Contributions: see `.github/CONTRIBUTING.md`.
