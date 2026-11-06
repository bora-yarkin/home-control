# SPDX-License-Identifier: GPL-3.0-or-later
import json
import unittest

from tests.support import load

lib = load("live.library")
defs = load("live.definitions")
defaults = load("live.defaults")

LIGHTS = [{"entity_id": "light.a", "x": -1, "y": 0, "z": 0}, {"entity_id": "light.b", "x": 1, "y": 0, "z": 0}]


class PresetTests(unittest.TestCase):
    def test_every_shipped_preset_starts_on_an_area(self):
        presets = defaults.presets()
        self.assertGreaterEqual(len(presets), 12)
        library = lib.Library()
        library.save_area({"id": "room", "name": "Room", "lights": LIGHTS})
        for preset_id in presets:
            request = library.request({"scene_id": "x", "preset": preset_id, "area": "room"})
            definition = defs.parse_definition(request)
            self.assertEqual(len(definition.lights), 2, preset_id)
            self.assertTrue(1 <= definition.speed <= 12, preset_id)

    def test_presets_are_copies_so_changing_one_does_not_change_the_next_call(self):
        first = defaults.presets()["candle"]
        first["palette"].clear()
        self.assertTrue(defaults.presets()["candle"]["palette"])

    def test_preset_names_and_ids_are_unique(self):
        presets = defaults.presets().values()
        self.assertEqual(len({p["id"] for p in presets}), len(presets))
        self.assertEqual(len({p["name"] for p in presets}), len(presets))


class SaveTests(unittest.TestCase):
    def setUp(self):
        self.library = lib.Library()

    def test_a_saved_scene_keeps_only_what_was_given(self):
        scene = self.library.save_scene({"id": "evening", "name": " Evening ", "preset": "sunset_glow", "speed": 3})
        self.assertEqual(scene, {"id": "evening", "name": "Evening", "ui": {}, "speed": 3, "preset": "sunset_glow"})

    def test_bad_input_is_refused_and_nothing_is_stored(self):
        bad = [
            {"id": "Bad Id", "name": "x"},
            {"id": "ok", "name": ""},
            {"id": "ok", "name": "x", "palette": []},
            {"id": "ok", "name": "x", "palette": [{"hs": [400, 50]}]},
            {"id": "ok", "name": "x", "speed": 13},
            {"id": "ok", "name": "x", "spread": "diagonal"},
            {"id": "ok", "name": "x", "preset": "nope"},
            {"id": "ok", "name": "x", "ui": {"blob": "x" * (lib.MAX_UI_BYTES + 1)}},
        ]
        for raw in bad:
            with self.assertRaises(defs.DefinitionError, msg=raw):
                self.library.save_scene(raw)
        self.assertEqual(self.library.scenes, {})

    def test_an_area_needs_lights_and_valid_places(self):
        for lights in (None, [], [{"entity_id": "switch.a"}], [{"entity_id": "light.a", "x": 2}], LIGHTS + LIGHTS):
            with self.assertRaises(defs.DefinitionError, msg=lights):
                self.library.save_area({"id": "a", "name": "A", "lights": lights})

    def test_the_number_of_saved_things_is_limited_but_replacing_is_not(self):
        for i in range(lib.MAX_AREAS):
            self.library.save_area({"id": f"a{i}", "name": "A", "lights": LIGHTS})
        with self.assertRaises(defs.DefinitionError):
            self.library.save_area({"id": "one-too-many", "name": "A", "lights": LIGHTS})
        self.library.save_area({"id": "a0", "name": "Renamed", "lights": LIGHTS})
        self.assertEqual(self.library.areas["a0"]["name"], "Renamed")

    def test_what_is_stored_survives_json_and_comes_back_equal(self):
        self.library.save_area({"id": "room", "name": "Room", "lights": LIGHTS, "ui": {"things": [1, 2]}})
        self.library.save_scene({"id": "s", "name": "S", "preset": "ocean", "area": "room"})
        again, problems = lib.Library.restore(json.loads(json.dumps(self.library.as_json())))
        self.assertEqual(again.as_json(), self.library.as_json())
        self.assertEqual(problems, [])

    def test_delete_reports_whether_anything_was_deleted(self):
        self.library.save_area({"id": "room", "name": "Room", "lights": LIGHTS})
        self.library.save_scene({"id": "s", "name": "S", "preset": "ocean", "area": "room"})
        self.assertTrue(self.library.delete_area("room"))
        self.assertFalse(self.library.delete_area("room"))
        self.assertTrue(self.library.delete_scene("s"))
        self.assertFalse(self.library.delete_scene("s"))


