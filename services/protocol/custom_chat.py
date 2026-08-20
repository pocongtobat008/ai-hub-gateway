"""Custom chat protocol — OpenAI-compatible chat completion via custom provider."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Iterator

from services.custom_provider import custom_provider


def custom_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Stream custom provider chat completion as OpenAI SSE chunks."""
    model = body.get("model", "auto")
    messages = body.get("messages", [])
    completion_id = f"chatcmpl-{uuid.uuid4().hex}"
    created = int(time.time())

    try:
        for chunk in custom_provider.chat_completion(
            messages=messages,
            model=model,
            stream=True,
        ):
            if isinstance(chunk, dict):
                # Forward the chunk as-is (already OpenAI-compatible)
                yield chunk
    except Exception as exc:
        yield {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {"content": f"Error: {exc}"}, "finish_reason": "stop"}],
        }

    yield {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }


def custom_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    """Non-streaming custom provider chat completion."""
    model = body.get("model", "auto")
    messages = body.get("messages", [])

    result = custom_provider.chat_completion(
        messages=messages,
        model=model,
        stream=False,
    )

    if isinstance(result, dict):
        return result

    # Shouldn't happen for non-stream
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
