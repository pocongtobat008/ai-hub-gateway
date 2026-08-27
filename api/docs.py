"""Document generation API routes — generate Word, Excel, PowerPoint, PDF."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel


class GenerateDocRequest(BaseModel):
    title: str
    content: str
    format: str  # "docx", "xlsx", "pptx", "pdf"


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/docs", tags=["docs"])

    @router.post("/generate")
    def generate_document(body: GenerateDocRequest, authorization: str | None = Header(default=None)):
        """Generate a document from chat content."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            return {"error": "Unauthorized"}

        from services.doc_generator import generate_word, generate_excel, generate_powerpoint, generate_pdf

        fmt = body.format.lower()
        if fmt == "docx":
            result = generate_word(body.title, body.content)
        elif fmt == "xlsx":
            result = generate_excel(body.title, body.content)
        elif fmt == "pptx":
            result = generate_powerpoint(body.title, body.content)
        elif fmt == "pdf":
            result = generate_pdf(body.title, body.content)
        else:
            return {"error": f"Unsupported format: {fmt}"}

        return result

    @router.get("/download/{filename}")
    def download_document(filename: str, authorization: str | None = Header(default=None)):
        """Download a generated document."""
        from api.support import require_identity
        if require_identity(authorization) is None:
            raise HTTPException(status_code=401, detail="Unauthorized")

        from services.doc_generator import OUTPUT_DIR
        filepath = OUTPUT_DIR / filename
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found")

        media_types = {
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".pdf": "application/pdf",
            ".html": "text/html",
        }
        media_type = media_types.get(filepath.suffix, "application/octet-stream")

        return FileResponse(
            path=str(filepath),
            filename=filename,
            media_type=media_type,
        )

    return router
