from __future__ import annotations

import asyncio
import base64
import io
import os
import queue
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Any, AsyncIterator, Iterator
from uuid import uuid4

from services.config import config, DATA_DIR

# The gemini_webapi package persists rotated __Secure-1PSIDTS per account in this
# directory (one file per Secure-1PSID) so cookies survive container restarts.
os.environ.setdefault("GEMINI_COOKIE_PATH", str(DATA_DIR / "gemini_cookies"))

from gemini_webapi import GeminiClient  # noqa: E402

from services.gemini_account_service import gemini_account_service  # noqa: E402

MEDIA_DIR = DATA_DIR / "gemini_media"

IMAGE_MODEL_PREFIXES = ("gemini", "nano-banana", "models/gemini")

# Known Gemini model families. Each entry declares which capabilities the model
# supports so the UI can group and label them (chat / image / canvas / video /
# audio / research). `tier` marks the minimum plan that usually unlocks it.
GEMINI_MODEL_CATALOG: list[dict[str, Any]] = [
    {"id": "gemini-3-flash", "display_name": "Gemini 3 Flash", "capabilities": ["chat", "image", "canvas", "video", "audio", "research"], "tier": "free"},
    {"id": "gemini-3-pro", "display_name": "Gemini 3 Pro", "capabilities": ["chat", "image", "canvas", "video", "audio", "research"], "tier": "free"},
    {"id": "gemini-3-flash-thinking", "display_name": "Gemini 3 Flash Thinking", "capabilities": ["chat", "research"], "tier": "free"},
    {"id": "gemini-3-flash-plus", "display_name": "Gemini 3 Flash Plus", "capabilities": ["chat", "image", "canvas", "video", "audio", "research"], "tier": "plus"},
    {"id": "gemini-3-pro-plus", "display_name": "Gemini 3 Pro Plus", "capabilities": ["chat", "image", "canvas", "video", "audio", "research"], "tier": "plus"},
    {"id": "gemini-3-flash-advanced", "display_name": "Gemini 3 Flash Advanced", "capabilities": ["chat", "image", "canvas", "video", "audio", "research"], "tier": "advanced"},
    {"id": "gemini-3-pro-advanced", "display_name": "Gemini 3 Pro Advanced", "capabilities": ["chat", "image", "canvas", "video", "audio", "research"], "tier": "advanced"},
    {"id": "nano-banana", "display_name": "Nano Banana (Canvas)", "capabilities": ["image", "canvas"], "tier": "advanced"},
    {"id": "gemini-image", "display_name": "Gemini Image", "capabilities": ["image"], "tier": "free"},
    {"id": "veo-3.1", "display_name": "Veo 3.1", "capabilities": ["video"], "tier": "advanced"},
    {"id": "veo-3", "display_name": "Veo 3", "capabilities": ["video"], "tier": "advanced"},
    {"id": "veo-2", "display_name": "Veo 2", "capabilities": ["video"], "tier": "advanced"},
]

VIDEO_MODEL_IDS = {"veo-3.1", "veo-3", "veo-2", "veo"}


def is_gemini_video_model(model: str | None) -> bool:
    normalized = str(model or "").strip().lower()
    return normalized in VIDEO_MODEL_IDS or ("veo" in normalized and "gemini" in normalized)


def _capabilities_for(model_id: str) -> list[str]:
    normalized = str(model_id or "").strip().lower()
    for item in GEMINI_MODEL_CATALOG:
        if str(item.get("id") or "").lower() == normalized:
            return list(item.get("capabilities") or [])
    capabilities = ["chat"]
    if "image" in normalized or "banana" in normalized:
        capabilities.append("image")
        capabilities.append("canvas")
    if "veo" in normalized or "video" in normalized:
        capabilities.append("video")
    if "thinking" in normalized:
        capabilities.append("research")
    return capabilities

_CONFIG_ACCOUNT_ID = "config"


