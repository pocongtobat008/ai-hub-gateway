"""DeepSeek account pool (email/password) for the DeepSeek web provider.

Mirrors the Gemini account-pool pattern: each account stores its DeepSeek
credentials plus health/usage tracking, and the provider selects a healthy
account per request with automatic failover.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

from services.config import DATA_DIR


DEEPSEEK_ACCOUNTS_FILE = DATA_DIR / "deepseek_accounts.json"

VALID_STATUSES = {"normal", "rate_limited", "abnormal", "disabled"}
VALID_SOURCE_TYPES = {"deepseek", "manual"}


def _new_id() -> str:
    return uuid.uuid4().hex[:16]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _normalize_status(value: object) -> str:
    status = str(value or "").strip().lower()
    mapping = {
        "正常": "normal",
        "限流": "rate_limited",
        "异常": "abnormal",
        "禁用": "disabled",
        "banned": "disabled",
        "rate_limit": "rate_limited",
        "ratelimited": "rate_limited",
    }
    status = mapping.get(status, status)
    if status not in VALID_STATUSES:
        status = "normal"
    return status


def _normalize_account(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    email = str(item.get("email") or "").strip()
    password = str(item.get("password") or "").strip()
    if not email or not password:
        return None
    source_type = str(item.get("source_type") or "deepseek").strip().lower()
    if source_type not in VALID_SOURCE_TYPES:
        source_type = "deepseek"
    return {
        "id": str(item.get("id") or _new_id()).strip(),
        "email": email,
        "password": password,
        "label": str(item.get("label") or "").strip(),
        "proxy": str(item.get("proxy") or "").strip(),
        "status": _normalize_status(item.get("status")),
        "source_type": source_type,
        "quota": max(0, int(item.get("quota") if item.get("quota") is not None else 0)),
        "success": max(0, int(item.get("success") or 0)),
        "fail": max(0, int(item.get("fail") or 0)),
        "invalid_count": max(0, int(item.get("invalid_count") or 0)),
        "last_used_at": item.get("last_used_at") or None,
        "last_invalid_at": item.get("last_invalid_at") or None,
        "last_error": str(item.get("last_error") or "").strip() or None,
        "restore_at": item.get("restore_at") or None,
        "models": item.get("models") if isinstance(item.get("models"), list) else [],
        "created_at": str(item.get("created_at") or _now_iso()),
        "updated_at": str(item.get("updated_at") or _now_iso()),
    }


def _public_account(item: dict) -> dict:
    """Account shape safe to send to the frontend (masks the password)."""
    public = dict(item)
    public["password"] = "********"
    return public


class DeepSeekAccountService:
    def __init__(self, store_file: Path = DEEPSEEK_ACCOUNTS_FILE) -> None:
        self._store_file = store_file
        self._lock = Lock()
        self._accounts: list[dict] = []
        self._rr_index = 0
        self._load()

    # ── persistence ────────────────────────────────────────────────

    def _load(self) -> None:
        if not self._store_file.exists():
            self._accounts = []
            return
        try:
            raw = json.loads(self._store_file.read_text(encoding="utf-8"))
            items = raw.get("accounts") if isinstance(raw, dict) else raw
            if not isinstance(items, list):
                items = []
            self._accounts = []
            for item in items:
                normalized = _normalize_account(item)
                if normalized:
                    self._accounts.append(normalized)
        except Exception:
            self._accounts = []

    def _save(self) -> None:
        self._store_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {"accounts": self._accounts, "updated_at": _now_iso()}
        self._store_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ── public API ─────────────────────────────────────────────────

    def list_accounts(self) -> list[dict]:
        with self._lock:
            self._restore_expired()
            return [_public_account(item) for item in self._accounts]

    def get_account(self, account_id: str) -> dict | None:
        with self._lock:
            for item in self._accounts:
                if item["id"] == account_id:
                    return _public_account(item)
        return None

    def get_credentials(self, account_id: str) -> dict | None:
        """Return raw credentials (email + password) for the provider."""
        with self._lock:
            for item in self._accounts:
                if item["id"] == account_id:
                    return {
                        "id": item["id"],
                        "email": item["email"],
                        "password": item["password"],
                        "proxy": item.get("proxy") or "",
                    }
        return None

    def add_account(self, email: str, password: str, *, label: str = "", proxy: str = "") -> dict:
        email = email.strip()
        password = password.strip()
        if not email or not password:
            raise ValueError("email and password are required")
        account = _normalize_account({
            "id": _new_id(),
            "email": email,
            "password": password,
            "label": label,
            "proxy": proxy,
            "status": "normal",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
        if account is None:
            raise ValueError("invalid account")
        with self._lock:
            for existing in self._accounts:
                if existing["email"].lower() == email.lower():
                    raise ValueError("An account with this email already exists")
            self._accounts.append(account)
            self._save()
        return _public_account(account)

    def update_account(self, account_id: str, updates: dict) -> dict | None:
        with self._lock:
            for index, item in enumerate(self._accounts):
                if item["id"] != account_id:
                    continue
                merged = {**item, **updates, "id": account_id, "updated_at": _now_iso()}
                # An empty password means "keep the current one" (UI masks it).
                password = str(merged.get("password") or "").strip()
                if not password:
                    merged["password"] = item.get("password") or ""
                normalized = _normalize_account(merged)
                if normalized is None:
                    return None
                self._accounts[index] = normalized
                self._save()
                return _public_account(normalized)
        return None

    def delete_account(self, account_id: str) -> bool:
        with self._lock:
            before = len(self._accounts)
            self._accounts = [item for item in self._accounts if item["id"] != account_id]
            if len(self._accounts) < before:
                self._save()
                return True
        return False

    # ── selection / health ─────────────────────────────────────────

    def _cooldown_passed(self, account: dict) -> bool:
        restore_at = account.get("restore_at")
        if not restore_at:
            return True
        try:
            restore = datetime.fromisoformat(str(restore_at))
            return datetime.now(timezone.utc) >= restore.replace(tzinfo=timezone.utc)
        except Exception:
            return True

    def _restore_expired(self) -> None:
        changed = False
        for item in self._accounts:
            if item.get("status") == "rate_limited" and self._cooldown_passed(item):
                item["status"] = "normal"
                item["restore_at"] = None
                item["updated_at"] = _now_iso()
                changed = True
        if changed:
            self._save()

    def _is_usable(self, account: dict) -> bool:
        if account["status"] not in ("normal", "rate_limited"):
            return False
        return self._cooldown_passed(account)

    def pick_account(self, prefer_id: str | None = None) -> dict | None:
        with self._lock:
            self._restore_expired()
            usable = [item for item in self._accounts if self._is_usable(item)]
            if not usable:
                return None
            if prefer_id:
                for item in usable:
                    if item["id"] == prefer_id:
                        return _public_account(item)
            candidates = sorted(usable, key=lambda item: (item["success"] + item["fail"]))
            index = self._rr_index % len(candidates)
            self._rr_index = (self._rr_index + 1) % len(candidates)
            return _public_account(candidates[index])

    def mark_used(self, account_id: str, *, ok: bool, error: str = "") -> None:
        with self._lock:
            for item in self._accounts:
                if item["id"] != account_id:
                    continue
                item["last_used_at"] = _now_iso()
                item["updated_at"] = _now_iso()
                if ok:
                    item["success"] = max(0, int(item.get("success") or 0)) + 1
                    item["restore_at"] = None
                else:
                    item["fail"] = max(0, int(item.get("fail") or 0)) + 1
                    item["last_error"] = str(error or "").strip()[:300] or None
                    item["last_invalid_at"] = _now_iso()
                    item["invalid_count"] = max(0, int(item.get("invalid_count") or 0)) + 1
                    lower = str(error or "").lower()
                    if any(token in lower for token in ("401", "logged out", "session expired", "auth failed", "unauthorized", "permission denied", "invalid credentials", "wrong password", "password_or_user_name_is_wrong", "account not exist", "user not found")):
                        item["status"] = "abnormal"
                        item["restore_at"] = None
                    elif "muted" in lower or "banned" in lower or "restricted" in lower:
                        # Account is muted/banned — set long cooldown (24h)
                        item["status"] = "rate_limited"
                        item["restore_at"] = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(timespec="seconds")
                    elif any(token in lower for token in ("rate limit", "quota", "429", "too many", "temporarily", "timeout", "timed out")):
                        item["status"] = "rate_limited"
                        item["restore_at"] = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(timespec="seconds")
                self._save()
                return

    def update_models(self, account_id: str, models: list[dict]) -> None:
        with self._lock:
            for item in self._accounts:
                if item["id"] != account_id:
                    continue
                item["models"] = models if isinstance(models, list) else []
                item["updated_at"] = _now_iso()
                self._save()
                return

    def status(self) -> dict:
        accounts = self.list_accounts()
        with self._lock:
            self._restore_expired()
        usable = sum(1 for item in accounts if self._is_usable(item))
        return {
            "enabled": bool(accounts),
            "configured": bool(accounts),
            "ready": usable > 0,
            "error": "",
            "accounts": accounts,
            "total": len(accounts),
            "usable": usable,
        }

    def seed_from_config(self, email: str, password: str, proxy: str = "") -> bool:
        """Import a legacy single-account config (email/password) into the pool (idempotent)."""
        email = email.strip()
        password = password.strip()
        if not email or not password:
            return False
        with self._lock:
            for existing in self._accounts:
                if existing["email"].lower() == email.lower():
                    return False
            account = _normalize_account({
                "id": _new_id(),
                "email": email,
                "password": password,
                "label": "config",
                "proxy": proxy,
                "status": "normal",
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            })
            if account is not None:
                self._accounts.append(account)
                self._save()
                return True
        return False


deepseek_account_service = DeepSeekAccountService()
