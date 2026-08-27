"""Session memory API — provides context summaries from ALL sessions.

This enables the AI to remember what was discussed/created in previous sessions
across ALL providers and tools: chat, image generation, canvas, voiceover, storyboard.
Gives context continuity across conversations and models.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header

_DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
_CONVERSATIONS_FILE = _DATA_DIR / "conversations.json"
_USAGE_LOG_FILE = _DATA_DIR / "usage_log.json"
_SESSION_MEMORY_FILE = _DATA_DIR / "session_memory.json"


def _load_conversations() -> list[dict[str, Any]]:
    if not _CONVERSATIONS_FILE.exists():
        return []
    try:
        with open(_CONVERSATIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return []


def _load_usage_log() -> list[dict[str, Any]]:
    if not _USAGE_LOG_FILE.exists():
        return []
    try:
        with open(_USAGE_LOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return []


def _load_session_memory() -> dict[str, Any]:
    if not _SESSION_MEMORY_FILE.exists():
        return {"summaries": [], "user_preferences": {}, "updated_at": None}
    try:
        with open(_SESSION_MEMORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"summaries": [], "user_preferences": {}, "updated_at": None}


def _save_session_memory(memory: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    memory["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    with open(_SESSION_MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, ensure_ascii=False, indent=2)


def _extract_conversation_summary(conv: dict[str, Any]) -> dict[str, Any]:
    """Extract a lightweight summary from a conversation for context."""
    messages = conv.get("messages", [])
    title = conv.get("title", "Untitled")
    conv_type = conv.get("type", "chat")

    # Get user messages only for topic extraction
    user_messages = [
        m.get("content", "")
        for m in messages
        if m.get("role") == "user" and isinstance(m.get("content"), str) and m.get("content", "").strip()
    ]

    # Get last assistant response for context
    assistant_messages = [
        m.get("content", "")
        for m in messages
        if m.get("role") == "assistant" and isinstance(m.get("content"), str) and m.get("content", "").strip()
    ]

    # Build summary
    topics = " | ".join([msg[:100] for msg in user_messages[:5]])
    last_response_preview = assistant_messages[-1][:200] if assistant_messages else ""

    return {
        "id": conv.get("id", ""),
        "title": title,
        "type": conv_type,
        "topics": topics,
        "message_count": len(messages),
        "last_response_preview": last_response_preview,
        "updated_at": conv.get("updatedAt", ""),
    }


def _extract_usage_summary(entry: dict[str, Any]) -> dict[str, Any]:
    """Extract summary from usage_log entry (image, canvas, voiceover, etc.)."""
    provider = entry.get("provider", "unknown")
    model = entry.get("model", "unknown")
    prompt = entry.get("prompt", entry.get("input", ""))
    result_preview = entry.get("result_preview", entry.get("output", ""))[:200]
    created_at = entry.get("timestamp", entry.get("created_at", ""))

    # Determine type from provider
    type_map = {
        "gpt": "chat",
        "gemini": "chat",
        "deepseek": "chat",
        "grok": "chat",
        "bansos": "chat",
        "custom": "chat",
        "image": "image",
        "canvas": "canvas",
        "voiceover": "voiceover",
        "storyboard": "storyboard",
    }
    conv_type = type_map.get(provider, provider)

    return {
        "id": entry.get("id", f"usage-{hash(prompt)}"),
        "title": f"[{conv_type.upper()}] {prompt[:60]}",
        "type": conv_type,
        "provider": provider,
        "model": model,
        "topics": prompt[:300] if prompt else "",
        "message_count": 1,
        "last_response_preview": result_preview,
        "updated_at": created_at,
    }


def _build_context_string(summaries: list[dict[str, Any]], max_tokens: int = 2000) -> str:
    """Build a context string from summaries to inject as system context."""
    if not summaries:
        return ""

    lines = ["## Previous Session Context (for continuity):"]
    lines.append("Remember these past interactions when responding. Reference relevant past work when applicable.")
    token_estimate = 0

    for s in summaries:
        conv_type = s.get("type", "chat")
        provider = s.get("provider", "")
        provider_tag = f" ({provider})" if provider else ""
        entry = f"- [{conv_type.upper()}{provider_tag}] {s['title']}"
        if s.get("topics"):
            entry += f" | Topics: {s['topics'][:150]}"
        if s.get("last_response_preview"):
            entry += f" | Last: {s['last_response_preview'][:100]}"
        lines.append(entry)
        token_estimate += len(entry) // 4  # rough token estimate

        if token_estimate > max_tokens:
            break

    return "\n".join(lines)


# ── API Routes ───────────────────────────────────────────────────────────────


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/session-memory", tags=["session-memory"])

    @router.get("/context")
    def get_context(
        limit: int = 10,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Get context summaries from recent conversations and usage logs.

        Returns a context string that can be injected as system context
        so the model remembers previous conversations across ALL tools.
        """
        from api.support import require_identity

        identity = require_identity(authorization)
        if identity is None:
            return {"context": "", "summaries": [], "total_conversations": 0}

        convs = _load_conversations()
        usage = _load_usage_log()

        # Extract summaries from conversations (chat, image)
        conv_summaries = [_extract_conversation_summary(c) for c in convs]

        # Extract summaries from usage log (all providers)
        usage_summaries = [_extract_usage_summary(u) for u in usage]

        # Merge and sort by time (most recent first)
        all_summaries = conv_summaries + usage_summaries
        all_summaries.sort(key=lambda s: s.get("updated_at", ""), reverse=True)

        # Take top N most recent
        recent = all_summaries[:limit]

        # Build context string
        context = _build_context_string(recent)

        return {
            "context": context,
            "summaries": recent,
            "total_conversations": len(convs),
            "total_usage": len(usage),
            "total_all": len(all_summaries),
        }

    @router.get("/summary/{conversation_id}")
    def get_conversation_summary(
        conversation_id: str,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Get a detailed summary of a specific conversation."""
        from api.support import require_identity

        identity = require_identity(authorization)
        if identity is None:
            return {"error": "Unauthorized"}

        convs = _load_conversations()
        for c in convs:
            if c.get("id") == conversation_id:
                return _extract_conversation_summary(c)

        return {"error": "Conversation not found"}

    return router
