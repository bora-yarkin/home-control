# Appliances and robot vacuums

## Appliances

*Add item → Appliance*. Choose a type; it only decides which slots are offered first. Then, in the appliance's set-up (reached from the page editor):

- **What it reads:** the entity for each slot (state, program, temperature, start, stop, remaining time, door…). Slots can be renamed.
- **Rows:** any further entity, with your own label and group heading.
- **Buttons:** a grid or a picture made with the [remote builder](media-and-remotes.md#the-remote-builder), for things with keys (a projector).

## Robot vacuums

Two ways:

- **Add the vacuum entity itself** (*Add item → Vacuum*). With the `xiaomi_miot` integration and a `robot_vacuum_map` map it gets the full room-cleaning card; other
  vacuums get controls from what they report, and you can give them a map camera, room buttons and mode selects under the device's options.
- **Add a robot vacuum appliance** (*Add item → Appliance → Robot vacuum*) for any brand: a live map, rooms, cleaning settings, per-room settings, no-go zones
  and your own Start actions. The full description, including the file format and how to have an AI write it, is
  **[the robot vacuum appliance](../vacuum-appliance.md)**.
