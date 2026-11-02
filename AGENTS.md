# Home Control: project instructions

- Domain `home_control`. The integration serves `custom_components/home_control/frontend/` and registers one panel; all
  behaviour is in the browser code there. `frontend/README.md` describes the files.
- Raise `frontend/version.json` after changing any frontend file (it is the cache key of every file).
- Hue Plus owns live scenes, areas and effects (it keeps them; the dashboard shows and edits them through Hue Plus). The dashboard writes only what an administrator just saved, deletes only what they just deleted, and creates what Hue Plus lacks; it never deletes or overwrites anything else. Static scenes (device settings run from the browser) belong to the dashboard.
- Everything specific to one integration lives in `frontend/integrations.js` and is shown only when that integration is
  present; the application must run with none of them installed.
- Test dashboard changes in a sealed copy that cannot write to Home Assistant, and check that user data is unchanged.
- No personal data in the repository: no real entity ids, names, addresses or screenshots of a real home.
- Licence GPL-3.0-or-later; Python files start with the SPDX line. Public at https://github.com/bora-yarkin/home-control, installed through HACS as a custom repository (not in the HACS default list).
- Tests: `.venv/bin/python -m pytest` (the integration) and `node --test tests/frontend` (the setup logic in `frontend/app/kinds.js`).
