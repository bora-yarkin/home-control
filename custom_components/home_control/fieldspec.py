# SPDX-License-Identifier: GPL-3.0-or-later
"""The one way a service field is described, shared by every module's ``spec.py``. No Home Assistant imports."""

from __future__ import annotations

from typing import Any


def f(type_: str, description: str, required: bool = False, **extra: Any) -> dict[str, Any]:
    """A service field.

    ``type_`` is how the value is read: "text"; "number", "int", "bool"; "select" (one of ``options``) and "select_list";
    "list" (a list of texts); "object" (data, or JSON text); "xy" (a list of [x, y] pairs) and "xy_one" (one pair);
    "lights" (a list of objects) and "time".
    """
    return {"type": type_, "description": description, "required": required, **extra}
