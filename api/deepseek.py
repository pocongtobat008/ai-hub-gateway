from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from api.support import require_admin
from services.deepseek_account_service import deepseek_account_service
from services.deepseek_provider import deepseek_provider


class DeepSeekTestRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    account_id: str = ""
    email: str = ""
    password: str = ""
    proxy: str = ""


class DeepSeekAccountCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    label: str = ""
    proxy: str = ""


class DeepSeekAccountUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    email: str | None = None
    password: str | None = None
    label: str | None = None
    proxy: str | None = None
    status: str | None = None


def _seed_config_account() -> None:
    """Migrate the legacy single-account config credentials into the account pool (idempotent)."""
    try:
        from services.config import config

        settings = config.get_deepseek_settings() if hasattr(config, "get_deepseek_settings") else {}
        if not isinstance(settings, dict):
            settings = {}
        deepseek_account_service.seed_from_config(
            str(settings.get("email") or ""),
            str(settings.get("password") or ""),
            proxy=str(settings.get("proxy") or ""),
        )
    except Exception:
        pass


def create_router() -> APIRouter:
    _seed_config_account()
    router = APIRouter()

    @router.get("/api/deepseek/status")
    async def deepseek_status(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"result": await run_in_threadpool(deepseek_provider.status)}

    @router.get("/api/deepseek/accounts")
    async def list_accounts(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"accounts": await run_in_threadpool(deepseek_account_service.list_accounts)}

    @router.post("/api/deepseek/accounts")
    async def add_account(body: DeepSeekAccountCreateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            account = await run_in_threadpool(
                deepseek_account_service.add_account,
                body.email.strip(),
                body.password,
                label=body.label.strip(),
                proxy=body.proxy.strip(),
            )
            return {"account": account, "accounts": deepseek_account_service.list_accounts()}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc

    @router.put("/api/deepseek/accounts/{account_id}")
    async def update_account(account_id: str, body: DeepSeekAccountUpdateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        updates: dict[str, object] = {}
        for field in ("email", "password", "label", "proxy", "status"):
            value = getattr(body, field, None)
            if value is not None:
                updates[field] = value
        try:
            account = await run_in_threadpool(deepseek_account_service.update_account, account_id, updates)
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if account is None:
            raise HTTPException(status_code=404, detail={"error": "account not found"})
        return {"account": account, "accounts": deepseek_account_service.list_accounts()}

    @router.delete("/api/deepseek/accounts/{account_id}")
    async def delete_account(account_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        ok = await run_in_threadpool(deepseek_account_service.delete_account, account_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error": "account not found"})
        return {"ok": True, "accounts": deepseek_account_service.list_accounts()}

    @router.post("/api/deepseek/test")
    async def deepseek_test(body: DeepSeekTestRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        email = str(body.email or "").strip()
        password = str(body.password or "")
        proxy = str(body.proxy or "").strip()
        account_id = str(body.account_id or "").strip() or None
        try:
            if account_id:
                creds = deepseek_account_service.get_credentials(account_id)
                if creds is None:
                    result = {"ok": False, "error": "account not found"}
                else:
                    result = await run_in_threadpool(
                        deepseek_provider.test_account,
                        creds["email"],
                        creds["password"],
                        creds.get("proxy") or "",
                    )
                    if result.get("ok") and isinstance(result.get("models"), list):
                        deepseek_account_service.update_models(
                            account_id,
                            [{"id": model_id} for model_id in result["models"]],
                        )
            elif email and password:
                result = await run_in_threadpool(deepseek_provider.test_account, email, password, proxy)
            else:
                result = {"ok": False, "error": "email and password are required"}
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
        return {"result": result}

    return router
