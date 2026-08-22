"""Voice-over API routes — TTS via Edge TTS."""
from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Any, Optional

from services.voiceover_service import (
    list_voices,
    synthesize,
    get_audio_path,
    list_generated,
    delete_audio,
)
from api.support import require_identity


class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "en-US-AriaNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/voiceover", tags=["voiceover"])

    @router.get("/voices")
    async def get_voices(language: str = "", authorization: str | None = Header(default=None)):
        require_identity(authorization)
        voices = await list_voices(language)
        return {"voices": voices, "total": len(voices)}

    @router.post("/synthesize")
    async def tts_synthesize(req: SynthesizeRequest, authorization: str | None = Header(default=None)):
        require_identity(authorization)
        result = await synthesize(
            text=req.text,
            voice=req.voice,
            rate=req.rate,
            pitch=req.pitch,
            volume=req.volume,
        )
        if "error" in result:
            raise HTTPException(status_code=500, detail={"error": result["error"]})
        return result

    @router.get("/audio/{filename}")
    async def get_audio(filename: str):
        path = get_audio_path(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Audio not found")
        return FileResponse(path, media_type="audio/mpeg", filename=filename)

    @router.get("/history")
    async def get_history(authorization: str | None = Header(default=None)):
        require_identity(authorization)
        items = list_generated()
        return {"items": items, "total": len(items)}

    @router.delete("/{filename}")
    async def remove_audio(filename: str, authorization: str | None = Header(default=None)):
        require_identity(authorization)
        if not delete_audio(filename):
            raise HTTPException(status_code=404, detail="Audio not found")
        return {"ok": True}

    return router
