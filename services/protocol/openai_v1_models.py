from __future__ import annotations

from typing import Any

from services.account_service import account_service
from services.deepseek_provider import deepseek_provider
from services.gemini_provider import gemini_provider
from services.model_service import model_catalog_service
from utils.helper import CODEX_IMAGE_MODEL


def list_models() -> dict[str, Any]:
    result = model_catalog_service.list_models()
    data = result.get("data")
    if not isinstance(data, list):
        return result
    seen = {str(item.get("id") or "").strip() for item in data if isinstance(item, dict)}
    dynamic_models: set[str] = set()
    accounts = account_service.list_accounts()
    web_image_accounts = [
        account
        for account in accounts
        if isinstance(account, dict)
    ]
    codex_types = {
        normalized
        for account in accounts
        if isinstance(account, dict)
           and account_service._normalize_source_type(account.get("source_type")) == "codex"
           and (normalized := account_service._normalize_account_type(account.get("type")))
    }

    if web_image_accounts:
        dynamic_models.add("gpt-image-2")
    if codex_types & {"Plus", "Team", "Pro"}:
        dynamic_models.add(CODEX_IMAGE_MODEL)
    if "Plus" in codex_types:
        dynamic_models.add(f"plus-{CODEX_IMAGE_MODEL}")
    if "Team" in codex_types:
        dynamic_models.add(f"team-{CODEX_IMAGE_MODEL}")
    if "Pro" in codex_types:
        dynamic_models.add(f"pro-{CODEX_IMAGE_MODEL}")

    for model in sorted(dynamic_models):
        if model not in seen:
            data.append({
                "id": model,
                "object": "model",
                "created": 0,
                "owned_by": "chatgpt2api",
                "permission": [],
                "root": model,
                "parent": None,
            })
            seen.add(model)

    if gemini_provider.is_enabled():
        try:
            gemini_models = gemini_provider.list_models(include_catalog=True)
            for gemini_model in gemini_models:
                model_id = str(gemini_model.get("id") or "").strip()
                if not model_id or model_id in seen:
                    continue
                seen.add(model_id)
                data.append({
                    "id": model_id,
                    "object": "model",
                    "created": 0,
                    "owned_by": "gemini",
                    "permission": [],
                    "root": model_id,
                    "parent": None,
                    "capabilities": gemini_model.get("capabilities") or [],
                    "available": bool(gemini_model.get("available", True)),
                    "display_name": gemini_model.get("display_name") or model_id,
                })
        except Exception:
            pass

    if deepseek_provider.is_enabled():
        try:
            deepseek_models = deepseek_provider.list_models()
            for deepseek_model in deepseek_models:
                model_id = str(deepseek_model.get("id") or "").strip()
                if not model_id or model_id in seen:
                    continue
                seen.add(model_id)
                data.append({
                    "id": model_id,
                    "object": "model",
                    "created": 0,
                    "owned_by": "deepseek",
                    "permission": [],
                    "root": model_id,
                    "parent": None,
                    "capabilities": deepseek_model.get("capabilities") or [],
                    "available": bool(deepseek_model.get("available", True)),
                    "display_name": deepseek_model.get("display_name") or model_id,
                })
        except Exception:
            pass
    return result
