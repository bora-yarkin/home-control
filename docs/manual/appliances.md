# Appliances and robot vacuums

## Appliances

<img src="../images/washer-popup.png" width="260" alt="A washer"> <img src="../images/oven-popup.png" width="260" alt="An oven">

*Add item → Appliance*. Choose a type; it only decides which slots are offered first. Then, in the appliance's set-up (reached from the page editor):

- **What it reads:** the entity for each slot (state, program, temperature, start, stop, remaining time, door…). Slots can be renamed.
- **Rows:** any further entity, with your own label and group heading.
- **Buttons:** a grid or a picture made with the [remote builder](media-and-remotes.md#the-remote-builder), for things with keys (a projector).

## Custom device

The appliance type **Custom device** starts empty and takes any entity. Each row is drawn as that entity's own row, in your order, under headings if you give them. It can also hold a grid of buttons made with the remote builder.

## Section presets

A section's settings → *Save as a preset file* saves it without any entity id. *Add section → From a preset file* loads one: you choose your own device for each place. Names and texts are kept as written, so read a file before sharing it.

## Robot vacuums

<img src="../images/vacuum-popup.png" width="300" alt="The robot vacuum popup">

Two ways:

- **Add the vacuum entity itself** (*Add item → Vacuum*). With the `xiaomi_miot` integration and a `robot_vacuum_map` map it gets the full room-cleaning card; other
  vacuums get controls from what they report, and you can give them a map camera, room buttons and mode selects under the device's options.
- **Add a robot vacuum appliance** (*Add item → Appliance → Robot vacuum*) for any brand: a live map, rooms, cleaning settings, per-room settings, no-go zones
  and your own Start actions. The full description, including the file format and how to have an AI write it, is
  **[the robot vacuum appliance](../vacuum-appliance.md)**.

## A whole device

*Add*, *Appliances*, *A whole device*: choose a Home Assistant device and a custom device is made from it. What operates it comes first, then its readings; its settings and diagnostics are behind *Details*. Change it like any custom device.

## Parts and blocks of an appliance's popup

<img src="../images/popup-parts.png" width="300" alt="Parts of an appliance popup">

A type is a starting template. In the appliance's settings, *Parts of the popup*: drag to reorder, tap to hide, and *Add a block* for any type: a temperature dial, a cycle ring, a progress bar, readings, Start and Stop, or settings tiles, each with entities of its own, as many as you need (a second oven cavity, both fridge compartments).

## Device files

*Save as a device file* keeps an appliance and the blocks added to its popup, without your entity, device and area ids. Names and texts you typed stay in the file, so read it before sharing it. *Add*, *Appliances*, *From a device file* asks for your own entities and lists every action the file can run before adding it.
