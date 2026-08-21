"""API routes for Gemini Canvas Proxy accounts."""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.canvas_account_service import (
    add_account,
    delete_account,
    get_account,
    list_accounts,
    reset_account,
    reset_all,
    update_account,
)
from services.canvas_provider import get_all_canvas_models

logger = logging.getLogger(__name__)


class AddCanvasAccountRequest(BaseModel):
    base_url: str = Field(..., description="Canvas proxy endpoint URL (e.g. http://127.0.0.1:8765)")
    token: str = Field(..., description="Bearer token for the proxy")
    label: str = Field(default="", description="Human-readable label")
    models: list[str] = Field(default=[], description="Model IDs (defaults to standard Canvas models)")


class UpdateCanvasAccountRequest(BaseModel):
    base_url: str | None = None
    token: str | None = None
    label: str | None = None
    models: list[str] | None = None
    status: str | None = None


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/canvas", tags=["canvas"])

    @router.get("/accounts")
    async def get_canvas_accounts():
        accounts = list_accounts()
        return {"accounts": accounts, "total": len(accounts)}

    @router.post("/accounts")
    async def create_canvas_account(req: AddCanvasAccountRequest):
        account = add_account(
            base_url=req.base_url,
            token=req.token,
            label=req.label,
            models=req.models or None,
        )
        return {"account": account}

    @router.put("/accounts/{account_id}")
    async def update_canvas_account(account_id: str, req: UpdateCanvasAccountRequest):
        updates = req.model_dump(exclude_unset=True)
        account = update_account(account_id, **updates)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"account": account}

    @router.delete("/accounts/{account_id}")
    async def delete_canvas_account(account_id: str):
        if not delete_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/accounts/{account_id}/reset")
    async def reset_canvas_account(account_id: str):
        if not reset_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/accounts/reset-all")
    async def reset_all_canvas_accounts():
        count = reset_all()
        return {"ok": True, "reset": count}

    @router.get("/accounts/{account_id}/test")
    async def test_canvas_account(account_id: str):
        account = get_account(account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        base_url = account["base_url"].rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{base_url}/health",
                    headers={"Authorization": f"Bearer {account['token']}"},
                )
                if resp.status_code == 200:
                    return {"ok": True, "status": "healthy"}
                else:
                    return {"ok": False, "status": resp.status_code, "error": resp.text[:200]}
        except Exception as e:
            return {"ok": False, "status": "error", "error": str(e)}

    @router.get("/available-models")
    async def canvas_available_models():
        models = get_all_canvas_models()
        return {"models": models}

    return router
