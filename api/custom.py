"""Custom/local provider accounts management API routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.custom_account_service import (
    add_account,
    delete_account,
    get_account as get_account_obj,
    get_credentials,
    list_accounts,
    reset_all,
    update_account,
)
from services.custom_provider import custom_provider, validate_models


class AddCustomAccountRequest(BaseModel):
    base_url: str
    api_key: str = ""
    models: list[str] = []
    label: str = ""


class AddCustomBulkRequest(BaseModel):
    base_url: str
    api_keys: list[str]  # one key per line
    models: list[str] = []
    label: str = ""


class UpdateCustomAccountRequest(BaseModel):
    label: str | None = None
    models: list[str] | None = None


class ValidateModelsRequest(BaseModel):
    base_url: str
    api_key: str = ""


class TestCustomRequest(BaseModel):
    account_id: str | None = None


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/custom", tags=["custom"])

    @router.get("/accounts")
    async def get_accounts() -> dict[str, Any]:
        return {"accounts": list_accounts()}

    @router.post("/accounts")
    async def add_custom_account(request: AddCustomAccountRequest) -> dict[str, Any]:
        if not request.base_url.strip():
            raise HTTPException(status_code=400, detail="base_url is required")
        base_url = request.base_url.strip().rstrip("/")
        # Use only models provided by user — do NOT auto-fetch
        models = [m.strip() for m in request.models if m.strip()]
        account = add_account(base_url, request.api_key.strip(), models, request.label)
        return account

    @router.post("/accounts/bulk")
    async def add_bulk_accounts(request: AddCustomBulkRequest) -> dict[str, Any]:
        if not request.base_url.strip():
            raise HTTPException(status_code=400, detail="base_url is required")
        base_url = request.base_url.strip().rstrip("/")
        models = [m.strip() for m in request.models if m.strip()]
        # Filter out empty lines and strip whitespace
        keys = [k.strip() for k in request.api_keys if k.strip()]
        if not keys:
            raise HTTPException(status_code=400, detail="No valid API keys provided")
        accounts = []
        for i, key in enumerate(keys):
            label = f"{request.label or base_url.split('/')[-1]} #{i + 1}" if len(keys) > 1 else request.label
            acc = add_account(base_url, key, models, label)
            accounts.append(acc)
        return {"ok": True, "added": len(accounts), "accounts": accounts}

    @router.put("/accounts/{account_id}")
    async def update_custom_account(account_id: str, request: UpdateCustomAccountRequest) -> dict[str, Any]:
        fields = {}
        if request.label is not None:
            fields["label"] = request.label
        if request.models is not None:
            fields["models"] = request.models
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        if not update_account(account_id, **fields):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.delete("/accounts/{account_id}")
    async def delete_custom_account(account_id: str) -> dict[str, Any]:
        if not delete_account(account_id):
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.post("/validate-models")
    async def validate_endpoint_models(request: ValidateModelsRequest) -> dict[str, Any]:
        """Validate and fetch models from a custom endpoint."""
        if not request.base_url.strip():
            raise HTTPException(status_code=400, detail="base_url is required")
        models = validate_models(request.base_url.strip(), request.api_key.strip())
        return {
            "ok": len(models) > 0,
            "models": models,
            "count": len(models),
        }

    @router.post("/test")
    async def test_custom_account(request: TestCustomRequest) -> dict[str, Any]:
        """Test a custom account by sending a simple chat completion."""
        if request.account_id:
            creds = get_credentials(request.account_id)
            if not creds:
                raise HTTPException(status_code=404, detail="Account not found")
            return await _test_single(creds["base_url"], creds["api_key"], request.account_id)
        else:
            return await _test_all()

    @router.post("/test-all")
    async def test_all_custom() -> dict[str, Any]:
        return await _test_all()

    @router.post("/reset")
    async def reset_custom_accounts() -> dict[str, Any]:
        count = reset_all()
        return {"ok": True, "reset": count}

    async def _test_single(base_url: str, api_key: str, account_id: str) -> dict[str, Any]:
        """Test a single custom endpoint using the first registered model."""
        import httpx
        try:
            # Get the account to find its registered models
            acc = get_account_obj(account_id)
            models_list = acc.get("models", []) if acc else []
            test_model = models_list[0] if models_list else "gpt-3.5-turbo"

            url = f"{base_url.rstrip('/')}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            payload = {
                "model": test_model,
                "messages": [{"role": "user", "content": "Say hi"}],
                "max_tokens": 10,
                "stream": False,
            }

            with httpx.Client(timeout=15) as client:
                resp = client.post(url, headers=headers, json=payload)

            if resp.status_code == 200:
                update_account(account_id, status="normal", last_error=None, fail_count=0)
                return {"ok": True}
            else:
                error = f"HTTP {resp.status_code}"
                try:
                    err = resp.json()
                    error = err.get("error", {}).get("message", error)
                except Exception:
                    pass
                update_account(account_id, status="abnormal", last_error=error)
                return {"ok": False, "error": error}
        except Exception as exc:
            update_account(account_id, status="abnormal", last_error=str(exc))
            return {"ok": False, "error": str(exc)}

    async def _test_all() -> dict[str, Any]:
        """Test all custom accounts."""
        accounts = list_accounts()
        ok = 0
        fail = 0
        for acc in accounts:
            creds = get_credentials(acc["id"])
            if not creds:
                fail += 1
                continue
            result = await _test_single(creds["base_url"], creds["api_key"], acc["id"])
            if result.get("ok"):
                ok += 1
            else:
                fail += 1

        return {"ok": True, "total": len(accounts), "passed": ok, "failed": fail}

    return router
