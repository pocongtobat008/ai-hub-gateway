"""Custom provider — round-robin OpenAI-compatible API with model validation."""
from __future__ import annotations

import json
import logging
import time
import uuid
import threading
from typing import Any, Iterator

import httpx

from services.custom_account_service import (
    get_all_endpoints,
    get_credentials,
    mark_error,
    mark_used,
)

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 60.0

# Cache: account_id -> list of model IDs
_model_cache: dict[str, list[str]] = {}
_cache_lock = threading.Lock()


def is_custom_model(model: str) -> bool:
    """Check if a model ID belongs to any custom provider account."""
    from services.custom_account_service import list_accounts
    for acc in list_accounts():
        if model in (acc.get("models") or []):
            return True
    return False


def get_all_custom_models() -> list[dict[str, Any]]:
    """Return all registered custom models across all accounts."""
    from services.custom_account_service import list_accounts
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
                    "owned_by": "custom",
                    "permission": [],
                    "root": model_id,
                    "parent": None,
                    "capabilities": ["chat"],
                    "available": True,
                    "display_name": model_id,
                    "account_id": acc.get("id", ""),
                    "base_url": acc.get("base_url", ""),
                })
    return models


def validate_models(base_url: str, api_key: str) -> list[str]:
    """Fetch available models from an OpenAI-compatible endpoint."""
    try:
        url = f"{base_url.rstrip('/')}/v1/models"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        with httpx.Client(timeout=15) as client:
            resp = client.get(url, headers=headers)

        if resp.status_code != 200:
            return []

        data = resp.json()
        models = []
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            for item in data["data"]:
                if isinstance(item, dict):
                    model_id = str(item.get("id", "")).strip()
                    if model_id:
                        models.append(model_id)
        return sorted(models)
    except Exception as exc:
        logger.warning("Model validation failed for %s: %s", base_url, exc)
        return []


class CustomProvider:
    """Round-robin provider for custom OpenAI-compatible APIs."""

    def __init__(self):
        self._index = 0
        self._lock = threading.Lock()

    def _pick_endpoint(self, model: str) -> dict[str, str] | None:
        """Pick an endpoint that serves the requested model."""
        endpoints = get_all_endpoints()
        if not endpoints:
            return None

        # Filter endpoints that have the requested model
        matching = [ep for ep in endpoints if model in ep.get("models", [])]
        if not matching:
            # If no exact match, try any endpoint (some APIs serve any model)
            matching = endpoints

        with self._lock:
            for _ in range(len(matching)):
                idx = self._index % len(matching)
                self._index = (self._index + 1) % len(matching)
                return matching[idx]
        return None

    def chat_completion(
        self,
        messages: list[dict[str, Any]],
        model: str,
        stream: bool = False,
        **kwargs: Any,
    ) -> dict[str, Any] | Iterator[dict[str, Any]]:
        """Process a chat completion request with round-robin failover."""
        max_retries = 3
        last_error = ""

        for attempt in range(max_retries):
            endpoint = self._pick_endpoint(model)
            if endpoint is None:
                raise RuntimeError("No custom provider accounts available. Add an account in Custom Accounts settings.")

            account_id = endpoint["account_id"]
            base_url = endpoint["base_url"]
            api_key = endpoint["api_key"]

            try:
                if stream:
                    return self._stream_completion(base_url, api_key, account_id, messages, model)
                else:
                    return self._complete(base_url, api_key, account_id, messages, model)
            except Exception as exc:
                last_error = str(exc)
                mark_error(account_id, last_error)
                logger.warning("Custom provider attempt %d failed: %s (account %s)", attempt + 1, last_error, account_id)

        raise RuntimeError(f"All custom provider attempts failed: {last_error}")

    def _complete(
        self, base_url: str, api_key: str, account_id: str,
        messages: list[dict[str, Any]], model: str,
    ) -> dict[str, Any]:
        """Non-streaming completion."""
        mark_used(account_id)
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {"model": model, "messages": messages, "stream": False}

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=payload)

        if resp.status_code != 200:
            error_msg = f"HTTP {resp.status_code}"
            try:
                err = resp.json()
                error_msg = err.get("error", {}).get("message", error_msg)
            except Exception:
                pass
            raise RuntimeError(error_msg)

        data = resp.json()
        return data

    def _stream_completion(
        self, base_url: str, api_key: str, account_id: str,
        messages: list[dict[str, Any]], model: str,
    ) -> Iterator[dict[str, Any]]:
        """Streaming completion via SSE."""
        mark_used(account_id)
        url = f"{base_url.rstrip('/')}/v1/chat/completions"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {"model": model, "messages": messages, "stream": True}

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    error_msg = f"HTTP {resp.status_code}"
                    try:
                        err = resp.read()
                        err_json = json.loads(err)
                        error_msg = err_json.get("error", {}).get("message", error_msg)
                    except Exception:
                        pass
                    raise RuntimeError(error_msg)

                for line in resp.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data_str)
                        yield chunk
                    except json.JSONDecodeError:
                        continue


custom_provider = CustomProvider()