def parse_cookie_string(value: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for segment in str(value or "").split(";"):
        segment = segment.strip()
        if not segment or "=" not in segment:
            continue
        key, _, val = segment.partition("=")
        key = key.strip()
        val = val.strip()
        if key:
            cookies[key] = val
    return cookies


def is_gemini_model(model: str | None) -> bool:
    normalized = str(model or "").strip().lower()
    if not normalized or normalized == "auto":
        return False
    if "deep-research" in normalized or "deep_research" in normalized:
        return True
    return normalized.startswith(IMAGE_MODEL_PREFIXES)


def is_gemini_image_model(model: str | None) -> bool:
    normalized = str(model or "").strip().lower()
    if not normalized or not is_gemini_model(normalized):
        return False
    return "image" in normalized or "nano-banana" in normalized


def build_gemini_prompt(messages: list[dict[str, Any]]) -> tuple[str, list[bytes]]:
    """Convert OpenAI-style messages into a single Gemini prompt + attached file bytes."""
    files: list[bytes] = []
    transcript_parts: list[str] = []

    def text_of(part: Any) -> str:
        if isinstance(part, str):
            return part
        if isinstance(part, dict) and part.get("type") == "text":
            return str(part.get("text") or "")
        return ""

    def image_of(part: Any) -> bytes | None:
        if not isinstance(part, dict) or part.get("type") != "image_url":
            return None
        image_url = part.get("image_url")
        if isinstance(image_url, str):
            url = image_url
        elif isinstance(image_url, dict):
            url = str(image_url.get("url") or "")
        else:
            url = ""
        return url_to_bytes(url)

    for message in messages:
        role = str(message.get("role") or "user")
        content = message.get("content")
        if role == "system":
            text = content if isinstance(content, str) else text_of(content)
            if text.strip():
                transcript_parts.append(f"System instruction: {text.strip()}")
            continue
        if isinstance(content, str):
            transcript_parts.append(f"{role}: {content}")
            continue
        if isinstance(content, list):
            text_parts = [text_of(part) for part in content]
            text = " ".join(part for part in text_parts if part.strip()).strip()
            for part in content:
                image_bytes = image_of(part)
                if image_bytes is not None and len(files) < 8:
                    files.append(image_bytes)
            if text:
                transcript_parts.append(f"{role}: {text}")
    prompt = "\n\n".join(part for part in transcript_parts if part.strip())
    return prompt, files


def url_to_bytes(url: str) -> bytes | None:
    url = str(url or "").strip()
    if not url:
        return None
    if url.startswith("data:"):
        try:
            header, _, payload = url.partition(",")
            if "base64" in header:
                return base64.b64decode(payload)
            return payload.encode("utf-8")
        except Exception:
            return None
    if url.startswith("http://") or url.startswith("https://"):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.read()
        except Exception:
            return None
    return None


def _file_inputs(files: list[bytes] | None) -> list[Any] | None:
    if not files:
        return None
    return [io.BytesIO(item) for item in files]


class GeminiProvider:
    """Gemini web provider backed by a Google account pool.

    Each Google account (cookies) gets its own GeminiClient on the shared
    background loop. Requests pick a healthy account with round-robin and
    automatic failover; failures update the account health state so unhealthy
    accounts are skipped until they recover.
    """

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread: threading.Thread | None = None
        self._clients: dict[str, GeminiClient] = {}
        self._lock = threading.Lock()
        self._signature = ""
        self._error: str | None = None
        self._models: dict[str, list[dict[str, Any]]] = {}

    # ── loop + account/client lifecycle ────────────────────────────

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        if self._loop is not None and self._loop.is_running():
            return self._loop
        loop = asyncio.new_event_loop()
        thread = threading.Thread(target=loop.run_forever, name="gemini-loop", daemon=True)
        thread.start()
        self._loop = loop
        self._loop_thread = thread
        return loop

    def _call(self, coro: Any) -> Any:
        loop = self._ensure_loop()
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result()

    def settings(self) -> dict[str, object]:
        return config.get_gemini_settings()

    # ── account source ─────────────────────────────────────────────

    def _accounts(self) -> list[dict[str, Any]]:
        """Pool accounts; falls back to the legacy config cookie when the pool is empty."""
        accounts = gemini_account_service.list_accounts()
        if accounts:
            return accounts
        settings = self.settings()
        cookies = settings.get("cookies") if isinstance(settings.get("cookies"), dict) else {}
        if not str(cookies.get("secure_1psid") or "").strip():
            return []
        return [{
            "id": _CONFIG_ACCOUNT_ID,
            "email": None,
            "label": "config",
            "cookies": {
                "secure_1psid": str(cookies.get("secure_1psid") or "").strip(),
                "secure_1psidts": str(cookies.get("secure_1psidts") or "").strip(),
                "extra": str(cookies.get("extra") or "").strip(),
            },
            "proxy": str(settings.get("proxy") or "").strip(),
            "plan_type": "free",
            "status": "normal",
        }]

    def is_configured(self) -> bool:
        return bool(self._accounts())

    def is_enabled(self) -> bool:
        return bool(self.settings().get("enabled")) and self.is_configured()

    def _signature_of(self) -> str:
        accounts = self._accounts()
        return "|".join([
            str(account.get("id") or "") + ":" + str(account.get("updated_at") or "") + ":" + str(account.get("status") or "")
            for account in accounts
        ])

    def _prune_cache_if_changed(self) -> None:
        signature = self._signature_of()
        if signature == self._signature:
            return
        self._signature = signature
        for account_id in list(self._clients.keys()):
            if account_id not in {str(account.get("id") or "") for account in self._accounts()}:
                client = self._clients.pop(account_id, None)
                if client is not None:
                    try:
                        self._call(client.close())
                    except Exception:
                        pass
                self._models.pop(account_id, None)

    def _pick_account(self, prefer_id: str | None = None) -> dict[str, Any] | None:
        """Round-robin over the pool's usable accounts; honours an explicit preference."""
        accounts = self._accounts()
        if not accounts:
            return None
        if prefer_id:
            for account in accounts:
                if str(account.get("id") or "") == prefer_id and account.get("status") == "normal":
                    return account
            for account in accounts:
                if str(account.get("id") or "") == prefer_id:
                    return account
        return gemini_account_service.pick_account() or accounts[0]

    async def _init_client(self, account: dict[str, Any]) -> GeminiClient:
        account_id = str(account.get("id") or "")
        existing = self._clients.get(account_id)
        if existing is not None:
            return existing
        async with asyncio.Lock():
            existing = self._clients.get(account_id)
            if existing is not None:
                return existing
            cookies = account.get("cookies") if isinstance(account.get("cookies"), dict) else {}
            secure_1psid = str(cookies.get("secure_1psid") or "").strip()
            secure_1psidts = str(cookies.get("secure_1psidts") or "").strip() or None
            extra = str(cookies.get("extra") or "").strip()
            proxy = str(account.get("proxy") or "").strip() or None
            client = GeminiClient(secure_1psid, secure_1psidts, proxy=proxy)
            if extra:
                parsed = parse_cookie_string(extra)
                if parsed:
                    client.cookies = parsed
            try:
                await client.init(timeout=600, watchdog_timeout=600, auto_close=False, auto_refresh=True, verbose=False)
            except Exception as exc:
                try:
                    await client.close()
                except Exception:
                    pass
                raise RuntimeError(f"Gemini init failed: {exc}") from exc
            self._clients[account_id] = client
            self._error = None
            try:
                models = await self._collect_models(client)
                self._models[account_id] = models
                if account_id != _CONFIG_ACCOUNT_ID:
                    gemini_account_service.update_models(account_id, models)
            except Exception:
                pass
            return client

    async def _collect_models(self, client: GeminiClient) -> list[dict[str, Any]]:
        try:
            models = client.list_models() or []
        except Exception:
            return []
        result: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in models:
            model_id = str(getattr(item, "model_id", "") or "").strip()
            model_name = str(getattr(item, "model_name", "") or "").strip()
            if not model_name or model_name in seen:
                continue
            seen.add(model_name)
            result.append({
                "id": model_name,
                "display_name": str(getattr(item, "display_name", "") or model_name),
                "is_available": bool(getattr(item, "is_available", True)),
                "model_id": model_id,
            })
        return result

    def _models_for(self, account_id: str) -> list[dict[str, Any]]:
        return self._models.get(account_id) or []

    def _current_account_id(self, client: GeminiClient) -> str:
        for account_id, cached in self._clients.items():
            if cached is client:
                return account_id
        return ""

    def catalog_models(self) -> list[dict[str, Any]]:
        """Known Gemini model families (all capabilities), for display & capability routing."""
        return [dict(item) for item in GEMINI_MODEL_CATALOG]

    def resolve_model_name(self, model: str, account_id: str | None = None) -> str | None:
        requested = str(model or "").strip().lower()
        if not requested:
            return None
        for models in [self._models_for(account_id or "")] + list(self._models.values()):
            for item in models:
                model_id = str(item.get("id") or "").lower()
                display = str(item.get("display_name") or "").lower()
                if model_id == requested or display == requested or requested in model_id:
                    return str(item.get("id") or "")
        return None

    # ── failover helpers ────────────────────────────────────────────

    def _failover_accounts(self, prefer_id: str | None = None) -> list[dict[str, Any]]:
        """Order accounts for a request: preferred account first, then round-robin,
        then the remaining usable accounts (failover order)."""
        pool = self._accounts()
        if not pool:
            raise RuntimeError("No Gemini account is configured")
        usable = [account for account in pool if account.get("status") == "normal"]
        if prefer_id:
            ordered = [account for account in usable if str(account.get("id") or "") == prefer_id]
            ordered += [account for account in usable if str(account.get("id") or "") != prefer_id]
            return ordered or usable
        first = gemini_account_service.pick_account()
        if first is None:
            return usable
        ordered = [first]
        ordered += [account for account in usable if account.get("id") != first.get("id")]
        return ordered

    async def _with_failover(self, operation, *args, prefer_id: str | None = None, **kwargs):
        """Run an async operation across accounts; mark failures and retry with the next account.
        CapabilityError (e.g. Veo/deep research unavailable on this account) does not count
        as an account-health failure and does not drop the cached client."""
        last_error: Exception | None = None
        for account in self._failover_accounts(prefer_id):
            account_id = str(account.get("id") or "")
            try:
                client = await self._init_client(account)
                result = await operation(client, *args, **kwargs)
                if account_id != _CONFIG_ACCOUNT_ID:
                    gemini_account_service.mark_used(account_id, ok=True)
                return result
            except CapabilityError as exc:
                last_error = exc
                continue
            except Exception as exc:
                last_error = exc
                if account_id != _CONFIG_ACCOUNT_ID:
                    gemini_account_service.mark_used(account_id, ok=False, error=str(exc))
                self._clients.pop(account_id, None)
                continue
        raise RuntimeError(str(last_error) if last_error else "Gemini request failed")

    async def _stream_with_failover(self, operation, *args, prefer_id: str | None = None, **kwargs) -> AsyncIterator[Any]:
        """Stream an async-generator operation across accounts with failover."""
        last_error: Exception | None = None
        for account in self._failover_accounts(prefer_id):
            account_id = str(account.get("id") or "")
            try:
                client = await self._init_client(account)
                produced = False
                async for chunk in operation(client, *args, **kwargs):
                    produced = True
                    yield chunk
                if account_id != _CONFIG_ACCOUNT_ID:
                    gemini_account_service.mark_used(account_id, ok=True)
                return
            except Exception as exc:
                last_error = exc
                if account_id != _CONFIG_ACCOUNT_ID:
                    gemini_account_service.mark_used(account_id, ok=False, error=str(exc))
                self._clients.pop(account_id, None)
                continue
        raise RuntimeError(str(last_error) if last_error else "Gemini request failed")

    # ── sync public API ────────────────────────────────────────────

    def ensure_ready(self, prefer_id: str | None = None) -> None:
        self._prune_cache_if_changed()
        account = self._pick_account(prefer_id)
        if account is None:
            raise RuntimeError("No Gemini account is configured")
        self._call(self._init_client(account))

    def status(self) -> dict[str, Any]:
        enabled = self.is_enabled()
        configured = self.is_configured()
        error = self._error or ""
        models: list[dict[str, Any]] = []
        gems_count = 0
        if enabled:
            try:
                account = self._pick_account()
                if account is not None:
                    account_id = str(account.get("id") or "")
                    self.ensure_ready(account_id)
                    models = self._models_for(account_id)
                    if not models:
                        client = self._clients.get(account_id)
                        if client is not None:
                            models = self._call(self._collect_models(client))
            except Exception as exc:
                error = str(exc)
        pool_status = gemini_account_service.status()
        pool_status.update({
            "enabled": enabled,
            "configured": configured,
            "ready": enabled and bool(models) and not error,
            "error": error,
            "models": models,
            "catalog": self.catalog_models(),
            "gems_count": gems_count,
        })
        return pool_status

    def list_models(self, prefer_id: str | None = None, *, include_catalog: bool = False) -> list[dict[str, Any]]:
        """Account models (dynamic registry) optionally merged with the known catalog.

        Catalog entries carry `capabilities` and `available` flags; registry models
        are marked available for the account that exposes them.
        """
        account_models: list[dict[str, Any]] = []
        try:
            self.ensure_ready(prefer_id)
            account = self._pick_account(prefer_id)
            if account is not None:
                account_models = self._models_for(str(account.get("id") or ""))
        except Exception:
            pass
        if not include_catalog:
            return account_models
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        for item in account_models:
            model_id = str(item.get("id") or "").strip()
            if not model_id or model_id in seen:
                continue
            seen.add(model_id)
            entry = dict(item)
            entry["available"] = True
            entry["capabilities"] = _capabilities_for(model_id)
            result.append(entry)
        for item in GEMINI_MODEL_CATALOG:
            model_id = str(item.get("id") or "").strip()
            if model_id in seen:
                continue
            seen.add(model_id)
            entry = dict(item)
            entry["available"] = False
            result.append(entry)
        return result

    def chat(
        self,
        prompt: str,
        model: str,
        gem: str | None = None,
        files: list[bytes] | None = None,
        account_id: str | None = None,
    ) -> dict[str, Any]:
        return self._call(self._with_failover(self._chat, prompt, model, gem, files, prefer_id=account_id))

    def chat_stream(
        self,
        prompt: str,
        model: str,
        gem: str | None = None,
        files: list[bytes] | None = None,
        account_id: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        loop = self._ensure_loop()
        channel: queue.Queue[Any] = queue.Queue()
        done = threading.Event()

        async def _pump() -> None:
            try:
                async for chunk in self._stream_with_failover(self._chat_stream, prompt, model, gem, files, prefer_id=account_id):
                    channel.put(chunk)
            except Exception as exc:
                channel.put(exc)
            finally:
                done.set()

        asyncio.run_coroutine_threadsafe(_pump(), loop)
        while True:
            try:
                item = channel.get(timeout=0.25)
            except queue.Empty:
                if done.is_set() and channel.empty():
                    break
                continue
            if isinstance(item, Exception):
                raise RuntimeError(str(item)) from item
            yield item
            if done.is_set() and channel.empty():
                break

    def generate_images(
        self,
        prompt: str,
        model: str,
        n: int = 1,
        files: list[bytes] | None = None,
        account_id: str | None = None,
    ) -> list[dict[str, Any]]:
        return self._call(self._with_failover(self._generate_images, prompt, model, n, files, prefer_id=account_id))

    def generate_videos(
        self,
        prompt: str,
        model: str,
        n: int = 1,
        files: list[bytes] | None = None,
        account_id: str | None = None,
    ) -> list[dict[str, Any]]:
        return self._call(self._with_failover(self._generate_videos, prompt, model, n, files, prefer_id=account_id))

    def save_image_sync(self, image: Any, account_id: str | None = None) -> dict[str, Any] | None:
        client = self._clients.get(account_id or "") or (list(self._clients.values()) or [None])[0]
        if client is None:
            return None
        return self._call(self._save_image(client, image))

    def deep_research(self, prompt: str, timeout: float = 600.0, account_id: str | None = None) -> dict[str, Any]:
        return self._call(self._with_failover(self._deep_research, prompt, timeout, prefer_id=account_id))

    def list_gems(self, account_id: str | None = None) -> list[dict[str, Any]]:
        return self._call(self._with_failover(self._fetch_gems, prefer_id=account_id))

    def create_gem(self, name: str, prompt: str, description: str = "", account_id: str | None = None) -> dict[str, Any]:
        return self._call(self._with_failover(self._create_gem, name, prompt, description, prefer_id=account_id))

    def delete_gem(self, gem_id: str, account_id: str | None = None) -> None:
        self._call(self._with_failover(self._delete_gem, gem_id, prefer_id=account_id))

    # ── async internals ─────────────────────────────────────────────

    async def _chat_stream(self, client: GeminiClient, prompt: str, model: str, gem: str | None, files: list[bytes] | None) -> AsyncIterator[dict[str, Any]]:
        resolved = self.resolve_model_name(model) or (model if model != "auto" else None)
        stream = client.generate_content_stream(
            prompt,
            files=_file_inputs(files),
            model=resolved if resolved else None,
            gem=gem or None,
            temporary=True,
        )
        final_output = None
        async for output in stream:
            final_output = output
            thoughts_delta = str(output.thoughts_delta or "")
            if thoughts_delta:
                yield {"kind": "thoughts", "text": thoughts_delta}
            text_delta = str(output.text_delta or "")
            if text_delta:
                yield {"kind": "delta", "text": text_delta}
        images = list(getattr(final_output, "images", None) or [])
        videos = list(getattr(final_output, "videos", None) or [])
        media = list(getattr(final_output, "media", None) or [])
        if images or videos or media:
            yield {"kind": "media", "images": images, "videos": videos, "media": media}

    async def _chat(self, client: GeminiClient, prompt: str, model: str, gem: str | None, files: list[bytes] | None) -> dict[str, Any]:
        resolved = self.resolve_model_name(model) or (model if model != "auto" else None)
        output = await client.generate_content(
            prompt,
            files=_file_inputs(files),
            model=resolved if resolved else None,
            gem=gem or None,
            temporary=True,
        )
        return {
            "text": str(output.text or ""),
            "thoughts": str(output.thoughts or "") or None,
            "images": list(output.images or []),
            "videos": list(output.videos or []),
            "media": list(output.media or []),
        }

    async def _save_image(self, client: GeminiClient, image: Any) -> dict[str, Any] | None:
        if client is None:
            return None
        try:
            with tempfile.TemporaryDirectory(prefix="gemini-img-") as tmp:
                path = await image.save(path=tmp, client=client.client, verbose=False)
                data = Path(path).read_bytes()
                if not data:
                    return None
                return {
                    "b64_json": base64.b64encode(data).decode("ascii"),
                    "revised_prompt": str(getattr(image, "alt", "") or "") or None,
                }
        except Exception:
            return None

    async def _generate_images(
        self,
        client: GeminiClient,
        prompt: str,
        model: str,
        n: int,
        files: list[bytes] | None,
    ) -> list[dict[str, Any]]:
        resolved = self.resolve_model_name(model) or (model if model != "auto" else None)
        output = await client.generate_content(
            prompt,
            files=_file_inputs(files),
            model=resolved if resolved else None,
            temporary=True,
        )
        images = list(output.images or [])
        generated: list[dict[str, Any]] = []
        for image in images:
            saved = await self._save_image(client, image)
            if saved:
                generated.append(saved)
            if len(generated) >= max(1, n):
                break
        return generated

    async def _save_video(self, client: GeminiClient, video: Any) -> dict[str, Any] | None:
        if client is None:
            return None
        try:
            with tempfile.TemporaryDirectory(prefix="gemini-vid-") as tmp:
                saved = await video.save(path=tmp, client=client.client, verbose=False)
                video_path = str((saved or {}).get("video") or "")
                thumb_path = str((saved or {}).get("video_thumbnail") or "")
                if not video_path or not Path(video_path).is_file():
                    return None
                MEDIA_DIR.mkdir(parents=True, exist_ok=True)
                filename = f"gemini-{uuid4().hex[:12]}.mp4"
                media_file = MEDIA_DIR / filename
                media_file.write_bytes(Path(video_path).read_bytes())
                thumb_url = None
                if thumb_path and Path(thumb_path).is_file():
                    thumb_filename = f"gemini-{uuid4().hex[:12]}.jpg"
                    (MEDIA_DIR / thumb_filename).write_bytes(Path(thumb_path).read_bytes())
                    thumb_url = f"/gemini-media/{thumb_filename}"
                return {
                    "url": f"/gemini-media/{filename}",
                    "thumbnail": thumb_url,
                    "title": str(getattr(video, "title", "") or "Video"),
                    "filename": filename,
                }
        except Exception:
            return None

    async def _generate_videos(
        self,
        client: GeminiClient,
        prompt: str,
        model: str,
        n: int,
        files: list[bytes] | None,
    ) -> list[dict[str, Any]]:
        # Video (Veo) generation. Veo is triggered through Gemini's native
        # generation-tool routing (inner_req_list[49]=11), not by choosing a
        # veo model — the account's chat model header is sent along with the
        # tool flag. If the requested model resolves in the registry we pass
        # it through; otherwise the default (flash) model is used.
        resolved = self.resolve_model_name(model, self._current_account_id(client))
        try:
            from gemini_webapi.constants import GenerationTool

            kwargs: dict[str, Any] = {
                "prompt": prompt,
                "files": _file_inputs(files),
                "temporary": True,
                "tool": GenerationTool.VIDEO,
            }
            if resolved:
                kwargs["model"] = resolved
            output = await asyncio.wait_for(
                client.generate_content(**kwargs),
                timeout=480,
            )
        except asyncio.TimeoutError:
            raise CapabilityError(
                "Video generation timed out. Veo rendering can take several minutes; "
                "if it keeps timing out this account may not have video generation access."
            ) from None
        videos = list(getattr(output, "videos", None) or [])
        generated: list[dict[str, Any]] = []
        for video in videos:
            saved = await self._save_video(client, video)
            if saved:
                generated.append(saved)
            if len(generated) >= max(1, n):
                break
        if not generated:
            raise CapabilityError(
                "Video generation returned no video. Veo requires a Gemini Advanced account; "
                "this account may not have video generation access."
            )
        return generated

    async def _deep_research(self, client: GeminiClient, prompt: str, timeout: float) -> dict[str, Any]:
        # Fail fast when the account demonstrably has no deep-research model:
        # the plan/start phase streams forever for unsupported (free) accounts.
        account_models = self._models_for(self._current_account_id(client))
        if account_models and not any(
            "research" in str(item.get("id") or "").lower()
            for item in account_models
        ):
            raise CapabilityError(
                "Deep research is not available on this Gemini account. "
                "It requires a Gemini plan with deep research access."
            )
        # Hard cap so an unsupported account cannot hang the request forever.
        hard_cap = min(max(float(timeout or 600.0), 5.0), 900.0)
        try:
            result = await asyncio.wait_for(
                client.deep_research(prompt, poll_interval=5.0, timeout=hard_cap),
                timeout=hard_cap + 30,
            )
        except asyncio.TimeoutError:
            raise CapabilityError(
                "Deep research timed out. It requires a Gemini plan with deep research access."
            ) from None
        plan = result.plan
        report = str(result.text or "")
        title = str(getattr(plan, "title", "") or "") or prompt[:60]
        steps = list(getattr(plan, "steps", None) or [])
        return {
            "done": bool(result.done),
            "title": title,
            "steps": steps,
            "report": report,
        }

    async def _fetch_gems(self, client: GeminiClient) -> list[dict[str, Any]]:
        gems = await client.fetch_gems(include_hidden=False)
        result: list[dict[str, Any]] = []
        for gem in gems:
            result.append({
                "id": str(getattr(gem, "id", "") or ""),
                "name": str(getattr(gem, "name", "") or ""),
                "description": str(getattr(gem, "description", "") or ""),
                "predefined": bool(getattr(gem, "predefined", False)),
            })
        return result

    async def _create_gem(self, client: GeminiClient, name: str, prompt: str, description: str) -> dict[str, Any]:
        gem = await client.create_gem(name=name, prompt=prompt, description=description)
        return {
            "id": str(getattr(gem, "id", "") or ""),
            "name": str(getattr(gem, "name", "") or name),
            "description": str(getattr(gem, "description", "") or ""),
            "predefined": False,
        }

    async def _delete_gem(self, client: GeminiClient, gem_id: str) -> None:
        await client.delete_gem(gem_id)


class CapabilityError(RuntimeError):
    """The account cannot perform the requested capability (e.g. Veo/deep
    research on a free tier). Not an account-health failure: do not mark the
    account failed or drop its cached client."""


gemini_provider = GeminiProvider()
