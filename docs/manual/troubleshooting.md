# Troubleshooting

| What you see | What to do |
|---|---|
| The panel looks old after an update | Restart Home Assistant after updating, then reload the page (in the app: *Settings → Companion app → Troubleshooting → Reset frontend cache*). |
| "Only admins can change" | Changes need an administrator account. |
| "Not saved, no connection" | The change is kept and saved when the connection returns; keep the page open. |
| A row says *Unavailable* | The entity is unavailable in Home Assistant, or does not exist (after moving homes, or renaming it). |
| Live scenes are not available | The Home Control integration must be loaded (*Settings → Devices & services*). |
| A TV shows few buttons or no inputs | Link its `remote` entity; some integrations report no inputs. |
| A vacuum map has no room names, trail or zones | The map entity needs `calibration_points`; see [the vacuum appliance](../vacuum-appliance.md#what-a-map-entity-needs). |
| Something broke after a change | *Settings → Backup and about → Change log* undoes recent changes; or restore a backup. |

*Settings → Backup and about → About and diagnostics* shows the versions. Report problems at
<https://github.com/bora-yarkin/home-control/issues> without entity names or addresses you consider private.
