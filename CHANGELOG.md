# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

- With Hue Plus installed the dashboard shows nothing from the Hue integration: its entities are left out of the registry the dashboard reads, so each Hue scene, light and sensor appears once. Hue Plus's scenes are driven as Hue scenes (speed, brightness, running state) with `hue_plus.activate_scene`.
- New scene asks what kind first: fixed settings (lights, AC, TV at set levels) or colours and effects. A live scene can take its colours from a palette or a rainbow, carry up to four brightness effects (pulse, flicker, sparkle, lightning), give single lights their own colours, brightness, effects or the light's own effect (experimental), and switch other devices on or off when it starts. Needs Hue Plus with the live scene parts.
- Live scenes and areas: the dashboard no longer deletes or overwrites what Hue Plus holds. It writes what an administrator saves, deletes what they delete, and creates what Hue Plus lacks. Before, opening the dashboard deleted every scene and area made in Hue Plus that the dashboard did not know.
- Guided device setup: a TV's remote and a camera's stream, pan/tilt, privacy and detection entities are found by themselves or chosen from a searchable list; Advanced settings include them.
- Dashboard packaged as an integration: serves its files and registers its panel.
