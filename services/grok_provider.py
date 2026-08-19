"""Grok provider — supports 3 auth methods:

1. xAI API Key (recommended): api.x.ai/v1
2. Grok CLI OAuth (from vansrouter): cli-chat-proxy.grok.com/v1
   - Uses refresh_token → access_token flow via auth.x.ai
   - Auto-refreshes expired tokens
3. Grok Web Cookies (fallback): grok.com/rest

Based on vansrouter's grok-cli and grok-web executors.
"""

from __future__ import annotations

import base64
import json
import os
import random
import time
import uuid
from typing import Any, Iterator

from services.grok_account_service import grok_account_service


# ── constants ──────────────────────────────────────────────────────

XAI_API_BASE = "https://api.x.ai/v1"
GROK_CLI_BASE = "https://cli-chat-proxy.grok.com/v1"
GROK_CLI_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
GROK_CLI_VERSION = "0.2.99"
GROK_CLI_USER_AGENT = f"grok-shell/{GROK_CLI_VERSION} (linux; x86_64)"

GROK_WEB_BASE = "https://grok.com/rest"

MODEL_ALIASES: dict[str, str] = {
    "grok-3": "grok-3",
    "grok-3-latest": "grok-3",
    "grok-3-mini": "grok-3-mini",
    "grok-3-thinking": "grok-3-thinking",
    "grok-3-fast": "grok-3-fast",
    "grok-4": "grok-4",
    "grok-4-mini": "grok-4-mini",
    "grok-4-thinking": "grok-4-thinking",
    "grok-4-heavy": "grok-4-heavy",
    "grok-4.1-mini": "grok-4.1-mini",
    "grok-4.1-fast": "grok-4.1-fast",
    "grok-4.1-expert": "grok-4.1-expert",
    "grok-4.1-thinking": "grok-4.1-thinking",
    "grok-4.2": "grok-4.2",
    "grok-4.20": "grok-4.20",
    "grok-2": "grok-2",
    "grok-2-latest": "grok-2",
    "grok-latest": "grok-3",
    "grok-build": "grok-build",
}

ALL_GROK_MODELS = [
    {"id": "grok-3", "name": "Grok 3"},
    {"id": "grok-3-mini", "name": "Grok 3 Mini (Thinking)"},
    {"id": "grok-3-thinking", "name": "Grok 3 Thinking"},
    {"id": "grok-4", "name": "Grok 4"},
    {"id": "grok-4-mini", "name": "Grok 4 Mini (Thinking)"},
    {"id": "grok-4-thinking", "name": "Grok 4 Thinking"},
    {"id": "grok-4-heavy", "name": "Grok 4 Heavy (SuperGrok)"},
    {"id": "grok-4.1-mini", "name": "Grok 4.1 Mini (Thinking)"},
    {"id": "grok-4.1-fast", "name": "Grok 4.1 Fast"},
    {"id": "grok-4.1-expert", "name": "Grok 4.1 Expert"},
    {"id": "grok-4.1-thinking", "name": "Grok 4.1 Thinking"},
    {"id": "grok-4.2", "name": "Grok 4.2 (4.20 Beta)"},
    {"id": "grok-build", "name": "Grok Build (CLI)"},
]


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


# ── xAI API Client ────────────────────────────────────────────────


