# Decisions

- D-1 (owner, 2026-11-03) Devices with special features (appliances, vacuums, intercoms, remotes) are brand independent: the user chooses the entities with an entity selector; the dashboard looks at the entity's domain, device class, unit, options and supported features. Nothing is hidden behind a brand name. A section with nothing bound or supported is not shown (a vacuum without a map has no map section; a custom picture can be given instead).
- D-2 (owner) A good-looking default layout for each such device that works with whatever is bound, using the dashboard's existing rows and components.
- D-3 (owner) When Hue Plus and scene engine are both installed, Hue lights are played by Hue Plus; scene engine plays every other light. A scene with both is played coherently on one clock. Scene engine holds nothing Hue-specific: it gets Hue's abilities from Hue Plus, like an expansion pack.
- D-4 (owner) Existing Hue Plus scenes that contain non-Hue lights keep working; new or edited mixed scenes belong to scene engine. Nothing is migrated automatically.
- D-5 (owner) Scene engine is updated for Home Assistant 2026.10 and published as a public repository next to the others.
- D-6 (owner) A device without an area in Home Assistant is placed by the user in a room; the choice is stored with the dashboard layout and Home Assistant's areas are not changed.
- D-7 (owner) The remote creator is a kind in the "Add device" list. The remote shows as a normal row and opens a popup with a grid of buttons. The grid has 3 columns by default; the number of columns is adjustable per remote and a button can take 2 columns. Each button has an entity and an icon (and an optional label).
- D-8 (owner) An image remote takes a picture by upload or by an existing `/local/` path. Touch areas are drawn over the picture. Nothing says "command sent": a message appears only when a command fails.
- D-9 (owner) A notification rule can watch any entity reaching a state; the battery rule also takes binary low-battery sensors.
- D-10 (owner) Push to talk is wanted for the intercom and for cameras that have a speaker (the guest room camera).
- D-11 (owner) Releases of home-control, hue-plus and scene-engine are published by the assistant when CI passes.
