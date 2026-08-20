"""Bansos accounts management API routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.bansos_account_service import (
    add_account,
    delete_account,
    get_account,
    list_accounts,
    reset_all,
    update_account,
)
from services.bansos_provider import BANSOS_MODELS


class AddBansosRequest(BaseModel):
    daemon_url: str = "http://127.0.0.1:17070"
    models: list[str] = []
    label: str = ""


class TestBansosRequest(BaseModel):
    account_id: str | None = None


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/bansos", tags=["bansos"])

    @router.get("/accounts")
    async def get_accounts() -> dict[str, Any]:
        return {"accounts": list_accounts()}

    @router.get("/available-models")
    async def available_models() -> dict[str, Any]:
        return {"models": BANSOS_MODELS}

    @router.post("/accounts")
    async def add_bansos_account(request: AddBansosRequest) -> dict[str, Any]:
        url = request.daemon_url.strip()
        if not url:
            raise HTTPException(status_code=400, detail="daemon_url is required")
        models = [m.strip() for m in request.models if m.strip()]
        if not models:
            models = ["deepseek-v4-flash-free"]  # default
        account = add_account(url, models, request.label)
        return account

    @router.delete("/accounts/{account_id}")
    async def delete_bansos_account(account_id: str) -> dict[str, Any]:
        if not delete_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/test")
    async def test_bansos(request: TestBansosRequest) -> dict[str, Any]:
        import httpx
        if request.account_id:
            acc = get_account(request.account_id)
            if not acc:
                raise HTTPException(status_code=404, detail="Account not found")
            return await _test_one(acc)
        return await _test_all()

    @router.post("/test-all")
    async def test_all() -> dict[str, Any]:
        return await _test_all()

    @router.post("/reset")
    async def reset_bansos() -> dict[str, Any]:
        count = reset_all()
        return {"ok": True, "reset": count}

    async def _test_one(acc: dict[str, Any]) -> dict[str, Any]:
        import httpx
        base_url = acc.get("daemon_url", "http://127.0.0.1:17070")
        models = acc.get("models", ["deepseek-v4-flash-free"])
        test_model = models[0] if models else "deepseek-v4-flash-free"
        try:
            url = f"{base_url.rstrip('/')}/v1/chat/completions"
            payload = {"model": test_model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5, "stream": False}
            with httpx.Client(timeout=10) as client:
                resp = client.post(url, json=payload, headers={"Content-Type": "application/json"})
            if resp.status_code == 200:
                update_account(acc["id"], status="normal", last_error=None)
                return {"ok": True}
            else:
                error = f"HTTP {resp.status_code}"
                try:
                    err = resp.json()
                    error = err.get("error", {}).get("message", error)
                except Exception:
                    pass
                update_account(acc["id"], status="abnormal", last_error=error)
                return {"ok": False, "error": error}
        except Exception as exc:
            update_account(acc["id"], status="abnormal", last_error=str(exc))
            return {"ok": False, "error": str(exc)}

    async def _test_all() -> dict[str, Any]:
        accounts = list_accounts()
        ok = 0
        fail = 0
        for acc in accounts:
            result = await _test_one(acc)
            if result.get("ok"):
                ok += 1
            else:
                fail += 1
        return {"ok": True, "total": len(accounts), "passed": ok, "failed": fail}

    return router
