# Troubleshooting

| Problem | What to try |
|---|---|
| The dashboard looks old after an update | Reload the page. In the app, close it and open it again, or use Settings → Companion app → Troubleshooting → Reset frontend cache. Updates that change the integration's Python also need a Home Assistant restart |
| "Only admins can change" | Use an administrator account |
| "Not saved, no connection" | Keep the page open. It saves when the connection returns |
| A row says Unavailable | The entity is unavailable, or it doesn't exist (renamed, or a different home) |
| Live scenes don't work | Check the Home Control integration is loaded under Devices & services |
| A TV has few buttons or no inputs | Link its `remote` entity. Some integrations don't report inputs |
| A vacuum map has no room names, trail or zones | The map needs `calibration_points`, see [the vacuum appliance guide](../vacuum-appliance.md#what-a-map-entity-needs) |
| Something broke after a change | Undo it from Settings → Backup and about → Change log, or restore a backup |

Versions are under Settings → Backup and about. Report problems at <https://github.com/bora-yarkin/home-control/issues>, and remove any entity names or addresses you'd rather keep private.
