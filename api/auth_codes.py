"""Auth code management API routes."""
from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Any

from services.auth_code_service import (
    generate_code,
    list_codes,
    delete_code,
    toggle_code,
    reset_code,
    get_stats,
)
from api.support import require_admin


class GenerateCodeRequest(BaseModel):
    role: str = "user"
    name: str = ""
    max_uses: int = 0
    expires_in_hours: int = 0


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/auth-codes", tags=["auth-codes"])

    @router.get("/stats")
    async def stats(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return get_stats()

    @router.get("/list")
    async def get_codes(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        codes = list_codes()
        return {"codes": codes, "total": len(codes)}

    @router.post("/generate")
    async def gen_code(req: GenerateCodeRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        if req.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
        result = generate_code(
            role=req.role,
            name=req.name,
            max_uses=req.max_uses,
            expires_in_hours=req.expires_in_hours,
        )
        return result

    @router.delete("/{code_id}")
    async def remove_code(code_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        if not delete_code(code_id):
            raise HTTPException(status_code=404, detail="Code not found")
        return {"ok": True}

    @router.post("/{code_id}/toggle")
    async def toggle(code_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        from services.auth_code_service import list_codes
        codes = list_codes()
        code = next((c for c in codes if c["id"] == code_id), None)
        if not code:
            raise HTTPException(status_code=404, detail="Code not found")
        new_enabled = not code["enabled"]
        toggle_code(code_id, new_enabled)
        return {"ok": True, "enabled": new_enabled}

    @router.post("/{code_id}/reset")
    async def reset(code_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        if not reset_code(code_id):
            raise HTTPException(status_code=404, detail="Code not found")
        return {"ok": True}

    return router
