"""Canvas chat protocol — handles streaming and non-streaming for Canvas proxy."""
from __future__ import annotations

import json
import uuid
from typing import Any, Iterator

from fastapi import HTTPException
from services.canvas_provider import completion


def canvas_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Streaming chat events for Canvas proxy models."""
    model = body.get("model", "gemini-3-flash-preview")
    messages = body.get("messages", [])
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"

    # Yield initial role chunk
    yield {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": 0,
        "model": model,
        "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
    }

    # Stream from Canvas proxy
    for event in completion(
        token="",
        pow_header="",
        payload=body,
    ):
        kind = event.get("kind")
        if kind == "delta":
            content = event.get("content", "")
            if content:
                yield {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": 0,
                    "model": model,
                    "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
                }
        elif kind == "error":
            error_msg = event.get("error", "Canvas proxy error")
            raise HTTPException(status_code=502, detail=error_msg)

    # Final done chunk
    yield {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": 0,
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield {"data": "[DONE]"}


def canvas_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    """Non-streaming chat response for Canvas proxy models."""
    model = body.get("model", "gemini-3-flash-preview")
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"

    content_parts = []
    for event in completion(
        token="",
        pow_header="",
        payload={**body, "stream": False},
    ):
        kind = event.get("kind")
        if kind == "delta":
            content_parts.append(event.get("content", ""))
        elif kind == "error":
            error_msg = event.get("error", "Canvas proxy error")
            raise HTTPException(status_code=502, detail=error_msg)

    content = "".join(content_parts)

    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": 0,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
