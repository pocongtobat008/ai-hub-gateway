"""OpenCode account service — manages opencode-proxy API keys."""
from __future__ import annotations

import json
import time
import threading
from pathlib import Path
from typing import Any

DATA_DIR = Path("/app/data") if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ACCOUNTS_FILE = DATA_DIR / "opencode_accounts.json"

_lock = threading.Lock()

# Available models from opencode-proxy config
OPENCODE_MODELS = [
    "grok-4.5",
    "gpt-5.6-luna",
    "glm-5.3",
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    "kimi-k2.5",
    "kimi-k2.6",
    "kimi-k2.7",
    "kimi-k3",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "mimo-v2-pro",
    "mimo-v2-omni",
    "mimo-v2.5-pro",
    "mimo-v2.5",
    "hy3",
    "minimax-m3",
    "minimax-m2.7",
    "minimax-m2.5",
    "qwen3.8-max",
    "qwen3.7-max",
    "qwen3.7-plus",
    "qwen3.6-plus",
    "qwen3.5-plus",
]

OPENCODE_PROXY_URL = "http://localhost:4000"


def _load() -> list[dict[str, Any]]:
    if ACCOUNTS_FILE.exists():
        try:
            data = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save(accounts: list[dict[str, Any]]) -> None:
    ACCOUNTS_FILE.write_text(
        json.dumps(accounts, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return key[:2] + "***"
    return key[:4] + "***" + key[-4:]


def list_accounts() -> list[dict[str, Any]]:
    with _lock:
        return [
            {
                "id": acc.get("id", ""),
                "label": acc.get("label", ""),
                "api_key_masked": _mask_key(acc.get("api_key", "")),
                "models": acc.get("models", []),
                "status": acc.get("status", "normal"),
                "last_error": acc.get("last_error"),
                "last_error_at": acc.get("last_error_at"),
                "last_used_at": acc.get("last_used_at"),
                "created_at": acc.get("created_at", ""),
                "fail_count": acc.get("fail_count", 0),
            }
            for acc in _load()
        ]


def get_account(account_id: str) -> dict[str, Any] | None:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                return acc
    return None


def get_api_key(account_id: str) -> str | None:
    """Return the raw API key for the given account."""
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                return acc.get("api_key", "")
    return None


def get_first_valid_key() -> str | None:
    """Return the first valid (non-empty) API key from any normal account."""
    with _lock:
        for acc in _load():
            if acc.get("status") == "normal" and acc.get("api_key"):
                return acc.get("api_key")
    return None


def add_account(api_key: str, models: list[str], label: str = "") -> dict[str, Any]:
    import uuid
    with _lock:
        accounts = _load()
        account_id = uuid.uuid4().hex[:16]
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        account = {
            "id": account_id,
            "api_key": api_key.strip(),
            "label": label or f"OpenCode-{account_id[:8]}",
            "models": models,
            "status": "normal",
            "last_error": None,
            "last_error_at": None,
            "last_used_at": None,
            "created_at": now,
            "fail_count": 0,
        }
        accounts.append(account)
        _save(accounts)
        return {
            "id": account_id,
            "label": account["label"],
            "models": models,
            "status": "normal",
            "created_at": now,
        }


def update_account(account_id: str, **kwargs: Any) -> bool:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                for key in ("label", "api_key", "models", "status"):
                    if key in kwargs:
                        acc[key] = kwargs[key]
                _save(accounts)
                return True
        return False


def delete_account(account_id: str) -> bool:
    with _lock:
        accounts = _load()
        new_accounts = [a for a in accounts if a.get("id") != account_id]
        if len(new_accounts) < len(accounts):
            _save(new_accounts)
            return True
        return False


def mark_used(account_id: str) -> None:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["last_used_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                _save(accounts)
                return


def mark_error(account_id: str, error: str) -> None:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["status"] = "abnormal"
                acc["last_error"] = error[:200]
                acc["last_error_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                acc["fail_count"] = acc.get("fail_count", 0) + 1
                _save(accounts)
                return


def reset_account(account_id: str) -> bool:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["status"] = "normal"
                acc["last_error"] = None
                acc["last_error_at"] = None
                acc["fail_count"] = 0
                _save(accounts)
                return True
        return False


def reset_all_accounts() -> int:
    count = 0
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("status") != "normal":
                acc["status"] = "normal"
                acc["last_error"] = None
                acc["last_error_at"] = None
                acc["fail_count"] = 0
                count += 1
        if count:
            _save(accounts)
    return count


def get_all_endpoints() -> list[dict[str, Any]]:
    """Return all active account endpoints for round-robin."""
    endpoints = []
    with _lock:
        for acc in _load():
            if acc.get("status") == "normal" and acc.get("api_key"):
                endpoints.append({
                    "account_id": acc["id"],
                    "api_key": acc["api_key"],
                    "base_url": OPENCODE_PROXY_URL,
                    "models": acc.get("models", []),
                })
    return endpoints
