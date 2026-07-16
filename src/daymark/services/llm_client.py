from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass


class LlmError(RuntimeError):
    pass


@dataclass(slots=True)
class OpenAICompatibleClient:
    api_key: str
    model: str = "gpt-4.1-mini"
    base_url: str = "https://api.openai.com/v1"
    timeout_seconds: int = 60

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        if not self.api_key.strip():
            raise LlmError("API 키가 설정되지 않았습니다.")
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        payload = json.dumps(
            {
                "model": self.model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise LlmError(f"LLM 요청 실패 ({exc.code}): {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise LlmError(f"LLM 서버에 연결할 수 없습니다: {exc}") from exc
        try:
            return body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise LlmError("LLM 응답 형식을 해석할 수 없습니다.") from exc
