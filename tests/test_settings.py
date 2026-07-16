from pathlib import Path
import tempfile
import unittest

from daymark.settings import AppSettings, SettingsStore


class SettingsStoreTest(unittest.TestCase):
    def test_missing_and_corrupt_files_use_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            store = SettingsStore(path)
            self.assertEqual("gpt-4.1-mini", store.load().llm_model)
            path.write_text("not-json", encoding="utf-8")
            self.assertEqual("https://api.openai.com/v1", store.load().llm_base_url)

    def test_save_does_not_include_api_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            store = SettingsStore(path)
            store.save(AppSettings(llm_model="test-model"))
            content = path.read_text(encoding="utf-8")
            self.assertIn("test-model", content)
            self.assertNotIn("api_key", content)


if __name__ == "__main__":
    unittest.main()
