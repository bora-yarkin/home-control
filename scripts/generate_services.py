# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes services.yaml and the ``services`` part of strings.json and translations/en.json from the services' spec
(custom_components/home_control/live/spec.py).

Run from the repository root with the development environment:  .venv/bin/python scripts/generate_services.py
`tests/test_generated_files.py` fails when the files in the repository are not what this writes.
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from custom_components.home_control.live import spec  # noqa: E402

FOLDER = ROOT / "custom_components" / "home_control"

SELECTORS = {
    "text": lambda d: {"text": None},
    "number": lambda d: {"number": {"mode": "box", "step": "any"}},
    "int": lambda d: {"number": {"mode": "box", "min": d.get("min", 0), "max": d.get("max", 100), "step": 1}},
    "bool": lambda d: {"boolean": None},
    "select": lambda d: {"select": {"options": d["options"]}},
    "select_list": lambda d: {"select": {"options": d["options"], "multiple": True}},
    "list": lambda d: {"object": None},
    "object": lambda d: {"object": None},
    "xy": lambda d: {"object": None},
    "xy_one": lambda d: {"object": None},
    "lights": lambda d: {"object": None},
    "time": lambda d: {"time": None},
}


def yaml_services() -> tuple[str, dict]:
    lines: list[str] = []
    strings: dict = {}
    for name, service in spec.SPEC.items():
        fields = service["fields"]
        lines.append(f"{name}:")
        if fields:
            lines.append("  fields:")
        strings[name] = {"name": name.replace("_", " ").capitalize(), "description": service["description"], "fields": {}}
        for field, d in fields.items():
            # Field names are quoted: YAML reads a bare `on` as true, which Home Assistant rejects.
            lines.append(f'    "{field}":')
            if d["required"]:
                lines.append("      required: true")
            if "default" in d:
                lines.append(f"      default: {json.dumps(d['default'])}")
            if "example" in d:
                lines.append(f"      example: {json.dumps(d['example'])}")
            lines.append("      selector:")
            for kind, options in SELECTORS[d["type"]](d).items():
                if options is None:
                    lines.append(f"        {kind}: {{}}")
                else:
                    lines.append(f"        {kind}:")
                    for key, value in options.items():
                        lines.append(f"          {key}: {json.dumps(value)}")
            strings[name]["fields"][field] = {"name": field.replace("_", " ").capitalize(), "description": d["description"]}
        lines.append("")
    return "\n".join(lines), strings


def render() -> dict[str, str]:
    yaml_text, services = yaml_services()
    out = {"services.yaml": yaml_text}
    for target in ("strings.json", "translations/en.json"):
        current = json.loads((FOLDER / target).read_text(encoding="utf-8"))
        current["services"] = services
        out[target] = json.dumps(current, indent=2, ensure_ascii=False) + "\n"
    return out


if __name__ == "__main__":
    for target, content in render().items():
        (FOLDER / target).write_text(content, encoding="utf-8")
    print("services:", len(spec.SPEC))
