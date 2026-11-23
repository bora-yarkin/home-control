# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Changed
- **A remote is used in its popup and built in the device's settings** (*Buttons*): the Use and Edit buttons tab is gone. The builder has a grid of up to 12 columns where each button has its own width and height, gaps, five-way pads, drag to reorder, and ready-made sets of keys for the integration behind a remote entity (Samsung TV, Apple TV, Android TV Remote, Roku, Sony Bravia, Philips, Vizio, Fire TV and LG webOS; the last six are built from their documentation and untested). A button presses an entity, sends a key to a remote entity, controls a media player, selects a source or presses an LG button; keys can repeat while held and have a colour. A picture remote has touch areas with the same actions.
- **TVs without a native remote get one built from their integration's keys** (Roku, Sony Bravia, Philips, Vizio, Fire TV, LG webOS), marked experimental. Samsung, Apple TV and Android TV keep their own.
- **A blind has its own popup**: the position slider when it can be set, open, stop and close, and the slats' slider or buttons; the row shows the position.

## [0.20.0] - 2026-11-23

### Changed
- **A device's settings are one page, not tabs**, and **every icon choice is the icon dropdown**: the icons that fit what it is are at the top of the dropdown under *Suggested*, then every icon (and your own SVGs); the separate row of icons is gone. The light group form is one page too.
- **Every settings popup has one layout** (the dashboard's own Settings excepted): Name and Icon side by side at the top, one block per topic under its own heading, where it sits, then the actions at the bottom in pairs with the dangerous one in red. Devices, sections, rooms, light groups, lights masters, appliances, remote buttons and status and climate tiles all follow it. The icon dropdown floats over the page like the other dropdowns.
- **A media player or a fan has a type you choose** (TV, Receiver or Speaker; Fan or Air purifier) in its settings, and the type decides its setup page. Before, the icon and the name decided; a device without a type gets one guessed once and keeps it.
- **The setup of an air conditioner lists climate entities**, and *Find automatically* links the helpers (switches, selects, numbers, scripts) of its device and the other climate entities named after it.
- **Hue scenes are tags of rooms**: *Rooms* lists only rooms (the pages of the dashboard, and areas of Home Assistant with Hue scenes that no page is set to), and *Tags* lists the tags of the scenes of the rooms ticked plus *Hue* when a ticked room has Hue scenes. Room counts include their Hue scenes. A scene list has a *New scene* button for admins.
- **The Advanced settings button of a device can be switched off per device again** (Behaviour, *What it is*).

### Changed
- **Scenes are part of a Section, not a kind of section** (layout 6): a Scenes section becomes a Section with its scenes (the ones made for it, the scenes of the *Rooms* and *Tags* it takes in, scene entities added to it, and a plugin's scenes). Adding scene entities from the + (type *Scenes*) adds scenes, not buttons, and *New scene* is the first entry there. Quick actions on Home are the Home page's scenes in a Section. A tag is *taken in* with one tap and *left out* with a second, in the same Tags dropdown; *None* clears a dropdown.

### Changed
- **Existing scenes are added to a lights master or a scenes section with dropdowns that take several ticks**: *Rooms* (the scenes made for each page, with how many it has) and *Tags* side by side, and *Leave out tags*. A master has a first dropdown for the areas of the scenes a plugin owns (Hue's): none chosen is the areas of its lights, *None* turns them off. "Every scene of this page" is now the page's own entry in *Rooms*; a scenes section as a source is gone (its scenes are those of its page).

## [0.19.0] - 2026-11-22

### Changed
- **Layout 5 (one-way):** the sections that held devices (Lights, Media, Climate, Controls, Sensors, Other devices, Devices) are one kind, **Section**, with the name and icon they had; Quick actions are Scenes. The layout converts when it loads and is saved at your next change; the Edit history can undo that save. A new Home page starts with Attention, At a glance, Rooms and Scenes; a new room page offers suggested sections from a Home Assistant room, or starts empty. Old-data conversions from before layout 4 are removed, so a layout older than 4 starts from the default pages.

### Added
- **Auto scenes**: a new kind of scene, up to ten colours each with a brightness. Played on a lights master (or a page's lights) it gives every light one of the colours at random, and playing it again gives them out again. Add one from the + of a scenes section or a master's scenes.
- **Scene tags**: admins can tag classic, live and auto scenes (a search box over the tags of the home, *Add the tag* when nothing matches; tags are lower case and shown only in settings). A lights master or a scenes section can take in the scenes with a tag, and leave out the tagged ones its sources would bring (for example a bathroom's scenes on a bedroom page). A tag no scene has is gone.
- **More than one lights master in a Lights section.** The section's own master stays as it is. A section can also hold lights masters of its own, each with the lights chosen for it, a name, power button, tab, scenes and sync: *Add a lights master* in the section's settings asks for a name and the lights and does not touch the section's lights or its own master. A bathroom master can be on the bedroom page without a Bathroom page.
- **Move or copy a master to another section**, from the master's settings: an automatic master is saved as manual with the lights it has, then goes to (or is copied into) the Lights section you choose. The lights of that section are not touched. Its scenes are shared, not copied.
- **The lights popup of At a glance has the lights of the lights masters too**, each light once, so the lights can be taken out of a room's section and the popup, its count and its alerts keep them. The tile's settings choose which masters are one row in the popup (the same row as on the page: slider, the icon that switches its lights, a tap that opens it); the lights of the others are listed one by one. A master can be listed under the room of the page it is on, or under the Home Assistant room of its lights.
- **Each light tile in a lights master has a second small line under its mode** with the brightness its lights run at and, for lights on a white, the temperature (averaged for a group).

### Fixed
- **A lights master does what the separate lights did.** The lights chosen for a master count as lights of the page (room counts, everything-off, conditions). A master can be hidden as a whole (*Visible* in its settings). Search finds *Name Master* and each of its lights as *Name Master · Light*, which switches only that light. The icon of a master is a stop button while any of its lights plays an effect or a sync. The row says how many lights are unavailable, and a tile says *Unavailable*. *Light groups* has a page in Settings and in the master's settings, to make and change groups.
- **Plugin wording and checks come from the plugin**: the scenes a plugin owns are a scene *source* and *kind* called `plugin` (stored `hue` becomes `plugin`, `hord` is `pord`), the words for them are the plugin's, and a light that stands for others is told by `registerGroupCheck` instead of a Hue attribute. A device's *Set up this device* row is the same for appliances, remotes and kits.
- **Old-data conversions removed**: layouts from before sections (v3), the shared pins/quick-action lists, the first form of a master's lights, and the one-time takeover of Hue Plus's saved scenes. A dashboard that is not at layout version 4 starts from the default pages. The Hue app's menu styles (`.hm-*`) moved to Hue Plus, which draws those pages.
- **Unused code removed**: three functions, a popup that repeated another, a list of settable kinds, and style rules nothing used.
- **Columns are one dropdown each**: a page has *Sections side by side* (Automatic, 1 to 4) and a section has *Columns* (Automatic, 1 to 4 columns of items inside it). The section's Full / Half width and the *Turn-all-off button* of a Lights section (and its button) are gone; a lights master has its own power button.
- **More cleanup of old settings.** Gone: the *Lights master settings* and master rows in a section's settings (the master's settings open from the master), the *Hidden sections* list of the page settings (the eye of a section shows or hides it), page *Export / Import*, *Automatic backups* (the change log keeps the history), *Check the layout*, *Separate colour and white* of a light, and *Keyboard and screen reader* (Tab and Enter now always work). *Edit this page* is called *Editor*. *About* shows the Home Control version (needs a Home Assistant restart to appear). A light in a master's list opens its settings (name, icon, which controls it shows).
- **A lights master is added from the + of a Lights section**: *Lights master* is the first item of the Lights list and asks for *Auto* (the section's own master, made from its lights and named All lights) or *Manual* (a name and lights of your choice). The *Lights master* switch and the *Add a lights master* row are gone from the section's settings; the master's settings have *Delete*.
- **Cleanup:** the *Colour wheel* setting and the old colour slider of the light popup are gone (the colour wheel is always used), and so is *Light colour in popups* (popups always fill with the light's colour), also in the At a glance lights settings. A section's *energy* options (price, currency) were unreachable because of a stray condition; they show again.
- **The lights of a master are one list, in auto and in manual**: each light with a grip to drag it, and, with *Show grouped lights as one light* on, a group is one row with a button that slides its lights open, which are ordered inside it (the lights row of the popup follows that order). With it off there is no button and every light is its own row. A manual master has the *Choose lights* button above the list, and a tap on a light edits its name and icon.
- **The settings of a lights master are a short page**: its name, then one row each for *Lights*, *Popup*, *Scenes* and *Where it shows* (each opens its own page), and right below them *Move or copy*, *Make it the section's own master* and *Delete*, instead of one long list.
- **A lights master that a section holds can hide its lights from the section** (as the section's own master can), and **can become the section's own master again** (*Make it the section's own master* in its settings), which can then be automatic once more. Deleting it is in the same settings.
- **On the white wheel a marker was not where its light's temperature is, and a light dropped at the cool end jumped back up.** The range of the wheel came from the first light, and a light group helper that does not know its lights' range says 1000 to 20000, which put every marker in the top third and sent a dropped marker back to a third of the way down once the light held at its own 6535. The range is now what every light can show (2237 to 6535 here).
- **The wheel was not the same on two screens that show the same lights.** Which lights share a marker was worked out when a popup opened and never again, so a phone and a computer showed four and six markers for the same lights. A panel the person has not changed by hand is now arranged from what the lights look like at the moment, on every screen, as when it opens: lights that stop looking alike come apart (the others that still look alike stay together), lights that come to look alike join. A change has to be there on two checks in a row, so a light crossing a limit for a moment does not shake the wheel. A panel where the person took lights out of a marker or joined them keeps their arrangement.
- **A marker of lights that run at different temperatures sat on the first of them.** It sits at their average now.
- **The dashboard drew itself, then drew itself again when Hue Plus's script had loaded**: for a moment it showed what is not there (the Hue sync, a light's scene), then took it away, and the lights' animations played again from the start, with the live values missing until the next update. The plugins' scripts are loaded together with the saved dashboard and the registries and the page is drawn once, when they are in (a plugin that takes more than 4 seconds is drawn in when it arrives, as before).
- **Lights that run differently were one marker on the wheel, and could not be separated by dragging.** Lights count as looking alike by their colour and brightness only, so a light on an effect (Fireplace) or in a live scene, whose colour happened to be close, was put in one marker with the others. A light on an effect, a moving palette and a still colour are told apart now.
- **The wheel did not follow lights that changed while the popup was open.** The markers moved, but which lights share a marker was worked out only when the popup opened, so after a scene was run or a light was changed somewhere else, lights that no longer looked alike stayed in one marker. They are taken apart as soon as they stop looking alike (only what the panel put together itself: a marker made by dropping a light on another stays).

## [0.17.2] - 2026-11-21

### Changed
- **The power button of a lights master's popup is in the place of the icon at the left of its title**, with the tint when its lights are on. Nothing is beside the close button but the settings button.

### Fixed
- **The gap between an opened group of the lights row and the tile after it was not the same for every group in Safari.** A rule that kept a group from being narrower than its content counted the width of the tile names, which are longer than the tiles, so a group with long names came out wider than its lights. The width said outright is used, so every gap is 10 pixels.

## [0.17.1] - 2026-11-21

### Fixed
- **The pen and the three dots of the scene that plays came out again when a folder of the Scenes page was opened** (or a tile moved). They stay where they are while the rows are made again.
- **A folder that opens slides the page down so it is in view**, by as much as it needs: a short folder that fits moves nothing, a tall one never goes above its own top.
- **The brightness slider of a light popup or a lights master set every light to the same level while a Hue scene played.** When the lights are the ones the active scene is on, a scene kind that has `dim` (Hue's) sets the brightness as a whole, so each light keeps its own level in the scene, as in the Hue app. Other lights get the plain brightness as before.

## [0.17.0] - 2026-11-21

### Fixed
- **Opening and closing a group in the lights row was jumpy.** The whole row was drawn again and the section's width was animated. Now only the section's clip and the tiles after it are moved, with the same timing (the edge of the reveal and the tile after it travel together), and nothing else in the row changes. Opening a group slides the row so the group and its lights are in view; closing one slides the row back with the rest when it was scrolled past its new end, instead of the browser pulling it in with a jump.
- **The last light of an opened group in the lights row was cut off, and the tile after it overlapped it, in Safari.** The section was spaced with `gap`, which Safari leaves out of its width. It is spaced with margins now, and its width is set outright to the width of its lights, so no browser can make it narrower.
- **Tapping a group in the lights row separated every light on the wheel** when all the lights ran alike. The wheel did not find the group in its one marker. A group, or a light of a group, is picked inside the marker that holds it now (the marker shows its icon) and nothing is separated.
- **The lights of the circle that opens on a marker made half a circle when there were few of them** (a fixed step apart). They are spread evenly round the whole circle now.
- **A light dropped on another marker of the light circle got a slightly different temperature** than the lights it joined: it took the colour its place on the wheel reads as, and markers are moved apart where they would overlap. It takes the marker's own colour or temperature now.
- **The name given to a lights master did not show in its popup** when another page had a Lights section of the same id: masters were found by the section id alone. They are now found by page and section.
- **A folder moved to the first place went back to the last** (dropped on the middle of a scene it was taken for a drop onto it and ignored). A folder is only reordered; a scene dropped on a scene or a folder makes or fills one.
- **Hiding a scene in one scenes section hid it in every section of the page.** The hidden Hue scenes were kept with the room. A section now keeps its own list: until its first change it uses the room's list as before, then its own.
- **Scenes added to a scenes section were added as devices.** The add popup has a *Scenes* type of its own (they were in *Controls*), and a scene chosen there for a scenes section becomes one of the section's scenes, drawn and opened as any scene is (a Hue scene opens its popup), with a trash that only takes it out of the section.

### Added
- **Still scenes in the Scenes page of a lights master have no stop icon**, and tapping one that is on switches the lights off (a scene that moves still stops).
- **Under the name of a light in the lights row: what it is doing.** The effect it runs (Candle), *Dynamics* when a scene's colours move on it (a live scene, or a Hue scene when Hue Plus says which lights it plays on), *Sync* when a sync plays on it (a plugin says so), *Dynamics* also when the bridge says the light plays a scene's colours, *Static* for one colour, *Mixed* for a group whose lights differ, and nothing while it is off.
- **A lights master with a sync tab switches off its lights that the sync does not play on** when the sync starts (a few seconds after it, when the sync says which lights it is on): they are not in its area.
- **A lights master can open on a tab of your choice** (*Opens on* in its settings: Default, Colour, White, Effects, Scenes or Sync). A tab it does not have leaves the default.
- **A lights master can show grouped lights as one light** (*Show grouped lights as one light* in its settings, off by default): a group is one light everywhere in its popup. Lights that look the same share a marker on the circle (a group counts as one of them), and the lights row has the group as one tile. Tapping a marker of several lists what it is made of, one level at a time: tapping a group in the list lists its lights, with a back button in the middle of the circle. Dragging a light out of a marker gives it a marker of its own, and the group it was in is opened where it stands; dropping it back on the marker makes the group whole again. A tap on a group of the lights row opens it beside its tile: its lights slide out to the right of it, the tiles after them slide along, and tapping it again (or the arrow between them, which has no background and spins back as it closes) closes it the same way. A group whose lights run at different colours or temperatures shows a gradient from its top left to its bottom right. Nothing is separated on the wheel by tapping, and a light taken out of a group on the wheel leaves the group as it is in the row. A group opens by itself, once, when its lights are not running alike. A group shows its own icon on its marker instead of the number of its lights. Tapping an entry never separates it: a light made of zones lists its zones like a group lists its lights, and a drag out of the circle needs a longer move than before. The lists change with the circle's closing and opening effects.
- **A lights master can hide its lights and its sync in its section** (*In the section* in its settings): only in the section, the master keeps them. Everything is shown again while the page is edited.
- **A lights master can control other lights than its section's.** In its settings, *Lights it controls*: *Auto* is what it was (the lights of its section, now also the ones hidden in the section), *Manual* is lights of your choice from the whole home; a tap on one opens the light's own settings popup (name, icon, options), the one a light of a section has.
- **The power button of a lights master can run a scene** (*Power button* in its settings): it runs the chosen scene when the lights are off and switches them off when they are on.
- **A settings button next to the power button** of a lights master's popup (administrators) opens its settings, over the popup.
- **A sync tab in a lights master's light popup**, when the master has it on and a plugin has a sync (Hue Plus's Spotify sync): the sync page takes the place of the colour wheel; the saved colours, the lights row and the brightness button slide shut or fade, and the tabs slide down to the bottom.
- **A power button next to the close button of a lights master's popup** switches every light of the master on or off.
- **A lights master's popup closes by sliding down only from its title**, so dragging on the wheel, the tiles or the scenes never closes it; its close button and a tap outside it still do.
- **A Scenes page in the light popup of a lights master** (the palette tab after Effects, with its own separator): the scenes as round tiles of their colours, each with what kind it is (Hue, live or classic scene) under its name, in four columns that scroll down and share the width of their row. A tile held and dropped on another makes a folder, which slides open under its row (the rows below slide down) and is named with its pen; tiles are reordered by dragging and the others make room as it moves. The scene that plays has a pen and three dots beside it. The + tile uses the scene maker of the scenes sections. The Scenes row at the bottom of the Effects page is gone.
- **The lights master has its own list of scenes**, independent of the scenes sections: the scenes made from its +, and sources chosen in its settings (*Scenes in the light popup*): the Hue scenes of its lights' areas, every classic and live scene of the page, and the scenes of each scenes section of the page. Removing a scenes section changes nothing in it.
- **The area's name is left out of scene names in a scenes section** ("Bathroom Dim" shows as "Dim"), for the page's area and for the area the section takes its scenes from; *Leave the area name out of scene names* in the section's settings turns it off.
- **A scenes section can take its scenes from another area** (*Scenes from* in the section's settings): the bathroom's scenes on the bedroom's page. The page's own area is the default.

## [0.16.1] - 2026-11-21

### Added
- **A scene editor can take lights out and add lights.** When the plugin that opens the editor lists lights that can be added (`candidates()` of `scenes.editLights`), each tile has a minus (one light always stays) and a plus tile lists the other lights to add. `onSave` also gets the lights the editor ends with.

## [0.16.0] - 2026-11-20

### Changed
- **The circle of separated lights opens and closes like the Hue app.** Measured from a 60 frames a second recording of the app, frame by frame: the circle grows from the middle in 11 frames with a slight overshoot, its lights pop in together 6 frames after it starts (each from a dot to a little over full size and back), and it closes in a single frame, after which the count drop of the group grows back with a bounce. The lights no longer appear one after the other. The drop of a selected light (the teardrop on the wheel) uses the same measured pop.
- **Joining lights, as in the Hue app.** Drop one light's drop on another and the joined lights stay where they were dropped, their count drop growing there (the same pop as every drop); they used to jump to the middle, play a ring and jump back to the real temperature. Nothing else is drawn.
- **A light that is off still opens its drop**: black, with the light's icon, over a black dot (tapping its tile, or the dot). Dragging it turns it on. Lights that are off also stay in the circle of separated lights (black) and no longer disappear from it. The drop of an off light was hidden before.
- **On the white wheel the lights start in a column in the middle** (their height is their temperature) instead of spread across; where several would sit on top of each other they are moved sideways. They can still be dragged anywhere.
- **No tile is lit when nothing is picked** (the lights of the master that are not in a group were lit by the master itself); picking a group or joined lights lights the tiles of their lights. A light set to a white temperature has the same tile colour as any other light at that temperature (a light made of zones used the slightly different colours of its zones).
- **A tap on a light inside the circle of separated lights only picks it**: its drop opens above it and bounces, and the circle stays as it was. Lights are separated by dragging them out, and then only the dragged light leaves (the others stay together). The plate and its lights are drawn in separate layers, so the lights on the left half no longer end up under the plate after the animation.
- **A light without an icon of its own takes the icon of its group** on the wheel and in the row of lights, so the lights of a group with a custom icon no longer show the plain bulb.
- **The row of lights shows every light, always.** Groups are their lights, a light made of zones is one tile (its zone colours as a gradient). The row no longer changes when lights are joined or separated on the wheel, and tapping a tile only shows the drop of that light on the wheel: nothing is separated until the drop is dragged, and then only that light is. The lights are in alphabetical order.
- **The lights master in the page editor.** It is shown while a page is edited (it was hidden) and opens its own settings: its name, whether it changes the whole room (both moved from the section's settings, where one row now leads to them), and the order of the lights, which can be dragged and set back to alphabetical.

## [0.15.1] - 2026-11-19

### Changed
- Code only, nothing to see: the popups are a table of definitions (`POPUP_DEFS`) instead of a 680-line chain of conditions; the settings of a device, the light group form and the add popup are built by one function for each part instead of one function each; the one-line explanation, the yes/no row, the labelled choice and the row of icon buttons are shared pieces (`hintRow`, `flagPill`, `segField`, `iconChoices`) used everywhere they were written out; 31 unused texts and one unused function are removed. The markup of the device popups is identical to before (compared tab by tab). The light popup was not touched. The frontend README has a table of the shared pieces and the harness README describes the layout audit.

## [0.15.0] - 2026-11-19

### Changed
- **Screensaver photos are a gallery.** Settings, Wall mode, Screensaver photos: *Upload a photo* (it is used at once), then every photo as a tile with a check that says whether the wall screen uses it. A photo can stay in the gallery without being used, so a tap on a tile switches it on or off and the trash button (after a question at the bottom) removes it. The heading counts the photos in use, and the settings line says "5 photos · 3 in use". Photos can still be added by address, one at a time, checked as they are entered. Which photos are off is saved with the list (`wallOff`).
- **Exporting and importing a page is done with files.** Page settings, *Export and import*: *Export this page* saves a `.json` file (named after the page and the time) with its sections, the scenes they list and their areas; *Import a page from a file* reads one, checks it (not a page, empty, broken, too large each say so), and asks at the bottom with what is in it ("Replace this page with the page in the file “Kitchen”? 5 sections, 2 scenes to add, 1 area to add. A backup of the dashboard is kept first.") before it replaces anything. It was a button that copied text to the clipboard and a box to paste it back into.
- The same two helpers (save a file, read a file) are used by the dashboard backup and the effects file; the effects example is downloaded as a file instead of being copied. An icon of your own is chosen as an SVG file (read, checked for a 24 by 24 drawing of paths and kept under the file's name) instead of typing a name and pasting path data. A wall photo address is entered one at a time and checked when entered, instead of a box of lines.

### Fixed
- The icon rows of a popup (the icon choices of a device, a light group) were 4px inset from the other rows; they line up. Every page, popup, device tab, dropdown and question was measured at phone and tablet width, dark and light, for corner radius, padding, alignment, equal tile heights, cut-off text and overlaps (a test-harness tool, `tests/frontend/harness/layout.js`); nothing else was off.
- The zones of a light strip were still offered as lights in the add popup (and in the list of new devices). A strip's main light lists only some of its zones (three of five), so the zones it did not list were missed. A zone is now also known by its unique id: a light whose unique id is another light's followed by `_zone_` and a number.

## [0.14.0] - 2026-11-19

### Added
- **Light groups.** On the lights list of an add popup the first entry, *Light group*, turns the lights you check into one group. The checkmark opens a *New light group* form (name, icon, the lights, hide its lights in Home Assistant, on when any or all are on); **nothing is made in Home Assistant until that form is saved with a name**, because the name chooses the light's entity id (a group named "Reading corner" is `light.reading_corner`). Saving makes Home Assistant's own Group helper (Settings, Devices and services, Helpers) through its configuration flow and puts the group on the page instead of its lights. The same form, with a checkmark that saves, is the settings of a group that exists (from the settings of any light that is a group): the name, lights and options are changed through the helper when it is saved, closing with changes asks, and Delete group (after a confirmation) deletes the helper; its lights stay. Renaming a group changes its name, not its entity id. A group not made by the helper (a Hue room) can be renamed and given an icon, but its lights cannot be changed here.

### Changed
- **Questions open at the bottom, all of them.** "Are you sure" (delete, remove, unlock, replace a page, give full access, ...) used to open as a dialog in the middle of the screen while "Unsaved changes" slid up from the bottom. Both are now the same bottom sheet, the TV's keyboard entry too, and the middle dialog style is gone. A confirmation that deletes or removes names its button for what it does (Delete) and shows it as a risk.
- **Device settings, in the same shape everywhere.** The settings of a device (and of a light group, the set-up of an appliance and of a TV or camera) open with the device as it will look on the page, so a change to its name or icon is seen at once. A device's settings are in tabs: **Look** (name, a few shorter names offered from the entity's own, a row of icons that fit the kind of device, then the whole icon list), **Options** (what is specific to the kind: lights' features, the media card, the thermostat dial, the vacuum map, the lock's slider, set-up), **Placement** (where it is: one tap on a section moves it; hide it in the app; remove it) and **More** (type, entity, advanced settings). Every change is made at once, with Undo.
- **Editing a page.** The toolbar is as it was (Undo, Add section, Reorder sections, Page settings, Done). Every section's heading has a + that adds to that section, and the dashed Add row stays only in a section that is empty. (A page-level Add was tried and removed: with several sections of one kind it could only guess which one.)
- **The add popup** has two dropdowns side by side instead of the row of type chips: *Type* (lights, switches, ... remote, appliance) and *Area* (every area of Home Assistant; all areas to begin with) to filter what is listed, a line under them and a line under the Light group entry. A light that stands for other lights (a group made in Home Assistant, or a Hue room or zone) has "Group" in its name: "Staircase Lower · Group". The zones of a light (a light strip's, a gradient tube's) are not offered as lights, since they are controlled from the popup of that light. Checks are kept when the type or the area changes.
- The add popup and the settings of a device or a light group open at full height, so changing tabs or the type does not change the size of the popup.
- **Lights, when turned on from the app:** *Last used* or *Custom*. Custom opens the light popup (wheel, brightness, white, effects) with a checkmark that saves what it shows, and opening Custom again shows the saved state; the light is put back as it was afterwards. The saved state is brightness, colour temperature or colour, and effect. The old brightness and kelvin choices still work until Custom is saved.
- The icon list of a device slides open and shut instead of jumping, the selected icon lines up with the others, and the tabs of a device popup slide in with the popup growing or shrinking to fit.
- The set-up of a TV or camera starts with *Find automatically*, with the count of what is linked.
- Every add popup of a page or a section (lights, switches, sensors, controls, cameras and the rest) is a checklist: check what to add, then the checkmark next to the close button adds it all at once, and closing with checks that were not saved asks. It was one tap, one device.

## [0.13.0] - 2026-11-16

### Fixed
- Dropdown menus with more than about eight entries could not be scrolled (a style that hides overflow won over the menu's own); they scroll now.
- Appliance (the generic oven, washer, dryer, dishwasher): Start stayed greyed out ("not available right now") for a button that had never been pressed, because a button reads `unknown` until its first press; and it hid the real reason (remote start off). Start is now reachable unless the button is unavailable, and the permission is checked first.
- Appliance: the list row showed the time left by matching English words in the state ("done", "none" and "inactive" counted as running; "preheating" and "washing" did not). A program is now under way when time is left or progress is between 0 and 100, whatever the appliance calls its state.
- Vacuum extras: the map of a camera or image entity (`/api/camera_proxy/...`) was never shown because only `https://` and `/local/` pictures were accepted; Start, Pause and Dock are dimmed and do nothing when the vacuum cannot do them; a reading bound under care values or modes is not also a chip in the header.
- Appliances and remotes made in the same millisecond got the same key and the layout dropped one.
- The entity picker for an appliance lists the entities of the devices already chosen first, and the editor says when a chosen entity no longer exists.

### Changed
- The appliance popups are made for the kind of appliance, and a device with many entities is a few groups, not a column of rows. An oven opens with a dial for its temperature (the temperature now as a dot on it, the state and the time left under the number); a washer, a dryer and a dishwasher with a ring that fills as the cycle goes (time left in the middle while it runs, the state when it does not); any other appliance with readings and a progress bar. Under it, in this order: a chip for an open door (a shut door says nothing), the Start button (Stop while a program runs), the settings as a grid of tiles (program, temperature, duration with minus and plus, five minutes a tap), and everything else the person added behind one line, "Details · N", where what can be set is a tile and what can only be read is one list. A door reads Open or Closed, in Home Assistant's own words when it has them. New slot: current temperature. A switch bound as Start or Stop is turned on or off, not toggled. The editor lists every slot in the order the type needs.
- The vacuum's modes and options are a grid of tiles and its care values one list of readings; the map of a vacuum belongs in its popup: a camera on the same device as a vacuum (or chosen as its map) is no longer a camera tile on a page, nor offered when adding a device, and the vacuum's popup shows it without any setup.
- A vacuum without a map integration offers suction (the fan speeds the vacuum lists).
- A remote's button can be set to ask first, for a door or a gate.

## [0.12.0] - 2026-11-16

### Fixed
- A page whose connection came back stayed "offline" for about three more seconds, with its "connection lost" banner, and refused commands meanwhile. The panel read Home Assistant's copy of the connection state at the moment the connection said it was ready, and that copy is updated a moment later; it now reads the connection itself.
- A save of the dashboard that failed because the connection was down said "only administrators can change" and was lost. It now says it is not saved, keeps the change and saves it when the connection is back.
- A start that lost a request (a weak connection) ended in a message with no way on. `version.json` is asked for again, a lost file of the application reloads the page up to three times, and after that there is a button.

### Changed
- Start and recovery are faster: the registries, the plugins, the saved dashboard and the person's choices are asked for together (three round trips became one), a changed entity is fetched by itself instead of loading the whole entity registry again, and a page that was away a minute or more remakes its connection at once instead of waiting two seconds for a ping.
- The last visit's registries and saved dashboard are kept on the device (under the user id) and the page is drawn from them at once; the real ones replace them in place. Nothing is saved over a copy: a save waits until the real saved dashboard has been read (decision D-21).
- Door call: the door's sound is played through Web Audio (started inside the tap that answers) instead of a media element, which a phone's browser dropped after about a second because the stream never ends. On an iPhone the page keeps a media session going so the ring/silent switch does not mute the door's sound, and uses the play-and-record audio session so the microphone keeps working.
- Talking from a dashboard on plain http (the phone app on a local address): the microphone is taken from a hidden frame of Home Assistant's own https address (`mic_frame.html`, served by its own view because Home Assistant forbids framing everywhere else), which records and passes the audio back; only a page on a private network address or on that host is answered. Needs an https external URL.

### Removed
- The Assist popup the dashboard opened where a page has no microphone.

## [0.11.0] - 2026-11-14

### Changed
- **Batteries are devices.** The Batteries popup, Settings, Batteries and the low-battery notification follow devices, not sensors: a device used to appear twice when it had a percentage sensor and a low flag. Each row says `Area · Device` (the name may take two lines), the battery percentage and a status (OK or Low). Devices with a battery that Home Assistant gains later are tracked, unless taken off the list; a device that was deleted and added again (a new device to Home Assistant) joins and its old self leaves, and the low-battery notification is brought to the new list. Settings, Batteries adds a device from a list of the devices that have a battery. The list from before (sensors) is not carried over: the popup starts empty, and a notification rule that chose sensors becomes "all tracked batteries".
- The low-battery notification names the device as `Area · Device`, watches a device by its percentage (or by its low flag when it has none, never both), and can be limited to chosen devices.
- **Remotes in the device-offline notification.** Fast Matter switch's Reachable sensors (new in its 0.6.0: the BILRESA remotes and other sleepy Matter devices) are watched by the same rule, on their own time: off for 15 minutes to 4 hours (30 minutes by default), apart from the time of the other devices. The toggle and the time are on the Device offline page; the message says `Area · Device is offline`.

## [0.10.0] - 2026-11-14

### Changed
- Light panel: tapping the tile of a light whose marker stands for several lights (lights that look the same and were joined, or a group that is not separated) no longer separates it. The marker is picked for that light: its drop shows the light's icon instead of the number, and brightness, colour, white and effects act on that light alone. Dragging the marker takes that light out and leaves the others together; tapping it again opens the group's circle as before.

### Added
- Area editor: a light made of zones (a bar) gets three choices above its direction and tilt sliders: lying flat or standing up, parallel or perpendicular to the back wall, cord at the left or the right.

## [0.9.10] - 2026-11-11

- Door call: the door's sound is requested again a few times after Answer, because the station may not report the call yet; the "nothing to listen to" message shows only after the last try.

## [0.9.9] - 2026-11-11

### Changed
- The door call popup is redone. Answer (green, with a handset) and Decline (red, with the handset put down) sit side by side; answering takes the call with sound both ways at once (the door is played, the microphone goes to the door), Decline turns into End call and grows to the full width as Answer fades away. The Talk and Listen buttons are gone: the mute button of the picture silences the door. The picture has no full screen and no settings button. The dashboard's slide to unlock is under the buttons, with some room below it so that it does not meet the phone's gesture at the bottom edge, and behaves as the dashboard's own lock row does: it slides while the door is locked, says "Unlocking…" with the handle back at the start as soon as it is slid, then "Unlocked" with the padlock open and the row tinted, and slides again once the door has locked itself; it is left out for a caller with nothing to unlock: a call indicator can say so with the attribute `can_unlock: false` (`docs/intercom-contract.md`). Nothing in it knows a brand.
- The test harness shows the popup with `?door=ringing`, `?door=call`, `?door=security-ringing` or `?door=security-call`.

## [0.9.8] - 2026-11-10

### Fixed
- The brightness button under Home on a Samsung TV's remote set the brightness of the lights in the TV's room; it now sets the TV's own screen brightness, which on a Samsung is its Backlight number (its Brightness number is the black level), shown on the TV's own scale, and does nothing while the TV is off.

## [0.9.7] - 2026-11-10

### Fixed
- In the light popup, the lights on the circle of a group sometimes sat behind the circle (the later ones, while they were still appearing); they are above it now.
- The lights editor (a scene being edited) opened and grouped the lights by how they were before the scene was played, so lights that now differ in temperature showed as one group. It waits until the lights have stopped changing before it opens.

### Added
- Plugin API: `registerSceneMaker` (a way of making a scene a plus integration offers in the new-scene popup), `scenes.editLights` (the light popup of several lights as an editor: the lights follow every change, the checkmark saves), and a `remove` hook of a scene kind (the trash of edit mode, after a question). Hue Plus uses them for Hue scenes (D-29 of Hue Plus).

## [0.9.6] - 2026-11-10

### Fixed
- A camera's push to talk did nothing for a camera whose talking is done by an integration (Tapo Talk): it now sends the microphone to the `talk_path` that integration publishes for the camera (`talk_cameras`), the same way a door call does, and says what to do on plain http.
- Answer and Reject of an intercom did nothing: a button that has never been pressed reads "unknown" in Home Assistant, which the dashboard took for "not available". Only "unavailable" holds a button back now.
- The "slide to unlock" shimmer ended in a cut-off pass and restarted early (it ran about one and three quarter times); it now moves by exactly one picture, so every pass is whole and the loop shows no jump.

### Changed
- Turning lights (and switches and fans) on or off draws the new state at once. Ten lights turned off together used to change one row at a time, each when its own integration reported back; the page now shows them all, and goes back to what Home Assistant says if it reports something else or nothing within four seconds.
- The "disconnected" banners wait one and a half seconds before they show, so a connection that comes back at once (a phone waking up) shows no warning.
- When the page comes back to the foreground, Home Assistant is sent a ping; a connection that does not answer within two seconds is closed and remade at once (a woken phone often holds a dead connection that the browser gives up on only after many seconds), and the page is drawn again immediately.

### Added
- Every camera shows a spinner in the middle until a picture is showing, which is the snapshot behind the video as soon as it has loaded or the first decoded frame of the video (not until the player's own checks for movement and brightness are done, which could take seconds more), and says "Still connecting…" after twelve seconds, so a slow camera (a building's door station) can be told from one that has given up.
- The unlock button on a camera and in a door call is a padlock whose shackle lifts and swings open, with a small spring, when the door is unlocked (a lock entity says it; a button counts for six seconds after it was pressed), and drops shut again.
- **Door calls.** When a camera's intercom rings, a popup with the camera, **Answer**, **End call**, **Unlock** and **Talk**/**Listen** opens by itself on every open dashboard, and when the dashboard is opened while the call is still going (a call's notification, when tapped, opens the dashboard). It works for everyone the camera's access rules allow, not only administrators. Answering starts the door's sound and the microphone; the microphone is sent to the integration's `talk_path` as 16 kHz PCM over a WebSocket, the door is played from its `listen_path`; both are read from the call indicator's attributes, so the popup knows no brand (`docs/intercom-contract.md`). On plain http, where a browser gives no microphone, Talk opens the phone app's own Assist when there is one. The notification an alert sends for a call indicator now carries the dashboard's address, which the phone apps open on a tap.
- Samsung TV remote: an **Apps** dropdown (the TV's source list: apps and inputs; it shows the one that is on) and the brightness button of the light popup in the empty place under Home, which sets the brightness of the lights in the TV's room. Where the dropdown sits follows the TV's Now playing setting: as the artwork or off, it is beside the power button; as the normal row, the Now playing row itself opens it (with a chevron) and the place beside power stays empty.

## [0.9.5] - 2026-11-08

### Fixed
- A classic scene imported from Hue listed every bulb on its own (each Play light, each lamp). A light group the room shows (Floor lamps, Hue Play, Ceiling lights) is now one light of the scene when the scene sets all its lights the same; lights set differently stay separate.

## [0.9.4] - 2026-11-08

### Fixed
- Deleting a scene from the list of existing scenes said "Scene deleted" but the scene stayed in the list until it was closed and opened again; the list is drawn again without it.

## [0.9.3] - 2026-11-08

### Fixed
- The trash on a scene in the page editor only took the scene off that page (the scene stayed saved, invisible), so nothing was deleted and its area could not be deleted. The trash now deletes the scene, after a question, from every page and from the saved scenes (a live scene is stopped and forgotten by the integration too); picking a scene again in the list is what takes it off one section. In that list a scene that is on no page has a trash too, to delete the scenes the old trash left behind.
- Deleting an area names every scene on a page that uses it; scenes on no page are named in a question and deleted with the area when you confirm.
- A static scene of a plugin (a Hue scene the bridge says does not play by itself, such as Desk light) was a live scene on the dashboard: a popup with speed controls. It is now used like a classic scene: a tap anywhere on its row switches it on or off, with no popup.

### Added
- A plugin can register a source of classic scenes (`registerSceneImport` with `classic: true`, whose `read` gives what each light is set to); the scene is made as *Save the lights as they are* does, from the scene's settings, not from the lights now. Hue Plus 0.12.0 offers it as *Import a classic scene from Hue*.

## [0.9.2] - 2026-11-08

### Fixed
- Segmented still changed colour in a short fade and then held it, which looked like a jump. A light now fades from one colour of the palette to the next across the whole segment (one command per segment, the fade as long as the segment, the next begins as it ends), with no colour of its own between the two.
- Linear still seemed to stop between fades: a bridge eases the start and end of every fade, so fades that only just overlapped showed a pause at each join. A fade now lasts twice the time to the light's next command, so the next command arrives while the light is moving at its fastest.

## [0.9.1] - 2026-11-07

### Fixed
- Segmented kept its colours exact but sent every change with no fade, so the lights jumped from one colour to the next. Segmented is about which colours are shown (each as it is, with no blended colours between two of them), not about how a change looks: every change is a smooth fade. The wording of the mode and of the `mode` field said the opposite and is corrected.
- Lights stopped between two colours (faded, rested, faded again) instead of moving without a break as in the bridge's own scenes. A fade now lasts as long as the light's own gap between commands (measured, since a hub takes only a few commands a second) plus a short overlap, so the next fade starts before the last one ends, in both Linear and Segmented. Someone changing a light is still noticed: a light is judged against the colours sent and the path between them.

## [0.9.0] - 2026-11-07

### Changed
- A live scene plays all the zones of a gradient light (a strip, a bed light) in order, as separate lights next to each other (decision D-19). A plus integration says how in `home_control.json` (`separate_zones`, `docs/plugin-api.md`); when some zones are unavailable (Hue's Linear and Mirrored styles blend two of the five) the scene calls it before it starts, so the light is in a style where every zone is its own, and the zones an area saved (3 in those styles) are completed to all five, evenly along the same length. Hue Plus 0.11.0 or later declares it; without it a strip is played as it was saved.
- The live scene maker works only with the scene, not with the lights (decision D-19). The colour wheel shows only the Colors light's markers and the transitions between them, never the lights' own colours; a light can be included or left out, given its own brightness and given an effect (No effect first), and nothing else. The brightness button sets the scene's brightness when Colors or nothing is selected and one light's own when a light is selected, and nothing is sent to the lights while you edit (the preview plays the scene). The effects page of the maker lists only the light's effects. Colours can no longer be joined to lights, and a scene saved from the maker no longer carries colours of its own for a light (a scene made before keeps them until it is saved again); brightness effects given to a light elsewhere are kept.
- A **Mode** button next to the brightness button (like a gradient light's Style) chooses how the colours follow each other: **Linear** (each blends into the next, as before) or **Segmented** (each colour is shown as it is, one after the other, with no colour in between, and changes as its segment begins, without a fade). `mode` is a field of `scene_start` and `scene_save`, and in segmented mode the wheel shows no transitions.

## [0.8.3] - 2026-11-07

### Fixed
- Previewing or saving a live scene in the maker failed with an error whenever a light reported an effect (every Hue light does, as "off"): the maker still called a list function on the effect-name check that became a pattern in 0.7.0. The effect a light shows is kept in the scene when it is one of the light's own effects, and "off" is not an effect.

## [0.8.2] - 2026-11-07

### Fixed
- A light fading up from off is no longer let go of at the start of a scene. A Hue light reports a brightness part way to the scene's (60 or 153 of 255) while it fades up, and the engine took that for someone else's change, so lights such as the ceiling light and a Hue Play bar dropped out in the first seconds and came back only when the colour check let them rejoin. A light that was off when its command was sent is now judged only after 10 seconds, whether it shows as off or as on.
- A change of brightness, range or speed made while a scene is frozen is shown (once; the scene still holds its colours), as the controls promise. It was ignored until the scene played again.

## [0.8.1] - 2026-11-07

### Fixed
- A light's own effect (Candle, Fire, ...) chosen for a gradient strip in a live scene is played on the strip, in the scene's colour. It was dropped when the scene started, and the strip's zones were given colours of their own instead (the area holds the zones, the look was for the strip). Now a look for a strip that names an effect its plus integration can play is for the strip as one light, standing where its zones stood, and its zones are left alone; any other look (brightness, colours, brightness effects) is given to each of its zones. A look for a light the scene does not have is still left out.
- A light that is off when a scene starts is switched on and kept. The engine counted a light that had not yet answered as switched off by someone else, which happened to the lights at the end of a long queue behind a hub's command rate (13 Hue lights take 1.6 seconds to send to), to a light that plays an effect, and to slow lights. A light that was off is now given 10 seconds from the moment its command is actually sent.
- A light playing its own effect is told again only when the scene's colour, brightness or speed has really changed (or after a minute), not every few seconds: a new colour can start the effect's animation again.

### Changed
- The zones of a strip now cover the palette between them (in proportion to the scene's Range) instead of by where they are in the room, so a strip a few centimetres long shows several clearly different colours (decision D-18).

## [0.8.0] - 2026-11-07

### Changed
- The rest of what was Hue-specific in the dashboard is Hue Plus's now, brought through the plugin API (decision D-17; Hue Plus 0.10.0 and later, install both together): Hue's scenes (their rows, popup with brightness, speed, play and freeze, the scene tiles of the light panel, and *Import as a live scene*), the Hue Spotify sync and the Hue Play HDMI Sync Box (their rows in the Lights section, popups, and the lights they play on), and the Style button of a gradient light. The dashboard keeps what a light made of zones is (any light that reports `zone_colors` and lists its zones in `entity_id`) and a scene import list for any source. Without Hue Plus a scene of the Hue integration is run like any scene and the sync switches are plain switches.
- The plugin API (still version 1, only added to) has hooks for these: `registerSceneKind`, `registerSceneImport`, `registerDeviceKind`, `registerPlayback`, `registerLightStyle`, `addStyles`, the dashboard's controls under `ui`, and a page title that can be a function. The page is drawn again when a plugin's script has loaded, so what it registers shows at once.

## [0.7.1] - 2026-11-07

### Fixed
- Saving a live scene from the dashboard failed ("not a valid option at 'fps'"): the dashboard sends the update rate with every save and the `scene_save` service did not take it (0.6.0 and 0.7.0). `scene_save` takes `fps` now, and a test checks that every key the dashboard sends is one the services take.

## [0.7.0] - 2026-11-07

### Added
- Effects catalogues (decision D-15): a light's effects can be described as data: their groups, labels, pictures or colours, how bright and how fast they start, how the speed maps to the light's own scale, and colour variants. One syntax (`docs/effects-file.md`, JSON) serves a plus integration, which ships its catalogue in `home_control.json` (Hue Plus: everything that was the dashboard's Hue table), and **Settings → Effects → Import an effects file**, where an administrator imports a file for lights of any brand, written by hand or with an AI's help. The file is checked before it is kept and every mistake is listed with where it is; a typo in a field name is an error, not ignored. A file never carries code (its only picture is a palette or an icon); a plus integration's own pictures are checked against a short list of drawing elements on both sides. Effects no catalogue knows are listed as the light reports them.
- The effects page calls the plus integration's own service for an effect with a colour or a speed, instead of Hue Plus's by name.

### Changed
- The Hue Plus menu in Settings, the bridge's entertainment areas in the area editor and Hue's texts are no longer in the dashboard: Hue Plus brings them in one script that Home Control loads for administrators, through a documented plugin API (`window.HomeControl`, version 1, `docs/plugin-api.md`) that any plus integration can use. The area editor calls a plugin's hooks for areas it owns; Settings and its search list the categories plugins register. With an older Hue Plus the Hue Plus category is not there (update Home Control and Hue Plus together).
- The dashboard no longer has Hue's effects, their groups, labels or pictures in its own code: they come from Hue Plus's catalogue (Home Control 0.7.0 and later with Hue Plus 0.9.0 and later; with an older Hue Plus the effects are listed as the lights report them).

### Fixed
- A light the colour check let go of is put back: it is watched for two minutes while its scene still has other lights, and rejoins as soon as it shows one of the scene's colours again. A light a person changed, or another scene took, is gone for good, and a scene whose every light was taken still ends at once.
- A gradient light's zones in a saved area get the unique id of their light at start even when Hue Plus has not loaded yet (Home Control can start first), so they keep working as the one light if Hue Plus is removed.
- A live scene no longer drops a light that is merely behind. The engine ended a light's part in a scene when it showed a colour far from what was sent last, once that was due. Hue reports a fade only when it ends, so on a fast palette a light still showed the colour of the command before, or, right after the scene started, the colour it had before; Hue Play bars and the desk light dropped out of Arctic aurora within seconds, in some runs. A light now has to be far from the colours of the last three commands and from its colour before the scene. Switching a light off, dimming it, or setting a colour that is nothing like the scene's still ends its part.

## [0.6.0]

### Added
- Lights that cannot fade by themselves (no transition support) are played with single commands at an update rate you choose, from 1 to 60 per second (it was 1 to 4, and not offered on the dashboard): the live scene editor has *Update rate (experimental)*, saved with the scene (default 2). Each update is one command, so a high rate loads the light's hub and is held to the rate it takes; the engine does this only for lights that cannot fade, and gives a light that can its own smooth fade as before. Marked experimental: it has not been tried on real lights.

### Changed
- Scenes and areas that were saved without the unique ids of their lights (everything taken over from Hue Plus) get them when Home Control starts, so they can be found again when an entity id is gone.

## [0.5.0]

### Changed
- Live scenes and areas are played by Home Control itself (frontend v233), for any light (decisions D-12 to D-14): the engine, the saved scenes and areas, the services (`home_control.scene_start`, `scene_save`, `area_save` and so on), the running-scenes sensor and the library read moved from Hue Plus into this integration. The dashboard talks only to these. Nothing on the dashboard looks or works differently with Hue Plus installed: Hue lights still play through the bridge, with their own effects.
- The first start takes over the scenes and areas Hue Plus saved (read only: Hue Plus's file is not changed) and keeps its own copy.
- A saved area light keeps the unique id of its light, and a gradient light's zone also that of its light, so scenes and areas keep working on the lights Home Assistant has left when a plus integration is removed.
- A plus integration declares itself in `home_control.json` and plays its lights' own effects through a service (decision D-13). Hue Plus is the first.
- Any light can be placed in an area, and the *Add a light* list offers every light; before, only Hue Plus's lights could be next to the Hue integration. Importing a Hue scene still needs Hue Plus.

### Removed
- The Scene engine integration as a partner: Home Control no longer looks for it.

## [0.4.6]

### Added
- The area editor can place any light of Home Assistant, not only the lights on the room's own page: *Add a light* under the tray lists every light that is not in the tray yet, from any room or none, with its area and a search, and each tap puts it in the area (a group adds its lights). Lights of other rooms that are in one of the room's sections were already in the tray (frontend v232).

## [0.4.5]

### Changed
- The Hue Plus menu in Settings reads the bridge once, when it opens, instead of on every page: one loading screen, then every page opens at once.
- The settings of a device in the Hue Plus menu (a light's function, power-on behaviour, mounting direction and segment order; what each press of a switch or dimmer does, including its time-based light and scene cycle; whether a MotionAware area is on; what an entertainment area does when a sync stops and who streams for it) are no longer sent to the bridge as soon as they are chosen. They are a draft of that device, and the checkmark in its header sends only that device. Pages that act at once (updates, routines, Matter, apps, showing a colour on an area) are unchanged.
- Everything that saves now looks and behaves the same: a checkmark next to the close button, no big Save button, and closing with changes that are not saved (the close button, back, tapping outside) asks *Unsaved changes: Save / Discard changes / Cancel*. This is the classic scene editor, the live scene maker, the area editor and the bridge's light placement, the light editor and the devices of the Hue Plus menu. The area editor and the light editor used to close without asking; the "Save scene", "Save area" and "Save to the bridge" buttons are gone (frontend v231).
- An air conditioner that is off is no longer greyed out in its popup (the temperature slider and dial keep their colour). It still cannot be changed while it is off: no pointer input, and the dial leaves the keyboard tab order and ignores the arrow keys (frontend v229).

## [0.4.4]

### Added
- Switches in the Hue Plus menu: a switch lists its buttons, a button has a press and a long press, and each press is chosen like in the Hue app: time-based light, scene cycle (scenes in order, seconds before it restarts, smart on/off), single scene, brighten, dim, lights off, entire home off or do nothing. Also Time-based light (the times and their scenes, the Hue app's own schedule in one tap) and Entire home off. Needs Hue Plus 0.6.0; experimental, not tried on a real dimmer (frontend v228).

## [0.4.3]

### Fixed
- Importing a Hue bridge's entertainment area into the area editor put every light in the wrong place (mirrored): the bridge and the editor count the room's depth the opposite way round. A light now stands where the Hue app shows it, in both directions.

### Changed
- The Hue Plus menu in Settings is redone to look and be organised like the settings of the Hue app: groups of flat rows (Devices, Bridges, MotionAware areas, Entertainment areas, Routines and automations, Smart home, Software update, Applications), lights as tiles, the set-up of a light, switches, checklists for a choice, and primary and delete buttons. Nothing else on the dashboard changes (frontend v226). A bridge's entertainment area can be edited in the placement editor directly: light placement writes to the bridge, with each light's brightness balance, and the performance (auto or one light) can be chosen. Needs Hue Plus 0.5.1.

## [0.4.2]

### Fixed
- The options of a dropdown (a select entity's options, a climate's modes, a light's kinds) were put into the page as HTML; a device that named an option with markup could run script in the dashboard. They are now shown as text. The other places that build HTML from strings were checked: they only use fixed text, numbers, icons and names set as text.
- The heading "Everything else" in the entity picker no longer shows a trailing colon (a text key was defined twice and the later one, meant for the access summary, won).

### Changed
- Removed two unused helpers and two duplicated text keys (frontend v224).

## [0.4.1]

- The camera intercom card has a Listen button that plays the door's audio during a call (frontend v223).
- Installation notes now describe the Marketplace that replaces HACS in Home Assistant 2026.11.

## [0.4.0]

Includes frontend v216 to v222 below (the connection notice, binary low batteries, remotes, appliances, image remotes, vacuum extras, intercom and push to talk, alerts for any entity, scenes with other brands, the whole-room master option). The 0.3.0 version number was never released; its changes are included here.

- Scenes with other brands (frontend v222): when Scene engine is installed, a live scene whose area has a light that is not Hue's is played by Scene engine (which hands the Hue lights to Hue Plus when that is installed too, so a mixed scene moves as one); a scene whose lights are all Hue's stays with Hue Plus. Starting, stopping, speed, range, brightness, play and freeze, the libraries and the area editor follow the owner; stopping the Hue half of a mixed scene stops the whole scene. Hue Plus's looks, brightness effects and native effects are not part of Scene engine's scenes.
- Appliances, brand independent (frontend v218): *Add device, Appliance* (oven, washer, dryer, dishwasher or other) makes a device whose popup is built from slots the administrator binds with the entity selector: state, program, temperature, duration, start, stop, progress, time left, door, remote-start permission, and free extra rows. A slot that is not bound is not shown; each control follows its entity's own kind (a select is a selector, a number a slider, a button a button). Start is disabled, with the reason, while a bound remote-start permission is off or the Start entity is unavailable; nothing says "started" because a command was sent. A time left reads from a timestamp or a duration.
- Date and time helpers (v218): an `input_datetime` is a row that opens the browser's own time or date input and sets the helper, instead of a sensor reading.
- The lights master can change the whole room (v218): a section option, off by default, makes the master's brightness reach every light of the section even those that are off; the default stays "the lights that are on".
- Image remotes (v219): a remote can be a picture of a real remote with touch areas over it. Upload the picture (PNG, JPEG or WebP, up to 5 MB, checked by its first bytes, kept under a name the server makes, served from `/home_control_remotes`) or point at a file under `/local/`. Tap the picture to add a touch area, drag to move, drag the corner to resize, choose a rectangle or an ellipse and the entity. In use the areas are invisible, glow briefly and run their entity; nothing says "sent" and an error shows only when a command fails.
- Vacuum extras, intercom, push to talk and scenes entity (v220): a vacuum can have a map picture from any camera or image entity (nothing is drawn over it), room buttons, modes and upkeep values; a camera can have answer, reject, unlock (the one chosen entity only, never a fallback) and a call indicator, with answer and reject shown only while it rings; a camera can have push to talk, a microphone button held while talking, which opens the microphone and a second WebRTC session and says plainly when the camera does not take audio or the microphone is blocked; a light can show a scenes select from another entity.
- Devices with no room in Home Assistant (v220) are listed first on the new-devices page under their own heading, and say that only the dashboard is changed when a room is chosen.
- Alerts for any entity (v221): a notification rule that watches any entity for any state (a washer finishing, a call coming in), with its own recipients, kept as a Home Assistant automation like the others.
## [0.3.0]

Includes the changes of frontend v213 to v217 below (zones left out of a new dashboard, a renamable lights master, everything off in a room, connection notice, binary low batteries, custom remotes).

- Custom remotes, part one (frontend v217): *Add device, Remote* makes a remote that shows as a normal row and opens a popup with a grid of buttons (3 columns by default; 2 to 6 per remote, and a button can take 2 columns). An administrator switches the popup to *Edit buttons* and uses a "+" tile: the entity selector (a script, button, input button, scene or switch), then the icon selector, a label, the width, the order and removal. A press runs the right service (script on, button press, scene on, switch toggle) and says nothing unless it fails or the entity is unavailable. Image remotes follow.
- Connection notice (frontend v216): a "connection lost" notice that stayed after Home Assistant reported the connection back is cleared once Home Assistant has said connected for 3 seconds, and the dashboard follows a new connection object.
- Low batteries that only say low (frontend v216): a battery binary sensor can be tracked; it shows Low or OK, counts in the batteries tile and is watched by the low-battery notification.
- Everything off in a room (frontend v215). A power button sits first in the header's group of buttons on every room's page that has something to switch off. It turns off every device on that room's pages (lights, media players, climate, fans, switches), stops live scenes on those lights and respects view-only and confirm settings. In the page editor, tapping it opens a list of those devices with a switch each; an administrator can switch one off to leave it as it is (an air purifier, say), and the choice is kept with the layout. The dashboard also keeps one script per room in Home Assistant, `script.home_control_<room id>_off`, built from the same list (it reads each script first and writes only what differs, and removes only a script that carries its mark), so an automation, a button or a voice assistant can run it.
## [0.2.1]

- A new dashboard no longer puts the zones of a gradient light on a page (frontend v213): the zone lights of a light made of colour zones (a Play gradient tube) are left out of the first layout and of the list of new devices; the main light is added and controls its zones, and a zone can still be added by hand.
- The lights master can be renamed (frontend v213): the section's settings have a name field under *Lights master*; the name is used for its row, its popup header and its light panel. Empty means "All lights".

## [0.2.0]

First public version. Changes since the private 0.1.0:

- Works next to Hue Plus when Hue Plus leaves the Hue integration alone (frontend v212). The panel leaves out an entity of the Hue integration only when a Hue Plus entity with the same unique id stands in for it (before, it left out every Hue entity as soon as Hue Plus had any), so lights, scenes and sensors Hue Plus does not cover stay. When Hue Plus says scenes are Hue-only, only Hue lights can be placed in an area. The setup screen says that nothing else on Home Assistant changes and how to make the dashboard the default (Profile, Default dashboard: a setting of each browser, which an integration cannot change).
- The loader no longer reads `version.json` itself when the panel gives no list of files (frontend v211). That was kept for browsers holding the old panel; Home Assistant has been restarted since, and the panel is registered with the new version, so every browser gets the new one. An old panel would now show the load-failure message instead.
- The sun of the brightness slider no longer flashes or shifts when the slider closes (frontend v210). The button was hidden while the slider was open and shown again 0.3 s after it closed, in step with the slider hiding, so on some frames both or neither were visible; and the slider's sun sat 1 px higher than the button's. The button now stays in place under the slider, which is hidden over it at the end of closing, and the two suns are drawn at the same spot.
- One drawing from saved data, and a fading brightness fill (frontend v209). The dashboard used to draw at once from a layout made up on the spot (one room per Home Assistant area) and a default start page, then redraw when the saved layout and the account's settings arrived. That showed the areas that are not rooms in the bar, a box saying some lights are unavailable (lights not yet placed on a page counted as missing), and sometimes the Home page before the chosen start page. It now waits for the saved layout and the account's settings and draws once; if nothing is saved yet it still starts from the made-up layout, and a saved layout that cannot be read is asked for again every 2 s. The header chips and the connection check run with each update instead of on 2 s timers. Closing the brightness slider fades the fill out with it instead of cutting it.
- Faster start (frontend v208): the panel used to ask for the stylesheet, the adapter, the camera file, the app's loader and then its 49 files one step after another, each step waiting on the one before and on the registries. It now reads `version.json`, which lists the files, and asks for everything at once; the files run in the same order as before, from what has already arrived while the registries load. Nothing about versions changes: `version.json` is still read fresh on every start and every file still carries `?v=`. The list of files moved from `dashboard-app.js` to `version.json`; an older panel (kept by browsers until Home Assistant is restarted) still works, as `dashboard-app.js` then reads the list itself. A `version.json` that cannot be read now stops the start with a message; before, the files were requested as version 0.
- Sync popups use the light popup's brightness button (frontend v207). On the Spotify sync, Style, Intensity, Colour and Brightness are all 76 px wide, as the slider's button is; the Hue Play HDMI sync box popup gets the same button and rising slider in place of its brightness bar (it shows the box's own 0 to 200 scale). The sun in the slider starts as light as the button and turns dark over the fill with a fade, instead of changing colour at once.
- The brightness slider of the light popup opens upward from its button (frontend v205): it is the button grown taller, with the same width, corners and bottom edge, instead of a pill that was scaled into place and stretched its corners. Closing shrinks it back the same way.
- Scenes are told apart by their icon (frontend v203): classic scenes keep the scene icon, live scenes get the sparkle (also the old palette default; an icon someone chose stays), and Hue scenes get the palette icon.
- Deleting moved into settings (frontend v201): sections and devices no longer have a trash button in edit mode; they are deleted from their settings popups (Delete this section, Remove from the room). Now playing, a media device's setting, now decides what the remote popup shows: nothing (Off), the title row (On, as before) or the artwork card; it no longer touches the subtitle under the device's name on the page.
- The white wheel has the same colours in every light popup (frontend v198). Its top was the colour of the lowest temperature among the popup's lights, so a master with a deep orange bulb showed a red wheel; a light's range now only decides where on the wheel it sits.
- Saved colours belong to the room (frontend v197). A colour or white temperature saved from one light is on the other lights of the room and on its lights master; each holds one colour or one temperature, and colours kept together are a scene (saved palettes and zone presets are gone). In the Saved section the + beside the pencil saves what the selected light, or the first light of a group, shows now; All saved, shown while removing, copies a colour from another room. What was saved per light moves to its room the first time a light popup is opened by an administrator. The old light presets page in a room's settings is gone, and so is the hold-a-preset-to-make-a-scene popup.
- Editor and lights rework (frontend v196). Sections can no longer be dragged on the page (it was unreliable); they are ordered in the Reorder sections popup, and devices still drag inside their sections. A TV's artwork card is now a Now playing setting: Off, On or Artwork card. The section settings popup no longer lists the section's widgets. A scenes section lists its scenes together (made here, live, then Hue's), and the Hue scenes can be reordered. The power button of a lights section is always there: it turns the lights off, or, when all are off, back on as they were. The light popup lost the colour and white swatches and the Temperature section; colours and white temperatures are saved in one section, Saved (the old Presets). The new scene popup can save the lights as they are now (brightness, colour or temperature, running effect) as a classic scene and opens the editor on it; a classic scene's light can keep an effect.
- Scene makers rewritten. A + button on every scenes section (administrators) asks classic or live. A live scene asks for its areas (one or more; their lights are the lights it can use), then opens the light popup with one more light, Colors: separate it into up to 10 colours, give each its colour and brightness (thin line between them, as on the bed light), join a colour to a light to give that light the colour, turn the lights on and off, set each light's brightness and effect on its own tabs; below come the scene's settings (colour source, direction, speed, colour spread, brightness), a preview on the lights, and saving. Scenes keep the areas they play in and the lights they leave off; Hue Plus is given an area of the scene's own. Leaving a maker with changes asks Save or Discard. The old live scene editor and its pages are gone.
- Classic scenes: tapping a light opens the dashboard's light popup (wheel, separate a group, effects) with a tick that keeps it in the scene; the keep brightness and colour choices are gone. Devices slide open instead of jumping. A scene can start a live scene as one of its devices. Leaving with changes asks Save or Discard.
- Cleanup (frontend v187): workarounds replaced by their causes. The bottom bar's selection pill follows the selected item's size (it was placed after a 60 and a 400 millisecond guess); the safe areas of a phone are worked out by CSS, which keeps them current (a script re-measured them after 0.6 and 1.8 seconds); a page refresh asked for during a drag waits for the drag to end (it was retried every half second); a change to the Hue bridge reloads its list when the bridge has answered (it waited 900 milliseconds). A live update that fails is reported once in the browser console instead of being swallowed. This device's saved settings and the keeping of a drag with its element each have one helper instead of about twenty copies.
- With Hue Plus installed the dashboard shows nothing from the Hue integration: its entities are left out of the registry the dashboard reads, so each Hue scene, light and sensor appears once. Hue Plus's scenes are driven as Hue scenes (speed, brightness, running state) with `hue_plus.activate_scene`.
- New scene asks what kind first: fixed settings (lights, AC, TV at set levels) or colours and effects. A live scene can take its colours from a palette or a rainbow, carry up to four brightness effects (pulse, flicker, sparkle, lightning), give single lights their own colours, brightness, effects or the light's own effect (experimental), and switch other devices on or off when it starts. Needs Hue Plus with the live scene parts.
- Live scenes and areas: the dashboard no longer deletes or overwrites what Hue Plus holds. It writes what an administrator saves, deletes what they delete, and creates what Hue Plus lacks. Before, opening the dashboard deleted every scene and area made in Hue Plus that the dashboard did not know.
- Guided device setup: a TV's remote and a camera's stream, pan/tilt, privacy and detection entities are found by themselves or chosen from a searchable list; Advanced settings include them.
- Dashboard packaged as an integration: serves its files and registers its panel.
