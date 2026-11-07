# SPDX-License-Identifier: GPL-3.0-or-later
"""services.yaml and the service texts are what scripts/generate_services.py writes from the spec, and the spec and the handlers agree."""

import importlib.util
from pathlib import Path

from custom_components.home_control.live import services as live_services
from custom_components.home_control.live import spec

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / "custom_components" / "home_control"


def _generator():
    found = importlib.util.spec_from_file_location("generate_services", ROOT / "scripts" / "generate_services.py")
    module = importlib.util.module_from_spec(found)
    found.loader.exec_module(module)
    return module


def test_the_generated_files_are_up_to_date():
    for target, content in _generator().render().items():
        assert (FOLDER / target).read_text(encoding="utf-8") == content, f"{target} is out of date: run scripts/generate_services.py"


def test_every_spec_has_a_handler_and_every_handler_a_spec():
    assert set(live_services.HANDLERS) == set(spec.SPEC)
