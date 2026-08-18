"""Chat conversation persistence API — JSON file storage in data/conversations.json."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

_DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
_CONVERSATIONS_FILE = _DATA_DIR / "conversations.json"


# ── helpers ──────────────────────────────────────────────────────────────────


def _load() -> list[dict[str, Any]]:
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


def _save(items: list[dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Keep max 200 conversations to avoid bloat
    items = items[:200]
    with open(_CONVERSATIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


# ── models ───────────────────────────────────────────────────────────────────


class ConversationMessage(BaseModel):
    id: str
    role: str
    content: Any
    createdAt: str
    error: str | None = None


class Conversation(BaseModel):
    id: str
    title: str
    createdAt: str
    updatedAt: str
    messages: list[ConversationMessage]


class SaveRequest(BaseModel):
    conversation: Conversation


class RenameRequest(BaseModel):
    title: str


# ── router ───────────────────────────────────────────────────────────────────


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/conversations", tags=["conversations"])

    @router.get("")
    async def list_conversations():
        items = _load()
        # Sort by updatedAt descending
        items.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
        return {"items": items, "total": len(items)}

    @router.post("")
    async def save_conversation(req: SaveRequest):
        items = _load()
        conv = req.conversation.model_dump()
        # Remove duplicates
        items = [i for i in items if i.get("id") != conv["id"]]
        items.insert(0, conv)
        _save(items)
        return {"ok": True}

    @router.delete("/{conversation_id}")
    async def delete_conversation(conversation_id: str):
        items = _load()
        before = len(items)
        items = [i for i in items if i.get("id") != conversation_id]
        if len(items) == before:
            raise HTTPException(status_code=404, detail="Conversation not found")
        _save(items)
        return {"ok": True, "remaining": len(items)}

    @router.delete("")
    async def clear_conversations():
        _save([])
        return {"ok": True, "total": 0}

    @router.put("/{conversation_id}/rename")
    async def rename_conversation(conversation_id: str, req: RenameRequest):
        items = _load()
        for item in items:
            if item.get("id") == conversation_id:
                item["title"] = req.title
                item["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
                _save(items)
                return {"ok": True}
        raise HTTPException(status_code=404, detail="Conversation not found")

    return router
