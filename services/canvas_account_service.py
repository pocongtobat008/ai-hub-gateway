"""Gemini Canvas Proxy account service.

Manages Canvas proxy accounts (endpoints + tokens) for the free unlimited
Gemini API via Canvas MessageChannel bridge.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from typing import Any

_DATA_DIR = os.environ.get("CANVAS_DATA_DIR", "/app/data")
_ACCOUNTS_FILE = os.path.join(_DATA_DIR, "canvas_accounts.json")

_lock = threading.Lock()
_accounts: list[dict[str, Any]] | None = None


def _load() -> list[dict[str, Any]]:
    global _accounts
    if _accounts is not None:
        return _accounts
    try:
        with open(_ACCOUNTS_FILE, "r", encoding="utf-8") as f:
            _accounts = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        _accounts = []
    return _accounts


def _save() -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump(_accounts or [], f, indent=2, ensure_ascii=False)


def list_accounts() -> list[dict[str, Any]]:
    with _lock:
        return list(_load())


def get_account(account_id: str) -> dict[str, Any] | None:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                return acc
    return None


def add_account(
    base_url: str,
    token: str,
    label: str = "",
    models: list[str] | None = None,
) -> dict[str, Any]:
    """Add a new Canvas proxy account.

    Args:
        base_url: The proxy endpoint (e.g., http://127.0.0.1:8765)
        token: The bearer token for the proxy
        label: Human-readable label
        models: List of model IDs available through this proxy
    """
    # Normalize base URL
    base_url = base_url.rstrip("/")

    # Default models for Canvas proxy
    if not models:
        models = [
            "gemini-3-flash-preview",
            "gemini-2.5-flash-preview-05-20",
            "gemini-3.1-flash-image-preview",
            "gemini-2.5-flash-image",
        ]

    account = {
        "id": str(uuid.uuid4()),
        "base_url": base_url,
        "token": token,
        "label": label or f"Canvas Proxy @ {base_url}",
        "models": models,
        "status": "normal",
        "total_requests": 0,
        "error_count": 0,
        "last_used": None,
        "created_at": __import__("datetime").datetime.utcnow().isoformat(),
    }

    with _lock:
        _load()
        _accounts = _accounts or []
        _accounts.append(account)
        _save()

    return account


def update_account(
    account_id: str,
    **kwargs: Any,
) -> dict[str, Any] | None:
    with _lock:
        _load()
        for acc in _accounts or []:
            if acc.get("id") == account_id:
                for key, value in kwargs.items():
                    if value is not None:
                        acc[key] = value
                _save()
                return acc
    return None


def delete_account(account_id: str) -> bool:
    with _lock:
        _load()
        global _accounts
        before = len(_accounts or [])
        _accounts = [a for a in (_accounts or []) if a.get("id") != account_id]
        if len(_accounts) < before:
            _save()
            return True
    return False


def mark_used(account_id: str) -> None:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                acc["total_requests"] = acc.get("total_requests", 0) + 1
                acc["last_used"] = __import__("datetime").datetime.utcnow().isoformat()
                _save()
                return


def mark_error(account_id: str) -> None:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                acc["error_count"] = acc.get("error_count", 0) + 1
                _save()
                return


def reset_account(account_id: str) -> bool:
    with _lock:
        for acc in _load():
            if acc.get("id") == account_id:
                acc["status"] = "normal"
                acc["error_count"] = 0
                _save()
                return True
    return False


def reset_all() -> int:
    with _lock:
        _load()
        count = 0
        for acc in _accounts or []:
            if acc.get("status") != "normal":
                acc["status"] = "normal"
                acc["error_count"] = 0
                count += 1
        _save()
        return count


def get_active_accounts() -> list[dict[str, Any]]:
    """Get all accounts with status 'normal'."""
    with _lock:
        return [a for a in _load() if a.get("status") == "normal"]
