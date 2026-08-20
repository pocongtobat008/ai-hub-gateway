"""Bansos provider — connects to bansos-router daemon for free keyless models."""
from __future__ import annotations

import json
import logging
import time
import uuid
import threading
from typing import Any, Iterator

import httpx

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 60.0

# Free models seeded from bansos-router
BANSOS_MODELS = [
    # OpenCode Zen
    "deepseek-v4-flash-free",
    "mimo-v2.5-free",
    "nemotron-3-ultra-free",
    "big-pickle",
    "laguna-s-2.1-free",
    # KiloCode
    "kilo-auto/free",
    "stepfun/step-3.7-flash:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3.5-lightning:free",
    "poolside/laguna-s-2.1:free",
    "cohere/north-mini-code:free",
    # LLM7
    "default",
    "fast",
]


def is_bansos_model(model: str) -> bool:
    """Check if model belongs to a bansos account."""
    from services.bansos_account_service import list_accounts
    for acc in list_accounts():
        if model in (acc.get("models") or []):
            return True
    return False


def get_all_bansos_models() -> list[dict[str, Any]]:
    """Return all registered bansos models."""
    from services.bansos_account_service import list_accounts
    models = []
    seen = set()
    for acc in list_accounts():
        for model_id in acc.get("models", []):
            if model_id and model_id not in seen:
                seen.add(model_id)
                models.append({
                    "id": model_id,
                    "object": "model",
                    "created": 0,
                    "owned_by": "bansos",
                    "permission": [],
                    "root": model_id,
                    "parent": None,
                    "capabilities": ["chat"],
                    "available": True,
                    "display_name": model_id,
                    "account_id": acc.get("id", ""),
                })
    return models


class BansosProvider:
    """Routes requests to bansos-router daemon."""

    def __init__(self):
        self._index = 0
        self._lock = threading.Lock()

    def _pick_account(self, model: str) -> dict[str, Any] | None:
        from services.bansos_account_service import list_accounts
        accounts = list_accounts()
        if not accounts:
            return None
        matching = [a for a in accounts if model in (a.get("models") or [])]
        if not matching:
            matching = accounts
        with self._lock:
            for _ in range(len(matching)):
                idx = self._index % len(matching)
                self._index = (self._index + 1) % len(matching)
                return matching[idx]
        return None

    def chat_completion(
        self, messages: list[dict[str, Any]], model: str,
        stream: bool = False, **kwargs: Any,
    ) -> dict[str, Any] | Iterator[dict[str, Any]]:
        max_retries = 3
        last_error = ""
        for attempt in range(max_retries):
            acc = self._pick_account(model)
            if acc is None:
                raise RuntimeError("No Bansos accounts configured. Add one in Bansos Accounts.")
            base_url = acc.get("daemon_url", "http://127.0.0.1:17070")
            try:
                if stream:
                    return self._stream(base_url, messages, model)
                else:
                    return self._complete(base_url, messages, model)
            except Exception as exc:
                last_error = str(exc)
                logger.warning("Bansos attempt %d failed: %s", attempt + 1, last_error)
        raise RuntimeError(f"All Bansos attempts failed: {last_error}")

    def _complete(self, base_url: str, messages: list[dict[str, Any]], model: str) -> dict[str, Any]:
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        payload = {"model": model, "messages": messages, "stream": False}
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.post(url, json=payload, headers={"Content-Type": "application/json"})
        if resp.status_code != 200:
            error = f"HTTP {resp.status_code}"
            try:
                err = resp.json()
                error = err.get("error", {}).get("message", error)
            except Exception:
                pass
            raise RuntimeError(error)
        return resp.json()

    def _stream(self, base_url: str, messages: list[dict[str, Any]], model: str) -> Iterator[dict[str, Any]]:
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        payload = {"model": model, "messages": messages, "stream": True}
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            with client.stream("POST", url, json=payload, headers={"Content-Type": "application/json"}) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"HTTP {resp.status_code}")
                for line in resp.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        return
                    try:
                        yield json.loads(data_str)
                    except json.JSONDecodeError:
                        continue


bansos_provider = BansosProvider()
