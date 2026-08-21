"""OpenCode provider — forwards to opencode-proxy via Anthropic messages format."""
from __future__ import annotations

import json
import logging
import time
import uuid
import threading
from typing import Any, Iterator

import httpx

from services.opencode_account_service import (
    get_all_endpoints,
    get_api_key,
    get_first_valid_key,
    mark_error,
    mark_used,
    OPENCODE_PROXY_URL,
    OPENCODE_MODELS,
)

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 120.0

OPENCODE_MODEL_SET = set(OPENCODE_MODELS)


def is_opencode_model(model: str | None) -> bool:
    """Check if model belongs to OpenCode provider."""
    if not model:
        return False
    m = model.lower().strip()
    if m in OPENCODE_MODEL_SET:
        return True
    # Also check registered accounts
    from services.opencode_account_service import list_accounts
    for acc in list_accounts():
        if m in [x.lower() for x in (acc.get("models") or [])]:
            return True
    return False


def get_all_opencode_models() -> list[dict[str, Any]]:
    """Return all registered OpenCode models."""
    models = []
    seen = set()
    for model_id in OPENCODE_MODELS:
        if model_id not in seen:
            seen.add(model_id)
            models.append({
                "id": model_id,
                "object": "model",
                "created": 0,
                "owned_by": "opencode",
                "permission": [],
                "root": model_id,
                "parent": None,
                "capabilities": ["chat"],
                "available": True,
                "display_name": model_id,
            })
    return models


def _openai_to_anthropic(body: dict[str, Any], model: str) -> dict[str, Any]:
    """Convert OpenAI chat completion format to Anthropic messages format."""
    messages = body.get("messages", [])
    system_parts = []
    anthropic_messages = []

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")

        if role == "system":
            if isinstance(content, str):
                system_parts.append(content)
            elif isinstance(content, list):
                texts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                system_parts.append("\n".join(texts))
            continue

        if role == "assistant":
            if isinstance(content, str):
                anthropic_messages.append({"role": "assistant", "content": content})
            elif isinstance(content, list):
                text_parts = []
                for p in content:
                    if isinstance(p, dict):
                        if p.get("type") == "text":
                            text_parts.append(p.get("text", ""))
                anthropic_messages.append({"role": "assistant", "content": "\n".join(text_parts) if text_parts else ""})
            continue

        if role == "user":
            if isinstance(content, str):
                anthropic_messages.append({"role": "user", "content": content})
            elif isinstance(content, list):
                blocks = []
                for p in content:
                    if isinstance(p, dict):
                        if p.get("type") == "text":
                            blocks.append({"type": "text", "text": p.get("text", "")})
                        elif p.get("type") == "image_url":
                            img_url = p.get("image_url", {}).get("url", "")
                            if img_url.startswith("data:"):
                                # base64 image
                                parts = img_url.split(",", 1)
                                if len(parts) == 2:
                                    media_type = parts[0].split(":")[1].split(";")[0]
                                    blocks.append({
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": media_type,
                                            "data": parts[1],
                                        },
                                    })
                            else:
                                blocks.append({
                                    "type": "image",
                                    "source": {"type": "url", "url": img_url},
                                })
                        elif p.get("type") == "file":
                            # file content
                            file_data = p.get("file", {}).get("data", "")
                            filename = p.get("file", {}).get("filename", "document")
                            if file_data.startswith("data:"):
                                parts = file_data.split(",", 1)
                                if len(parts) == 2:
                                    media_type = parts[0].split(":")[1].split(";")[0]
                                    blocks.append({
                                        "type": "document",
                                        "source": {
                                            "type": "base64",
                                            "media_type": media_type,
                                            "data": parts[1],
                                        },
                                    })
                if blocks:
                    anthropic_messages.append({"role": "user", "content": blocks})
                else:
                    anthropic_messages.append({"role": "user", "content": str(content)})
            continue

    # Build Anthropic request
    anthropic_body: dict[str, Any] = {
        "model": model,
        "messages": anthropic_messages,
        "max_tokens": body.get("max_tokens", 8192),
        "stream": body.get("stream", False),
    }

    if system_parts:
        anthropic_body["system"] = "\n\n".join(system_parts)

    if "temperature" in body:
        anthropic_body["temperature"] = body["temperature"]
    if "top_p" in body:
        anthropic_body["top_p"] = body["top_p"]
    if "stop" in body:
        anthropic_body["stop_sequences"] = body["stop"]

    # Tools
    if "tools" in body:
        anthropic_body["tools"] = []
        for tool in body["tools"]:
            func = tool.get("function", {})
            anthropic_body["tools"].append({
                "name": func.get("name", ""),
                "description": func.get("description", ""),
                "input_schema": func.get("parameters", {}),
            })

    return anthropic_body


