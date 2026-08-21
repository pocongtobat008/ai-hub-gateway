"""OpenCode chat protocol — forwards to opencode-proxy via Anthropic format."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Iterator

from services.opencode_provider import opencode_provider


def opencode_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Stream OpenCode chat completion as OpenAI SSE chunks."""
    model = body.get("model", "auto")
    messages = body.get("messages", [])
    completion_id = f"chatcmpl-{uuid.uuid4().hex}"
    created = int(time.time())

    try:
        for chunk in opencode_provider.chat_completion(
            messages=messages,
            model=model,
            stream=True,
            **{k: v for k, v in body.items() if k not in ("model", "messages", "stream")},
        ):
            if isinstance(chunk, dict):
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


def opencode_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    """Non-streaming OpenCode chat completion."""
    model = body.get("model", "auto")
    messages = body.get("messages", [])

    result = opencode_provider.chat_completion(
        messages=messages,
        model=model,
        stream=False,
        **{k: v for k, v in body.items() if k not in ("model", "messages", "stream")},
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
