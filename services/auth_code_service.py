"""Auth code service — generate shareable auth codes like ChatGPT/Gemini."""
from __future__ import annotations

import hashlib
import secrets
import time
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path("/app/data") if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CODES_FILE = DATA_DIR / "auth_codes.json"

_lock = threading.Lock()


def _load() -> list[dict[str, Any]]:
    if CODES_FILE.exists():
        try:
            import json
            data = json.loads(CODES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save(codes: list[dict[str, Any]]) -> None:
    import json
    CODES_FILE.write_text(
        json.dumps(codes, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_code(
    role: str = "user",
    name: str = "",
    max_uses: int = 0,
    expires_in_hours: int = 0,
) -> dict[str, Any]:
    """Generate a new auth code.
    
    Args:
        role: "admin" or "user"
        name: optional label for the code
        max_uses: 0 = unlimited, N = max N uses
        expires_in_hours: 0 = never, N = expires in N hours
    
    Returns:
        Dict with code info including the raw code (shown once)
    """
    with _lock:
        codes = _load()
        
        # Generate a memorable code: BECOME-XXXX-XXXX
        prefix = "BECOME"
        part1 = secrets.token_hex(2).upper()
        part2 = secrets.token_hex(2).upper()
        raw_code = f"{prefix}-{part1}-{part2}"
        
        code_hash = _hash_code(raw_code)
        
        now = _now_iso()
        expires_at = None
        if expires_in_hours > 0:
            from datetime import timedelta
            exp_dt = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
            expires_at = exp_dt.isoformat()
        
        code_entry = {
            "id": uuid.uuid4().hex[:12],
            "code_hash": code_hash,
            "role": role,
            "name": name or f"{role.title()} Code",
            "max_uses": max_uses,
            "use_count": 0,
            "expires_at": expires_at,
            "enabled": True,
            "created_at": now,
            "last_used_at": None,
            "last_used_by": None,
        }
        codes.append(code_entry)
        _save(codes)
        
        return {
            "id": code_entry["id"],
            "code": raw_code,  # Only shown once!
            "role": role,
            "name": code_entry["name"],
            "max_uses": max_uses,
            "expires_at": expires_at,
            "created_at": now,
        }


def list_codes() -> list[dict[str, Any]]:
    """List all auth codes (without exposing raw codes)."""
    with _lock:
        codes = _load()
        result = []
        for c in codes:
            result.append({
                "id": c.get("id", ""),
                "role": c.get("role", "user"),
                "name": c.get("name", ""),
                "max_uses": c.get("max_uses", 0),
                "use_count": c.get("use_count", 0),
                "expires_at": c.get("expires_at"),
                "enabled": c.get("enabled", True),
                "created_at": c.get("created_at", ""),
                "last_used_at": c.get("last_used_at"),
                "last_used_by": c.get("last_used_by"),
                "is_expired": _is_expired(c),
                "is_depleted": _is_depleted(c),
            })
        return result


def _is_expired(code: dict) -> bool:
    exp = code.get("expires_at")
    if not exp:
        return False
    try:
        exp_dt = datetime.fromisoformat(exp)
        return datetime.now(timezone.utc) > exp_dt
    except Exception:
        return False


def _is_depleted(code: dict) -> bool:
    max_uses = code.get("max_uses", 0)
    if max_uses <= 0:
        return False
    return code.get("use_count", 0) >= max_uses


def authenticate(raw_code: str) -> dict[str, Any] | None:
    """Authenticate using an auth code. Returns identity dict or None."""
    candidate = str(raw_code or "").strip()
    if not candidate:
        return None
    
    candidate_hash = _hash_code(candidate)
    
    with _lock:
        codes = _load()
        for i, code in enumerate(codes):
            if not code.get("enabled", True):
                continue
            stored_hash = code.get("code_hash", "")
            if not stored_hash or stored_hash != candidate_hash:
                continue
            
            # Check expiration
            if _is_expired(code):
                continue
            
            # Check usage limit
            if _is_depleted(code):
                continue
            
            # Valid! Update usage
            codes[i]["use_count"] = code.get("use_count", 0) + 1
            codes[i]["last_used_at"] = _now_iso()
            _save(codes)
            
            return {
                "id": f"code-{code.get('id', '')}",
                "name": code.get("name", "Auth Code User"),
                "role": code.get("role", "user"),
            }
    
    return None


def delete_code(code_id: str) -> bool:
    with _lock:
        codes = _load()
        new_codes = [c for c in codes if c.get("id") != code_id]
        if len(new_codes) < len(codes):
            _save(new_codes)
            return True
        return False


def toggle_code(code_id: str, enabled: bool) -> bool:
    with _lock:
        codes = _load()
        for code in codes:
            if code.get("id") == code_id:
                code["enabled"] = enabled
                _save(codes)
                return True
        return False


def reset_code(code_id: str) -> bool:
    with _lock:
        codes = _load()
        for code in codes:
            if code.get("id") == code_id:
                code["use_count"] = 0
                code["last_used_at"] = None
                _save(codes)
                return True
        return False


def get_stats() -> dict[str, Any]:
    with _lock:
        codes = _load()
        total = len(codes)
        active = sum(1 for c in codes if c.get("enabled", True) and not _is_expired(c) and not _is_depleted(c))
        expired = sum(1 for c in codes if _is_expired(c))
        depleted = sum(1 for c in codes if _is_depleted(c))
        total_uses = sum(c.get("use_count", 0) for c in codes)
        return {
            "total": total,
            "active": active,
            "expired": expired,
            "depleted": depleted,
            "total_uses": total_uses,
        }
