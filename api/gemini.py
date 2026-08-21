from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from api.support import require_admin, require_identity
from services.gemini_account_service import gemini_account_service
from services.gemini_provider import MEDIA_DIR, gemini_provider


class GeminiTestRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    account_id: str | None = None


class GeminiAccountCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    secure_1psid: str = Field(..., min_length=1)
    secure_1psidts: str = ""
    extra: str = ""
    email: str = ""
    label: str = ""
    proxy: str = ""
    plan_type: str = "free"


class GeminiAccountUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    secure_1psid: str | None = None
    secure_1psidts: str | None = None
    extra: str | None = None
    email: str | None = None
    label: str | None = None
    proxy: str | None = None
    plan_type: str | None = None
    status: str | None = None


class GemCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1)
    description: str = ""


class DeepResearchRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    timeout: float = 600.0


def _seed_config_account() -> None:
    """Migrate the legacy single-account config cookies into the account pool (idempotent)."""
    try:
        from services.config import config

        settings = config.get_gemini_settings()
        cookies = settings.get("cookies") if isinstance(settings.get("cookies"), dict) else {}
        gemini_account_service.seed_from_config(
            {
                "secure_1psid": str(cookies.get("secure_1psid") or ""),
                "secure_1psidts": str(cookies.get("secure_1psidts") or ""),
                "extra": str(cookies.get("extra") or ""),
            },
            proxy=str(settings.get("proxy") or ""),
        )
    except Exception:
        pass


