"""Manus chat protocol — OpenAI-compatible chat completion via Manus IM."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Iterator

from services.manus_provider import manus_pool, is_manus_model


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


def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize messages for Manus — extract text from content parts."""
    result = []
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            text_parts = []
            for part in content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
                    elif part.get("type") == "image_url":
                        text_parts.append("[Image attached]")
                elif isinstance(part, str):
                    text_parts.append(part)
            content = "\n".join(text_parts)
        result.append({"role": msg.get("role", "user"), "content": content})
    return result


def manus_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Stream Manus chat completion as OpenAI SSE chunks."""
    model = body.get("model", "manus-1.6")
    messages = body.get("messages", [])
    completion_id = f"chatcmpl-{uuid.uuid4().hex}"
    created = int(time.time())

    # Send role delta
    yield _sse_chunk(completion_id, model, created, {"role": "assistant", "content": ""})

    try:
        normalized = _normalize_messages(messages)
        for chunk in manus_pool.chat_completion(
            messages=normalized,
            model=model,
            stream=True,
        ):
            if isinstance(chunk, dict):
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                finish_reason = chunk.get("choices", [{}])[0].get("finish_reason")
                content = delta.get("content", "")
                if content:
                    yield _sse_chunk(completion_id, model, created, {"content": content})
                if finish_reason:
                    yield _sse_chunk(completion_id, model, created, {}, finish_reason)
    except Exception as exc:
        yield _sse_chunk(
            completion_id, model, created,
            {"content": f"Manus error: {exc}"},
            "stop",
        )

    yield _sse_chunk(completion_id, model, created, {}, "stop")


def manus_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    """Non-streaming Manus chat completion."""
    model = body.get("model", "manus-1.6")
    messages = body.get("messages", [])

    normalized = _normalize_messages(messages)
    result = manus_pool.chat_completion(
        messages=normalized,
        model=model,
        stream=False,
    )

    if isinstance(result, dict):
        return result

    # Shouldn't happen for non-stream, but handle gracefully
    content = ""
    for chunk in result:
        if isinstance(chunk, dict):
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content += delta.get("content", "")

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
