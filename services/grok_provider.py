"""Grok web provider — cookie-based reverse proxy to grok.com.

Implements the Grok web protocol:
  - SSO cookie authentication
  - POST https://grok.com/rest/app-chat/conversations/new
  - Streaming JSON lines (result.response.token)
  - Round-robin account rotation with failover
  - Tool support: web search, image generation (Aurora)

Models:
  grok-3       — Grok-3 (latest)
  grok-3-mini  — Grok-3 Mini (fast)
  grok-3-fast  — Grok-3 Fast
  grok-2       — Grok-2
"""

from __future__ import annotations

import json
import random
import threading
import time
import uuid
from typing import Any, Iterator

from services.grok_account_service import grok_account_service


# ── constants ──────────────────────────────────────────────────────

GROK_CHAT_URL = "https://grok.com/rest/app-chat/conversations/new"
GROK_REST_BASE = "https://grok.com/rest"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
]

# OpenAI model id -> grok model name
MODEL_ALIASES: dict[str, str] = {
    "grok-3": "grok-3",
    "grok-3-latest": "grok-3",
    "grok-3-mini": "grok-3-mini",
    "grok-3-fast": "grok-3-fast",
    "grok-2": "grok-2",
    "grok-2-latest": "grok-2",
    "grok-latest": "grok-3",
}

ALL_GROK_MODELS = [
    {"id": "grok-3", "name": "Grok-3", "description": "Most capable model"},
    {"id": "grok-3-mini", "name": "Grok-3 Mini", "description": "Fast and efficient"},
    {"id": "grok-3-fast", "name": "Grok-3 Fast", "description": "Speed optimized"},
    {"id": "grok-2", "name": "Grok-2", "description": "Previous generation"},
]


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _random_ua() -> str:
    return random.choice(USER_AGENTS)


def is_grok_model(model: str | None) -> bool:
    normalized = str(model or "").strip().lower()
    if not normalized or normalized == "auto":
        return False
    if normalized == "grok":
        return True
    return normalized.startswith("grok-") and normalized in MODEL_ALIASES


def resolve_model_name(model: str | None) -> str:
    normalized = str(model or "").strip().lower()
    return MODEL_ALIASES.get(normalized, normalized)


# ── Grok HTTP client ──────────────────────────────────────────────


class GrokClient:
    """Raw HTTP client for the Grok web API using SSO cookies."""

    def __init__(self, sso: str, proxy: str = "") -> None:
        self._sso = sso
        self._proxy = proxy
        self._session = None

    def _get_session(self):
        if self._session is None:
            from curl_cffi import requests
            kwargs: dict[str, Any] = {
                "impersonate": "chrome131",
                "timeout": 120,
                "headers": self._build_headers(),
            }
            if self._proxy:
                kwargs["proxy"] = self._proxy
            self._session = requests.Session(**kwargs)
        return self._session

    def _build_headers(self) -> dict[str, str]:
        return {
            "authority": "grok.com",
            "accept": "*/*",
            "content-type": "application/json",
            "cookie": self._sso,
            "origin": "https://grok.com",
            "referer": "https://grok.com/?referrer=website",
            "user-agent": _random_ua(),
        }

    def close(self) -> None:
        if self._session is not None:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None

    def chat_stream(self, message: str, model: str) -> Iterator[str]:
        """Stream chat response from Grok. Yields token strings."""
        session = self._get_session()
        data = {"message": message, "modelName": model}

        try:
            with session.stream(
                "POST",
                GROK_CHAT_URL,
                headers=self._build_headers(),
                json=data,
            ) as response:
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                            token = (
                                obj.get("result", {})
                                .get("response", {})
                                .get("token")
                            )
                            if token:
                                yield token
                        except json.JSONDecodeError:
                            continue
                elif response.status_code == 401:
                    raise RuntimeError("Grok: SSO cookie expired or invalid")
                elif response.status_code == 429:
                    raise RuntimeError("Grok: rate limit reached")
                else:
                    body = response.text[:500]
                    raise RuntimeError(f"Grok HTTP {response.status_code}: {body}")
        except Exception as exc:
            error = str(exc)
            if "SSO" in error or "401" in error:
                raise RuntimeError(f"Grok authentication failed: {error}")
            if "429" in error or "rate" in error.lower():
                raise RuntimeError("Grok: rate limit reached")
            raise

    def test(self) -> dict[str, Any]:
        """Test if the SSO cookie is valid."""
        session = self._get_session()
        try:
            resp = session.get(
                "https://grok.com/rest/user/info",
                headers=self._build_headers(),
            )
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    name = data.get("name") or data.get("displayName") or "Grok User"
                    return {"ok": True, "name": name}
                except Exception:
                    return {"ok": True, "name": "Grok User"}
            elif resp.status_code == 401:
                return {"ok": False, "error": "SSO cookie expired or invalid"}
            else:
                return {"ok": False, "error": f"Grok returned HTTP {resp.status_code}"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}