def create_router() -> APIRouter:
    _seed_config_account()
    router = APIRouter()

    @router.get("/api/gemini/status")
    async def gemini_status(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"result": await run_in_threadpool(gemini_provider.status)}

    @router.get("/api/gemini/accounts")
    async def list_accounts(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"accounts": await run_in_threadpool(gemini_account_service.list_accounts)}

    @router.post("/api/gemini/accounts")
    async def add_account(body: GeminiAccountCreateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            account = await run_in_threadpool(
                gemini_account_service.add_account,
                {
                    "secure_1psid": body.secure_1psid.strip(),
                    "secure_1psidts": body.secure_1psidts.strip(),
                    "extra": body.extra.strip(),
                },
                email=body.email.strip(),
                label=body.label.strip(),
                proxy=body.proxy.strip(),
                plan_type=body.plan_type.strip() or "free",
            )
            return {"account": account, "accounts": gemini_account_service.list_accounts()}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc

    @router.put("/api/gemini/accounts/{account_id}")
    async def update_account(account_id: str, body: GeminiAccountUpdateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        updates: dict[str, object] = {}
        if body.secure_1psid is not None or body.secure_1psidts is not None or body.extra is not None:
            current = gemini_account_service.get_account(account_id) or {}
            cookies = current.get("cookies") if isinstance(current.get("cookies"), dict) else {}
            updates["cookies"] = {
                "secure_1psid": (body.secure_1psid if body.secure_1psid is not None else cookies.get("secure_1psid")) or "",
                "secure_1psidts": (body.secure_1psidts if body.secure_1psidts is not None else cookies.get("secure_1psidts")) or "",
                "extra": (body.extra if body.extra is not None else cookies.get("extra")) or "",
            }
        for field in ("email", "label", "proxy", "plan_type", "status"):
            value = getattr(body, field, None)
            if value is not None:
                updates[field] = value
        try:
            account = await run_in_threadpool(gemini_account_service.update_account, account_id, updates)
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if account is None:
            raise HTTPException(status_code=404, detail={"error": "account not found"})
        return {"account": account, "accounts": gemini_account_service.list_accounts()}

    @router.delete("/api/gemini/accounts/{account_id}")
    async def delete_account(account_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        ok = await run_in_threadpool(gemini_account_service.delete_account, account_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error": "account not found"})
        return {"ok": True, "accounts": gemini_account_service.list_accounts()}

    @router.post("/api/gemini/test")
    async def gemini_test(body: GeminiTestRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        account_id = str(body.account_id or "").strip() or None
        try:
            def _test() -> dict:
                gemini_provider.ensure_ready(account_id)
                return {
                    "ok": True,
                    "error": "",
                    "models": gemini_provider.list_models(account_id),
                }
            return {"result": await run_in_threadpool(_test)}
        except Exception as exc:
            return {"result": {"ok": False, "error": str(exc), "models": []}}

    @router.post("/api/gemini/test-all")
    async def test_all_accounts(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        accounts = gemini_account_service.list_accounts()
        ok_count = 0
        fail_count = 0
        for acc in accounts:
            acc_id = acc.get("id", "")
            try:
                def _test_one() -> dict:
                    gemini_provider.ensure_ready(acc_id)
                    return {"ok": True}
                result = await run_in_threadpool(_test_one)
                ok_count += 1
                gemini_account_service.mark_used(acc_id, ok=True)
            except Exception as exc:
                fail_count += 1
                gemini_account_service.mark_used(acc_id, ok=False, error=str(exc)[:100])
        return {"total": len(accounts), "ok": ok_count, "fail": fail_count, "accounts": gemini_account_service.list_accounts()}

    @router.post("/api/gemini/reset")
    async def reset_all_accounts(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        accounts = gemini_account_service.list_accounts()
        for acc in accounts:
            gemini_account_service.update_account(acc["id"], {"status": "normal"})
        import json
        store = gemini_account_service._store_file
        if store.exists():
            data = json.loads(store.read_text(encoding="utf-8"))
            items = data.get("accounts", []) if isinstance(data, dict) else data
            for item in items:
                item["status"] = "normal"
                item["last_error"] = None
                item["last_error_at"] = None
                item["fail"] = 0
                item["invalid_count"] = 0
                item["restore_at"] = None
            store.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return {"ok": True, "accounts": gemini_account_service.list_accounts()}

    @router.get("/api/gemini/fetch-models")
    async def fetch_models_from_source(authorization: str | None = Header(default=None)):
        """Fetch live models from Gemini source."""
        require_admin(authorization)
        try:
            models = await run_in_threadpool(gemini_provider.list_models, None, include_catalog=True)
            model_ids = [m.get("id", m.get("name", "")) for m in models if m.get("id") or m.get("name")]
            return {"models": model_ids}
        except Exception as exc:
            return {"models": [], "error": str(exc)}

    @router.get("/api/gemini/gems")
    async def list_gems(authorization: str | None = Header(default=None)):
        require_identity(authorization)
        try:
            return {"gems": await run_in_threadpool(gemini_provider.list_gems)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    @router.post("/api/gemini/gems")
    async def create_gem(body: GemCreateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            gem = await run_in_threadpool(
                gemini_provider.create_gem,
                body.name.strip(),
                body.prompt.strip(),
                body.description.strip(),
            )
            return {"gem": gem}
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    @router.delete("/api/gemini/gems/{gem_id}")
    async def delete_gem(gem_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            await run_in_threadpool(gemini_provider.delete_gem, gem_id)
            return {"ok": True}
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    @router.post("/api/gemini/deep-research")
    async def deep_research(body: DeepResearchRequest, authorization: str | None = Header(default=None)):
        require_identity(authorization)
        try:
            return {"result": await run_in_threadpool(gemini_provider.deep_research, body.prompt, body.timeout)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    @router.get("/gemini-media/{filename}")
    async def get_gemini_media(filename: str):
        path = MEDIA_DIR / filename
        try:
            resolved = path.resolve()
            if MEDIA_DIR.resolve() not in resolved.parents or not resolved.is_file():
                raise HTTPException(status_code=404, detail="not found")
        except Exception as exc:
            raise HTTPException(status_code=404, detail="not found") from exc
        return FileResponse(resolved, filename=resolved.name)

    return router
