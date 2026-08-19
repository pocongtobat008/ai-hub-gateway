"""Grok chat protocol — converts OpenAI-style requests to Grok web API calls.

Handles:
  - /v1/chat/completions (stream + non-stream)
  - Converts OpenAI messages to a single Grok prompt
  - Yields OpenAI-compatible SSE chunks
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Iterator

from services.grok_provider import grok_provider, is_grok_model


# ── helpers ────────────────────────────────────────────────────────


def _format_messages(messages: list[dict[str, Any]]) -> str:
    """Convert OpenAI-style messages to a single prompt string for Grok.

    Grok accepts a single message string, so we concatenate the conversation
    history with role prefixes.
    """
    parts: list[str] = []
    for msg in messages:
        role = str(msg.get("role") or "user")
        content = msg.get("content")
        if isinstance(content, list):
            # Multi-part content (text + images)
            text_parts = []
            for part in content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        text_parts.append(str(part.get("text") or ""))
                    elif part.get("type") == "image_url":
                        url = (part.get("image_url") or {}).get("url") or ""
                        if url:
                            text_parts.append(f"[Image: {url}]")
                elif isinstance(part, str):
                    text_parts.append(part)
            content_str = "\n".join(text_parts)
        elif isinstance(content, str):
            content_str = content
        else:
            content_str = str(content or "")

        if not content_str.strip():
            continue

        if role == "system":
            parts.append(f"System: {content_str}")
        elif role == "user":
            parts.append(content_str)
        elif role == "assistant":
            parts.append(f"Assistant: {content_str}")
        elif role == "tool":
            parts.append(f"Tool result: {content_str}")

    return "\n\n".join(parts)


def _sse_chunk(
    content: str,
    model: str,
    *,
    finish_reason: str | None = None,
    role: str = "assistant",
    chunk_id: str | None = None,
) -> dict[str, Any]:
    """Build an OpenAI-compatible SSE chunk."""
    delta: dict[str, Any] = {}
    if finish_reason is None:
        delta["role"] = role
    delta["content"] = content if content else None

    return {
        "id": chunk_id or f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }


def _sse_done(model: str, chunk_id: str | None = None) -> dict[str, Any]:
    return _sse_chunk("", model, finish_reason="stop", chunk_id=chunk_id)


def _error_chunk(error: str, model: str) -> dict[str, Any]:
    return {
        "error": {
            "message": error,
            "type": "grok_error",
            "param": None,
            "code": "grok_error",
        }
    }


# ── streaming ──────────────────────────────────────────────────────


def grok_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Handle streaming /v1/chat/completions for Grok models."""
    messages = body.get("messages") or []
    model = str(body.get("model") or "grok-3")

    prompt = _format_messages(messages)
    if not prompt.strip():
        yield _error_chunk("Empty prompt", model)
        return

    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"

    try:
        for event in grok_provider.chat_stream(prompt, model):
            kind = event.get("kind")
            if kind == "delta":
                text = str(event.get("text") or "")
                if text:
                    yield _sse_chunk(text, model, chunk_id=chunk_id)
            elif kind == "done":
                yield _sse_done(model, chunk_id=chunk_id)
                return
        # If we exit the loop without a done event, send one
        yield _sse_done(model, chunk_id=chunk_id)
    except RuntimeError as exc:
        yield _error_chunk(str(exc), model)


# ── non-streaming ──────────────────────────────────────────────────


def grok_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    """Handle non-streaming /v1/chat/completions for Grok models."""
    messages = body.get("messages") or []
    model = str(body.get("model") or "grok-3")

    prompt = _format_messages(messages)
    if not prompt.strip():
        return _error_chunk("Empty prompt", model)

    try:
        result = grok_provider.chat(prompt, model)
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result.get("text", ""),
                    },
                    "finish_reason": result.get("finish_reason", "stop"),
                }
            ],
            "usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
        }
    except RuntimeError as exc:
        return _error_chunk(str(exc), model)


__all__ = ["grok_chat_events", "grok_chat_response", "is_grok_model"]
