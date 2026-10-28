# Contributing to Home Control

Thank you for helping. Open an issue before a large change so the direction can be agreed first.

- **Licence.** The project is GPL-3.0-or-later; your contribution is under the same licence.
- **Layout.** `custom_components/home_control/` is the integration. See `AGENTS.md` for the rules about structure.
- **Style.** Clear names, comments that say why, no dead code, no new dependency without discussion.
- **Checks.** `ruff check .`, `ruff format --check .` and `pytest` must pass. Add a test for new behaviour.
- **Commits.** One topic per commit, a message that says why. Update `CHANGELOG.md`.
- **Secrets.** Never commit a token, key, log or capture that contains one.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
