from __future__ import annotations

import json
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.config import DATA_DIR

USAGE_FILE = DATA_DIR / "usage_log.json"
MAX_ENTRIES = 20000

_lock = threading.Lock()


def _load() -> list[dict[str, Any]]:
    try:
        data = json.loads(USAGE_FILE.read_text("utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(entries: list[dict[str, Any]]) -> None:
    tmp = USAGE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(entries[-MAX_ENTRIES:], ensure_ascii=False), "utf-8")
    tmp.replace(USAGE_FILE)


def record(model: str, provider: str, *, stream: bool = False, status: str = "ok", error: str = "") -> None:
    """Record one chat request. Called at dispatch time from the protocol layer."""
    entry = {
        "ts": int(time.time()),
        "model": str(model or "unknown"),
        "provider": str(provider or "gpt"),
        "stream": bool(stream),
        "status": status,
        "error": str(error or "")[:200],
    }
    with _lock:
        entries = _load()
        entries.append(entry)
        _save(entries)


def _day_key(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def summarize(days: int = 14) -> dict[str, Any]:
    """Aggregate usage for the last N days: daily series, per-model, per-provider."""
    with _lock:
        entries = _load()
    cutoff = time.time() - days * 86400
    recent = [e for e in entries if e.get("ts", 0) >= cutoff]

    daily: dict[str, dict[str, int]] = defaultdict(lambda: {"requests": 0, "errors": 0})
    by_model: dict[str, dict[str, Any]] = defaultdict(lambda: {"requests": 0, "errors": 0, "last_used": 0})
    by_provider: dict[str, dict[str, Any]] = defaultdict(lambda: {"requests": 0, "errors": 0, "last_used": 0})
    errors_recent: list[dict[str, Any]] = []

    for entry in entries:
        model = str(entry.get("model") or "unknown")
        provider = str(entry.get("provider") or "gpt")
        is_error = str(entry.get("status") or "ok") == "error"
        ts = int(entry.get("ts") or 0)
        by_model[model]["requests"] += 1
        if is_error:
            by_model[model]["errors"] += 1
        by_model[model]["last_used"] = max(by_model[model]["last_used"], ts)
        by_provider[provider]["requests"] += 1
        if is_error:
            by_provider[provider]["errors"] += 1
        by_provider[provider]["last_used"] = max(by_provider[provider]["last_used"], ts)

    for entry in recent:
        day = _day_key(int(entry.get("ts") or 0))
        daily[day]["requests"] += 1
        if str(entry.get("status") or "ok") == "error":
            daily[day]["errors"] += 1

    for entry in recent:
        if str(entry.get("status") or "ok") == "error":
            errors_recent.append(entry)

    errors_recent.sort(key=lambda e: e.get("ts", 0), reverse=True)
    total_requests = sum(v["requests"] for v in by_provider.values())
    total_errors = sum(v["errors"] for v in by_provider.values())

    return {
        "days": days,
        "total_requests": total_requests,
        "total_errors": total_errors,
        "daily": [{"date": d, **v} for d, v in sorted(daily.items())],
        "by_model": sorted(
            ({"model": m, **v} for m, v in by_model.items()),
            key=lambda item: item["requests"],
            reverse=True,
        ),
        "by_provider": sorted(
            ({"provider": p, **v} for p, v in by_provider.items()),
            key=lambda item: item["requests"],
            reverse=True,
        ),
        "recent_errors": errors_recent[:25],
    }
