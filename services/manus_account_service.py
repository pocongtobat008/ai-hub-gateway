"""Manus account service — manages Manus API keys with round-robin and cooldown."""
from __future__ import annotations

import json
import time
import threading
from pathlib import Path
from typing import Any

DATA_DIR = Path("/app/data") if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ACCOUNTS_FILE = DATA_DIR / "manus_accounts.json"

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
    if len(key) <= 8:
        return key[:2] + "***"
    return key[:4] + "***" + key[-4:]


def list_accounts() -> list[dict[str, Any]]:
    with _lock:
        return [
            {
                "id": acc.get("id", ""),
                "api_key_masked": _mask_key(acc.get("api_key", "")),
                "label": acc.get("label", ""),
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


def get_credentials(account_id: str) -> str | None:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                return acc.get("api_key")
    return None


def add_account(api_key: str, label: str = "") -> dict[str, Any]:
    import uuid
    with _lock:
        accounts = _load()
        account_id = uuid.uuid4().hex[:16]
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        account = {
            "id": account_id,
            "api_key": api_key.strip(),
            "label": label or _mask_key(api_key.strip()),
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
            "api_key_masked": _mask_key(api_key.strip()),
            "label": account["label"],
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
                acc["cooldown_until"] = time.time() + 300  # 5 min cooldown
                if acc["fail_count"] >= 3:
                    acc["status"] = "rate_limited"
                else:
                    acc["status"] = "abnormal"
                _save(accounts)
                return


def mark_auth_failure(account_id: str, error: str) -> None:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["last_error"] = error
                acc["last_error_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                acc["fail_count"] = acc.get("fail_count", 0) + 1
                acc["cooldown_until"] = time.time() + 600  # 10 min cooldown for auth failure
                acc["status"] = "abnormal"
                _save(accounts)
                return


def get_all_api_keys() -> list[tuple[str, str]]:
    """Return list of (account_id, api_key) for all normal accounts."""
    with _lock:
        accounts = _load()
        now = time.time()
        result = []
        for acc in accounts:
            if acc.get("status") == "normal" and acc.get("cooldown_until", 0) <= now:
                result.append((acc["id"], acc.get("api_key", "")))
        return result


def reset_all() -> int:
    """Reset all accounts to normal status."""
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
