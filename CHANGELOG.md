# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.9.3] - 2026-11-08

### Fixed
- A scene taken off every page (un-ticked in the page editor) is still saved, so its area could not be deleted and the message named only one scene, which could not be seen anywhere. The message now names every scene that is on a page and uses the area; scenes that are on no page are named in a question and deleted with the area when you confirm.
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