# ── Provider ───────────────────────────────────────────────────────


class GrokProvider:
    """High-level provider: account pool + chat/chat_stream + models."""

    def __init__(self) -> None:
        self._clients: dict[str, GrokClient] = {}

    def _client_for(self, account: dict) -> GrokClient:
        account_id = str(account.get("id") or "")
        client = self._clients.get(account_id)
        if client is not None and (client._proxy or "") != str(account.get("proxy") or ""):
            client.close()
            client = None
            self._clients.pop(account_id, None)
        if client is None:
            client = GrokClient(
                sso=str(account.get("sso") or ""),
                proxy=str(account.get("proxy") or ""),
            )
            self._clients[account_id] = client
        return client

    def _close_client(self, account_id: str) -> None:
        client = self._clients.pop(account_id, None)
        if client is not None:
            client.close()

    def is_configured(self) -> bool:
        return bool(grok_account_service.list_accounts())

    def is_enabled(self) -> bool:
        return self.is_configured()

    def status(self) -> dict[str, Any]:
        return grok_account_service.status()

    def _pick_account(self, prefer_id: str | None = None) -> dict | None:
        picked = grok_account_service.pick_account(prefer_id=prefer_id)
        if picked is None:
            return None
        creds = grok_account_service.get_credentials(str(picked.get("id") or ""))
        if creds is None:
            return None
        return {**picked, **creds}

    # ── test ──────────────────────────────────────────────────────

    def test_account(self, sso: str, proxy: str = "") -> dict[str, Any]:
        client = GrokClient(sso=sso, proxy=proxy)
        try:
            return client.test()
        finally:
            client.close()

    # ── chat ──────────────────────────────────────────────────────

    def _chat_once(
        self, account: dict, message: str, model: str
    ) -> Iterator[str]:
        account_id = str(account.get("id") or "")
        client = self._client_for(account)
        try:
            yield from client.chat_stream(message, model)
        except RuntimeError as exc:
            error = str(exc)
            lower = error.lower()
            if any(tok in lower for tok in ("401", "expired", "invalid", "auth")):
                grok_account_service.mark_used(account_id, ok=False, error=error)
                self._close_client(account_id)
            elif any(tok in lower for tok in ("rate limit", "429", "too many")):
                grok_account_service.mark_used(account_id, ok=False, error=error)
            raise

    def chat_stream(
        self,
        message: str,
        model: str,
        account_id: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Stream chat response with automatic failover across accounts."""
        model_name = resolve_model_name(model)
        last_error: Exception | None = None
        tried: set[str] = set()
        got_content = False

        total_accounts = len(grok_account_service.list_accounts()) or 1
        for _ in range(total_accounts):
            account = self._pick_account(prefer_id=account_id)
            if account is None:
                break
            account_key = str(account.get("id") or "")
            if account_key in tried:
                continue
            tried.add(account_key)
            if account_id and account_key != account_id:
                raise RuntimeError("Requested Grok account is not available")
            try:
                for token in self._chat_once(account, message, model_name):
                    got_content = True
                    yield {"kind": "delta", "text": token}
            except RuntimeError as exc:
                last_error = exc
                continue

            if not got_content:
                last_error = RuntimeError("Grok returned an empty response")
                grok_account_service.mark_used(account_key, ok=False, error=str(last_error))
                continue

            grok_account_service.mark_used(account_key, ok=True)
            yield {"kind": "done", "finish_reason": "stop"}
            return

        if last_error is not None:
            raise RuntimeError(f"All Grok accounts failed: {last_error}")
        raise RuntimeError("No available Grok account")

    def chat(
        self,
        message: str,
        model: str,
        account_id: str | None = None,
    ) -> dict[str, Any]:
        """Non-streaming chat (collect all deltas)."""
        text: list[str] = []
        for item in self.chat_stream(message, model, account_id=account_id):
            kind = item.get("kind")
            if kind == "delta":
                text.append(str(item.get("text") or ""))
        return {"text": "".join(text), "finish_reason": "stop"}

    # ── models ────────────────────────────────────────────────────

    def list_models(self) -> list[dict[str, Any]]:
        return [
            {
                "id": m["id"],
                "object": "model",
                "created": int(time.time()),
                "owned_by": "xai",
            }
            for m in ALL_GROK_MODELS
        ]


grok_provider = GrokProvider()