class RestoreTests(unittest.TestCase):
    """What comes back from storage is checked like a start call: a damaged file never starts anything wrong."""

    GOOD_AREA = {"id": "room", "name": "Room", "lights": LIGHTS, "ui": {}}
    GOOD_SCENE = {"id": "s", "name": "S", "ui": {}, "preset": "ocean", "area": "room"}

    def test_nothing_stored_is_an_empty_library(self):
        for stored in (None, {}):
            library, problems = lib.Library.restore(stored)
            self.assertEqual((library.scenes, library.areas, problems), ({}, {}, []))

    def test_unreadable_data_starts_empty_and_says_so(self):
        for stored in ("text", 5, [1], {"scenes": "x", "areas": 3}):
            library, problems = lib.Library.restore(stored)
            self.assertEqual((library.scenes, library.areas), ({}, {}), stored)
            self.assertTrue(problems, stored)

    def test_an_invalid_entry_is_dropped_and_named_but_the_others_are_kept(self):
        stored = {
            "areas": {"room": self.GOOD_AREA, "bad": {"id": "bad", "name": "Bad", "lights": [{"entity_id": "lock.door"}]}},
            "scenes": {"s": self.GOOD_SCENE, "x": {"id": "x", "name": "X", "speed": 99}},
        }
        library, problems = lib.Library.restore(stored)
        self.assertEqual(list(library.areas), ["room"])
        self.assertEqual(list(library.scenes), ["s"])
        self.assertEqual(len(problems), 2)
        self.assertTrue(any("bad" in p for p in problems))
        self.assertTrue(any("'x'" in p for p in problems))

    def test_an_entry_stored_under_another_id_is_dropped(self):
        library, problems = lib.Library.restore({"scenes": {"other": self.GOOD_SCENE}})
        self.assertEqual(library.scenes, {})
        self.assertEqual(len(problems), 1)

    def test_more_than_the_limit_keeps_the_limit_and_says_so(self):
        areas = {f"a{i}": {"id": f"a{i}", "name": "A", "lights": LIGHTS} for i in range(lib.MAX_AREAS + 3)}
        library, problems = lib.Library.restore({"areas": areas})
        self.assertEqual(len(library.areas), lib.MAX_AREAS)
        self.assertEqual(len(problems), 3)

    def test_restoring_does_not_keep_unknown_fields(self):
        scene = {**self.GOOD_SCENE, "sneaky": "<script>"}
        library, _ = lib.Library.restore({"areas": {"room": self.GOOD_AREA}, "scenes": {"s": scene}})
        self.assertNotIn("sneaky", library.scenes["s"])


class RequestTests(unittest.TestCase):
    def setUp(self):
        self.library = lib.Library()
        self.library.save_area({"id": "room", "name": "Room", "lights": LIGHTS})
        self.library.save_scene({"id": "s", "name": "S", "preset": "ocean", "area": "room", "speed": 2})

    def test_the_call_wins_over_the_saved_scene_which_wins_over_the_preset(self):
        ocean = defaults.presets()["ocean"]
        self.assertEqual(self.library.request({"scene_id": "s"})["speed"], 2)
        self.assertEqual(self.library.request({"scene_id": "s"})["range"], ocean["range"])
        self.assertEqual(self.library.request({"scene_id": "s", "speed": 9})["speed"], 9)

    def test_lights_come_from_the_call_then_the_named_area_then_the_saved_scene(self):
        own = [{"entity_id": "light.c"}]
        self.assertEqual(self.library.request({"scene_id": "s", "lights": own})["lights"], own)
        self.library.save_area({"id": "other", "name": "Other", "lights": own})
        self.assertEqual(self.library.request({"scene_id": "s", "area": "other"})["lights"][0]["entity_id"], "light.c")
        self.assertEqual(len(self.library.request({"scene_id": "s"})["lights"]), 2)

    def test_what_cannot_be_started_is_explained(self):
        for data, words in (
            ({"scene_id": "new"}, "lights"),
            ({"scene_id": "new", "lights": LIGHTS}, "palette"),
            ({"scene_id": "new", "preset": "nope", "lights": LIGHTS}, "preset"),
            ({"scene_id": "s", "area": "gone"}, "area"),
        ):
            with self.assertRaises(defs.DefinitionError, msg=data) as caught:
                self.library.request(data)
            self.assertIn(words, str(caught.exception))

    def test_an_inline_definition_without_anything_saved_starts(self):
        request = self.library.request({"scene_id": "inline", "lights": LIGHTS, "palette": [{"k": 2700}], "speed": 5})
        self.assertEqual(defs.parse_definition(request).speed, 5)


if __name__ == "__main__":
    unittest.main()
