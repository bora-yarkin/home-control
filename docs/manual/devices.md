# Devices

## Adding

In the editor, tap *Add item* in a section. Choose a type and, if you like, a Home Assistant area; tick what you want and add it. The types:

| Type | What it offers |
|---|---|
| Lights | Lights, a *Lights master*, and making the ticked lights one light group (a Home Assistant Group helper). |
| Switches, Fans, Climate, Media, Vacuum, Cameras, Sensors, Controls (numbers, selects, buttons, scripts, covers, locks), Helpers, All entities | Entities of that kind. |
| Scenes | Home Assistant scenes, the dashboard's scenes, *New scene* and a *Scene collection*. |
| Remote | The ready-made remotes of your TVs, the Remote master, or one you build yourself. |
| Appliance | An oven, washer, dryer, dishwasher, coffee machine, fridge, projector, robot vacuum or any other, made from entities. |
| Widgets | [Widgets](widgets.md). |

## A device's settings

Tap a device in the editor.

- **Look:** name, icon, size. A sensor, number or select can be a tile; a camera can show its live picture.
- **Options:** what is particular to the kind: a light's saved state, a media player's type (TV, receiver, speaker) and its inputs, a climate dial instead of a
  slider, a lock that asks you to slide, a fan that is an air purifier, linked entities, and *Set up this device*.
- **Placement:** move or copy it to another section or page, or remove it.
- **More:** hide it, hide its *Advanced settings* button, and more rarely used choices.

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