class XAIClient:
    def __init__(self, api_key: str, proxy: str = "") -> None:
        self._api_key = api_key
        self._proxy = proxy
        self._session = None

    def _get_session(self):
        if self._session is None:
            from curl_cffi import requests
            kwargs: dict[str, Any] = {
                "impersonate": "chrome131",
                "timeout": 120,
                "headers": {
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
            }
            if self._proxy:
                kwargs["proxy"] = self._proxy
            self._session = requests.Session(**kwargs)
        return self._session

    def close(self) -> None:
        if self._session is not None:
            try: self._session.close()
            except: pass
            self._session = None

    def chat_stream(self, messages: list[dict], model: str) -> Iterator[str]:
        session = self._get_session()
        with session.stream("POST", f"{XAI_API_BASE}/chat/completions",
            json={"model": model, "messages": messages, "stream": True}) as response:
            if response.status_code == 200:
                for line in response.iter_lines():
                    if not line or not line.startswith("data: "): continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]": return
                    try:
                        for choice in json.loads(data_str).get("choices") or []:
                            content = (choice.get("delta") or {}).get("content")
                            if content: yield content
                    except: continue
            elif response.status_code == 401:
                raise RuntimeError("xAI: invalid API key")
            elif response.status_code == 429:
                raise RuntimeError("xAI: rate limit reached")
            else:
                raise RuntimeError(f"xAI HTTP {response.status_code}: {response.text[:300]}")

    def test(self) -> dict[str, Any]:
        session = self._get_session()
        try:
            resp = session.get(f"{XAI_API_BASE}/models")
            if resp.status_code == 200:
                models = [m.get("id","") for m in resp.json().get("data",[])]
                return {"ok": True, "models": models}
            return {"ok": False, "error": f"xAI HTTP {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}


# ── Grok CLI Client (OAuth token refresh) ─────────────────────────


class GrokCLIClient:
    """Client for Grok CLI (cli-chat-proxy.grok.com) using OAuth tokens."""

    def __init__(self, access_token: str, refresh_token: str, proxy: str = "") -> None:
        self._access_token = access_token
        self._refresh_token = refresh_token
        self._proxy = proxy
        self._session = None

    def _get_session(self):
        if self._session is None:
            from curl_cffi import requests
            kwargs: dict[str, Any] = {
                "impersonate": "chrome131",
                "timeout": 120,
                "headers": {
                    "Authorization": f"Bearer {self._access_token}",
                    "Content-Type": "application/json",
                    "User-Agent": GROK_CLI_USER_AGENT,
                    "x-grok-client-identifier": "grok-shell",
                    "x-grok-client-version": GROK_CLI_VERSION,
                },
            }
            if self._proxy:
                kwargs["proxy"] = self._proxy
            self._session = requests.Session(**kwargs)
        return self._session

    def _refresh_access_token(self) -> str:
        """Refresh the access token using the refresh token."""
        from curl_cffi import requests
        resp = requests.post(
            "https://auth.x.ai/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": self._refresh_token,
                "client_id": GROK_CLI_CLIENT_ID,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Token refresh failed: HTTP {resp.status_code}")
        data = resp.json()
        new_access = data.get("access_token", "")
        new_refresh = data.get("refresh_token", "")
        if not new_access:
            raise RuntimeError(f"Token refresh failed: {data.get('error', 'no access_token')}")
        self._access_token = new_access
        if new_refresh:
            self._refresh_token = new_refresh
        # Update session headers
        if self._session:
            self._session.headers["Authorization"] = f"Bearer {new_access}"
        return new_access

    def close(self) -> None:
        if self._session is not None:
            try: self._session.close()
            except: pass
            self._session = None

    def get_tokens(self) -> tuple[str, str]:
        return self._access_token, self._refresh_token

    def chat_stream(self, messages: list[dict], model: str) -> Iterator[str]:
        session = self._get_session()
        payload = {"model": model, "messages": messages, "stream": True}
        try:
            with session.stream("POST", f"{GROK_CLI_BASE}/chat/completions", json=payload) as response:
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if not line or not line.startswith("data: "): continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]": return
                        try:
                            for choice in json.loads(data_str).get("choices") or []:
                                content = (choice.get("delta") or {}).get("content")
                                if content: yield content
                        except: continue
                elif response.status_code == 401:
                    # Token expired — try refresh
                    try:
                        self._refresh_access_token()
                        # Retry with new token
                        with self._get_session().stream("POST", f"{GROK_CLI_BASE}/chat/completions", json=payload) as retry:
                            if retry.status_code == 200:
                                for line in retry.iter_lines():
                                    if not line or not line.startswith("data: "): continue
                                    data_str = line[6:].strip()
                                    if data_str == "[DONE]": return
                                    try:
                                        for choice in json.loads(data_str).get("choices") or []:
                                            content = (choice.get("delta") or {}).get("content")
                                            if content: yield content
                                    except: continue
                            else:
                                raise RuntimeError(f"Grok CLI auth failed after refresh: HTTP {retry.status_code}")
                    except RuntimeError:
                        raise
                    except Exception as e:
                        raise RuntimeError(f"Grok CLI refresh failed: {e}")
                elif response.status_code == 402:
                    raise RuntimeError("Grok CLI: out of credits")
                else:
                    raise RuntimeError(f"Grok CLI HTTP {response.status_code}")
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Grok CLI error: {e}")

    def test(self) -> dict[str, Any]:
        session = self._get_session()
        try:
            resp = session.get(f"{GROK_CLI_BASE}/models")
            if resp.status_code == 200:
                return {"ok": True}
            elif resp.status_code == 401:
                try:
                    self._refresh_access_token()
                    return {"ok": True, "refreshed": True}
                except:
                    return {"ok": False, "error": "Token expired and refresh failed"}
            else:
                return {"ok": False, "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}


# ── Provider ───────────────────────────────────────────────────────


class GrokProvider:
    def __init__(self) -> None:
        self._clients: dict[str, Any] = {}

    def _client_for(self, account: dict) -> XAIClient | GrokCLIClient:
        account_id = str(account.get("id") or "")
        client = self._clients.get(account_id)
        if client is not None and (getattr(client, "_proxy", "") or "") != str(account.get("proxy") or ""):
            client.close()
            client = None
            self._clients.pop(account_id, None)
        if client is None:
            api_key = str(account.get("api_key") or "").strip()
            access_token = str(account.get("access_token") or "").strip()
            refresh_token = str(account.get("refresh_token") or "").strip()
            if api_key:
                client = XAIClient(api_key=api_key, proxy=str(account.get("proxy") or ""))
            elif access_token and refresh_token:
                client = GrokCLIClient(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    proxy=str(account.get("proxy") or ""),
                )
            else:
                raise RuntimeError("Account has no API key or OAuth tokens")
            self._clients[account_id] = client
        return client

    def _close_client(self, account_id: str) -> None:
        client = self._clients.pop(account_id, None)
        if client: client.close()

    def is_configured(self) -> bool:
        return bool(grok_account_service.list_accounts())

    def is_enabled(self) -> bool:
        return self.is_configured()

    def status(self) -> dict[str, Any]:
        return grok_account_service.status()

    def _pick_account(self, prefer_id: str | None = None) -> dict | None:
        picked = grok_account_service.pick_account(prefer_id=prefer_id)
        if not picked: return None
        creds = grok_account_service.get_credentials(str(picked.get("id") or ""))
        if not creds: return None
        return {**picked, **creds}

    def test_account(self, **kwargs) -> dict[str, Any]:
        api_key = kwargs.get("api_key", "")
        access_token = kwargs.get("access_token", "")
        refresh_token = kwargs.get("refresh_token", "")
        proxy = kwargs.get("proxy", "")
        if api_key:
            return XAIClient(api_key=api_key, proxy=proxy).test()
        elif access_token and refresh_token:
            return GrokCLIClient(access_token=access_token, refresh_token=refresh_token, proxy=proxy).test()
        return {"ok": False, "error": "No credentials provided"}

    def chat_stream(self, message: str, model: str, account_id: str | None = None) -> Iterator[dict[str, Any]]:
        model_name = resolve_model_name(model)
        last_error: Exception | None = None
        tried: set[str] = set()
        got_content = False

        total_accounts = len(grok_account_service.list_accounts()) or 1
        for _ in range(total_accounts):
            account = self._pick_account(prefer_id=account_id)
            if not account: break
            account_key = str(account.get("id") or "")
            if account_key in tried: continue
            tried.add(account_key)

            client = self._client_for(account)
            try:
                messages = [{"role": "user", "content": message}]
                for token in client.chat_stream(messages, model_name):
                    got_content = True
                    yield {"kind": "delta", "text": token}
                # Save refreshed tokens if client was refreshed
                if isinstance(client, GrokCLIClient):
                    new_access, new_refresh = client.get_tokens()
                    grok_account_service.update_account(account_key, {
                        "access_token": new_access,
                        "refresh_token": new_refresh,
                    })
            except RuntimeError as exc:
                last_error = exc
                error_lower = str(exc).lower()
                if any(t in error_lower for t in ("401", "expired", "invalid", "auth")):
                    grok_account_service.mark_used(account_key, ok=False, error=str(exc))
                    self._close_client(account_key)
                elif any(t in error_lower for t in ("rate limit", "429", "too many")):
                    grok_account_service.mark_used(account_key, ok=False, error=str(exc))
                elif "credits" in error_lower or "402" in error_lower:
                    grok_account_service.mark_used(account_key, ok=False, error=str(exc))
                continue

            if not got_content:
                last_error = RuntimeError("Grok returned empty response")
                grok_account_service.mark_used(account_key, ok=False, error=str(last_error))
                continue

            grok_account_service.mark_used(account_key, ok=True)
            yield {"kind": "done", "finish_reason": "stop"}
            return

        if last_error: raise RuntimeError(f"All Grok accounts failed: {last_error}")
        raise RuntimeError("No available Grok account")

    def chat(self, message: str, model: str, account_id: str | None = None) -> dict[str, Any]:
        text: list[str] = []
        for item in self.chat_stream(message, model, account_id=account_id):
            if item.get("kind") == "delta": text.append(str(item.get("text") or ""))
        return {"text": "".join(text), "finish_reason": "stop"}

    def list_models(self) -> list[dict[str, Any]]:
        return [{"id": m["id"], "object": "model", "created": int(time.time()), "owned_by": "xai"} for m in ALL_GROK_MODELS]


grok_provider = GrokProvider()
