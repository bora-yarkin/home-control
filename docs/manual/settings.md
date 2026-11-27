# Settings

Tap the gear in the header. There's a search box.

| Group | Entry | What it's for |
|---|---|---|
| Display | Appearance | Theme, accent colour, larger display, start page, weather sky, time format. Per person |
| | Wall mode | For a wall tablet: a clock or photos when idle, dimmed at night |
| Dashboard | Editor | Edit the current page |
| | Guided setup | [Build pages step by step](getting-started.md#the-first-run-guided-setup) |
| | Devices | New devices, unused devices, Advanced settings buttons |
| | Light groups | Home Assistant light groups |
| | Areas | Light positions for live scenes |
| | Siri and HomeKit | Publish live scenes as `scene` entities and choose what HomeKit gets |
| | Effects | Effect catalogues and imports |
| People | Users and access | Full access, view only, ask first or hidden, per room or device |
| | Notifications | Low battery, offline, vacuum trouble and your own alerts, made as automations (`dashboard_n_…`) |
| Data | Activity | What your devices have been doing |
| | Backup and about | [Backup](backup.md), change log, versions, diagnostics |

Help → User manual opens this manual.

## Language

Settings → Appearance → Language follows Home Assistant or a language you pick for your account. English and Turkish are included. Names you've saved aren't translated.

To add a language, create `frontend/app/lang/<code>.js` that sets `LANGS["<code>"] = {...}` using the keys in `app/strings.js`, and add its name under `languages` in `frontend/version.json`. Missing keys show in English, and a test makes sure listed languages are complete.

## Colours and shape

Settings → Colours and shape changes icon colours by type (or turns them off, or makes them a rainbow), corner roundness and spacing, for everyone. Accent colour is personal and lives under Appearance.

## My alerts

Add your own lines to Attention, shown while a condition is true. The level at which a worn part counts as low is under Notifications.

## Users

Only administrators can change the dashboard. Access rules only apply inside this dashboard. They aren't Home Assistant permissions, so a user can still reach things elsewhere in Home Assistant.
