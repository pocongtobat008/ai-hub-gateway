"""Voice-over service using Edge TTS (Microsoft Neural TTS)."""
from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

DATA_DIR = Path("/app/data/voiceover") if Path("/app/data").is_dir() else Path(__file__).resolve().parent.parent / "data" / "voiceover"
DATA_DIR.mkdir(parents=True, exist_ok=True)


async def list_voices(language: str = "") -> list[dict[str, Any]]:
    """List available Edge TTS voices, optionally filtered by language prefix."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "edge-tts", "--list-voices",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        lines = stdout.decode("utf-8", errors="replace").strip().split("\n")
        
        voices = []
        for line in lines[2:]:  # Skip header + separator
            parts = line.split()
            if len(parts) >= 2:
                name = parts[0]
                gender = parts[1] if len(parts) > 1 else "Unknown"
                # Parse content categories and personalities
                content_cats = parts[2] if len(parts) > 2 else "General"
                personality = " ".join(parts[3:]) if len(parts) > 3 else ""
                
                if language and not name.lower().startswith(language.lower()):
                    continue
                
                voices.append({
                    "name": name,
                    "gender": gender,
                    "content_categories": content_cats,
                    "personality": personality,
                })
        return voices
    except Exception as e:
        return [{"error": str(e)}]


async def synthesize(
    text: str,
    voice: str = "en-US-AriaNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    volume: str = "+0%",
) -> dict[str, Any]:
    """Synthesize text to speech using Edge TTS.
    
    Returns dict with file path and metadata.
    """
    if not text.strip():
        return {"error": "Text is required"}
    
    # Create output file
    output_id = uuid.uuid4().hex[:12]
    output_file = DATA_DIR / f"{output_id}.mp3"
    
    # Build edge-tts command
    cmd = [
        "edge-tts",
        "--voice", voice,
        "--rate", rate,
        "--pitch", pitch,
        "--volume", volume,
        "--text", text,
        "--write-media", str(output_file),
    ]
    
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode != 0:
            return {"error": f"Edge TTS failed: {stderr.decode('utf-8', errors='replace')}"}
        
        if not output_file.exists():
            return {"error": "Output file not created"}
        
        file_size = output_file.stat().st_size
        
        # Get audio duration using ffprobe if available
        duration = 0
        try:
            ffprobe = await asyncio.create_subprocess_exec(
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(output_file),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            dur_out, _ = await ffprobe.communicate()
            duration = float(dur_out.decode().strip() or 0)
        except Exception:
            pass
        
        return {
            "id": output_id,
            "file": f"/api/voiceover/audio/{output_id}.mp3",
            "file_size": file_size,
            "duration": round(duration, 2),
            "voice": voice,
            "text": text[:200],
            "created_at": time.time(),
        }
    except Exception as e:
        return {"error": str(e)}


def get_audio_path(filename: str) -> Path | None:
    """Get the path to an audio file."""
    path = DATA_DIR / filename
    if path.exists():
        return path
    return None


def list_generated(limit: int = 50) -> list[dict[str, Any]]:
    """List recently generated audio files."""
    files = sorted(DATA_DIR.glob("*.mp3"), key=lambda f: f.stat().st_mtime, reverse=True)
    result = []
    for f in files[:limit]:
        result.append({
            "id": f.stem,
            "file": f"/api/voiceover/audio/{f.name}",
            "file_size": f.stat().st_size,
            "created_at": f.stat().st_mtime,
        })
    return result


def delete_audio(filename: str) -> bool:
    """Delete an audio file."""
    path = DATA_DIR / filename
    if path.exists():
        path.unlink()
        return True
    return False
