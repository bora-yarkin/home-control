# Backup and restore

*Settings → Backup and about → Backup and restore.*

## Download

One `.json` file with:

- the shared dashboard: rooms, pages, sections, devices, widgets, remotes, appliances, header, scenes, areas, saved colours, custom icons, wall photos, access
  rules and notification rules;
- your own appearance settings;
- this device's dashboard settings (large display, light panel memory and your effect choices, live scene speed and brightness, a remote master's last pick);
- the pictures of image remotes;
- which live scenes are published, TV Home keys, and imported effect files.

If a part cannot be read, the file is made without it and the message names it.

## Restore

Choose a file. Before anything happens the dashboard checks it and tells you what it holds and what it would not accept; then it **downloads a backup of what you
have now**, replaces the dashboard, updates the notification automations, live scenes, published scenes, TV Home keys and effect files to match, and reloads.
If the dashboard cannot be saved, nothing is changed. A part that could not be restored is named.

A restore replaces: it does not merge. To undo it, restore the file it downloaded first. To move one page between homes instead, use *Page settings → Export and
import*.

## Not included

What Home Assistant keeps itself: entities and their areas, light groups and other helpers, your own automations and scripts, the HomeKit Bridge's list, the panel's
title and icon, other users' appearance choices, the change log, and what a plus integration keeps. Use Home Assistant's own backup for those.

## Moving to another Home Assistant

The file refers to entity ids. Entities that do not exist there show as unavailable until you replace them. Access rules are tied to user ids and need setting up
again.

The companion apps do not always save downloaded files; make backups from a web browser to be sure.
