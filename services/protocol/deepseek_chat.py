"""DeepSeek chat protocol handlers (OpenAI-compatible), with tool calling.

DeepSeek's web backend has no native function calling, so tools are injected
into the prompt as natural-language instructions (see build_tools_context) and
the model replies with a <|tool▁calls▁begin|>[...]<|tool▁calls▁end|> block. This
module collects the streamed text and, when tools were requested, re-emits the
response as OpenAI-style tool_calls chunks.

With `tool_loop: true` in the request body, the server executes known built-in
tools (web_search, get_current_time, get_current_date, calculator) itself and
keeps feeding the results back until the model produces a final answer.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Iterator

from services.deepseek_provider import (
    build_deepseek_prompt,
    build_tools_context,
    deepseek_provider,
    is_deepseek_model,
    parse_tool_calls,
)
from services.protocol.openai_v1_chat_complete import (
    chat_messages_from_body,
    completion_chunk,
    completion_response,
    normalize_messages,
    normalize_text_messages,
)


def _completion_id() -> str:
    return f"chatcmpl-{uuid.uuid4().hex}"


def _account_id(body: dict[str, Any]) -> str | None:
    account_id = str(body.get("account_id") or "").strip()
    return account_id or None


def _thinking_enabled(body: dict[str, Any]) -> bool:
    effort = str(body.get("reasoning_effort") or "").strip().lower()
    if effort == "none":
        return False
    return True  # DeepSeek web defaults to thinking on


def _search_enabled(body: dict[str, Any]) -> bool:
    web = body.get("web_search_options")
    if isinstance(web, dict):
        ctx = str(web.get("search_context_size") or "").strip().lower()
        if ctx == "none":
            return False
        if web.get("enabled") is False:
            return False
        return True
    return False


def _requested_tools(body: dict[str, Any]) -> list[dict[str, Any]]:
    tools = body.get("tools")
    if not isinstance(tools, list):
        return []
    return [tool for tool in tools if isinstance(tool, dict)]


def _tool_loop_enabled(body: dict[str, Any]) -> bool:
    return bool(body.get("tool_loop") or body.get("auto_tool_loop"))


# ── Built-in tool execution for auto tool loop ───────────────────────

BUILTIN_TOOL_NAMES = {"web_search", "get_current_time", "get_current_date", "calculator"}


def _call_args(call: dict[str, Any]) -> dict[str, Any]:
    fn = call.get("function") if isinstance(call.get("function"), dict) else {}
    arguments = fn.get("arguments") or "{}"
    if isinstance(arguments, dict):
        return arguments
    try:
        parsed = json.loads(str(arguments))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _call_name(call: dict[str, Any]) -> str:
    fn = call.get("function") if isinstance(call.get("function"), dict) else {}
    return str(fn.get("name") or "")


def _safe_calc(expression: str) -> str:
    """Evaluate a simple arithmetic expression without eval()."""
    import ast
    import operator as op_mod

    allowed = {
        ast.Add: op_mod.add, ast.Sub: op_mod.sub, ast.Mult: op_mod.mul,
        ast.Div: op_mod.truediv, ast.FloorDiv: op_mod.floordiv, ast.Mod: op_mod.mod,
        ast.Pow: op_mod.pow, ast.USub: op_mod.neg, ast.UAdd: op_mod.pos,
    }

    def _eval(node: ast.AST):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise ValueError("only numbers allowed")
        if isinstance(node, ast.BinOp) and type(node.op) in allowed:
            return allowed[type(node.op)](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in allowed:
            return allowed[type(node.op)](_eval(node.operand))
        raise ValueError("unsupported expression")

    value = _eval(ast.parse(str(expression).strip(), mode="eval"))
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value)


def execute_builtin_tool(name: str, arguments: dict[str, Any]) -> str:
    """Execute a known server-side tool and return its text output.

    Raises ToolNotFoundError for unknown tools so the caller can hand them back
    to the client instead of executing them.
    """
    normalized = str(name or "").strip().lower()
    if normalized == "web_search":
        from services.protocol.web_search_tool import run_web_search, text_with_url_citations

        query = str(arguments.get("query") or arguments.get("q") or "").strip()
        if not query:
            return "web_search error: missing 'query' argument"
        result = run_web_search(query)
        text, _annotations = text_with_url_citations(result)
        return text or "No results found."
    if normalized in ("get_current_time", "current_time"):
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S %Z")
    if normalized in ("get_current_date", "current_date"):
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if normalized in ("calculator", "calculate"):
        expression = str(arguments.get("expression") or arguments.get("expr") or "").strip()
        if not expression:
            return "calculator error: missing 'expression' argument"
        try:
            return _safe_calc(expression)
        except Exception as exc:
            return f"calculator error: {exc}"
    raise ToolNotFoundError(name)


class ToolNotFoundError(Exception):
    """Raised when the model asks for a tool the server cannot execute."""

    def __init__(self, name: str) -> None:
        super().__init__(f"tool '{name}' is not available for automatic execution")
        self.name = name


def _extract_files(messages: list[dict[str, Any]]) -> list[tuple[str, str, bytes]]:
    """Extract inline base64 images into (filename, content_type, bytes) for upload."""
    import base64

    files: list[tuple[str, str, bytes]] = []
    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            part_type = str(part.get("type") or "")
            if part_type == "image_url":
                url = str((part.get("image_url") or {}).get("url") or "")
                if not url.startswith("data:"):
                    continue
                try:
                    header, data = url[len("data:"):].split(",", 1)
                    mime = header.split(";")[0] or "image/png"
                    ext = "png" if "png" in mime else ("jpg" if "jpeg" in mime else "bin")
                    raw = base64.b64decode(data)
                    files.append((f"image_{len(files) + 1}.{ext}", mime, raw))
                except Exception:
                    continue
            elif part_type in {"image", "input_image"}:
                # Normalized format: {"type": "image", "data": <bytes>, "mime": mime}
                data = part.get("data")
                if isinstance(data, (bytes, bytearray)):
                    mime = str(part.get("mime") or "image/png")
                    ext = "png" if "png" in mime else ("jpg" if "jpeg" in mime else "bin")
                    files.append((f"image_{len(files) + 1}.{ext}", mime, bytes(data)))
                else:
                    url = str(part.get("url") or "")
                    if url.startswith("data:"):
                        try:
                            header, data_str = url[len("data:"):].split(",", 1)
                            mime = header.split(";")[0] or "image/png"
                            ext = "png" if "png" in mime else ("jpg" if "jpeg" in mime else "bin")
                            files.append((f"image_{len(files) + 1}.{ext}", mime, base64.b64decode(data_str)))
                        except Exception:
                            continue
    return files


def _run_chat(body: dict[str, Any], messages: list[dict[str, Any]] | None = None) -> Iterator[dict[str, Any]]:
    """Yield provider events ({kind: thoughts|delta|done}) for the request body."""
    model = str(body.get("model") or "deepseek-chat").strip() or "deepseek-chat"
    if messages is None:
        messages = normalize_text_messages(normalize_messages(chat_messages_from_body(body)))
    tools = _requested_tools(body)
    tool_choice = body.get("tool_choice")
    tools_context = build_tools_context(tools, tool_choice)
    prompt = build_deepseek_prompt(messages, tools_context=tools_context)
    files = _extract_files(messages)
    account_id = _account_id(body)
    thinking = _thinking_enabled(body)
    search = _search_enabled(body)

    yield from deepseek_provider.chat_stream(
        prompt, model, account_id=account_id, thinking=thinking, search=search, files=files
    )


def _collect_response(body: dict[str, Any], messages: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any] | None]:
    """Run one chat turn and return (thoughts_text, full_text, tool_calls_or_None)."""
    thoughts: list[str] = []
    text_parts: list[str] = []
    for item in _run_chat(body, messages=messages):
        kind = item.get("kind")
        if kind == "thoughts":
            thoughts.append(str(item.get("text") or ""))
        elif kind == "delta":
            text_parts.append(str(item.get("text") or ""))
    full_text = "".join(text_parts)
    calls = parse_tool_calls(full_text)
    if calls is None and _looks_like_tool_call(full_text):
        calls = _recover_tool_call(full_text)
        if calls is None:
            # The model clearly tried to emit a tool call but produced
            # unparsable JSON. Do not surface the raw marker text as a final
            # answer; signal a retryable error instead.
            raise RuntimeError(
                "DeepSeek returned a malformed tool call that could not be parsed; please retry"
            )
    return "".join(thoughts), full_text, calls


def _looks_like_tool_call(text: str) -> bool:
    """Detect an unparsed tool-call marker in the model output."""
    lowered = text.lower()
    return (
        "<|tool▁calls▁begin|>" in text
        or "<|tool_calls▁begin|>" in lowered
        or "tool_calls▁begin" in lowered
    )


def _recover_tool_call(text: str) -> list[dict[str, Any]] | None:
    """Best-effort recovery when the strict parser fails but the output clearly
    contains a tool-call block (e.g. broken JSON). Returns OpenAI-style calls or
    None when recovery is not possible."""
    lowered = text.lower()
    start_markers = ("<|tool▁calls▁begin|>", "<|tool_calls▁begin|>", "<|tool▁calls▁begin|>")
    start = -1
    for marker in start_markers:
        start = text.find(marker)
        if start != -1:
            break
    if start == -1:
        idx = lowered.find("tool_calls▁begin")
        if idx == -1:
            idx = lowered.find("tool▁calls▁begin")
        if idx == -1:
            return None
        start = idx
    end_markers = ("<|tool▁calls▁end|>", "<|tool_calls▁end|>", "<|tool▁calls▁end|>")
    end = -1
    for marker in end_markers:
        end = text.find(marker, start)
        if end != -1:
            end += len(marker)
            break
    if end == -1:
        end = len(text)
    inner = text[start:end]

    # Find the JSON array / object inside the block.
    arr_start = inner.find("[")
    arr_end = inner.rfind("]")
    if arr_start != -1 and arr_end > arr_start:
        raw = inner[arr_start:arr_end + 1]
    else:
        obj_start = inner.find("{")
        obj_end = inner.rfind("}")
        if obj_start == -1 or obj_end <= obj_start:
            return None
        raw = inner[obj_start:obj_end + 1]

    def _repair_unquoted(s: str) -> str:
        """Best-effort repair of unquoted keys AND string values."""
        import re as _re

        s = _repair_json_keys(s)
        # Quote bare word values (name: calculator -> name: "calculator")
        pattern = _re.compile(r'(:\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*[,}\]])')
        s = pattern.sub(r'\1"\2"\3', s)
        # Wrap numeric-looking expressions that are actually strings (expression: 2+2)
        pattern2 = _re.compile(r'(:\s*)([0-9]+\s*[+\-*/%^][^,}\]]*)(\s*[,}\]])')
        s = pattern2.sub(r'\1"\2"\3', s)
        return s

    try:
        parsed = json.loads(raw)
    except Exception:
        from services.deepseek_provider import _repair_json_keys

        try:
            parsed = json.loads(_repair_unquoted(raw))
        except Exception:
            return None
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        return None

    calls: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("function") or "").strip()
        args = item.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                pass
        if not name:
            continue
        calls.append({
            "id": f"call_{uuid.uuid4().hex[:16]}",
            "type": "function",
            "function": {"name": name, "arguments": json.dumps(args if isinstance(args, dict) else {}, ensure_ascii=False)},
        })
    return calls or None


MAX_TOOL_LOOP_ITERATIONS = 6


def _tool_loop_messages(
    messages: list[dict[str, Any]],
    call: dict[str, Any],
    output: str,
) -> list[dict[str, Any]]:
    """Append the assistant tool call + tool output to the message list."""
    fn = call.get("function") if isinstance(call.get("function"), dict) else {}
    next_messages = list(messages)
    next_messages.append({
        "role": "assistant",
        "content": None,
        "tool_calls": [call],
    })
    next_messages.append({
        "role": "tool",
        "tool_call_id": str(call.get("id") or ""),
        "content": output,
    })
    return next_messages


def _tool_call_chunks(model: str, calls: list[dict[str, Any]], completion_id: str, created: int) -> Iterator[dict[str, Any]]:
    """Emit OpenAI streaming chunks for parsed tool calls."""
    for index, call in enumerate(calls):
        fn = call.get("function") if isinstance(call.get("function"), dict) else {}
        name = str(fn.get("name") or "")
        arguments = str(fn.get("arguments") or "{}")
        call_id = str(call.get("id") or f"call_{uuid.uuid4().hex[:16]}")
        # First chunk: id + type + function name
        yield completion_chunk(model, {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "index": index,
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": ""},
            }],
        }, None, completion_id, created)
        # Arguments in chunks (single chunk is fine for correctness)
        yield completion_chunk(model, {
            "tool_calls": [{
                "index": index,
                "function": {"arguments": arguments},
            }],
        }, None, completion_id, created)
    yield completion_chunk(model, {}, "tool_calls", completion_id, created)


def _emit_thoughts_and_text(
    model: str,
    completion_id: str,
    created: int,
    thoughts: str,
    text: str,
) -> Iterator[dict[str, Any]]:
    sent_role = False
    for thought in thoughts.split("\n"):
        if not thought:
            continue
        if not sent_role:
            yield completion_chunk(model, {"role": "assistant", "content": "", "reasoning_content": thought}, None, completion_id, created)
            sent_role = True
        else:
            yield completion_chunk(model, {"reasoning_content": thought}, None, completion_id, created)
    if text:
        if not sent_role:
            yield completion_chunk(model, {"role": "assistant", "content": text}, None, completion_id, created)
            sent_role = True
        else:
            yield completion_chunk(model, {"content": text}, None, completion_id, created)
    if not sent_role:
        yield completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)


def deepseek_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    model = str(body.get("model") or "deepseek-chat").strip() or "deepseek-chat"
    completion_id = _completion_id()
    created = int(time.time())
    tools = _requested_tools(body)

    if not tools:
        # Plain streaming path (no tools): forward deltas in real time.
        sent_role = False
        try:
            for item in _run_chat(body):
                kind = item.get("kind")
                if kind == "thoughts":
                    delta: dict[str, Any] = {"reasoning_content": item.get("text", "")}
                    if not sent_role:
                        delta = {"role": "assistant", "content": "", "reasoning_content": item.get("text", "")}
                        sent_role = True
                    yield completion_chunk(model, delta, None, completion_id, created)
                elif kind == "delta":
                    delta = {"content": item.get("text", "")}
                    if not sent_role:
                        delta = {"role": "assistant", "content": item.get("text", "")}
                        sent_role = True
                    yield completion_chunk(model, delta, None, completion_id, created)
                elif kind == "done":
                    yield completion_chunk(model, {}, item.get("finish_reason") or "stop", completion_id, created)
                    return
        except Exception as exc:
            if not sent_role:
                yield completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)
            yield completion_chunk(model, {"content": f"DeepSeek error: {exc}"}, None, completion_id, created)
            yield completion_chunk(model, {}, "stop", completion_id, created)
            return
        if not sent_role:
            yield completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)
        yield completion_chunk(model, {}, "stop", completion_id, created)
        return

    # Tool-calling path.
    if _tool_loop_enabled(body):
        # Auto tool loop: the server executes known built-in tools and feeds the
        # outputs back until the model gives a final answer (or hits the cap).
        messages = normalize_text_messages(normalize_messages(chat_messages_from_body(body)))
        try:
            for _ in range(MAX_TOOL_LOOP_ITERATIONS):
                thoughts, full_text, calls = _collect_response(body, messages)
                if not calls:
                    yield from _emit_thoughts_and_text(model, completion_id, created, thoughts, full_text)
                    yield completion_chunk(model, {}, "stop", completion_id, created)
                    return

                # Try to execute every requested tool.
                outputs: list[tuple[dict[str, Any], str]] = []
                unknown: list[dict[str, Any]] = []
                for call in calls:
                    name = _call_name(call)
                    try:
                        output = execute_builtin_tool(name, _call_args(call))
                        outputs.append((call, output))
                    except ToolNotFoundError:
                        unknown.append(call)

                # Emit the tool calls so clients can see them.
                yield from _emit_thoughts_and_text(model, completion_id, created, thoughts, "")
                yield from _tool_call_chunks(model, calls, completion_id, created)

                if unknown:
                    # Hand unknown tools back to the client (standard behavior).
                    yield completion_chunk(model, {}, "tool_calls", completion_id, created)
                    return

                # Feed results back and continue the loop.
                for call, output in outputs:
                    messages = _tool_loop_messages(messages, call, output)
            yield completion_chunk(model, {"content": "DeepSeek tool loop reached the maximum number of iterations."}, None, completion_id, created)
            yield completion_chunk(model, {}, "stop", completion_id, created)
            return
        except Exception as exc:
            yield completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)
            yield completion_chunk(model, {"content": f"DeepSeek error: {exc}"}, None, completion_id, created)
            yield completion_chunk(model, {}, "stop", completion_id, created)
            return

    # Standard tool-calling path: collect the full response, then parse.
    thoughts, full_text, calls = _collect_response(body, normalize_text_messages(normalize_messages(chat_messages_from_body(body))))
    if calls:
        # Emit reasoning first (if any), then the tool calls.
        sent_role = False
        for thought in thoughts.split("\n"):
            if not thought:
                continue
            if not sent_role:
                yield completion_chunk(model, {"role": "assistant", "content": "", "reasoning_content": thought}, None, completion_id, created)
                sent_role = True
            else:
                yield completion_chunk(model, {"reasoning_content": thought}, None, completion_id, created)
        yield from _tool_call_chunks(model, calls, completion_id, created)
        return

    # No tool call detected: fall back to plain text response.
    sent_role = False
    for thought in thoughts.split("\n"):
        if not thought:
            continue
        if not sent_role:
            yield completion_chunk(model, {"role": "assistant", "content": "", "reasoning_content": thought}, None, completion_id, created)
            sent_role = True
        else:
            yield completion_chunk(model, {"reasoning_content": thought}, None, completion_id, created)
    if full_text:
        yield completion_chunk(model, {"content": full_text}, None, completion_id, created)
    if not sent_role and not full_text:
        yield completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)
    yield completion_chunk(model, {}, "stop", completion_id, created)


def _run_tool_loop_response(
    body: dict[str, Any],
    messages: list[dict[str, Any]],
    model: str,
) -> dict[str, Any]:
    """Auto tool loop for non-streaming responses: execute built-in tools until
    the model produces a final answer, then return it (or the tool_calls when an
    unknown tool needs the client)."""
    try:
        return _run_tool_loop_response_inner(body, messages, model)
    except Exception as exc:
        return completion_response(model, f"DeepSeek error: {exc}", messages=messages)


def _run_tool_loop_response_inner(
    body: dict[str, Any],
    messages: list[dict[str, Any]],
    model: str,
) -> dict[str, Any]:
    for _ in range(MAX_TOOL_LOOP_ITERATIONS):
        thoughts, full_text, calls = _collect_response(body, messages)
        if not calls:
            response = completion_response(model, full_text, messages=messages)
            if thoughts:
                response["choices"][0]["message"]["reasoning_content"] = thoughts
            return response

        outputs: list[tuple[dict[str, Any], str]] = []
        unknown: list[dict[str, Any]] = []
        for call in calls:
            name = _call_name(call)
            try:
                output = execute_builtin_tool(name, _call_args(call))
                outputs.append((call, output))
            except ToolNotFoundError:
                unknown.append(call)

        if unknown:
            # Unknown tool: hand the calls back to the client.
            message: dict[str, Any] = {"role": "assistant", "content": None, "tool_calls": calls}
            if thoughts:
                message["reasoning_content"] = thoughts
            return {
                "id": f"chatcmpl-{uuid.uuid4().hex}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls"}],
            }

        for call, output in outputs:
            messages = _tool_loop_messages(messages, call, output)

    return completion_response(model, "DeepSeek tool loop reached the maximum number of iterations.", messages=messages)


def deepseek_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    model = str(body.get("model") or "deepseek-chat").strip() or "deepseek-chat"
    messages = normalize_text_messages(normalize_messages(chat_messages_from_body(body)))
    tools = _requested_tools(body)

    if tools and _tool_loop_enabled(body):
        return _run_tool_loop_response(body, messages, model)

    tool_choice = body.get("tool_choice")
    tools_context = build_tools_context(tools, tool_choice)
    prompt = build_deepseek_prompt(messages, tools_context=tools_context)
    files = _extract_files(messages)
    account_id = _account_id(body)
    thinking = _thinking_enabled(body)
    search = _search_enabled(body)

    try:
        result = deepseek_provider.chat(
            prompt, model, account_id=account_id, thinking=thinking, search=search, files=files
        )
    except Exception as exc:
        return completion_response(model, f"DeepSeek error: {exc}", messages=messages)

    text = str(result.get("text") or "")
    thoughts = str(result.get("thoughts") or "").strip()

    if tools:
        calls = parse_tool_calls(text)
        if calls:
            message: dict[str, Any] = {"role": "assistant", "content": None, "tool_calls": calls}
            if thoughts:
                message["reasoning_content"] = thoughts
            response = {
                "id": f"chatcmpl-{uuid.uuid4().hex}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls"}],
            }
            usage = result.get("usage")
            if usage is not None:
                response["usage"] = {
                    "prompt_tokens": 0,
                    "completion_tokens": int(usage),
                    "total_tokens": int(usage),
                }
            return response

    response = completion_response(model, text, messages=messages)
    if thoughts:
        response["choices"][0]["message"]["reasoning_content"] = thoughts
    usage = result.get("usage")
    if usage is not None:
        response["usage"] = {
            "prompt_tokens": 0,
            "completion_tokens": int(usage),
            "total_tokens": int(usage),
        }
    return response


__all__ = ["deepseek_chat_events", "deepseek_chat_response", "is_deepseek_model"]
