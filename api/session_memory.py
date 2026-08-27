"""Session memory API — provides context summaries from past conversations.

This enables the AI to remember what was discussed in previous sessions,
giving context continuity across conversations.

Uses the existing conversations.json for storage.
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
        "topics": topics,
        "message_count": len(messages),
        "last_response_preview": last_response_preview,
        "updated_at": conv.get("updatedAt", ""),
    }


def _build_context_string(summaries: list[dict[str, Any]], max_tokens: int = 2000) -> str:
    """Build a context string from summaries to inject as system context."""
    if not summaries:
        return ""

    lines = ["## Previous Session Context (for continuity):"]
    token_estimate = 0

    for s in summaries:
        entry = f"- [{s['title']}] Topics: {s['topics']}"
        if s.get("last_response_preview"):
            entry += f" | Last response: {s['last_response_preview'][:150]}"
        lines.append(entry)
        token_estimate += len(entry) // 4  # rough token estimate

        if token_estimate > max_tokens:
            break

    return "\n".join(lines)


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/session-memory", tags=["session-memory"])

    @router.get("/context")
    def get_context(
        authorization: str | None = Header(default=None),
        limit: int = 10,
    ):
        """Get context summaries from recent conversations for context continuity.

        Returns a context string that should be injected into the system prompt
        so the model remembers previous conversations.
        """
        from api.support import require_identity

        identity = require_identity(authorization)
        if identity is None:
            return {"context": "", "summaries": [], "total_conversations": 0}

        convs = _load_conversations()
        # Sort by updatedAt descending, take the most recent N
        convs.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
        recent = convs[:limit]

        summaries = [_extract_conversation_summary(c) for c in recent]
        context_string = _build_context_string(summaries)

        return {
            "context": context_string,
            "summaries": summaries,
            "total_conversations": len(convs),
        }

    @router.get("/summary/{conversation_id}")
    def get_conversation_summary(
        conversation_id: str,
        authorization: str | None = Header(default=None),
    ):
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

    @router.get("/preferences")
    def get_preferences(authorization: str | None = Header(default=None)):
        """Get stored user preferences from past interactions."""
        from api.support import require_identity

        identity = require_identity(authorization)
        if identity is None:
            return {"preferences": {}}

        memory = _load_session_memory()
        return {"preferences": memory.get("user_preferences", {})}

    @router.post("/preferences")
    def update_preferences(
        body: dict[str, Any],
        authorization: str | None = Header(default=None),
    ):
        """Update user preferences (model, language, style, etc.)."""
        from api.support import require_identity

        identity = require_identity(authorization)
        if identity is None:
            return {"error": "Unauthorized"}

        memory = _load_session_memory()
        prefs = memory.get("user_preferences", {})
        prefs.update(body)
        memory["user_preferences"] = prefs
        _save_session_memory(memory)
        return {"ok": True, "preferences": prefs}

    @router.post("/sync")
    def sync_session(body: dict[str, Any], authorization: str | None = Header(default=None)):
        """Sync a conversation summary into session memory for fast access."""
        from api.support import require_identity

        identity = require_identity(authorization)
        if identity is None:
            return {"error": "Unauthorized"}

        conv_id = body.get("conversation_id", "")
        memory = _load_session_memory()
        summaries = memory.get("summaries", [])

        # Find conversation and extract summary
        convs = _load_conversations()
        for c in convs:
            if c.get("id") == conv_id:
                summary = _extract_conversation_summary(c)
                # Update existing or add new
                summaries = [s for s in summaries if s.get("id") != conv_id]
                summaries.insert(0, summary)
                # Keep max 50 summaries
                summaries = summaries[:50]
                memory["summaries"] = summaries
                _save_session_memory(memory)
                return {"ok": True, "summary": summary}

        return {"error": "Conversation not found"}

    return router
