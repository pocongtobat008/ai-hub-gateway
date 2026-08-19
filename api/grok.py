"""Grok accounts API — CRUD, test, and status endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from api.support import require_admin
from services.grok_account_service import grok_account_service
from services.grok_provider import grok_provider


class AddAccountRequest(BaseModel):
    api_key: str = ""
    cookies: dict[str, str] | str | None = None
    label: str = ""
    proxy: str = ""


class UpdateAccountRequest(BaseModel):
    api_key: str | None = None
    cookies: dict[str, str] | str | None = None
    label: str | None = None
    proxy: str | None = None
    status: str | None = None


class TestAccountRequest(BaseModel):
    api_key: str = ""
    cookies: dict[str, str] | str | None = None
    proxy: str = ""


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/grok/status")
    async def get_status(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"result": grok_provider.status()}

    @router.get("/api/grok/accounts")
    async def list_accounts(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"accounts": grok_account_service.list_accounts()}

    @router.post("/api/grok/accounts")
    async def add_account(body: AddAccountRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            account = grok_account_service.add_account(
                api_key=body.api_key, cookies=body.cookies, label=body.label, proxy=body.proxy
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return {"account": account, "accounts": grok_account_service.list_accounts()}

    @router.put("/api/grok/accounts/{account_id}")
    async def update_account(account_id: str, body: UpdateAccountRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        account = grok_account_service.update_account(account_id, updates)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"account": account, "accounts": grok_account_service.list_accounts()}

    @router.delete("/api/grok/accounts/{account_id}")
    async def delete_account(account_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        ok = grok_account_service.delete_account(account_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True, "accounts": grok_account_service.list_accounts()}

    @router.post("/api/grok/test")
    async def test_account(body: TestAccountRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        from services.grok_account_service import _normalize_cookies
        cookies = _normalize_cookies(body.cookies) if body.cookies else None
        result = grok_provider.test_account(
            api_key=body.api_key, cookies=cookies, proxy=body.proxy
        )
        return {"result": result}

    return router
