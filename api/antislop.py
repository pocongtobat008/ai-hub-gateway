"""Anti-Slop skill: serves design rules as system prompt injection for chat."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter

SKILLS_DIR = Path("/app/skills/anti-slop")
FALLBACK_DIR = Path(__file__).resolve().parent.parent / "skills" / "anti-slop"


def _read_skill(name: str) -> str:
    """Read a skill file by name. Falls back to local dev directory."""
    for base in (SKILLS_DIR, FALLBACK_DIR):
        path = base / name
        if path.exists():
            return path.read_text(encoding="utf-8")
    return ""


def _build_antislop_prompt(skills: list[str] | None = None) -> str:
    """Build the anti-slop system prompt from core + selected skills."""
    core = _read_skill("core.md") or _read_skill("antislop/SKILL.md")
    if not core:
        return "Anti-slop rules could not be loaded."

    parts = [
        "# Anti-Slop Design Rules",
        "",
        "You MUST follow these design rules when generating UI, code, or copy.",
        "These rules prevent generic AI-generated output and ensure quality.",
        "",
        "---",
        "",
        core,
    ]

    skill_map = {
        "ui": "antislop-ui/SKILL.md",
        "copywriting": "antislop-copywriting/SKILL.md",
        "human": "antislop-human/SKILL.md",
        "mobile": "antislop-layoutmobile/SKILL.md",
        "code": "antislop-code/SKILL.md",
    }

    if skills:
        for skill_name in skills:
            skill_file = skill_map.get(skill_name)
            if skill_file:
                content = _read_skill(skill_file)
                if content:
                    parts.append("")
                    parts.append("---")
                    parts.append("")
                    parts.append(content)

    return "\n".join(parts)


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/antislop", tags=["antislop"])

    @router.get("/rules")
    async def get_rules(skills: str = "") -> dict[str, Any]:
        """Get anti-slop rules. Optional comma-separated skills: ui, copywriting, human, mobile, code."""
        skill_list = [s.strip() for s in skills.split(",") if s.strip()] if skills else None
        prompt = _build_antislop_prompt(skill_list)
        return {
            "ok": True,
            "prompt": prompt,
            "core_lines": len((_read_skill("core.md") or "").splitlines()),
            "available_skills": ["ui", "copywriting", "human", "mobile", "code"],
        }

    @router.get("/skills")
    async def list_skills() -> dict[str, Any]:
        """List available anti-slop skills."""
        available = []
        skill_info = {
            "ui": ("antislop-ui/SKILL.md", "UI / visual: layout, color, components, decoration, motion"),
            "copywriting": ("antislop-copywriting/SKILL.md", "Copy & text: headlines, CTAs, tone, anti-AI patterns"),
            "human": ("antislop-human/SKILL.md", "Accessibility: contrast, keyboard, focus, states"),
            "mobile": ("antislop-layoutmobile/SKILL.md", "Mobile layout: responsive breakpoints, grids, tap targets"),
            "code": ("antislop-code/SKILL.md", "Code comments: remove generic AI-slop comments"),
        }
        for name, (filename, desc) in skill_info.items():
            content = _read_skill(filename)
            if content:
                available.append({
                    "name": name,
                    "description": desc,
                    "lines": len(content.splitlines()),
                })
        return {"ok": True, "skills": available}

    return router
