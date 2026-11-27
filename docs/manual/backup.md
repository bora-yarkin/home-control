# Backup and restore

Settings → Backup and about → Backup and restore.

## Downloading

You get one `.json` file containing the dashboard (rooms, pages, widgets, remotes, appliances, scenes, areas, colours, icons, wall photos, access and notification rules), your appearance settings, this device's dashboard settings, remote pictures, published live scenes, TV Home keys and imported effects.

If something can't be read, the file is made without it and you're told which part.

## Restoring

Pick a file. The dashboard checks it and tells you what's in it and what it would reject. Then it saves a backup of your current setup, replaces everything, brings notification automations, live scenes, published scenes, TV Home keys and effects in line, and reloads. If the dashboard can't be saved, nothing changes.

Restoring replaces, it doesn't merge. To go back, restore the file it just saved. To copy a single page to another home, use Page settings → Export and import.

## What's not included

Anything Home Assistant keeps itself: entities and areas, helpers and light groups, your own automations and scripts, the HomeKit Bridge list, the panel's title and icon, other users' appearance choices, the change log, and data kept by add-on integrations. Use Home Assistant's backup for those.

## Moving to another Home Assistant

The file refers to entity ids. Any that don't exist show as unavailable until you swap them. Access rules are tied to user accounts, so set them up again.

The companion apps don't always save downloads, so make backups from a browser.