def _anthropic_to_openai(resp: dict[str, Any], model: str) -> dict[str, Any]:
    """Convert Anthropic response to OpenAI chat completion format."""
    content_blocks = resp.get("content", [])
    text_parts = []
    tool_calls = []

    for block in content_blocks:
        if isinstance(block, dict):
            if block.get("type") == "text":
                text_parts.append(block.get("text", ""))
            elif block.get("type") == "tool_use":
                tool_calls.append({
                    "id": block.get("id", f"call_{uuid.uuid4().hex[:8]}"),
                    "type": "function",
                    "function": {
                        "name": block.get("name", ""),
                        "arguments": json.dumps(block.get("input", {})),
                    },
                })

    content = "\n".join(text_parts) if text_parts else ""

    stop_reason = resp.get("stop_reason", "end_turn")
    finish_map = {"end_turn": "stop", "max_tokens": "length", "tool_use": "tool_calls"}
    finish_reason = finish_map.get(stop_reason, "stop")

    usage = resp.get("usage", {})

    result: dict[str, Any] = {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content if content else None,
                },
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
        },
    }

    if tool_calls:
        result["choices"][0]["message"]["tool_calls"] = tool_calls
        if not content:
            result["choices"][0]["message"]["content"] = None

    return result


class OpenCodeProvider:
    """Round-robin provider that forwards to opencode-proxy."""

    def __init__(self):
        self._index = 0
        self._lock = threading.Lock()

    def _pick_endpoint(self) -> dict[str, str] | None:
        endpoints = get_all_endpoints()
        if not endpoints:
            return None
        with self._lock:
            idx = self._index % len(endpoints)
            self._index = (self._index + 1) % len(endpoints)
            return endpoints[idx]

    def chat_completion(
        self,
        messages: list[dict[str, Any]],
        model: str,
        stream: bool = False,
        **kwargs: Any,
    ) -> dict[str, Any] | Iterator[dict[str, Any]]:
        max_retries = 3
        last_error = ""

        for attempt in range(max_retries):
            endpoint = self._pick_endpoint()
            if endpoint is None:
                # Try direct with first valid key
                api_key = get_first_valid_key()
                if not api_key:
                    raise RuntimeError("No OpenCode accounts available. Add an account in OpenCode settings.")
                endpoint = {
                    "account_id": "direct",
                    "api_key": api_key,
                    "base_url": OPENCODE_PROXY_URL,
                }

            account_id = endpoint["account_id"]
            api_key = endpoint["api_key"]

            try:
                # Build OpenAI body for conversion
                openai_body = {
                    "model": model,
                    "messages": messages,
                    "stream": stream,
                }
                if "max_tokens" in kwargs:
                    openai_body["max_tokens"] = kwargs["max_tokens"]
                if "temperature" in kwargs:
                    openai_body["temperature"] = kwargs["temperature"]
                if "tools" in kwargs:
                    openai_body["tools"] = kwargs["tools"]

                # Convert to Anthropic format
                anthropic_body = _openai_to_anthropic(openai_body, model)

                if stream:
                    return self._stream_completion(account_id, api_key, anthropic_body, model)
                else:
                    return self._complete(account_id, api_key, anthropic_body, model)
            except Exception as exc:
                last_error = str(exc)
                if account_id != "direct":
                    mark_error(account_id, last_error)
                logger.warning("OpenCode attempt %d failed: %s (account %s)", attempt + 1, last_error, account_id)

        raise RuntimeError(f"All OpenCode attempts failed: {last_error}")

    def _complete(
        self, account_id: str, api_key: str, anthropic_body: dict[str, Any], model: str,
    ) -> dict[str, Any]:
        if account_id != "direct":
            mark_used(account_id)

        url = f"{OPENCODE_PROXY_URL}/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

        anthropic_body["stream"] = False

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=anthropic_body)

        if resp.status_code != 200:
            error_msg = f"HTTP {resp.status_code}"
            try:
                err = resp.json()
                error_msg = err.get("error", {}).get("message", error_msg)
            except Exception:
                pass
            raise RuntimeError(error_msg)

        data = resp.json()
        return _anthropic_to_openai(data, model)

    def _stream_completion(
        self, account_id: str, api_key: str, anthropic_body: dict[str, Any], model: str,
    ) -> Iterator[dict[str, Any]]:
        if account_id != "direct":
            mark_used(account_id)

        url = f"{OPENCODE_PROXY_URL}/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }

        anthropic_body["stream"] = True

        completion_id = f"chatcmpl-{uuid.uuid4().hex}"
        created = int(time.time())

        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            with client.stream("POST", url, headers=headers, json=anthic_body) as resp:
                if resp.status_code != 200:
                    error_msg = f"HTTP {resp.status_code}"
                    try:
                        err = resp.read()
                        err_json = json.loads(err)
                        error_msg = err_json.get("error", {}).get("message", error_msg)
                    except Exception:
                        pass
                    yield {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model,
                        "choices": [{"index": 0, "delta": {"content": f"Error: {error_msg}"}, "finish_reason": "stop"}],
                    }
                    return

                # Parse Anthropic SSE stream and convert to OpenAI chunks
                text_block_open = False
                tool_block_open = False
                tool_id = ""
                tool_name = ""
                tool_args = ""

                for line in resp.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break

                    try:
                        event = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    event_type = event.get("type", "")

                    if event_type == "content_block_start":
                        content_block = event.get("content_block", {})
                        if content_block.get("type") == "text":
                            text_block_open = True
                        elif content_block.get("type") == "tool_use":
                            tool_block_open = True
                            tool_id = content_block.get("id", "")
                            tool_name = content_block.get("name", "")
                            tool_args = ""
                    elif event_type == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield {
                                    "id": completion_id,
                                    "object": "chat.completion.chunk",
                                    "created": created,
                                    "model": model,
                                    "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}],
                                }
                        elif delta.get("type") == "input_json_delta":
                            partial = delta.get("partial_json", "")
                            tool_args += partial
                    elif event_type == "content_block_stop":
                        if tool_block_open and tool_name:
                            yield {
                                "id": completion_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": [{
                                    "index": 0,
                                    "delta": {
                                        "tool_calls": [{
                                            "index": 0,
                                            "id": tool_id,
                                            "type": "function",
                                            "function": {"name": tool_name, "arguments": tool_args},
                                        }],
                                    },
                                    "finish_reason": None,
                                }],
                            }
                        text_block_open = False
                        tool_block_open = False
                        tool_name = ""
                        tool_args = ""
                    elif event_type == "message_delta":
                        stop = event.get("delta", {}).get("stop_reason", "end_turn")
                        finish_map = {"end_turn": "stop", "max_tokens": "length", "tool_use": "tool_calls"}
                        yield {
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model,
                            "choices": [{"index": 0, "delta": {}, "finish_reason": finish_map.get(stop, "stop")}],
                        }

        yield {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }


opencode_provider = OpenCodeProvider()
