"""Manus accounts management API routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.manus_account_service import (
    add_account,
    delete_account,
    get_credentials,
    list_accounts,
    reset_all,
    update_account,
)
from services.manus_provider import manus_pool


class AddManusAccountRequest(BaseModel):
    api_key: str
    label: str = ""


class UpdateManusAccountRequest(BaseModel):
    label: str | None = None


class TestManusRequest(BaseModel):
    account_id: str | None = None


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/manus", tags=["manus"])

    @router.get("/accounts")
    async def get_accounts() -> dict[str, Any]:
        return {"accounts": list_accounts()}

    @router.post("/accounts")
    async def add_manus_account(request: AddManusAccountRequest) -> dict[str, Any]:
        if not request.api_key.strip():
            raise HTTPException(status_code=400, detail="api_key is required")
        account = add_account(request.api_key.strip(), request.label)
        return account

    @router.put("/accounts/{account_id}")
    async def update_manus_account(account_id: str, request: UpdateManusAccountRequest) -> dict[str, Any]:
        fields = {}
        if request.label is not None:
            fields["label"] = request.label
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        if not update_account(account_id, **fields):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.delete("/accounts/{account_id}")
    async def delete_manus_account(account_id: str) -> dict[str, Any]:
        if not delete_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/test")
    async def test_manus_account(request: TestManusRequest) -> dict[str, Any]:
        """Test a Manus API key by calling agent.list."""
        import httpx
        from services.manus_provider import MANUS_API_BASE, _headers, _decode, ManusUpstreamError

        if request.account_id:
            api_key = get_credentials(request.account_id)
            if not api_key:
                raise HTTPException(status_code=404, detail="Account not found")
        else:
            # Test all accounts
            return await _test_all_manus()

        try:
            with httpx.Client(timeout=15) as client:
                resp = client.get(
                    f"{MANUS_API_BASE}/v2/agent.list",
                    headers=_headers(api_key),
                )
            _decode(resp)
            update_account(request.account_id, status="normal", last_error=None, fail_count=0)
            return {"ok": True}
        except ManusUpstreamError as exc:
            update_account(request.account_id, status="abnormal", last_error=str(exc))
            return {"ok": False, "error": str(exc)}

    @router.post("/test-all")
    async def test_all_manus() -> dict[str, Any]:
        return await _test_all_manus()

    @router.post("/reset")
    async def reset_manus_accounts() -> dict[str, Any]:
        count = reset_all()
        return {"ok": True, "reset": count}

    async def _test_all_manus() -> dict[str, Any]:
        """Test all Manus accounts and refresh tokens."""
        import httpx
        from services.manus_provider import MANUS_API_BASE, _headers, _decode, ManusUpstreamError

        accounts = list_accounts()
        ok = 0
        fail = 0
        for acc in accounts:
            api_key = get_credentials(acc["id"])
            if not api_key:
                fail += 1
                update_account(acc["id"], status="abnormal", last_error="No API key")
                continue
            try:
                with httpx.Client(timeout=15) as client:
                    resp = client.get(
                        f"{MANUS_API_BASE}/v2/agent.list",
                        headers=_headers(api_key),
                    )
                _decode(resp)
                update_account(acc["id"], status="normal", last_error=None, fail_count=0)
                ok += 1
            except ManusUpstreamError as exc:
                update_account(acc["id"], status="abnormal", last_error=str(exc))
                fail += 1
            except Exception as exc:
                update_account(acc["id"], status="abnormal", last_error=str(exc))
                fail += 1

        return {"ok": True, "total": len(accounts), "passed": ok, "failed": fail}

    return router
