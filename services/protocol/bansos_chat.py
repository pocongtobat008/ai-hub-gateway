"""Bansos chat protocol — OpenAI-compatible chat via bansos-router daemon."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Iterator

from services.bansos_provider import bansos_provider


def bansos_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    model = body.get("model", "mimo-v2.5-free")
    messages = body.get("messages", [])
    try:
        for chunk in bansos_provider.chat_completion(messages=messages, model=model, stream=True):
            if isinstance(chunk, dict):
                yield chunk
    except Exception as exc:
        yield {"id": f"chatcmpl-{uuid.uuid4().hex}", "object": "chat.completion.chunk", "created": int(time.time()), "model": model, "choices": [{"index": 0, "delta": {"content": f"Error: {exc}"}, "finish_reason": "stop"}]}
    yield {"id": f"chatcmpl-{uuid.uuid4().hex}", "object": "chat.completion.chunk", "created": int(time.time()), "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}


def bansos_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    model = body.get("model", "mimo-v2.5-free")
    messages = body.get("messages", [])
    result = bansos_provider.chat_completion(messages=messages, model=model, stream=False)
    if isinstance(result, dict):
        return result
    content = ""
    for chunk in result:
        if isinstance(chunk, dict):
            content += chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
    return {"id": f"chatcmpl-{uuid.uuid4().hex}", "object": "chat.completion", "created": int(time.time()), "model": model, "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
