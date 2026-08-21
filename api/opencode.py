"""OpenCode account management API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from services.opencode_account_service import (
    list_accounts,
    add_account,
    update_account,
    delete_account,
    reset_account,
    reset_all_accounts,
    OPENCODE_MODELS,
)
from services.opencode_provider import get_all_opencode_models, OPENCODE_PROXY_URL


class AddAccountRequest(BaseModel):
    api_key: str
    models: list[str] = []
    label: str = ""


class UpdateAccountRequest(BaseModel):
    api_key: str | None = None
    models: list[str] | None = None
    label: str | None = None


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/opencode", tags=["opencode"])

    @router.get("/accounts")
    async def get_accounts():
        accounts = list_accounts()
        return {"accounts": accounts, "total": len(accounts)}

    @router.post("/accounts")
    async def create_account(req: AddAccountRequest):
        if not req.api_key.strip():
            raise HTTPException(status_code=400, detail="API key is required")
        models = req.models if req.models else OPENCODE_MODELS
        acc = add_account(req.api_key, models, req.label)
        return acc

    @router.put("/accounts/{account_id}")
    async def modify_account(account_id: str, req: UpdateAccountRequest):
        updates = {}
        if req.api_key is not None:
            updates["api_key"] = req.api_key
        if req.models is not None:
            updates["models"] = req.models
        if req.label is not None:
            updates["label"] = req.label
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        if not update_account(account_id, **updates):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.delete("/accounts/{account_id}")
    async def remove_account(account_id: str):
        if not delete_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/accounts/{account_id}/reset")
    async def reset_single_account(account_id: str):
        if not reset_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/accounts/reset-all")
    async def reset_all():
        count = reset_all_accounts()
        return {"ok": True, "reset": count}

    @router.post("/accounts/{account_id}/refresh")
    async def refresh_account(account_id: str):
        """Test an account by hitting the opencode-proxy health endpoint."""
        from services.opencode_account_service import get_api_key
        import httpx

        api_key = get_api_key(account_id)
        if not api_key:
            raise HTTPException(status_code=404, detail="Account not found")

        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(f"{OPENCODE_PROXY_URL}/health")
            if resp.status_code == 200:
                reset_account(account_id)
                return {"ok": True, "status": "normal"}
            else:
                from services.opencode_account_service import mark_error
                mark_error(account_id, f"HTTP {resp.status_code}")
                update_account(account_id, status="abnormal")
                return {"ok": False, "status": "abnormal", "error": f"HTTP {resp.status_code}"}
        except Exception as exc:
            from services.opencode_account_service import mark_error
            mark_error(account_id, str(exc))
            update_account(account_id, status="abnormal")
            return {"ok": False, "status": "abnormal", "error": str(exc)}

    @router.get("/models")
    async def get_models():
        return {"models": get_all_opencode_models()}

    @router.get("/available-models")
    async def get_available_models():
        models = get_all_opencode_models()
        return {
            "object": "list",
            "data": [
                {
                    "id": m["id"],
                    "object": "model",
                    "created": 0,
                    "owned_by": "opencode",
                }
                for m in models
            ],
        }

    @router.get("/fetch-models")
    async def fetch_available_models():
        """Return the built-in model list from opencode-proxy config."""
        return {"models": OPENCODE_MODELS, "source": "opencode-proxy config", "count": len(OPENCODE_MODELS)}

    return router
