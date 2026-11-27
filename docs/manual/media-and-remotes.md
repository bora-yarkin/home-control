# TVs, speakers and remotes

## Media players

<img src="../images/remote.png" width="300" alt="TV remote">

A media row opens now playing, volume and sources. Set whether it's a TV, receiver or speaker in the device's options. A TV with a linked `remote` entity gets a full remote.

I use the Samsung, Apple TV and Android TV Remote layouts on real devices. The Roku, Sony Bravia, Philips, Vizio, Fire TV and LG webOS ones are built from their integrations' documentation and marked experimental.

The built-in `samsungtv` integration doesn't report inputs. Samsung TV Smart does, and its input list is set in that integration's options.

## Adding a remote

Add item → Remote gives three choices:

- Ready-made remote. Pick a media player. If it has no remote entity of its own you're asked which one sends its keys, which is common when a streaming box shows up under two integrations.
- Remote master, described below.
- Build your own, which starts empty.

## Changing ready-made buttons

A button only shows if the TV's integration can do what it says. To change one, edit the page, open the TV and choose Remote buttons. Each button can be automatic, hidden, or pointed at something else: a script, button, scene or switch, a remote key, or a media control. Keyboard accepts a text field, a script (it receives `text`), or a player that can type. Screen brightness takes a number, and Apps and inputs takes a source list or a select.

Typing depends on the integration. Samsung needs `samsungtv_smart`. Apple TV only types while its on-screen keyboard is open. Android TV Remote needs Enable IME turned on in its options. Roku and Vizio can type. Sony Bravia, Philips, Fire TV and LG webOS don't document it, so their keyboard only appears if you give it a source. No integration documents screen brightness, so the remote uses the TV's Backlight number if it has one.

## The remote builder

For a grid, choose the number of columns and add buttons: entities, remote keys, media actions and sources, a five-way pad, a touchpad, now playing, a source menu, a keyboard, a slider or a gap. Drag to reorder and set each one's size. You can also give your grid the look of the built-in Samsung and Apple TV remotes.

Or use a picture: upload a photo of your real remote (PNG, JPEG or WebP, up to 5 MB) or use a `/local/` file, and draw touch areas over the buttons.

## Remote master

One remote for a TV and everything plugged into it. Pick the default device, usually the TV, which also owns the power button. Add the other devices with the input each one uses, and choosing one switches the TV to that input. Buttons a device doesn't have stay with the TV. Speakers appear as volume sliders.

A menu next to the power button switches between devices, and it can remember your last choice. Each device can have its own name, icon and button roles, and you can build custom remotes inside the master.
