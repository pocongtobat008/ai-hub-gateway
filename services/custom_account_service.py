"""Custom/local provider account service — manages OpenAI-compatible API endpoints."""
from __future__ import annotations

import json
import time
import threading
from pathlib import Path
from typing import Any

DATA_DIR = Path("/app/data") if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ACCOUNTS_FILE = DATA_DIR / "custom_accounts.json"

_lock = threading.Lock()


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
                "base_url": acc.get("base_url", ""),
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


def get_credentials(account_id: str) -> dict[str, str] | None:
    """Return {base_url, api_key} for the given account."""
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                return {
                    "base_url": acc.get("base_url", ""),
                    "api_key": acc.get("api_key", ""),
                }
    return None


def add_account(base_url: str, api_key: str, models: list[str], label: str = "") -> dict[str, Any]:
    import uuid
    with _lock:
        accounts = _load()
        account_id = uuid.uuid4().hex[:16]
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        account = {
            "id": account_id,
            "base_url": base_url.rstrip("/"),
            "api_key": api_key.strip(),
            "label": label or base_url.replace("https://", "").replace("http://", "").split("/")[0],
            "models": models,
            "status": "normal",
            "last_error": None,
            "last_error_at": None,
            "last_used_at": None,
            "created_at": now,
            "fail_count": 0,
            "cooldown_until": 0,
        }
        accounts.append(account)
        _save(accounts)
        return {
            "id": account_id,
            "label": account["label"],
            "base_url": account["base_url"],
            "api_key_masked": _mask_key(api_key.strip()),
            "models": models,
            "status": "normal",
            "created_at": now,
        }


def update_account(account_id: str, **fields: Any) -> bool:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                for key, value in fields.items():
                    acc[key] = value
                _save(accounts)
                return True
    return False


def delete_account(account_id: str) -> bool:
    with _lock:
        accounts = _load()
        before = len(accounts)
        accounts = [acc for acc in accounts if acc.get("id") != account_id]
        if len(accounts) < before:
            _save(accounts)
            return True
    return False


def mark_used(account_id: str) -> None:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["last_used_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                acc["status"] = "normal"
                acc["last_error"] = None
                acc["last_error_at"] = None
                acc["fail_count"] = 0
                _save(accounts)
                return


def mark_error(account_id: str, error: str) -> None:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["last_error"] = error
                acc["last_error_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                acc["fail_count"] = acc.get("fail_count", 0) + 1
                acc["cooldown_until"] = time.time() + 300
                if acc["fail_count"] >= 3:
                    acc["status"] = "rate_limited"
                else:
                    acc["status"] = "abnormal"
                _save(accounts)
                return


def get_all_endpoints() -> list[dict[str, str]]:
    """Return list of {account_id, base_url, api_key} for all normal accounts."""
    with _lock:
        accounts = _load()
        now = time.time()
        result = []
        for acc in accounts:
            if acc.get("status") == "normal" and acc.get("cooldown_until", 0) <= now:
                result.append({
                    "account_id": acc["id"],
                    "base_url": acc.get("base_url", ""),
                    "api_key": acc.get("api_key", ""),
                    "models": acc.get("models", []),
                })
        return result


def reset_all() -> int:
    with _lock:
        accounts = _load()
        count = 0
        for acc in accounts:
            if acc.get("status") != "normal":
                acc["status"] = "normal"
                acc["last_error"] = None
                acc["last_error_at"] = None
                acc["fail_count"] = 0
                acc["cooldown_until"] = 0
                count += 1
        _save(accounts)
        return count
