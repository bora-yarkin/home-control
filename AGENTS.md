# Home Control: project instructions

- Domain `home_control`. The integration serves `custom_components/home_control/frontend/` and registers one panel; all
  behaviour is in the browser code there. `frontend/README.md` describes the files.
- Raise `frontend/version.json` after changing any frontend file (it is the cache key of every file).
- Home Control owns live scenes, areas and their playing, for any light (`custom_components/home_control/live/`, services `home_control.scene_*`; decision D-12). The browser shows and edits them and keeps a copy: it writes only what an administrator just saved, deletes only what they just deleted, and creates what the integration lacks; it never deletes or overwrites anything else. Static scenes (device settings run from the browser) are the dashboard's too. A brand's "plus" integration (Hue Plus) expands what this does for its lights through `home_control.json`, its own services and one script of its own pages in the plugin API (`docs/plugin-api.md`, D-13); nothing brand specific lives in `live/`, and the effects of a light are data (`docs/effects-file.md`, D-15). The Hue menu, the bridge's entertainment areas and Hue's effect catalogue are Hue Plus's (its repository), not here; Hue's scenes and their import, the Spotify sync, the sync box and the gradient styles are Hue Plus's too (plugin API hooks). Nothing Hue-specific is left in the frontend; which entities a plus integration replaces is its own declaration (`replaces`), and what a light made of zones is stays here, for any brand.
- Everything specific to one integration lives in `frontend/integrations.js` and is shown only when that integration is
  present; the application must run with none of them installed.
- Test dashboard changes in a sealed copy that cannot write to Home Assistant, and check that user data is unchanged.
- No personal data in the repository: no real entity ids, names, addresses or screenshots of a real home.
- Licence GPL-3.0-or-later; Python files start with the SPDX line. Public at https://github.com/bora-yarkin/home-control, installed through the Marketplace (HACS inside Home Assistant) as a custom repository (not in its default list).
- Tests: `.venv/bin/python -m pytest` (the integration) and `node --test tests/frontend` (the setup logic in `frontend/app/kinds.js`).
