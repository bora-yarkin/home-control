# Devices

## Adding

In the editor, tap *Add item* in a section. Choose a type and, if you like, a Home Assistant area; tick what you want and add it. The types:

| Type | What it offers |
|---|---|
| Lights | Lights, a *Lights master*, and making the ticked lights one light group (a Home Assistant Group helper). |
| Switches, Fans, Climate, Media, Vacuum, Cameras, Sensors, Controls (numbers, selects, buttons, scripts, covers, locks), Helpers, All entities | Entities of that kind. |
| Scenes | Home Assistant scenes, the dashboard's scenes, *New scene* and a *Scene collection*. |
| Remote | A ready-made remote for any media player, the Remote master, or one you build yourself. |
| Appliance | An oven, washer, dryer, dishwasher, coffee machine, fridge, projector, robot vacuum or any other, made from entities. |
| Widgets | [Widgets](widgets.md). |

## A device's settings

Tap a device in the editor.

- **Look:** name, icon, size. A sensor, number or select can be a tile; a camera can show its live picture.
- **Options:** what is particular to the kind: a light's saved state, a media player's type (TV, receiver, speaker) and its inputs, a climate dial instead of a
  slider, a lock that asks you to slide, a fan that is an air purifier, linked entities, and *Set up this device*.
- **Placement:** move or copy it to another section or page, or remove it.
- **More:** hide it, hide its *Advanced settings* button, and more rarely used choices.

## What each type can do

Lights, switches, fans, climate, media players, vacuums, cameras, covers and locks have their own rows and popups. Humidifiers, water heaters, alarm panels (with their code), valves, lawn mowers, sirens, updates, automations, texts, dates and times, notify targets, weather, events, people, groups and remotes get controls from what each one reports. A popup shows only what the device says it supports; a thermostat that keeps two temperatures has a slider for each. *More in Home Assistant* opens Home Assistant's own dialog for anything else.

## Customize

*Edit the page → the device → Customize*:

- **Icon colour**: the colour wheel, or a colour code.
- **Tap, press and hold, double tap**: open its popup, switch it, Home Assistant's dialog, go to a page, run something else, or nothing.
- **Ask before operating**.
- **State text**: your own words for the row, with `{state}`, `{name}`, `{attr:name}`, `{sensor.id}` or `{sensor.id:attribute}`; and other texts when a condition holds.
- **Show only when**: up to four conditions, as for sections.

*Settings → Defaults by type* sets taps and asking for every device of a type.

## Linked entities

Many devices come with several entities (a TV's remote, a purifier's filter life). *Set up this device* can **find them automatically** or lets you pick them;
they then appear in the device's popup.

## Advanced settings button

A device popup can end with *Advanced settings*: the other entities of the same Home Assistant device. It is for administrators. It can be hidden:

- **on the whole dashboard:** *Settings → Devices → Advanced settings buttons on devices*;
- **on one device:** the device's settings → *Advanced settings button* (it holds on every page the device is on);
- **in a Remote master:** for the whole master, or for one device inside it.

## Light groups

*Settings → Light groups* makes, renames and deletes Home Assistant light groups (the Group helper), or tick lights in the Add popup and choose *as one group*.

## New devices

When devices appear in Home Assistant, a dot on the settings button and *Settings → Devices* offer them: add each to a room or ignore it.

## Adding to a device's popup

In a device's settings, *Its popup* adds anything a page can hold under the popup's own controls: devices, widgets, action buttons, template texts and further popups, which can hold popups of their own. Drag to reorder.

## Customise Advanced settings

In a device's settings, *Customise Advanced settings*: drag to reorder, tap an item to hide or rename it, add any entity, add blocks, or go back to automatic. The two switches that hide the Advanced settings button still apply.
