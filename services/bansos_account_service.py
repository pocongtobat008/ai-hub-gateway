"""Bansos account service — manages bansos-router daemon URLs."""
from __future__ import annotations

import json
import time
import threading
import uuid
from pathlib import Path
from typing import Any

DATA_DIR = Path("/app/data") if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ACCOUNTS_FILE = DATA_DIR / "bansos_accounts.json"

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
    ACCOUNTS_FILE.write_text(json.dumps(accounts, indent=2, ensure_ascii=False), encoding="utf-8")


def list_accounts() -> list[dict[str, Any]]:
    with _lock:
        return [
            {
                "id": acc.get("id", ""),
                "label": acc.get("label", ""),
                "daemon_url": acc.get("daemon_url", ""),
                "models": acc.get("models", []),
                "status": acc.get("status", "normal"),
                "last_error": acc.get("last_error"),
                "created_at": acc.get("created_at", ""),
                "last_used_at": acc.get("last_used_at"),
            }
            for acc in _load()
        ]


def get_account(account_id: str) -> dict[str, Any] | None:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                return acc
    return None


def add_account(daemon_url: str, models: list[str], label: str = "") -> dict[str, Any]:
    with _lock:
        accounts = _load()
        account_id = uuid.uuid4().hex[:16]
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        account = {
            "id": account_id,
            "daemon_url": daemon_url.rstrip("/"),
            "label": label or daemon_url.replace("http://", "").replace("https://", ""),
            "models": models,
            "status": "normal",
            "last_error": None,
            "created_at": now,
            "last_used_at": None,
        }
        accounts.append(account)
        _save(accounts)
        return {"id": account_id, "label": account["label"], "daemon_url": account["daemon_url"], "models": models, "status": "normal", "created_at": now}


def update_account(account_id: str, **fields: Any) -> bool:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                for k, v in fields.items():
                    acc[k] = v
                _save(accounts)
                return True
    return False


def delete_account(account_id: str) -> bool:
    with _lock:
        accounts = _load()
        before = len(accounts)
        accounts = [a for a in accounts if a.get("id") != account_id]
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
                _save(accounts)
                return


def mark_error(account_id: str, error: str) -> None:
    with _lock:
        accounts = _load()
        for acc in accounts:
            if acc.get("id") == account_id:
                acc["last_error"] = error
                acc["status"] = "abnormal"
                _save(accounts)
                return


def reset_all() -> int:
    with _lock:
        accounts = _load()
        count = 0
        for acc in accounts:
            if acc.get("status") != "normal":
                acc["status"] = "normal"
                acc["last_error"] = None
                count += 1
        _save(accounts)
        return count
