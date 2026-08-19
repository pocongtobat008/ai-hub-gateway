"""Grok provider — supports two auth methods:

1. xAI API Key (primary, recommended):
   - Base URL: https://api.x.ai/v1
   - OpenAI-compatible API
   - Free tier available at console.x.ai

2. Browser Cookies (fallback):
   - SSO cookie from grok.com
   - Requires cf_clearance (Cloudflare challenge) for POST endpoints
   - Less reliable due to anti-bot protection

Models:
  grok-3       — Grok-3 (latest)
  grok-3-mini  — Grok-3 Mini (fast)
  grok-3-fast  — Grok-3 Fast
  grok-2       — Grok-2
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import time
import uuid
from base64 import b64decode, b64encode
from typing import Any, Iterator

from services.grok_account_service import grok_account_service


# ── constants ──────────────────────────────────────────────────────

XAI_API_BASE = "https://api.x.ai/v1"
GROK_REST_BASE = "https://grok.com/rest"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

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


# ── xAI API Client (primary method) ──────────────────────────────


class XAIClient:
    """Client for xAI API (api.x.ai/v1) — OpenAI-compatible."""

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
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None

    def chat_stream(self, messages: list[dict], model: str) -> Iterator[str]:
        """Stream chat response from xAI API. Yields content strings."""
        session = self._get_session()
        url = f"{XAI_API_BASE}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        try:
            with session.stream("POST", url, json=payload) as response:
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices") or []
                            for choice in choices:
                                delta = choice.get("delta") or {}
                                content = delta.get("content")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue
                elif response.status_code == 401:
                    raise RuntimeError("xAI: invalid API key")
                elif response.status_code == 429:
                    raise RuntimeError("xAI: rate limit reached")
                else:
                    body = response.text[:500]
                    raise RuntimeError(f"xAI HTTP {response.status_code}: {body}")
        except Exception as exc:
            error = str(exc)
            if "401" in error or "invalid" in error.lower():
                raise RuntimeError(f"xAI authentication failed: {error}")
            if "429" in error or "rate" in error.lower():
                raise RuntimeError("xAI: rate limit reached")
            raise

    def test(self) -> dict[str, Any]:
        """Test if the API key is valid."""
        session = self._get_session()
        try:
            resp = session.get(f"{XAI_API_BASE}/models")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("id", "") for m in data.get("data", [])]
                return {"ok": True, "models": models}
            elif resp.status_code == 401:
                return {"ok": False, "error": "Invalid API key"}
            else:
                return {"ok": False, "error": f"xAI returned HTTP {resp.status_code}"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}


# ── Cookie Client (fallback method) ──────────────────────────────


class GrokCookieClient:
    """Client for Grok web API using browser cookies (fallback)."""

    _META_BASE64 = "n3ZIx7mlK0v5tXOOwnOW0kx919Tg8EB66MmUtAeyFyZjNZVZ3P+DYM+SHCIrOoxZ"
    _FINGERPRINT = "09100b5c28f5c28f5c0b5c28f5c28f5c0b5c28f5c28f5c0b5c28f5c28f5c00"
    _EPOCH_OFFSET = 0x644F6370

    def __init__(self, cookies: dict[str, str], proxy: str = "") -> None:
        self._cookies = cookies
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

    def _cookie_string(self) -> str:
        return "; ".join(f"{k}={v}" for k, v in sorted(self._cookies.items()))

    def _make_statsig_id(self, path: str, method: str = "POST") -> str:
        meta_bytes = b64decode(self._META_BASE64)
        relative_seconds = int(max(0, time.time() - self._EPOCH_OFFSET))
        message = f"{method}!{path}!{relative_seconds}obfiowerehiring{self._FINGERPRINT}"
        digest = hashlib.sha256(message.encode("utf-8")).digest()
        raw = bytearray()
        random_byte = os.urandom(1)[0]
        raw.append(random_byte)
        raw.extend(meta_bytes)
        raw.append(relative_seconds & 0xFF)
        raw.append((relative_seconds >> 8) & 0xFF)
        raw.append((relative_seconds >> 16) & 0xFF)
        raw.append((relative_seconds >> 24) & 0xFF)
        raw.extend(digest[:16])
        raw.append(3)
        for i in range(1, len(raw)):
            raw[i] ^= random_byte
        return b64encode(bytes(raw)).decode("ascii").rstrip("=")

    def _build_headers(self) -> dict[str, str]:
        return {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "origin": "https://grok.com",
            "referer": "https://grok.com/",
            "sec-ch-ua": '"Chromium";v="151", "Google Chrome";v="151", "Not)A)Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Linux"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": random.choice(USER_AGENTS),
        }

    def close(self) -> None:
        if self._session is not None:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None

    def chat_stream(self, message: str, model: str) -> Iterator[str]:
        """Stream chat response from Grok web API."""
        session = self._get_session()
        path = "/app-chat/conversations/new"
        url = f"{GROK_REST_BASE}{path}"
        headers = self._build_headers()
        headers["cookie"] = self._cookie_string()
        headers["x-xai-request-id"] = str(uuid.uuid4()).lower()
        headers["x-statsig-id"] = self._make_statsig_id(path, "POST")

        payload = {
            "temporary": False,
            "message": message,
            "model": model,
            "modeId": "default",
            "imageAttachments": [],
            "fileAttachments": [],
            "disableSearch": False,
            "enableImageGeneration": True,
            "returnImageBytes": False,
            "returnRawGrokInXaiRequest": False,
            "enableImageStreaming": True,
            "imageGenerationCount": 2,
            "forceConcise": False,
            "enableSideBySide": True,
            "sendFinalMetadata": True,
            "disableTextFollowUps": False,
            "responseMetadata": {},
            "disableMemory": False,
            "forceSideBySide": False,
            "isAsyncChat": False,
            "disableSelfHarmShortCircuit": False,
            "collectionIds": [],
            "disabledConnectorIds": [],
            "linkQuery": False,
            "deviceEnvInfo": {
                "darkModeEnabled": True,
                "devicePixelRatio": 2,
                "screenWidth": 1920,
                "screenHeight": 1080,
                "viewportWidth": 1920,
                "viewportHeight": 900,
            },
        }

        try:
            with session.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code == 200:
                    for line in response.iter_lines():
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                            token = obj.get("result", {}).get("response", {}).get("token")
                            if token:
                                yield token
                        except json.JSONDecodeError:
                            continue
                elif response.status_code == 401:
                    raise RuntimeError("Grok: authentication failed (cookie expired)")
                elif response.status_code == 403:
                    raise RuntimeError("Grok: access denied (403) — cookies may need cf_clearance")
                elif response.status_code == 429:
                    raise RuntimeError("Grok: rate limit reached")
                else:
                    body = response.text[:500]
                    raise RuntimeError(f"Grok HTTP {response.status_code}: {body}")
        except Exception as exc:
            error = str(exc)
            if "401" in error or "authentication" in error.lower():
                raise RuntimeError(f"Grok authentication failed: {error}")
            if "429" in error or "rate" in error.lower():
                raise RuntimeError("Grok: rate limit reached")
            if "403" in error:
                raise RuntimeError(f"Grok access denied: {error}")
            raise

    def test(self) -> dict[str, Any]:
        """Test if the cookies are valid."""
        session = self._get_session()
        try:
            path = "/user-settings"
            url = f"{GROK_REST_BASE}{path}"
            headers = self._build_headers()
            headers["cookie"] = self._cookie_string()
            resp = session.get(url, headers=headers)
            if resp.status_code == 200:
                return {"ok": True, "name": "Grok User"}
            elif resp.status_code == 401:
                return {"ok": False, "error": "Cookies expired or invalid"}
            else:
                return {"ok": False, "error": f"Grok returned HTTP {resp.status_code}"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}


# ── Provider ───────────────────────────────────────────────────────


class GrokProvider:
    """High-level provider: account pool + chat/chat_stream + models."""

    def __init__(self) -> None:
        self._clients: dict[str, Any] = {}

    def _client_for(self, account: dict) -> XAIClient | GrokCookieClient:
        account_id = str(account.get("id") or "")
        client = self._clients.get(account_id)

        # Check if proxy changed
        if client is not None and (getattr(client, "_proxy", "") or "") != str(account.get("proxy") or ""):
            client.close()
            client = None
            self._clients.pop(account_id, None)

        if client is None:
            # Prefer API key if available
            api_key = str(account.get("api_key") or "").strip()
            if api_key:
                client = XAIClient(api_key=api_key, proxy=str(account.get("proxy") or ""))
            else:
                cookies = account.get("cookies") or {}
                if isinstance(cookies, str):
                    cookies = dict(
                        part.split("=", 1)
                        for part in cookies.split(";")
                        if "=" in part
                    )
                client = GrokCookieClient(cookies=cookies, proxy=str(account.get("proxy") or ""))
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

    def test_account(self, api_key: str = "", cookies: dict[str, str] | None = None, proxy: str = "") -> dict[str, Any]:
        if api_key:
            client = XAIClient(api_key=api_key, proxy=proxy)
        elif cookies:
            client = GrokCookieClient(cookies=cookies, proxy=proxy)
        else:
            return {"ok": False, "error": "No API key or cookies provided"}
        try:
            return client.test()
        finally:
            client.close()

    # ── chat ──────────────────────────────────────────────────────

    def _chat_once_xai(self, client: XAIClient, message: str, model: str) -> Iterator[str]:
        messages = [{"role": "user", "content": message}]
        yield from client.chat_stream(messages, model)

    def _chat_once_cookie(self, client: GrokCookieClient, message: str, model: str) -> Iterator[str]:
        yield from client.chat_stream(message, model)

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

            client = self._client_for(account)
            try:
                if isinstance(client, XAIClient):
                    for token in self._chat_once_xai(client, message, model_name):
                        got_content = True
                        yield {"kind": "delta", "text": token}
                else:
                    for token in self._chat_once_cookie(client, message, model_name):
                        got_content = True
                        yield {"kind": "delta", "text": token}
            except RuntimeError as exc:
                last_error = exc
                error_lower = str(exc).lower()
                if any(tok in error_lower for tok in ("401", "expired", "invalid", "auth")):
                    grok_account_service.mark_used(account_key, ok=False, error=str(exc))
                    self._close_client(account_key)
                elif any(tok in error_lower for tok in ("rate limit", "429", "too many")):
                    grok_account_service.mark_used(account_key, ok=False, error=str(exc))
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
