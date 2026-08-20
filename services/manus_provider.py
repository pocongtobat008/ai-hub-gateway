"""Manus provider — round-robin token pool, failover, OpenAI-compatible streaming."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
import threading
from typing import Any, Iterator

import httpx

from services.manus_account_service import (
    get_all_api_keys,
    get_credentials,
    mark_auth_failure,
    mark_error,
    mark_used,
)

logger = logging.getLogger(__name__)

MANUS_API_BASE = "https://api.manus.ai"
REQUEST_TIMEOUT = 60.0
POLL_INTERVAL = 2.0
MAX_WAIT_SECONDS = 600.0

MANUS_MODELS = {"manus-1.6", "agent-default-main_task"}


def is_manus_model(model: str) -> bool:
    normalized = model.strip().lower()
    return normalized.startswith("manus") or normalized in {m.lower() for m in MANUS_MODELS}


def _headers(api_key: str, content_type: bool = False) -> dict[str, str]:
    headers = {
        "x-manus-api-key": api_key,
        "User-Agent": "becomeai-manus/1.0",
    }
    if content_type:
        headers["Content-Type"] = "application/json"
    return headers


def _decode(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        raise RuntimeError(f"Manus returned non-JSON response (HTTP {response.status_code})")
    if response.status_code >= 400 or not data.get("ok", False):
        error = data.get("error") or {}
        msg = error.get("message", f"Manus request failed with HTTP {response.status_code}")
        code = error.get("code", "")
        is_auth = response.status_code in {401, 403} or code in {"permission_denied", "unauthorized"}
        raise ManusUpstreamError(msg, response.status_code, code, is_auth)
    return data


class ManusUpstreamError(RuntimeError):
    def __init__(self, message: str, status_code: int = 0, code: str = "", is_auth: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.is_auth = is_auth


class ManusTokenPool:
    """Round-robin token pool with cooldown and failover."""

    def __init__(self, cooldown_seconds: int = 300):
        self._cooldown_seconds = cooldown_seconds
        self._index = 0
        self._lock = threading.Lock()

    def _pick_account(self) -> tuple[str, str] | None:
        """Pick next available account. Returns (account_id, api_key) or None."""
        keys = get_all_api_keys()
        if not keys:
            return None
        with self._lock:
            for _ in range(len(keys)):
                idx = self._index % len(keys)
                self._index = (self._index + 1) % len(keys)
                account_id, api_key = keys[idx]
                if api_key:
                    return account_id, api_key
        return None

    def chat_completion(
        self,
        messages: list[dict[str, Any]],
        model: str = "manus-1.6",
        stream: bool = False,
        **kwargs: Any,
    ) -> dict[str, Any] | Iterator[dict[str, Any]]:
        """Process a chat completion request with round-robin failover."""
        max_retries = 5
        last_error = ""

        for attempt in range(max_retries):
            picked = self._pick_account()
            if picked is None:
                raise RuntimeError("No Manus API keys available. Add accounts in Manus Accounts settings.")

            account_id, api_key = picked
            try:
                if stream:
                    return self._stream_completion(api_key, account_id, messages, model)
                else:
                    return self._complete(api_key, account_id, messages, model)
            except ManusUpstreamError as exc:
                last_error = str(exc)
                if exc.is_auth:
                    mark_auth_failure(account_id, last_error)
                else:
                    mark_error(account_id, last_error)
                logger.warning("Manus attempt %d failed: %s (account %s)", attempt + 1, last_error, account_id)
            except Exception as exc:
                last_error = str(exc)
                mark_error(account_id, last_error)
                logger.warning("Manus attempt %d error: %s (account %s)", attempt + 1, last_error, account_id)

        raise RuntimeError(f"All Manus attempts failed: {last_error}")

    def _messages_to_prompt(self, messages: list[dict[str, Any]]) -> str:
        lines = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
                content = "\n".join(text_parts)
            if content:
                lines.append(f"{role.upper()}: {content}")
        return "\n\n".join(lines)

    def _resolve_task(self, api_key: str, model: str, prompt: str) -> str:
        """Create or reuse a Manus task."""
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            if model == "agent-default-main_task":
                resp = client.post(
                    f"{MANUS_API_BASE}/v2/task.sendMessage",
                    headers=_headers(api_key, content_type=True),
                    json={"task_id": model, "message": {"content": prompt}},
                )
                _decode(resp)
                return model

            resp = client.post(
                f"{MANUS_API_BASE}/v2/task.create",
                headers=_headers(api_key, content_type=True),
                json={"message": {"content": prompt}},
            )
            data = _decode(resp)
            task_id = data.get("task_id")
            if not task_id:
                raise ManusUpstreamError("Manus did not return a task_id")
            return task_id

    def _complete(
        self, api_key: str, account_id: str, messages: list[dict[str, Any]], model: str
    ) -> dict[str, Any]:
        """Non-streaming completion."""
        prompt = self._messages_to_prompt(messages)
        mark_used(account_id)
        task_id = self._resolve_task(api_key, model, prompt)

        last_content = ""
        deadline = time.monotonic() + MAX_WAIT_SECONDS
        cursor = None
        seen_ids: set[str] = set()

        while time.monotonic() < deadline:
            params: dict[str, Any] = {"task_id": task_id, "limit": 100, "order": "asc"}
            if cursor:
                params["cursor"] = cursor

            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                resp = client.get(
                    f"{MANUS_API_BASE}/v2/task.listMessages",
                    headers=_headers(api_key),
                    params=params,
                )
            data = _decode(resp)

            for event in data.get("messages", []):
                event_id = str(event.get("id", ""))
                if event_id and event_id in seen_ids:
                    continue
                if event_id:
                    seen_ids.add(event_id)

                if event.get("type") == "assistant_message":
                    content_raw = event.get("assistant_message", {}).get("content", "")
                    if isinstance(content_raw, str):
                        last_content = content_raw
                    elif isinstance(content_raw, list):
                        last_content = "\n".join(
                            p.get("text", "") for p in content_raw if isinstance(p, dict) and p.get("type") == "text"
                        )

                if event.get("type") == "error_message":
                    err_msg = event.get("error_message", {}).get("content", "Manus task failed")
                    raise ManusUpstreamError(err_msg)

                status = event.get("status_update", {}).get("agent_status")
                if status in {"stopped", "error", "waiting"}:
                    return self._build_response(model, last_content)

            next_cursor = data.get("next_cursor") or data.get("cursor")
            if next_cursor and next_cursor != cursor:
                cursor = next_cursor
            time.sleep(POLL_INTERVAL)

        return self._build_response(model, last_content)

    def _stream_completion(
        self, api_key: str, account_id: str, messages: list[dict[str, Any]], model: str
    ) -> Iterator[dict[str, Any]]:
        """Streaming completion via SSE."""
        prompt = self._messages_to_prompt(messages)
        mark_used(account_id)
        task_id = self._resolve_task(api_key, model, prompt)

        completion_id = f"chatcmpl-{uuid.uuid4().hex}"
        created = int(time.time())
        last_content = ""
        deadline = time.monotonic() + MAX_WAIT_SECONDS
        cursor = None
        seen_ids: set[str] = set()

        try:
            while time.monotonic() < deadline:
                params: dict[str, Any] = {"task_id": task_id, "limit": 100, "order": "asc"}
                if cursor:
                    params["cursor"] = cursor

                with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                    resp = client.get(
                        f"{MANUS_API_BASE}/v2/task.listMessages",
                        headers=_headers(api_key),
                        params=params,
                    )
                data = _decode(resp)

                for event in data.get("messages", []):
                    event_id = str(event.get("id", ""))
                    if event_id and event_id in seen_ids:
                        continue
                    if event_id:
                        seen_ids.add(event_id)

                    if event.get("type") == "assistant_message":
                        content_raw = event.get("assistant_message", {}).get("content", "")
                        if isinstance(content_raw, str):
                            content = content_raw
                        elif isinstance(content_raw, list):
                            content = "\n".join(
                                p.get("text", "") for p in content_raw
                                if isinstance(p, dict) and p.get("type") == "text"
                            )
                        else:
                            content = ""

                        delta = content[len(last_content):] if content.startswith(last_content) else content
                        if delta:
                            yield self._sse_chunk(completion_id, model, created, {"content": delta})
                            last_content = content

                    elif event.get("type") == "error_message":
                        err_msg = event.get("error_message", {}).get("content", "Manus task failed")
                        yield self._sse_chunk(completion_id, model, created, {"content": err_msg}, "error")
                        return

                    status = event.get("status_update", {}).get("agent_status")
                    if status in {"stopped", "error", "waiting"}:
                        yield self._sse_chunk(completion_id, model, created, {}, "stop")
                        return

                next_cursor = data.get("next_cursor") or data.get("cursor")
                if next_cursor and next_cursor != cursor:
                    cursor = next_cursor
                time.sleep(POLL_INTERVAL)

            yield self._sse_chunk(completion_id, model, created, {}, "stop")
        except Exception as exc:
            yield self._sse_chunk(completion_id, model, created, {"content": str(exc)}, "error")

    @staticmethod
    def _build_response(model: str, content: str) -> dict[str, Any]:
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    @staticmethod
    def _sse_chunk(
        completion_id: str, model: str, created: int,
        delta: dict[str, Any], finish_reason: str | None = None,
    ) -> dict[str, Any]:
        return {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
        }


manus_pool = ManusTokenPool()
