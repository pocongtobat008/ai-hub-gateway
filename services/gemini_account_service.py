"""Google account pool for the Gemini provider.

Mirrors the chatgpt2api account-pool pattern: each Google account stores its
Gemini web cookies plus health/usage tracking, and the provider selects a
healthy account per request with automatic failover.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from services.config import DATA_DIR


GEMINI_ACCOUNTS_FILE = DATA_DIR / "gemini_accounts.json"

VALID_STATUSES = {"normal", "rate_limited", "abnormal", "disabled"}
VALID_SOURCE_TYPES = {"gemini", "google", "manual"}
VALID_PLAN_TYPES = {"free", "plus", "pro", "ultra", "advanced"}


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


def _normalize_cookies(value: object) -> dict[str, str]:
    source = value if isinstance(value, dict) else {}
    return {
        "secure_1psid": str(source.get("secure_1psid") or "").strip(),
        "secure_1psidts": str(source.get("secure_1psidts") or "").strip(),
        "extra": str(source.get("extra") or "").strip(),
    }


def _normalize_account(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    cookies = _normalize_cookies(item.get("cookies"))
    if not cookies["secure_1psid"]:
        return None
    source_type = str(item.get("source_type") or "gemini").strip().lower()
    if source_type not in VALID_SOURCE_TYPES:
        source_type = "gemini"
    plan_type = str(item.get("plan_type") or "free").strip().lower()
    if plan_type not in VALID_PLAN_TYPES:
        plan_type = "free"
    return {
        "id": str(item.get("id") or _new_id()).strip(),
        "email": str(item.get("email") or "").strip() or None,
        "label": str(item.get("label") or "").strip(),
        "cookies": cookies,
        "proxy": str(item.get("proxy") or "").strip(),
        "status": _normalize_status(item.get("status")),
        "source_type": source_type,
        "plan_type": plan_type,
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
    """Account shape safe to send to the frontend (masks nothing sensitive except it keeps cookies for admin UI)."""
    return dict(item)


class GeminiAccountService:
    def __init__(self, store_file: Path = GEMINI_ACCOUNTS_FILE) -> None:
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

    def add_account(self, cookies: dict, *, email: str = "", label: str = "", proxy: str = "", plan_type: str = "free") -> dict:
        normalized_cookies = _normalize_cookies(cookies)
        if not normalized_cookies["secure_1psid"]:
            raise ValueError("secure_1psid cookie is required")
        account = _normalize_account({
            "id": _new_id(),
            "email": email,
            "label": label,
            "cookies": normalized_cookies,
            "proxy": proxy,
            "plan_type": plan_type,
            "status": "normal",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
        if account is None:
            raise ValueError("invalid account")
        with self._lock:
            # Avoid duplicate 1PSID
            for existing in self._accounts:
                if existing["cookies"]["secure_1psid"] == account["cookies"]["secure_1psid"]:
                    raise ValueError("An account with this Secure-1PSID already exists")
            self._accounts.append(account)
            self._save()
        return _public_account(account)

    def update_account(self, account_id: str, updates: dict) -> dict | None:
        with self._lock:
            for index, item in enumerate(self._accounts):
                if item["id"] != account_id:
                    continue
                merged = {**item, **updates, "id": account_id, "updated_at": _now_iso()}
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
        """Flip rate_limited accounts back to normal once their cooldown expires."""
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
        if not account["cookies"]["secure_1psid"]:
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
            # Round-robin over usable accounts
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
                    # Only flip status for real failures; unknown/data-structure errors
                    # just bump the counters and keep the account usable.
                    lower = str(error or "").lower()
                    if any(token in lower for token in ("401", "logged out", "session expired", "auth failed", "unauthorized", "permission denied")):
                        item["status"] = "abnormal"
                        item["restore_at"] = None
                    elif any(token in lower for token in ("rate limit", "quota", "429", "too many", "temporarily", "timeout", "timed out")):
                        item["status"] = "rate_limited"
                        from datetime import timedelta
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

    def seed_from_config(self, cookies: dict, proxy: str = "") -> bool:
        """Import the legacy single-account config cookies into the pool (idempotent)."""
        normalized = _normalize_cookies(cookies)
        if not normalized["secure_1psid"]:
            return False
        with self._lock:
            for existing in self._accounts:
                if existing["cookies"]["secure_1psid"] == normalized["secure_1psid"]:
                    return False
            account = _normalize_account({
                "id": _new_id(),
                "label": "config",
                "cookies": normalized,
                "proxy": proxy,
                "plan_type": "free",
                "status": "normal",
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            })
            if account is not None:
                self._accounts.append(account)
                self._save()
                return True
        return False


gemini_account_service = GeminiAccountService()
