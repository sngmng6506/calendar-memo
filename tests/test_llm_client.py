import json
import unittest
from unittest.mock import patch

from daymark.services.llm_client import LlmError, OpenAICompatibleClient


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self) -> bytes:
        return json.dumps({"choices": [{"message": {"content": "보고서"}}]}).encode()


class InvalidJsonResponse(FakeResponse):
    def read(self) -> bytes:
        return b"not-json"


class NullContentResponse(FakeResponse):
    def read(self) -> bytes:
        return json.dumps({"choices": [{"message": {"content": None}}]}).encode()


class LlmClientTest(unittest.TestCase):
    def test_requires_api_key(self) -> None:
        with self.assertRaises(LlmError):
            OpenAICompatibleClient(api_key="").generate("system", "user")

    @patch("urllib.request.urlopen", return_value=FakeResponse())
    def test_parses_openai_compatible_response(self, mocked) -> None:
        client = OpenAICompatibleClient(api_key="test", base_url="https://example.com/v1")
        self.assertEqual("보고서", client.generate("system", "user"))
        request = mocked.call_args.args[0]
        self.assertEqual("https://example.com/v1/chat/completions", request.full_url)

    def test_invalid_base_url_is_wrapped(self) -> None:
        client = OpenAICompatibleClient(api_key="test", base_url="not-a-url")
        with self.assertRaises(LlmError):
            client.generate("system", "user")

    @patch("urllib.request.urlopen", return_value=InvalidJsonResponse())
    def test_invalid_json_is_wrapped(self, _mocked) -> None:
        client = OpenAICompatibleClient(api_key="test", base_url="https://example.com/v1")
        with self.assertRaises(LlmError):
            client.generate("system", "user")

    @patch("urllib.request.urlopen", return_value=NullContentResponse())
    def test_null_content_is_wrapped(self, _mocked) -> None:
        client = OpenAICompatibleClient(api_key="test", base_url="https://example.com/v1")
        with self.assertRaises(LlmError):
            client.generate("system", "user")


if __name__ == "__main__":
    unittest.main()
