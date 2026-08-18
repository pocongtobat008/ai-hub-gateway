from __future__ import annotations

import base64
import time
import uuid
from typing import Any, Iterator

from services.config import config
from services.gemini_provider import gemini_provider, build_gemini_prompt, is_gemini_image_model
from services.protocol.conversation import save_image_bytes


def _base_url() -> str:
    return str(config.base_url or "").strip()


def _completion_chunk(model: str, delta: dict[str, Any], finish_reason: str | None, completion_id: str, created: int) -> dict[str, Any]:
    from services.protocol.openai_v1_chat_complete import completion_chunk

    return completion_chunk(model, delta, finish_reason, completion_id, created)


def _completion_response(model: str, text: str, messages: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    from services.protocol.openai_v1_chat_complete import completion_response

    return completion_response(model, text, messages=messages)


def _text_chat_parts(body: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    from services.protocol.openai_v1_chat_complete import text_chat_parts

    return text_chat_parts(body)


def _save_gemini_image(image: Any) -> str | None:
    saved = gemini_provider.save_image_sync(image)
    if not saved or not saved.get("b64_json"):
        return None
    try:
        data = base64.b64decode(saved["b64_json"])
    except Exception:
        return None
    try:
        return save_image_bytes(data, _base_url() or None)
    except Exception:
        return None


def _media_markdown(images: list[Any], videos: list[Any], media: list[Any]) -> list[str]:
    links: list[str] = []
    for image in images:
        url = _save_gemini_image(image)
        if url:
            title = str(getattr(image, "title", "") or "image").replace("\n", " ").strip()
            links.append(f"![{title}]({url})")
    for item in list(videos) + list(media):
        title = str(getattr(item, "title", "") or "media").replace("\n", " ").strip()
        url = str(getattr(item, "url", "") or getattr(item, "mp4_url", "") or "").strip()
        if url:
            links.append(f"[{title}]({url})")
    return links


def _is_deep_research(model: str) -> bool:
    normalized = str(model or "").strip().lower()
    return "deep-research" in normalized or "deep_research" in normalized


def _account_id(body: dict[str, Any]) -> str | None:
    value = str(body.get("account_id") or "").strip()
    return value or None


def gemini_chat_events(body: dict[str, Any]) -> Iterator[dict[str, Any]]:
    model, messages = _text_chat_parts(body)
    prompt, files = build_gemini_prompt(messages)
    gem = str(body.get("gem") or "").strip() or None
    account_id = _account_id(body)
    completion_id = f"chatcmpl-{uuid.uuid4().hex}"
    created = int(time.time())

    if _is_deep_research(model):
        yield _completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)
        yield _completion_chunk(model, {"content": "Preparing the deep research plan…"}, None, completion_id, created)
        try:
            result = gemini_provider.deep_research(prompt, account_id=account_id)
            report = str(result.get("report") or "No report was generated.")
            title = str(result.get("title") or "Deep research")
            text = f"# {title}\n\n{report}"
        except Exception as exc:
            text = f"Deep research failed: {exc}"
        yield _completion_chunk(model, {"content": text}, None, completion_id, created)
        yield _completion_chunk(model, {}, "stop", completion_id, created)
        return

    sent_role = False
    media_links: list[str] = []
    for item in gemini_provider.chat_stream(prompt, model, gem, files, account_id=account_id):
        kind = item.get("kind")
        if kind == "thoughts":
            delta: dict[str, Any] = {"reasoning_content": item.get("text", "")}
            if not sent_role:
                delta = {"role": "assistant", "content": "", "reasoning_content": item.get("text", "")}
                sent_role = True
            yield _completion_chunk(model, delta, None, completion_id, created)
        elif kind == "delta":
            delta = {"content": item.get("text", "")}
            if not sent_role:
                delta = {"role": "assistant", "content": item.get("text", "")}
                sent_role = True
            yield _completion_chunk(model, delta, None, completion_id, created)
        elif kind == "media":
            media_links.extend(
                _media_markdown(item.get("images") or [], item.get("videos") or [], item.get("media") or [])
            )

    if media_links:
        yield _completion_chunk(model, {"content": "\n\n" + "\n".join(media_links)}, None, completion_id, created)
    if not sent_role:
        yield _completion_chunk(model, {"role": "assistant", "content": ""}, None, completion_id, created)
    yield _completion_chunk(model, {}, "stop", completion_id, created)


def gemini_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    model, messages = _text_chat_parts(body)
    prompt, files = build_gemini_prompt(messages)
    gem = str(body.get("gem") or "").strip() or None
    account_id = _account_id(body)

    if _is_deep_research(model):
        result = gemini_provider.deep_research(prompt, account_id=account_id)
        report = str(result.get("report") or "No report was generated.")
        title = str(result.get("title") or "Deep research")
        text = f"# {title}\n\n{report}"
        return _completion_response(model, text, messages=messages)

    result = gemini_provider.chat(prompt, model, gem, files, account_id=account_id)
    text = str(result.get("text") or "")
    media_links = _media_markdown(result.get("images") or [], result.get("videos") or [], result.get("media") or [])
    if media_links:
        text = f"{text}\n\n" + "\n".join(media_links)
    response = _completion_response(model, text, messages=messages)
    thoughts = str(result.get("thoughts") or "").strip()
    if thoughts:
        response["choices"][0]["message"]["reasoning_content"] = thoughts
    return response


def gemini_image_generation_response(body: dict[str, Any]) -> dict[str, Any]:
    prompt = str(body.get("prompt") or "")
    model = str(body.get("model") or "")
    n = max(1, int(body.get("n") or 1))
    response_format = str(body.get("response_format") or "b64_json")
    account_id = _account_id(body)
    images = gemini_provider.generate_images(prompt, model, n, account_id=account_id)
    data: list[dict[str, Any]] = []
    for image in images:
        b64 = str(image.get("b64_json") or "")
        if not b64:
            continue
        revised_prompt = str(image.get("revised_prompt") or prompt).strip() or prompt
        if response_format == "url":
            try:
                data.append({
                    "url": save_image_bytes(base64.b64decode(b64), _base_url() or None),
                    "revised_prompt": revised_prompt,
                })
            except Exception:
                continue
        else:
            data.append({"b64_json": b64, "revised_prompt": revised_prompt})
    if not data:
        raise RuntimeError(
            "Image generation returned no image. This Gemini account/model may not support image generation "
            "(image-capable models such as Nano Banana require a compatible plan)."
        )
    return {"created": int(time.time()), "data": data}


def gemini_image_edit_response(prompt: str, model: str, image_files: list[bytes], account_id: str | None = None) -> dict[str, Any]:
    images = gemini_provider.generate_images(prompt, model, n=1, files=image_files, account_id=account_id)
    data: list[dict[str, Any]] = []
    for image in images:
        b64 = str(image.get("b64_json") or "")
        if not b64:
            continue
        data.append({"b64_json": b64, "revised_prompt": str(image.get("revised_prompt") or prompt) or prompt})
    return {"created": int(time.time()), "data": data}


def gemini_video_generation_response(body: dict[str, Any]) -> dict[str, Any]:
    prompt = str(body.get("prompt") or "")
    model = str(body.get("model") or "veo-3.1")
    n = max(1, int(body.get("n") or 1))
    account_id = _account_id(body)
    videos = gemini_provider.generate_videos(prompt, model, n, account_id=account_id)
    return {"created": int(time.time()), "data": videos}
