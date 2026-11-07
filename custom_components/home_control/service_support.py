# SPDX-License-Identifier: GPL-3.0-or-later
"""Reads the fields of a service from its spec (``live/spec.py``), so the schema, ``services.yaml`` and the translations cannot disagree."""

from __future__ import annotations

import json
from typing import Any

import voluptuous as vol
from homeassistant.helpers import config_validation as cv


def _object(value: Any) -> Any:
    """Data, or JSON text holding data (a service form hands over text)."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError as err:
            raise vol.Invalid(f"not valid JSON: {err}") from err
    if isinstance(value, (dict, list)):
        return value
    raise vol.Invalid("expected an object or a list")


def reader(definition: dict[str, Any]) -> Any:
    """The voluptuous validator for one field of a spec."""
    number = vol.Coerce(float)
    low, high = definition.get("min"), definition.get("max")
    integer = vol.All(vol.Coerce(int), vol.Range(min=low, max=high)) if low is not None or high is not None else vol.Coerce(int)
    readers = {
        "text": cv.string,
        "number": number,
        "int": integer,
        "bool": cv.boolean,
        "select": vol.In(definition.get("options") or []),
        "select_list": vol.All(cv.ensure_list, [vol.In(definition.get("options") or [])]),
        "list": vol.All(cv.ensure_list, [cv.string]),
        "object": _object,
        "xy": vol.All(_object, [vol.All([number], vol.Length(2, 2))]),
        "xy_one": vol.All(_object, vol.All([number], vol.Length(2, 2))),
        "lights": [dict],
        "time": cv.time,
    }
    return readers[definition["type"]]


def schema_for(fields: dict[str, dict[str, Any]]) -> vol.Schema:
    """The schema of a service: every field of its spec."""
    schema: dict[Any, Any] = {}
    for field, definition in fields.items():
        marker = vol.Required(field) if definition["required"] else vol.Optional(field, default=definition.get("default", vol.UNDEFINED))
        schema[marker] = reader(definition)
    return vol.Schema(schema)
