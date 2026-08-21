"""Gemini Canvas Proxy provider — forwards requests to the Canvas proxy endpoint.

The Canvas proxy turns a free Gemini Canvas session into an OpenAI-compatible
API at http://127.0.0.1:8765/v1. This provider round-robins across multiple
proxy accounts (each running its own Canvas session).
"""
from __future__ import annotations

import json
import logging
import random
import time
import threading
from typing import Any, Iterator

import httpx

from services.canvas_account_service import (
    get_active_accounts,
    mark_used,
    mark_error,
)

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 120.0
_lock = threading.Lock()
_index = 0


def is_canvas_model(model: str) -> bool:
    """Check if a model ID belongs to a Canvas proxy account."""
    from services.canvas_account_service import list_accounts
    for acc in list_accounts():
        if model in (acc.get("models") or []):
            return True
    return False


def get_all_canvas_models() -> list[dict[str, Any]]:
    """Return all registered Canvas models across all accounts."""
    from services.canvas_account_service import list_accounts
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
                    "owned_by": "canvas",
                    "permission": [],
                    "root": model_id,
                    "parent": None,
                    "capabilities": ["chat"],
                    "available": acc.get("status") == "normal",
                    "display_name": f"Canvas: {model_id}",
                    "account_id": acc.get("id", ""),
                    "base_url": acc.get("base_url", ""),
                })
    return models


def _next_account() -> dict[str, Any] | None:
    """Round-robin selection of an active Canvas proxy account."""
    global _index
    accounts = get_active_accounts()
    if not accounts:
        return None
    with _lock:
        _index = (_index + 1) % len(accounts)
        return accounts[_index]


def completion(
    token: str,
    pow_header: str,
    payload: dict[str, Any],
) -> Iterator[dict[str, Any]]:
    """POST /v1/chat/completions via Canvas proxy.

    Yields dicts: {"kind": "thoughts"} | {"kind": "delta", "content": str} | {"kind": "done"}
    """
    model = payload.get("model", "auto")
    messages = payload.get("messages", [])
    stream = payload.get("stream", True)

    # Find the right account for this model
    account = None
    for acc in get_active_accounts():
        if model in (acc.get("models") or []):
            account = acc
            break
    if not account:
        account = _next_account()
    if not account:
        yield {"kind": "error", "error": "No Canvas proxy accounts available"}
        return

    base_url = account["base_url"].rstrip("/")
    token = account.get("token", "")
    api_url = f"{base_url}/v1/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    # Forward the request as-is (already OpenAI format)
    request_body = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }
    # Forward optional parameters
    for key in ("temperature", "max_tokens", "top_p", "top_k"):
        if key in payload:
            request_body[key] = payload[key]

    try:
        mark_used(account["id"])
    except Exception:
        pass

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            with client.stream(
                "POST",
                api_url,
                json=request_body,
                headers=headers,
            ) as response:
                if response.status_code != 200:
                    error_text = response.read().decode("utf-8", errors="replace")
                    try:
                        error_data = json.loads(error_text)
                        error_msg = error_data.get("error", {}).get("message", error_text)
                    except (json.JSONDecodeError, AttributeError):
                        error_msg = error_text[:500]
                    yield {"kind": "error", "error": f"Canvas proxy error ({response.status_code}): {error_msg}"}
                    try:
                        mark_error(account["id"])
                    except Exception:
                        pass
                    return

                # Parse SSE stream
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content")
                                if content:
                                    yield {"kind": "delta", "content": content}
                        except (json.JSONDecodeError, KeyError):
                            continue

    except httpx.TimeoutException:
        yield {"kind": "error", "error": "Canvas proxy request timed out"}
        try:
            mark_error(account["id"])
        except Exception:
            pass
    except httpx.ConnectError as e:
        yield {"kind": "error", "error": f"Cannot connect to Canvas proxy: {e}. Make sure the proxy is running at {base_url}"}
        try:
            mark_error(account["id"])
        except Exception:
            pass
    except Exception as e:
        yield {"kind": "error", "error": f"Canvas proxy error: {e}"}
        try:
            mark_error(account["id"])
        except Exception:
            pass
