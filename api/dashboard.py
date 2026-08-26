from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header

from api.support import require_identity
from services import usage_service


def _safe(call, default):
    try:
        return call()
    except Exception:
        return default


def _account_stats(service_or_module, provider: str) -> dict[str, Any]:
    accounts = _safe(service_or_module.list_accounts, []) or []
    statuses: dict[str, int] = {}
    for account in accounts:
        status = str(account.get("status") or "normal")
        statuses[status] = statuses.get(status, 0) + 1
    models: list[str] = []
    for account in accounts:
        for model in account.get("models") or []:
            mid = str(model.get("id") if isinstance(model, dict) else model or "")
            if mid and mid not in models:
                models.append(mid)
    return {
        "provider": provider,
        "total": len(accounts),
        "statuses": statuses,
        "models": len(models) or None,
    }


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/dashboard/overview")
    def overview(authorization: str | None = Header(default=None)):
        identity = require_identity(authorization)
        if identity is None:
            return {"error": {"message": "Invalid or expired key", "type": "authentication_error", "code": "invalid_api_key"}}

        import services.account_service as gpt_mod
        import services.gemini_account_service as gemini_mod
        import services.deepseek_account_service as deepseek_mod
        import services.grok_account_service as grok_mod
        import services.opencode_account_service as opencode_mod
        import services.custom_account_service as custom_mod
        import services.bansos_account_service as bansos_mod
        import services.manus_account_service as manus_mod

        def _svc(module):
            """Support both singleton-instance modules and plain function modules."""
            import types
            if isinstance(module, types.ModuleType):
                for attr in vars(module).values():
                    # Skip classes & modules; only real singleton instances qualify
                    if not isinstance(attr, (types.ModuleType, type)) and hasattr(attr, "list_accounts"):
                        return attr
            return module

        providers = [
            ("gpt", _svc(gpt_mod)),
            ("gemini", _svc(gemini_mod)),
            ("deepseek", _svc(deepseek_mod)),
            ("grok", _svc(grok_mod)),
            ("opencode", _svc(opencode_mod)),
            ("custom", _svc(custom_mod)),
            ("bansos", _svc(bansos_mod)),
            ("manus", _svc(manus_mod)),
        ]
        accounts = [_account_stats(svc, name) for name, svc in providers]

        # Gemini catalog + live models
        try:
            from services.gemini_provider import gemini_provider
            gemini_catalog = gemini_provider.catalog_models()
        except Exception:
            gemini_catalog = []

        usage = usage_service.summarize(days=14)

        total_accounts = sum(a["total"] for a in accounts)
        healthy_accounts = sum(a["statuses"].get("normal", 0) for a in accounts)

        return {
            "accounts": accounts,
            "totals": {
                "providers": len(accounts),
                "accounts": total_accounts,
                "healthy_accounts": healthy_accounts,
                "usage_requests": usage["total_requests"],
                "usage_errors": usage["total_errors"],
            },
            "gemini_catalog": gemini_catalog,
            "usage": usage,
        }

    @router.get("/api/dashboard/usage")
    def usage(authorization: str | None = Header(default=None), days: int = 14):
        identity = require_identity(authorization)
        if identity is None:
            return {"error": {"message": "Invalid or expired key", "type": "authentication_error", "code": "invalid_api_key"}}
        days = max(1, min(int(days or 14), 90))
        return usage_service.summarize(days=days)

    return router
