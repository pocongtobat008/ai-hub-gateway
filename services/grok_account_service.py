"""Grok account pool — supports 3 auth methods:

1. xAI API Key: from console.x.ai
2. Grok CLI OAuth: access_token + refresh_token (from vansrouter import)
3. Browser Cookies: sso cookie from grok.com (fallback)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

from services.config import DATA_DIR

GROK_ACCOUNTS_FILE = DATA_DIR / "grok_accounts.json"
VALID_STATUSES = {"normal", "rate_limited", "abnormal", "disabled"}


def _new_id() -> str:
    return uuid.uuid4().hex[:16]

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def _normalize_status(value: object) -> str:
    status = str(value or "").strip().lower()
    mapping = {"正常": "normal", "限流": "rate_limited", "异常": "abnormal", "禁用": "disabled"}
    status = mapping.get(status, status)
    return status if status in VALID_STATUSES else "normal"

def _normalize_cookies(value: object) -> dict[str, str]:
    if isinstance(value, dict):
        return {k: str(v or "").strip() for k, v in value.items() if str(v or "").strip()}
    if isinstance(value, str):
        cookies = {}
        for part in value.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                k, v = k.strip(), v.strip()
                if k and v: cookies[k] = v
        return cookies
    return {}

def _normalize_account(item: object) -> dict | None:
    if not isinstance(item, dict): return None
    api_key = str(item.get("api_key") or "").strip()
    access_token = str(item.get("access_token") or "").strip()
    refresh_token = str(item.get("refresh_token") or "").strip()
    cookies = _normalize_cookies(item.get("cookies") or item.get("sso"))
    if not api_key and not (access_token and refresh_token) and not cookies.get("sso"):
        return None
    return {
        "id": str(item.get("id") or _new_id()).strip(),
        "api_key": api_key,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "cookies": cookies,
        "label": str(item.get("label") or "").strip(),
        "proxy": str(item.get("proxy") or "").strip(),
        "status": _normalize_status(item.get("status")),
        "success": max(0, int(item.get("success") or 0)),
        "fail": max(0, int(item.get("fail") or 0)),
        "invalid_count": max(0, int(item.get("invalid_count") or 0)),
        "last_used_at": item.get("last_used_at") or None,
        "last_invalid_at": item.get("last_invalid_at") or None,
        "last_error": str(item.get("last_error") or "").strip() or None,
        "restore_at": item.get("restore_at") or None,
        "created_at": str(item.get("created_at") or _now_iso()),
        "updated_at": str(item.get("updated_at") or _now_iso()),
    }

def _public_account(item: dict) -> dict:
    public = dict(item)
    # Mask API key
    ak = str(public.get("api_key") or "")
    public["api_key_masked"] = (ak[:8] + "…" + ak[-4:]) if len(ak) > 12 else ("••••" if ak else "")
    public.pop("api_key", None)
    # Mask access_token
    at = str(public.get("access_token") or "")
    public["access_token_masked"] = (at[:15] + "…") if len(at) > 20 else ("••••" if at else "")
    public.pop("access_token", None)
    # Mask refresh_token
    rt = str(public.get("refresh_token") or "")
    public["refresh_token_masked"] = (rt[:10] + "…") if len(rt) > 15 else ("••••" if rt else "")
    public.pop("refresh_token", None)
    # Mask cookies
    cookies = dict(public.get("cookies") or {})
    masked = {}
    for k, v in cookies.items():
        masked[k] = (v[:8] + "…" + v[-4:]) if len(v) > 12 else "••••"
    public["cookies"] = masked
    public["cookie_count"] = len(cookies)
    return public


class GrokAccountService:
    def __init__(self, store_file: Path = GROK_ACCOUNTS_FILE) -> None:
        self._store_file = store_file
        self._lock = Lock()
        self._accounts: list[dict] = []
        self._rr_index = 0
        self._load()

    def _load(self) -> None:
        if not self._store_file.exists():
            self._accounts = []
            return
        try:
            raw = json.loads(self._store_file.read_text(encoding="utf-8"))
            items = raw.get("accounts") if isinstance(raw, dict) else raw
            self._accounts = [n for item in (items if isinstance(items, list) else []) if (n := _normalize_account(item))]
        except: self._accounts = []

    def _save(self) -> None:
        self._store_file.parent.mkdir(parents=True, exist_ok=True)
        self._store_file.write_text(json.dumps({"accounts": self._accounts, "updated_at": _now_iso()}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def list_accounts(self) -> list[dict]:
        with self._lock:
            self._restore_expired()
            return [_public_account(item) for item in self._accounts]

    def get_account(self, account_id: str) -> dict | None:
        with self._lock:
            for item in self._accounts:
                if item["id"] == account_id: return _public_account(item)
        return None

    def get_credentials(self, account_id: str) -> dict | None:
        with self._lock:
            for item in self._accounts:
                if item["id"] == account_id:
                    return {"id": item["id"], "api_key": item.get("api_key") or "",
                            "access_token": item.get("access_token") or "",
                            "refresh_token": item.get("refresh_token") or "",
                            "cookies": dict(item.get("cookies") or {}),
                            "proxy": item.get("proxy") or ""}
        return None

    def add_account(self, *, api_key: str = "", access_token: str = "", refresh_token: str = "",
                    cookies: dict[str, str] | str | None = None, label: str = "", proxy: str = "") -> dict:
        api_key = api_key.strip()
        access_token = access_token.strip()
        refresh_token = refresh_token.strip()
        normalized_cookies = _normalize_cookies(cookies) if cookies else {}
        if not api_key and not (access_token and refresh_token) and not normalized_cookies.get("sso"):
            raise ValueError("Provide api_key, or access_token+refresh_token, or sso cookie")
        account = _normalize_account({
            "id": _new_id(), "api_key": api_key, "access_token": access_token,
            "refresh_token": refresh_token, "cookies": normalized_cookies,
            "label": label, "proxy": proxy, "status": "normal",
            "created_at": _now_iso(), "updated_at": _now_iso(),
        })
        if not account: raise ValueError("invalid account")
        with self._lock:
            self._accounts.append(account)
            self._save()
        return _public_account(account)

    def add_accounts_bulk(self, accounts: list[dict]) -> int:
        """Bulk import accounts. Returns count of added accounts."""
        added = 0
        with self._lock:
            for item in accounts:
                normalized = _normalize_account(item)
                if not normalized: continue
                # Skip duplicates by access_token or api_key
                at = normalized.get("access_token") or ""
                ak = normalized.get("api_key") or ""
                if at and any(a.get("access_token") == at for a in self._accounts): continue
                if ak and any(a.get("api_key") == ak for a in self._accounts): continue
                self._accounts.append(normalized)
                added += 1
            if added: self._save()
        return added

    def update_account(self, account_id: str, updates: dict) -> dict | None:
        with self._lock:
            for index, item in enumerate(self._accounts):
                if item["id"] != account_id: continue
                merged = {**item, **updates, "id": account_id, "updated_at": _now_iso()}
                if "cookies" in updates:
                    nc = _normalize_cookies(updates["cookies"])
                    merged["cookies"] = nc if nc else item.get("cookies") or {}
                normalized = _normalize_account(merged)
                if not normalized: return None
                self._accounts[index] = normalized
                self._save()
                return _public_account(normalized)
        return None

    def delete_account(self, account_id: str) -> bool:
        with self._lock:
            before = len(self._accounts)
            self._accounts = [i for i in self._accounts if i["id"] != account_id]
            if len(self._accounts) < before: self._save(); return True
        return False

    def _cooldown_passed(self, account: dict) -> bool:
        restore_at = account.get("restore_at")
        if not restore_at: return True
        try:
            restore = datetime.fromisoformat(str(restore_at))
            return datetime.now(timezone.utc) >= restore.replace(tzinfo=timezone.utc)
        except: return True

    def _restore_expired(self) -> None:
        changed = False
        for item in self._accounts:
            if item.get("status") == "rate_limited" and self._cooldown_passed(item):
                item["status"] = "normal"; item["restore_at"] = None; item["updated_at"] = _now_iso(); changed = True
        if changed: self._save()

    def _is_usable(self, account: dict) -> bool:
        if account["status"] not in ("normal", "rate_limited"): return False
        return self._cooldown_passed(account)

    def pick_account(self, prefer_id: str | None = None) -> dict | None:
        with self._lock:
            self._restore_expired()
            usable = [i for i in self._accounts if self._is_usable(i)]
            if not usable: return None
            if prefer_id:
                for i in usable:
                    if i["id"] == prefer_id: return _public_account(i)
            candidates = sorted(usable, key=lambda i: (i["success"] + i["fail"]))
            idx = self._rr_index % len(candidates)
            self._rr_index = (self._rr_index + 1) % len(candidates)
            return _public_account(candidates[idx])

    def mark_used(self, account_id: str, *, ok: bool, error: str = "") -> None:
        with self._lock:
            for item in self._accounts:
                if item["id"] != account_id: continue
                item["last_used_at"] = _now_iso(); item["updated_at"] = _now_iso()
                if ok:
                    item["success"] = max(0, int(item.get("success") or 0)) + 1; item["restore_at"] = None
                else:
                    item["fail"] = max(0, int(item.get("fail") or 0)) + 1
                    item["last_error"] = str(error or "").strip()[:300] or None
                    item["last_invalid_at"] = _now_iso()
                    item["invalid_count"] = max(0, int(item.get("invalid_count") or 0)) + 1
                    lower = str(error or "").lower()
                    if any(t in lower for t in ("401", "expired", "invalid", "auth")):
                        item["status"] = "abnormal"; item["restore_at"] = None
                    elif any(t in lower for t in ("rate limit", "429", "too many")):
                        item["status"] = "rate_limited"
                        item["restore_at"] = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(timespec="seconds")
                    elif "credits" in lower or "402" in lower:
                        item["status"] = "rate_limited"
                        item["restore_at"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(timespec="seconds")
                self._save(); return

    def status(self) -> dict:
        accounts = self.list_accounts()
        with self._lock: self._restore_expired()
        usable = sum(1 for i in accounts if self._is_usable(i))
        return {"enabled": bool(accounts), "configured": bool(accounts), "ready": usable > 0,
                "error": "", "accounts": accounts, "total": len(accounts), "usable": usable}


grok_account_service = GrokAccountService()
