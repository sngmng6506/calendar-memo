import json
from pathlib import Path
import tempfile
import unittest

from daymark.settings import AppSettings, SettingsStore, clamp_opacity


class SettingsStoreTest(unittest.TestCase):
    def test_missing_and_corrupt_files_use_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            store = SettingsStore(path)
            defaults = store.load()
            self.assertEqual("gpt-4.1-mini", defaults.llm_model)
            self.assertEqual(0, defaults.desktop_display_index)
            self.assertEqual(0.94, defaults.window_opacity)
            path.write_text("not-json", encoding="utf-8")
            self.assertEqual("https://api.openai.com/v1", store.load().llm_base_url)

    def test_save_persists_monitor_and_opacity_without_api_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            store = SettingsStore(path)
            store.save(
                AppSettings(
                    llm_model="test-model",
                    desktop_mode=False,
                    desktop_display_index=2,
                    window_opacity=0.84,
                )
            )
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual("test-model", data["llm_model"])
            self.assertFalse(data["desktop_mode"])
            self.assertEqual(2, data["desktop_display_index"])
            self.assertEqual(0.84, data["window_opacity"])
            self.assertNotIn("api_key", data)

    def test_opacity_is_clamped_when_loaded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            path.write_text(
                json.dumps(
                    {
                        "desktop_display_index": -5,
                        "window_opacity": 0.1,
                    }
                ),
                encoding="utf-8",
            )
            loaded = SettingsStore(path).load()
            self.assertEqual(0, loaded.desktop_display_index)
            self.assertEqual(0.78, loaded.window_opacity)
            self.assertEqual(1.0, clamp_opacity(3))


if __name__ == "__main__":
    unittest.main()
