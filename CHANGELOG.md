# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

- Live scenes and areas: the dashboard no longer deletes or overwrites what Hue Plus holds. It writes what an administrator saves, deletes what they delete, and creates what Hue Plus lacks. Before, opening the dashboard deleted every scene and area made in Hue Plus that the dashboard did not know.
- Guided device setup: a TV's remote and a camera's stream, pan/tilt, privacy and detection entities are found by themselves or chosen from a searchable list; Advanced settings include them.
- Dashboard packaged as an integration: serves its files and registers its panel.
