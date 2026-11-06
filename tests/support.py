# SPDX-License-Identifier: GPL-3.0-or-later
"""Loads the integration's Home-Assistant-free modules as a package of their own, without running the integration's
``__init__`` (which needs Home Assistant). Testing them this way keeps them honest: they cannot import Home Assistant."""

from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path
from typing import Any

PACKAGE = "home_control_pure"
FOLDER = Path(__file__).resolve().parent.parent / "custom_components" / "home_control"


def load(dotted: str) -> Any:
    """The module with this dotted name inside the integration, for example ``live.engine``."""
    if PACKAGE not in sys.modules:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(FOLDER)]  # type: ignore[attr-defined]
        sys.modules[PACKAGE] = package
    return importlib.import_module(f"{PACKAGE}.{dotted}")
