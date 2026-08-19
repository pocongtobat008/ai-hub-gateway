"""DeepSeek web provider — a pure-Python port of the ds-free-api Rust client.

Implements the DeepSeek web protocol against https://chat.deepseek.com:
  - email/password login -> bearer token
  - chat session create/delete
  - Proof-of-Work (DeepSeekHashV1, WASM) challenge solving
  - /chat/completion SSE streaming with the p/o/v patch protocol
  - file upload for vision inputs

Model mapping (deepseek web model types -> OpenAI-style IDs):
  default -> deepseek-chat
  expert  -> deepseek-reasoner
  vision  -> deepseek-vision
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

from services.config import DATA_DIR
from services.deepseek_account_service import deepseek_account_service


DEEPSEEK_TOKENS_FILE = DATA_DIR / "deepseek_tokens.json"

# ── constants ──────────────────────────────────────────────────────

API_BASE = "https://chat.deepseek.com/api/v0"
WASM_URL = "https://fe-static.deepseek.com/chat/static/sha3_wasm_bg.7b9ca65ddd.wasm"
USER_AGENT = "DeepSeek/2.1.1 Android/35"
# 2.3.0+ is required for vision (image) mode; older versions are rejected with
# "使用识图模式请更新至最新版本" (update required for image recognition).
CLIENT_VERSION = "2.3.0"
CLIENT_PLATFORM = "android"
CLIENT_LOCALE = "zh_CN"

# OpenAI model id -> deepseek model_type
MODEL_ALIASES: dict[str, str] = {
    "deepseek-chat": "default",
    "deepseek-default": "default",
    "deepseek-reasoner": "expert",
    "deepseek-expert": "expert",
    "deepseek-vision": "vision",
    "deepseek-search": "default",
}
MODEL_TYPES = ("default", "expert", "vision")

TOOL_CALL_START = "<|tool▁calls▁begin|>"
TOOL_CALL_END = "<|tool▁calls▁end|>"
TOOL_OUTPUT_BEGIN = "<｜tool▁output▁begin｜>"
TOOL_OUTPUT_END = "<｜tool▁output▁end｜>"
TOOL_OUTPUTS_BEGIN = "<｜tool▁outputs▁begin｜>"
TOOL_OUTPUTS_END = "<｜tool▁outputs▁end｜>"
EOS = "<｜end▁of▁sentence｜>"

FRAG_THINK = "THINK"
FRAG_RESPONSE = "RESPONSE"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def is_deepseek_model(model: str | None) -> bool:
    normalized = str(model or "").strip().lower()
    if not normalized or normalized == "auto":
        return False
    return normalized == "deepseek" or normalized.startswith("deepseek-")


def resolve_model_type(model: str | None) -> str | None:
    normalized = str(model or "").strip().lower()
    return MODEL_ALIASES.get(normalized)


# ── PoW solver ─────────────────────────────────────────────────────

class DeepSeekHashSolver:
    """Wraps the WASM DeepSeekHashV1 solver (deepseek_pow)."""

    def __init__(self) -> None:
        self._solver = None
        self._lock = threading.Lock()

    def _get_solver(self):
        if self._solver is None:
            from services.deepseek_pow import DeepSeekPOW
            self._solver = DeepSeekPOW()
        return self._solver

    def solve(self, challenge: dict[str, Any]) -> str:
        """Solve a PoW challenge and return the base64 X-Ds-Pow-Response header value."""
        if str(challenge.get("algorithm") or "") != "DeepSeekHashV1":
            raise RuntimeError(f"unsupported PoW algorithm: {challenge.get('algorithm')}")
        with self._lock:
            solver = self._get_solver()
            result = solver.solve_challenge({
                "algorithm": challenge["algorithm"],
                "challenge": challenge["challenge"],
                "salt": challenge["salt"],
                "difficulty": challenge["difficulty"],
                "expire_at": challenge["expire_at"],
                # solve_challenge includes these in its payload; we override them
                # with the real values from the challenge below.
                "signature": "",
                "target_path": "",
            })
        # Rebuild the header with the challenge's signature/target_path
        payload = json.loads(base64.b64decode(result).decode("utf-8"))
        payload["signature"] = challenge.get("signature") or ""
        payload["target_path"] = challenge.get("target_path") or "/api/v0/chat/completion"
        return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")


_pow_solver = DeepSeekHashSolver()


# ── SSE patch parser (port of ds-free-api response.rs) ─────────────

class _Fragment:
    __slots__ = ("ty", "content")

    def __init__(self, ty: str, content: str = "") -> None:
        self.ty = ty
        self.content = content


class PatchState:
    """Maintains DeepSeek p/o/v patch state across SSE frames."""

    def __init__(self) -> None:
        self.current_path: str | None = None
        self.current_op: str | None = None
        self.fragments: list[_Fragment] = []
        self.status: str | None = None
        self.accumulated_token_usage: int | None = None

    def apply_frame(self, frame: str) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        if not frame.strip():
            return events

        event_type = None
        data = None
        for line in frame.splitlines():
            stripped = line.strip()
            if stripped.startswith("event:"):
                event_type = stripped[len("event:"):].strip()
            elif stripped.startswith("data:"):
                data = stripped[len("data:"):].strip()

        if event_type == "hint" and data is not None:
            raise RuntimeError(_hint_to_error(data))

        if data:
            try:
                val = json.loads(data)
            except Exception:
                return events
            if isinstance(val, dict):
                events.extend(self.apply_patch(val))
        return events

    def apply_patch(self, val: dict[str, Any]) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        p = val.get("p")
        if isinstance(p, str):
            self.current_path = p
        o = val.get("o")
        if isinstance(o, str):
            self.current_op = o

        op = self.current_op or "SET"
        path = self.current_path or ""

        if "v" not in val:
            return events
        v = val["v"]

        # Initial snapshot: no path and v contains response
        if self.current_path is None and isinstance(v, dict) and "response" in v:
            return self.apply_initial_snapshot(v["response"])

        if op == "BATCH" and isinstance(v, list):
            return self.apply_batch(path, v)

        return self.apply_path(path, op, v)

    def apply_batch(self, parent_path: str, arr: list[Any]) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        sub_path = ""
        sub_op = "SET"

        for item in arr:
            if not isinstance(item, dict):
                continue
            p = item.get("p")
            if isinstance(p, str):
                sub_path = p
            o = item.get("o")
            if isinstance(o, str):
                sub_op = o
            if "v" not in item:
                continue
            v = item["v"]
            full_path = sub_path if not parent_path else (parent_path if not sub_path else f"{parent_path}/{sub_path}")
            if sub_op == "BATCH" and isinstance(v, list):
                events.extend(self.apply_batch(full_path, v))
            else:
                events.extend(self.apply_path(full_path, sub_op, v))
        return events

    def apply_initial_snapshot(self, response: Any) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        if not isinstance(response, dict):
            return events
        s = response.get("status")
        if isinstance(s, str):
            self.status = s
        n = response.get("accumulated_token_usage")
        if isinstance(n, (int, float)):
            self.accumulated_token_usage = int(n)
        arr = response.get("fragments")
        if isinstance(arr, list):
            self.fragments = []
            for frag in arr:
                if not isinstance(frag, dict):
                    continue
                ty = frag.get("type")
                if not isinstance(ty, str):
                    continue
                content = str(frag.get("content") or "")
                self.fragments.append(_Fragment(ty, content))
                if content:
                    if ty == FRAG_THINK:
                        events.append({"kind": "thoughts", "text": content})
                    elif ty == FRAG_RESPONSE:
                        events.append({"kind": "delta", "text": content})
        return events

    def apply_path(self, path: str, op: str, val: Any) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        stripped = path.lstrip("/")

        if stripped == "response/status":
            if isinstance(val, str):
                self.status = val
        elif stripped in ("response/accumulated_token_usage", "accumulated_token_usage"):
            if isinstance(val, (int, float)):
                self.accumulated_token_usage = int(val)
        elif stripped == "response/fragments/-1/content":
            if isinstance(val, str) and self.fragments:
                frag = self.fragments[-1]
                frag.content += val
                if frag.ty == FRAG_THINK:
                    events.append({"kind": "thoughts", "text": val})
                elif frag.ty == FRAG_RESPONSE:
                    events.append({"kind": "delta", "text": val})
        elif stripped == "response/fragments" and op == "APPEND":
            if isinstance(val, list):
                for item in val:
                    if not isinstance(item, dict):
                        continue
                    ty = item.get("type")
                    if not isinstance(ty, str):
                        continue
                    content = str(item.get("content") or "")
                    self.fragments.append(_Fragment(ty, content))
                    if content:
                        if ty == FRAG_THINK:
                            events.append({"kind": "thoughts", "text": content})
                        elif ty == FRAG_RESPONSE:
                            events.append({"kind": "delta", "text": content})
        return events

    @property
    def finished(self) -> bool:
        return self.status in ("FINISHED", "INCOMPLETE")

    @property
    def has_response_content(self) -> bool:
        return any(f.ty == FRAG_RESPONSE and f.content for f in self.fragments)


def _hint_to_error(data: str) -> str:
    try:
        val = json.loads(data)
    except Exception:
        return f"hint: {data[:200]}"
    content = (
        val.get("content")
        or val.get("finish_reason")
        or "(unknown)"
    )
    content = str(content)
    if "rate_limit" in content:
        return "DeepSeek rate limit reached, please try again later"
    if "input_exceeds_limit" in content:
        return "Input too long, please shorten and retry"
    return f"DeepSeek hint: {content}"


# ── HTTP client ────────────────────────────────────────────────────

def _auth_headers(token: str) -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Authorization": f"Bearer {token}",
        "X-Client-Version": CLIENT_VERSION,
        "X-Client-Platform": CLIENT_PLATFORM,
        "X-Client-Locale": CLIENT_LOCALE,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _auth_headers_with_pow(token: str, pow_response: str) -> dict[str, str]:
    headers = _auth_headers(token)
    headers["X-Ds-Pow-Response"] = pow_response
    return headers


def _parse_envelope(data: Any) -> Any:
    """Parse the DeepSeek envelope {code, msg, data: {biz_code, biz_msg, biz_data}}."""
    if not isinstance(data, dict):
        raise RuntimeError(f"invalid DeepSeek response: {data!r}")
    code = data.get("code")
    if code != 0:
        raise RuntimeError(f"DeepSeek error: code={code}, msg={data.get('msg')}")
    inner = data.get("data")
    if not isinstance(inner, dict):
        raise RuntimeError("DeepSeek response missing data")
    biz_code = inner.get("biz_code")
    if biz_code != 0:
        raise RuntimeError(f"DeepSeek error: biz_code={biz_code}, {inner.get('biz_msg')}")
    return inner.get("biz_data")



class DeepSeekClient:
    """Raw HTTP client for the DeepSeek web API."""

    def __init__(self, proxy: str = "") -> None:
        self._proxy = proxy
        self._session = None

    def _get_session(self):
        if self._session is None:
            from curl_cffi import requests
            kwargs: dict[str, Any] = {
                "impersonate": "chrome110",
                "timeout": 60,
                "headers": {"User-Agent": USER_AGENT},
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

    def login(self, email: str, password: str) -> str:
        session = self._get_session()
        payload = {
            "email": email,
            "password": password,
            "device_id": "",
            "os": "web",
        }
        resp = session.post(
            f"{API_BASE}/users/login",
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
            json=payload,
        )
        if resp.status_code == 202 or "waf" in resp.text.lower()[:200]:
            raise RuntimeError("WAF Challenge: use a non-US proxy for DeepSeek login")
        try:
            data = resp.json()
        except Exception:
            raise RuntimeError(f"DeepSeek login HTTP {resp.status_code}: {resp.text[:300]}")
        # Login responses come back as the standard envelope with the user object
        # nested one level deeper: {code, msg, data: {biz_code, biz_msg,
        # biz_data: {code, msg, user: {id, token, ...}}}}. Failures surface as
        # biz_code != 0 (either in the outer envelope or the nested payload).
        if not isinstance(data, dict):
            raise RuntimeError(f"DeepSeek login failed: invalid response {data!r}")
        code = data.get("code")
        if code != 0:
            raise RuntimeError(f"DeepSeek login error: code={code}, msg={data.get('msg')}")
        inner = data.get("data")
        if isinstance(inner, dict) and inner.get("biz_code") not in (None, 0):
            raise RuntimeError(
                f"DeepSeek login error: biz_code={inner.get('biz_code')}, {inner.get('biz_msg')}"
            )
        payload = inner.get("biz_data") if isinstance(inner, dict) else None
        if not isinstance(payload, dict):
            raise RuntimeError(f"DeepSeek login failed: no payload ({data!r})")
        if payload.get("code") not in (None, 0):
            raise RuntimeError(f"DeepSeek login error: code={payload.get('code')}, msg={payload.get('msg')}")
        user = payload.get("user")
        if not isinstance(user, dict) or not user.get("token"):
            raise RuntimeError(f"DeepSeek login failed: no token ({data!r})")
        return str(user["token"])

    def create_session(self, token: str) -> str:
        session = self._get_session()
        resp = session.post(
            f"{API_BASE}/chat_session/create",
            headers=_auth_headers(token),
            json={},
        )
        data = _parse_envelope(resp.json())
        # biz_data is {chat_session: {id, seq_id, ...}}
        if not isinstance(data, dict):
            raise RuntimeError(f"create_session failed: {data!r}")
        chat_session = data.get("chat_session")
        if not isinstance(chat_session, dict) or not chat_session.get("id"):
            raise RuntimeError(f"create_session failed: {data!r}")
        return str(chat_session["id"])

    def delete_session(self, token: str, session_id: str) -> None:
        session = self._get_session()
        try:
            resp = session.post(
                f"{API_BASE}/chat_session/delete",
                headers=_auth_headers(token),
                json={"chat_session_id": session_id},
            )
            _parse_envelope(resp.json())
        except Exception:
            pass

    def stop_stream(self, token: str, session_id: str, message_id: int) -> None:
        session = self._get_session()
        try:
            resp = session.post(
                f"{API_BASE}/chat/stop_stream",
                headers=_auth_headers(token),
                json={"chat_session_id": session_id, "message_id": message_id},
            )
            _parse_envelope(resp.json())
        except Exception:
            pass

    def create_pow_challenge(self, token: str, target_path: str) -> dict[str, Any]:
        session = self._get_session()
        resp = session.post(
            f"{API_BASE}/chat/create_pow_challenge",
            headers=_auth_headers(token),
            json={"target_path": target_path},
        )
        data = _parse_envelope(resp.json())
        if not isinstance(data, dict) or not data.get("challenge"):
            raise RuntimeError(f"create_pow_challenge failed: {data!r}")
        return data["challenge"]

    def compute_pow_header(self, token: str, target_path: str) -> str:
        challenge = self.create_pow_challenge(token, target_path)
        return _pow_solver.solve(challenge)

    def upload_file(self, token: str, pow_header: str, filename: str, content_type: str, content: bytes) -> str:
        session = self._get_session()
        headers = _auth_headers_with_pow(token, pow_header)
        headers.pop("Content-Type", None)
        from curl_cffi import CurlMime

        mime = CurlMime()
        mime.addpart(
            name="file",
            filename=filename,
            content_type=content_type,
            data=content,
        )
        resp = session.post(
            f"{API_BASE}/file/upload_file",
            headers=headers,
            multipart=mime,
        )
        data = _parse_envelope(resp.json())
        if not isinstance(data, dict) or not data.get("id"):
            raise RuntimeError(f"upload_file failed: {data!r}")
        return str(data["id"])

    def upload_and_poll(self, token: str, filename: str, content_type: str, content: bytes,
                        timeout_secs: float = 20.0) -> str:
        """Upload a file and poll fetch_files until it is ready (SUCCESS).

        DeepSeek processes uploaded files asynchronously; using a file id before
        it reaches SUCCESS makes the completion fail (invalid ref file id).
        """
        pow_header = self.compute_pow_header(token, "/api/v0/file/upload_file")
        file_id = self.upload_file(token, pow_header, filename, content_type, content)
        deadline = time.time() + timeout_secs
        while time.time() < deadline:
            try:
                data = self.fetch_files(token, [file_id])
                files = data.get("files") if isinstance(data, dict) else None
                if isinstance(files, list) and files:
                    status = str(files[0].get("status") or "")
                    if status == "SUCCESS":
                        return file_id
                    if status == "FAILED":
                        raise RuntimeError(f"DeepSeek file processing failed: {files[0].get('file_name')}")
            except RuntimeError as exc:
                if "file" in str(exc).lower() and "not found" in str(exc).lower():
                    pass
                else:
                    raise
            time.sleep(1.0)
        raise RuntimeError(f"DeepSeek file upload timed out after {int(timeout_secs)}s")

    def fetch_files(self, token: str, file_ids: list[str]) -> dict[str, Any]:
        session = self._get_session()
        resp = session.get(
            f"{API_BASE}/file/fetch_files",
            headers=_auth_headers(token),
            params={"file_ids": ",".join(file_ids)},
        )
        data = _parse_envelope(resp.json())
        return data if isinstance(data, dict) else {}

    def completion(self, token: str, pow_header: str, payload: dict[str, Any]) -> Iterator[dict[str, Any]]:
        """POST /chat/completion and yield parsed patch events.

        Yields dicts: {"kind": "thoughts"|"delta"|"done", ...}
        """
        session = self._get_session()
        resp = session.post(
            f"{API_BASE}/chat/completion",
            headers=_auth_headers_with_pow(token, pow_header),
            json=payload,
            stream=True,
        )
        if resp.status_code != 200:
            body = resp.text[:500]
            raise RuntimeError(f"DeepSeek completion HTTP {resp.status_code}: {body}")

        state = PatchState()
        buf = b""
        pending_events: list[dict[str, Any]] = []
        first_two: list[str] = []
        first_chunk = True

        for chunk in resp.iter_content(chunk_size=4096):
            if not chunk:
                continue
            buf += chunk

            # Detect non-SSE JSON error on the very first chunk.
            # When the account is muted (biz_code=5) the server returns a
            # single JSON object instead of SSE frames.
            if first_chunk:
                first_chunk = False
                try:
                    text = buf.decode("utf-8", errors="replace").strip()
                    if text.startswith("{"):
                        data = json.loads(text)
                        inner = data.get("data") if isinstance(data, dict) else None
                        biz_code = inner.get("biz_code") if isinstance(inner, dict) else None
                        biz_msg = (inner.get("biz_msg") or "") if isinstance(inner, dict) else ""
                        if biz_code == 5 or (biz_msg and "muted" in str(biz_msg).lower()):
                            mute_until = ((inner.get("biz_data") or {}).get("mute_until", 0)) if isinstance(inner, dict) else 0
                            raise RuntimeError(
                                f"DeepSeek account muted: {biz_msg}"
                                f" (mute_until={mute_until})"
                            )
                        if biz_code and biz_code != 0:
                            raise RuntimeError(f"DeepSeek error: biz_code={biz_code}, {biz_msg}")
                except (json.JSONDecodeError, ValueError):
                    pass  # Not JSON, continue with normal SSE parsing

            while b"\n\n" in buf:
                raw, buf = buf.split(b"\n\n", 1)
                frame = raw.decode("utf-8", errors="replace")
                if len(first_two) < 2:
                    first_two.append(frame)
                    if len(first_two) == 2:
                        hint_err = _check_hint(frame)
                        if hint_err:
                            raise RuntimeError(hint_err)
                    continue
                try:
                    events = state.apply_frame(frame)
                except RuntimeError as exc:
                    raise exc
                pending_events.extend(events)

                if state.finished:
                    finish = "stop" if state.status == "FINISHED" else None
                    yield {"kind": "done", "finish_reason": finish,
                           "accumulated_token_usage": state.accumulated_token_usage}
                    return

                for evt in pending_events:
                    yield evt
                pending_events = []

        # Trailing buffer — may contain a JSON error too
        if buf:
            frame = buf.decode("utf-8", errors="replace")
            stripped = frame.strip()
            if stripped.startswith("{"):
                try:
                    data = json.loads(stripped)
                    inner = data.get("data") if isinstance(data, dict) else None
                    biz_code = inner.get("biz_code") if isinstance(inner, dict) else None
                    biz_msg = (inner.get("biz_msg") or "") if isinstance(inner, dict) else ""
                    if biz_code == 5 or (biz_msg and "muted" in str(biz_msg).lower()):
                        mute_until = ((inner.get("biz_data") or {}).get("mute_until", 0)) if isinstance(inner, dict) else 0
                        raise RuntimeError(
                            f"DeepSeek account muted: {biz_msg}"
                            f" (mute_until={mute_until})"
                        )
                    if biz_code and biz_code != 0:
                        raise RuntimeError(f"DeepSeek error: biz_code={biz_code}, {biz_msg}")
                except (json.JSONDecodeError, ValueError):
                    pass
            try:
                events = state.apply_frame(frame)
            except RuntimeError:
                events = []
            pending_events.extend(events)

        for evt in pending_events:
            yield evt

        if not state.finished:
            yield {"kind": "done", "finish_reason": None, "accumulated_token_usage": state.accumulated_token_usage}


def _check_hint(frame: str) -> str | None:
    is_hint = any(
        line.strip().startswith("event:") and line.strip()[len("event:"):].strip() == "hint"
        for line in frame.splitlines()
    )
    if not is_hint:
        return None
    data = None
    for line in frame.splitlines():
        stripped = line.strip()
        if stripped.startswith("data:"):
            data = stripped[len("data:"):].strip()
    if data:
        return _hint_to_error(data)
    return "DeepSeek hint error"


# ── ChatML prompt building (port of ds-free-api prompt.rs) ─────────

def _role_tag(role: str) -> str:
    r = role[:1].upper() + role[1:] if role else role
    return f"<｜{r}｜>"


def _format_content_part(part: Any) -> str:
    if isinstance(part, str):
        return part
    if not isinstance(part, dict):
        return ""
    ty = part.get("type")
    if ty == "text":
        return str(part.get("text") or "")
    if ty == "image_url":
        url = str((part.get("image_url") or {}).get("url") or "")
        if url.startswith("http://") or url.startswith("https://"):
            return f"[请访问这个链接: {url}]"
        return "[图片: detail=auto]"
    if ty in ("image", "input_image"):
        # Normalized format carries raw bytes; the actual file is uploaded separately.
        return "[图片]"
    if ty == "input_audio":
        return "[音频]"
    return str(part.get("text") or "")


def _format_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(_format_content_part(p) for p in content)
    return ""


def build_deepseek_prompt(messages: list[dict[str, Any]], tools_context: str | None = None) -> str:
    """Convert OpenAI-style messages into DeepSeek ChatML prompt.

    When tools_context is given it is appended to the first System block (or a
    new System block is prepended) to steer the model toward tool calls.
    """
    parts: list[str] = []
    i = 0
    while i < len(messages):
        msg = messages[i]
        role = str(msg.get("role") or "user")
        if role == "tool":
            tool_contents: list[str] = []
            while i < len(messages) and str(messages[i].get("role") or "") == "tool":
                tool_contents.append(_format_content(messages[i].get("content")))
                i += 1
            inner = "".join(
                f"{TOOL_OUTPUT_BEGIN}{c}{TOOL_OUTPUT_END}" for c in tool_contents
            )
            parts.append(f"{TOOL_OUTPUTS_BEGIN}{inner}{TOOL_OUTPUTS_END}")
            continue

        body_parts: list[str] = []
        name = msg.get("name")
        if name:
            body_parts.append(f"(name: {name})")
        content = _format_content(msg.get("content"))
        if content:
            body_parts.append(content)

        tool_calls = msg.get("tool_calls")
        if isinstance(tool_calls, list) and tool_calls:
            items: list[str] = []
            for tc in tool_calls:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                fn_name = str(fn.get("name") or "")
                fn_args = fn.get("arguments") or "{}"
                try:
                    args_json = json.dumps(json.loads(fn_args), ensure_ascii=False)
                except Exception:
                    args_json = json.dumps(str(fn_args), ensure_ascii=False)
                items.append(
                    json.dumps({"name": fn_name, "arguments": json.loads(args_json)}, ensure_ascii=False)
                )
            body_parts.append(f"{TOOL_CALL_START}\n[{', '.join(items)}]\n{TOOL_CALL_END}")

        body = "\n".join(p for p in body_parts if p)
        tag = _role_tag(role)
        prefix = EOS if role == "user" else ""
        parts.append(f"{prefix}{tag}{body}\n")
        i += 1

    # Inject the tool-calling context into the first System block
    if tools_context:
        sys_idx = next(
            (idx for idx, p in enumerate(parts) if p.startswith("<｜System｜>")),
            None,
        )
        if sys_idx is not None:
            parts[sys_idx] = parts[sys_idx].rstrip("\n") + "\n\n" + tools_context + "\n"
        else:
            parts.insert(0, f"<｜System｜>\n{tools_context}\n")

    # Ensure trailing <｜Assistant｜>
    if not any(p.startswith("<｜Assistant｜>") for p in parts):
        parts.append("<｜Assistant｜>\n")
    return "".join(parts)


# ── Tool calling (port of ds-free-api tools.rs + tool_parser.rs) ────

def _norm_tag_char(c: str) -> str:
    if c == "\uff5c":  # ｜
        return "|"
    if c == "\u2581":  # ▁
        return "_"
    return c


def _fuzzy_find(haystack: str, needle: str) -> int | None:
    """Find a tag allowing ｜<->| and ▁<->_ equivalence (full-width variants)."""
    if needle in haystack:
        return haystack.find(needle)
    h = [c for c in haystack]
    n = [c for c in needle]
    if len(n) > len(h):
        return None
    for start in range(len(h) - len(n) + 1):
        if all(_norm_tag_char(h[start + j]) == _norm_tag_char(n[j]) for j in range(len(n))):
            return start
    return None


def parse_tool_calls(text: str) -> list[dict[str, Any]] | None:
    """Parse <|tool▁calls▁begin|>[...]<|tool▁calls▁end|> into OpenAI-style tool calls.

    Returns a list of {"id", "type": "function", "function": {"name", "arguments"}} dicts,
    or None when no valid tool call block is found.
    """
    start_pos = _fuzzy_find(text, TOOL_CALL_START)
    if start_pos is None:
        return None
    after_start = start_pos + len(TOOL_CALL_START)
    end_pos = _fuzzy_find(text[after_start:], TOOL_CALL_END)
    if end_pos is None:
        inner = text[after_start:]
    else:
        inner = text[after_start:after_start + end_pos]

    arr_start = inner.find("[")
    arr_end = inner.rfind("]")
    if arr_start == -1 or arr_end == -1 or arr_end <= arr_start:
        # Single object fallback
        obj_start = inner.find("{")
        obj_end = inner.rfind("}")
        if obj_start == -1 or obj_end == -1:
            return None
        try:
            obj = json.loads(inner[obj_start:obj_end + 1])
            arr = [obj]
        except Exception:
            return None
    else:
        json_str = inner[arr_start:arr_end + 1]
        if json_str.strip() == "[]":
            return None
        try:
            arr = json.loads(json_str)
        except Exception:
            # Repair unquoted keys (common DeepSeek hallucination)
            repaired = _repair_json_keys(json_str)
            try:
                arr = json.loads(repaired)
            except Exception:
                return None
    if not isinstance(arr, list):
        arr = [arr]

    calls: list[dict[str, Any]] = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        args_value = item.get("arguments")
        if isinstance(args_value, str):
            try:
                args_str = json.dumps(json.loads(args_value), ensure_ascii=False)
            except Exception:
                args_str = args_value
        elif isinstance(args_value, dict):
            args_str = json.dumps(args_value, ensure_ascii=False)
        else:
            args_str = "{}"
        calls.append({
            "id": f"call_{uuid.uuid4().hex[:16]}",
            "type": "function",
            "function": {"name": name, "arguments": args_str},
        })
    return calls or None


def _repair_json_keys(s: str) -> str:
    """Best-effort repair of unquoted JSON keys (e.g. {name: "x", arguments: {}})."""
    import re as _re

    out: list[str] = []
    i = 0
    while i < len(s):
        c = s[i]
        if c in "{,":
            out.append(c)
            i += 1
            while i < len(s) and s[i].isspace():
                out.append(s[i])
                i += 1
            if i < len(s) and (s[i].isalpha() or s[i] == "_"):
                j = i
                while j < len(s) and (s[j].isalnum() or s[j] == "_"):
                    j += 1
                key = s[i:j]
                out.append('"' + key + '"')
                i = j
            continue
        out.append(c)
        i += 1
    return "".join(out)


def build_tools_context(tools: list[dict[str, Any]], tool_choice: Any = None) -> str | None:
    """Build the tool-calling instruction block injected into the system prompt.

    Mirrors ds-free-api's tools.rs: format template + rules + per-tool definitions.
    Returns None when no tools are provided (or tool_choice is none).
    """
    if not tools:
        return None
    if isinstance(tool_choice, str) and tool_choice == "none":
        return None
    if isinstance(tool_choice, dict) and str(tool_choice.get("type") or "") == "none":
        return None

    lines: list[str] = []
    lines.append("## 工具调用")
    lines.append("### 格式规范")
    lines.append("**工具调用格式 — 请严格遵守：**")
    lines.append("")
    lines.append("将 JSON 数组包裹在工具调用标记中：")
    lines.append("")
    lines.append(f"{TOOL_CALL_START}[{{\"name\": \"工具名\", \"arguments\": {{参数JSON}}}}]{TOOL_CALL_END}")
    lines.append("")
    lines.append("**规则：**")
    lines.append("")
    lines.append("**核心：决定调用工具时，你的响应中只允许出现工具调用文本本身，禁止任何解释、前缀、总结、问候语等额外内容。**")
    lines.append("")
    lines.append(f"1. JSON 数组必须以 `{TOOL_CALL_START}` 开头、以 `{TOOL_CALL_END}` 结尾，将数组**完整包裹**在标记内。")
    lines.append("2. 所有工具调用必须放在**一个** JSON 数组中，多个调用用逗号分隔。")
    lines.append(f"3. 输出 `{TOOL_CALL_END}` 后**立即停止**，不得添加后续文本、XML 标签或说明文字。")
    lines.append("4. 不要将工具调用包裹在 markdown 代码块中。")
    lines.append("5. 字符串参数值必须用**双引号**包裹（JSON 标准）。")
    lines.append(f"6. 决定调用工具时，输出的**第一个非空白字符**必须是 `{TOOL_CALL_START}`。")
    lines.append("")

    # Tool definitions
    lines.append("### 工具定义")
    lines.append("你可以使用以下工具：")
    for idx, tool in enumerate(tools):
        if not isinstance(tool, dict):
            continue
        fn = tool.get("function") if isinstance(tool.get("function"), dict) else None
        if not fn:
            continue
        name = str(fn.get("name") or "").strip()
        if not name:
            continue
        params = fn.get("parameters") or {}
        try:
            params_str = json.dumps(params, ensure_ascii=False)
        except Exception:
            params_str = "{}"
        desc = str(fn.get("description") or "").strip()
        desc_block = f"  无描述" if not desc else f"~~~markdown\n  {desc}\n~~~"
        lines.append(f"- **{name}** (function):")
        lines.append(f"  - 调用方法: `{TOOL_CALL_START}[{{\"name\": \"{name}\", \"arguments\": {params_str}}}]{TOOL_CALL_END}`")
        lines.append(f"  - 简要说明:")
        lines.append(desc_block)

    # tool_choice instructions
    choice_instructions: list[str] = []
    if isinstance(tool_choice, str):
        if tool_choice == "required":
            choice_instructions.append("**注意：你必须调用一个或多个工具。**")
    elif isinstance(tool_choice, dict):
        tc_type = str(tool_choice.get("type") or "")
        if tc_type == "function":
            fn_choice = tool_choice.get("function")
            fn_name = str((fn_choice or {}).get("name") or "").strip()
            if fn_name:
                choice_instructions.append(f"**注意：你必须调用 '{fn_name}' 工具。**")
    if choice_instructions:
        lines.append("### 调用指令")
        lines.extend(choice_instructions)

    return "\n".join(lines)


def split_history_prompt(prompt: str) -> tuple[str, str]:
    """Split ChatML prompt into inline prompt + history content (for oversized inputs)."""
    blocks: list[tuple[str, str]] = []
    pos = 0
    while True:
        start = prompt.find("<｜", pos)
        if start == -1:
            break
        role_start = start + 3
        role_end = prompt.find("｜>", role_start)
        if role_end == -1:
            break
        role = prompt[role_start:role_end].strip().lower()
        content_start = role_end + 2
        content_end = prompt.find("<｜", content_start)
        if content_end == -1:
            content_end = len(prompt)
        content = prompt[content_start:content_end].rstrip("\n")
        blocks.append((role, content))
        pos = content_end

    last_assistant = -1
    for idx, (role, _) in enumerate(blocks):
        if role == "assistant":
            last_assistant = idx

    if last_assistant >= 0:
        inline = f"<｜Assistant｜>{blocks[last_assistant][1]}\n"
        history = "[file content end]\n\n"
        for role, content in blocks[:last_assistant]:
            history += f"<｜{role[:1].upper() + role[1:]}｜>{content}\n"
        history += "[file name]: IGNORE\n[file content begin]\n"
        return inline, history
    return prompt, ""


# ── Provider ───────────────────────────────────────────────────────

class DeepSeekProvider:
    """High-level provider: account pool + chat/chat_stream + models."""

    _TOKEN_TTL_SECONDS = 6 * 3600  # DeepSeek bearer tokens last a long time

    def __init__(self) -> None:
        self._clients: dict[str, DeepSeekClient] = {}
        self._tokens: dict[str, tuple[str, float]] = {}  # account_id -> (token, expiry)
        self._token_lock = threading.Lock()
        self._load_tokens()

    def _load_tokens(self) -> None:
        try:
            if DEEPSEEK_TOKENS_FILE.exists():
                raw = json.loads(DEEPSEEK_TOKENS_FILE.read_text(encoding="utf-8"))
                tokens = raw.get("tokens") if isinstance(raw, dict) else raw
                if isinstance(tokens, dict):
                    for account_id, entry in tokens.items():
                        if not isinstance(entry, dict):
                            continue
                        token = str(entry.get("token") or "")
                        expiry = float(entry.get("expires_at") or 0)
                        if token and expiry > time.time():
                            self._tokens[account_id] = (token, expiry)
        except Exception:
            pass

    def _save_tokens(self) -> None:
        try:
            DEEPSEEK_TOKENS_FILE.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "tokens": {
                    account_id: {"token": token, "expires_at": expiry}
                    for account_id, (token, expiry) in self._tokens.items()
                },
                "updated_at": _now_ms(),
            }
            DEEPSEEK_TOKENS_FILE.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        except Exception:
            pass

    # ── helpers ────────────────────────────────────────────────────

    def _client_for(self, account: dict) -> DeepSeekClient:
        account_id = str(account.get("id") or "")
        client = self._clients.get(account_id)
        # If the cached client has a different proxy, recreate it
        if client is not None and (client._proxy or "") != str(account.get("proxy") or ""):
            client.close()
            client = None
            self._clients.pop(account_id, None)
        if client is None:
            client = DeepSeekClient(proxy=str(account.get("proxy") or ""))
            self._clients[account_id] = client
        return client

    def _close_client(self, account_id: str) -> None:
        client = self._clients.pop(account_id, None)
        if client is not None:
            client.close()

    def _accounts(self) -> list[dict]:
        return deepseek_account_service.list_accounts()

    def is_configured(self) -> bool:
        return bool(deepseek_account_service.list_accounts())

    def is_enabled(self) -> bool:
        return self.is_configured()

    def status(self) -> dict[str, Any]:
        return deepseek_account_service.status()

    def _pick_account(self, prefer_id: str | None = None) -> dict | None:
        """Pick a healthy account and return its raw credentials (email+password)."""
        picked = deepseek_account_service.pick_account(prefer_id=prefer_id)
        if picked is None:
            return None
        creds = deepseek_account_service.get_credentials(str(picked.get("id") or ""))
        if creds is None:
            return None
        return creds

    # ── auth ───────────────────────────────────────────────────────

    def test_account(self, email: str, password: str, proxy: str = "") -> dict[str, Any]:
        """Validate credentials by logging in.

        Returns the available DeepSeek models so the admin UI can show what the
        account can drive (mirrors the Gemini account test).
        """
        client = DeepSeekClient(proxy=proxy)
        try:
            token = client.login(email, password)
            models = [m for m in MODEL_ALIASES if m not in ("deepseek-default", "deepseek-expert", "deepseek-search")]
            return {"ok": True, "token": token[:16] + "…", "models": models}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        finally:
            client.close()

    def _get_token(self, account: dict) -> str:
        """Return a cached bearer token or login to obtain a fresh one (persisted to disk)."""
        account_id = str(account.get("id") or "")
        with self._token_lock:
            cached = self._tokens.get(account_id)
            now = time.time()
            if cached and cached[1] > now:
                return cached[0]
            client = self._client_for(account)
            token = client.login(str(account.get("email") or ""), str(account.get("password") or ""))
            self._tokens[account_id] = (token, now + self._TOKEN_TTL_SECONDS)
            self._save_tokens()
            return token

    def _invalidate_token(self, account_id: str) -> None:
        with self._token_lock:
            self._tokens.pop(account_id, None)
            self._save_tokens()

    # ── chat ───────────────────────────────────────────────────────

    def _chat_once(self, account: dict, prompt: str, model_type: str, thinking: bool, search: bool,
                   files: list[tuple[str, str, bytes]] | None = None) -> Iterator[dict[str, Any]]:
        account_id = str(account.get("id") or "")
        client = self._client_for(account)

        session_id = None
        token = None
        try:
            token = self._get_token(account)
            session_id = client.create_session(token)

            ref_file_ids: list[str] = []
            if files:
                for filename, content_type, content in files:
                    file_id = client.upload_and_poll(token, filename, content_type, content)
                    ref_file_ids.append(file_id)

            payload = {
                "chat_session_id": session_id,
                "parent_message_id": None,
                "model_type": model_type,
                "prompt": prompt,
                "ref_file_ids": ref_file_ids,
                "thinking_enabled": thinking,
                "search_enabled": search,
                "preempt": False,
            }
            pow_header = client.compute_pow_header(token, "/api/v0/chat/completion")
            yield from client.completion(token, pow_header, payload)
        except RuntimeError as exc:
            error = str(exc)
            lower = error.lower()
            if any(tok in lower for tok in ("rate limit", "429", "too many", "temporarily")):
                deepseek_account_service.mark_used(account_id, ok=False, error=error)
            elif any(tok in lower for tok in ("401", "unauthorized", "invalid credentials", "wrong password", "password_or_user_name_is_wrong", "account not exist", "user not found", "not logged in", "login expired")):
                deepseek_account_service.mark_used(account_id, ok=False, error=error)
                self._invalidate_token(account_id)
                self._close_client(account_id)
            raise
        finally:
            if session_id is not None:
                client.delete_session(token, session_id)

    def chat_stream(self, prompt: str, model: str, account_id: str | None = None,
                    thinking: bool = True, search: bool = False,
                    files: list[tuple[str, str, bytes]] | None = None) -> Iterator[dict[str, Any]]:
        model_type = resolve_model_type(model) or "default"
        last_error: Exception | None = None
        tried: set[str] = set()
        emitted = False
        got_content = False
        # Failover: if an account fails to authenticate (bad password, expired
        # session, rate-limit on login), _chat_once marks it and raises before
        # any streaming starts, so we transparently retry with another account.
        total_accounts = len(deepseek_account_service.list_accounts()) or 6
        for _ in range(total_accounts):
            account = self._pick_account(prefer_id=account_id)
            if account is None:
                break
            account_key = str(account.get("id") or "")
            if account_key in tried:
                continue
            tried.add(account_key)
            if account_id and account_key != account_id:
                raise RuntimeError("Requested DeepSeek account is not available")
            try:
                for event in self._chat_once(account, prompt, model_type, thinking, search, files=files):
                    emitted = True
                    kind = event.get("kind")
                    if kind in ("delta", "thoughts"):
                        got_content = True
                    yield event
            except RuntimeError as exc:
                last_error = exc
                error_lower = str(exc).lower()
                if emitted:
                    # Failure mid-stream: do not retry (would duplicate output).
                    raise
                # Mark account as unhealthy; handle specific error types
                error_msg = str(exc)
                if any(tok in error_lower for tok in ("muted", "banned", "restricted")):
                    deepseek_account_service.mark_used(account_key, ok=False, error=error_msg)
                    self._invalidate_token(account_key)
                    self._close_client(account_key)
                elif any(tok in error_lower for tok in ("rate limit", "429", "too many")):
                    deepseek_account_service.mark_used(account_key, ok=False, error=error_msg)
                elif any(tok in error_lower for tok in ("401", "unauthorized", "invalid credentials",
                                                        "wrong password", "not logged in", "login expired")):
                    deepseek_account_service.mark_used(account_key, ok=False, error=error_msg)
                    self._invalidate_token(account_key)
                    self._close_client(account_key)
                # Loop and pick the next healthy account.
                continue
            if not got_content:
                # The upstream returned zero content (e.g. a dead account that
                # accepts login but never generates text). Treat as failure and
                # fail over to the next account.
                error = "DeepSeek returned an empty response"
                last_error = RuntimeError(error)
                deepseek_account_service.mark_used(account_key, ok=False, error=error)
                continue
            deepseek_account_service.mark_used(account_key, ok=True)
            return
        if last_error is not None:
            raise RuntimeError(f"All DeepSeek accounts failed: {last_error}")
        raise RuntimeError("No available DeepSeek account")

    def chat(self, prompt: str, model: str, account_id: str | None = None,
             thinking: bool = True, search: bool = False,
             files: list[tuple[str, str, bytes]] | None = None) -> dict[str, Any]:
        thoughts: list[str] = []
        text: list[str] = []
        finish: str | None = None
        usage: int | None = None
        for item in self.chat_stream(prompt, model, account_id=account_id, thinking=thinking,
                                     search=search, files=files):
            kind = item.get("kind")
            if kind == "thoughts":
                thoughts.append(str(item.get("text") or ""))
            elif kind == "delta":
                text.append(str(item.get("text") or ""))
            elif kind == "done":
                finish = item.get("finish_reason")
                usage = item.get("accumulated_token_usage")
        result: dict[str, Any] = {
            "text": "".join(text),
            "thoughts": "".join(thoughts),
            "finish_reason": finish,
            "usage": usage,
        }
        return result

    # ── models ─────────────────────────────────────────────────────

    def list_models(self, include_catalog: bool = False) -> list[dict[str, Any]]:
        models: list[dict[str, Any]] = []
        accounts = self._accounts()
        available = any(a.get("status") in ("normal", "rate_limited") for a in accounts)
        for model_id, model_type in MODEL_ALIASES.items():
            if model_id in ("deepseek-default", "deepseek-expert", "deepseek-search"):
                continue
            models.append({
                "id": model_id,
                "object": "model",
                "created": 0,
                "owned_by": "deepseek",
                "permission": [],
                "root": model_id,
                "parent": None,
                "capabilities": _capabilities_for(model_id, model_type),
                "available": available,
                "display_name": _display_name(model_id, model_type),
            })
        return models


def _capabilities_for(model_id: str, model_type: str) -> list[str]:
    if model_type == "vision":
        return ["vision", "chat"]
    if model_type == "expert":
        return ["reasoning", "chat"]
    return ["chat"]


def _display_name(model_id: str, model_type: str) -> str:
    labels = {
        "default": "DeepSeek Chat",
        "expert": "DeepSeek Reasoner",
        "vision": "DeepSeek Vision",
    }
    return labels.get(model_type, model_id)


deepseek_provider = DeepSeekProvider()
