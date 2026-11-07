# SPDX-License-Identifier: GPL-3.0-or-later
"""The engine stays free of Home Assistant and of any brand.

Its pure modules import nothing from Home Assistant or from the rest of Home Control, so the engine can be tested with fake lights and a
fake clock. A few thin files connect it to Home Assistant; they may take only the listed parts of Home Control. No file names a brand:
a plus integration declares what it knows of its lights (``providers.py``, decision D-13).
"""

import ast
import re
import unittest
from pathlib import Path

LIVE = Path(__file__).resolve().parents[2] / "custom_components" / "home_control" / "live"

# Connect the package to Home Assistant; every other module is pure.
THIN = {"__init__", "setup", "services", "spec", "websocket", "hass_driver", "providers", "resolve", "actions", "migration"}
# The one-time takeover of what Hue Plus saved (D-12) is the only file that names a brand; it goes when every install has moved over.
BRAND_EXEMPT = {"migration"}
# What the thin files may take from outside the package (relative to home_control).
ALLOWED_OUTSIDE = {"const", "service_support", "fieldspec", "effects"}
BRANDS = re.compile(r"hue_plus|hue plus|philips|govee|tuya|ikea", re.IGNORECASE)  # a brand, not the colour term "hue"


def imports(path: Path):
    """(module, level) of every import in a file."""
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name, 0
        elif isinstance(node, ast.ImportFrom):
            yield node.module or "", node.level


class BoundaryTests(unittest.TestCase):
    def test_the_package_has_the_files_this_test_knows_about(self):
        found = {p.stem for p in LIVE.glob("*.py")}
        self.assertTrue(found >= THIN, THIN - found)

    def test_pure_modules_import_neither_home_assistant_nor_the_rest_of_home_control(self):
        for path in sorted(LIVE.glob("*.py")):
            if path.stem in THIN:
                continue
            for module, level in imports(path):
                self.assertNotEqual(module.split(".")[0], "homeassistant", f"{path.name} imports {module}")
                self.assertLessEqual(level, 1, f"{path.name} reaches outside the package: {'.' * level}{module}")
                self.assertNotIn(module.split(".")[0], {"aiohue", "voluptuous"}, f"{path.name} imports {module}")

    def test_thin_files_take_only_the_allowed_parts_of_home_control(self):
        for stem in sorted(THIN):
            path = LIVE / f"{stem}.py"
            for module, level in imports(path):
                if level == 2:
                    self.assertIn(module.split(".")[0], ALLOWED_OUTSIDE | {""}, f"{path.name} imports ..{module}")
                self.assertLess(level, 3, path.name)

    def test_no_code_names_a_brand(self):
        """A brand may appear in a comment or a docstring, never in an import, an identifier or a string the code uses."""
        for path in sorted(LIVE.glob("*.py")):
            if path.stem in BRAND_EXEMPT:
                continue
            tree = ast.parse(path.read_text())
            docstrings = {
                id(node.body[0].value)
                for node in ast.walk(tree)
                if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                and node.body
                and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
            }
            for node in ast.walk(tree):
                names = []
                if isinstance(node, ast.Name):
                    names.append(node.id)
                elif isinstance(node, ast.Attribute):
                    names.append(node.attr)
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    names.append(node.name)
                elif isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
                    names.append(node.value)
                for name in names:
                    self.assertIsNone(BRANDS.search(name), f"{path.name} names a brand: {name!r}")
            for module, _ in imports(path):
                self.assertIsNone(BRANDS.search(module), f"{path.name} imports {module}")


if __name__ == "__main__":
    unittest.main()
