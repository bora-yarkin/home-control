# Settings

Open with the gear in the header. The search box finds a setting.

| Group | Entry | What it does |
|---|---|---|
| Display | Appearance | Light, dark or automatic theme; accent colour; larger display; start page; weather sky; time format. Per person. |
| | Wall mode | For a tablet on the wall: a clock or photos after a while without touch, dimmed at night. |
| Dashboard | Editor | Edit the current page. |
| | Guided setup | Build the pages step by step ([the first run](getting-started.md#the-first-run-guided-setup)). |
| | Devices | New devices, devices not on the dashboard, and the Advanced settings buttons of the whole dashboard. |
| | Light groups | Make and change Home Assistant light groups. |
| | Areas | Where lights are, for live scenes. |
| | Siri and HomeKit | Publish live scenes as `scene` entities, and choose what the HomeKit Bridge offers. The Home Assistant app offers scenes to Shortcuts. |
| | Effects | Effect catalogues and importing an effects file. |
| People | Users and access | For each non-administrator: full access, view only, ask first or hidden, by room or device. |
| | Notifications | Low battery, device offline, vacuum problem, and alerts for any entity reaching a state. They are made as Home Assistant automations (`dashboard_n_…`) and sent to the notify services you choose. |
| Data | Activity | What your devices did recently. |
| | Backup and about | [Backup and restore](backup.md), the **Change log** (the last ten changes to the dashboard, with undo), versions and diagnostics. |

**Help → User manual** opens this manual.

## Users

Only administrators change the dashboard. Access rules apply inside this dashboard only: they are not Home Assistant permissions, so a user can still reach an
entity elsewhere in Home Assistant.
