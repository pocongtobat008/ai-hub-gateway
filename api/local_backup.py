"""Local backup management API routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse

from services.local_backup_service import local_backup_service


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/local-backup", tags=["local-backup"])

    @router.get("/list")
    def list_backups(authorization: str | None = Header(default=None)):
        """List all local backups."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        backups = local_backup_service.list_backups()
        return {"backups": backups, "total": len(backups)}

    @router.post("/create")
    def create_backup(authorization: str | None = Header(default=None)):
        """Create a new backup immediately."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        result = local_backup_service.run_backup(trigger="manual")
        return result

    @router.get("/download/{filename}")
    def download_backup(filename: str, authorization: str | None = Header(default=None)):
        """Download a backup file."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            raise HTTPException(status_code=401, detail="Unauthorized")
        path = local_backup_service.export_backup(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Backup not found")
        return FileResponse(
            path=str(path),
            filename=filename,
            media_type="application/gzip",
        )

    @router.post("/restore/{filename}")
    def restore_backup(filename: str, authorization: str | None = Header(default=None)):
        """Restore data from a backup (will overwrite current data)."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        result = local_backup_service.restore_backup(filename)
        return result

    @router.delete("/{filename}")
    def delete_backup(filename: str, authorization: str | None = Header(default=None)):
        """Delete a specific backup."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        ok = local_backup_service.delete_backup(filename)
        if not ok:
            raise HTTPException(status_code=404, detail="Backup not found")
        return {"ok": True, "deleted": filename}

    @router.get("/info/{filename}")
    def backup_info(filename: str, authorization: str | None = Header(default=None)):
        """Get metadata from a backup."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}
        info = local_backup_service.get_backup_info(filename)
        if info is None:
            raise HTTPException(status_code=404, detail="Backup not found")
        return info

    return router
