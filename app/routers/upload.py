"""
File upload router — supports uploading restaurant logos and menu item photos.
Files are stored locally in the 'uploads/' directory and served as static assets.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.config import get_settings
from app.dependencies import RequireAdmin

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
    current_user: RequireAdmin,
    file: UploadFile = File(...),
):
    """
    Upload an image file (restaurant logo or dish photo).
    Uploads to Cloudinary CDN if credentials are provided in env,
    otherwise falls back to local 'uploads/' directory storage.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is missing",
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' not allowed. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum limit of 5MB",
        )

    settings = get_settings()

    # Cloudinary Cloud Object Storage Upload
    has_cloudinary_keys = (
        bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)
        or bool(settings.CLOUDINARY_URL)
    )

    if has_cloudinary_keys:
        try:
            import cloudinary
            import cloudinary.uploader

            if settings.CLOUDINARY_URL:
                os.environ["CLOUDINARY_URL"] = settings.CLOUDINARY_URL
            else:
                cloudinary.config(
                    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                    api_key=settings.CLOUDINARY_API_KEY,
                    api_secret=settings.CLOUDINARY_API_SECRET,
                    secure=True,
                )

            res = cloudinary.uploader.upload(
                contents,
                folder="apnagreenbasket_uploads",
                public_id=uuid.uuid4().hex,
                resource_type="auto",
            )
            return {
                "url": res.get("secure_url"),
                "filename": res.get("public_id"),
                "storage": "cloudinary",
            }
        except Exception as cloud_err:
            print(f"[Upload Warning] Cloudinary upload failed: {cloud_err}. Falling back to local storage.")

    # Local Disk Storage Fallback
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_filename

    with open(file_path, "wb") as f:
        f.write(contents)

    image_url = f"/uploads/{unique_filename}"
    return {"url": image_url, "filename": unique_filename, "storage": "local"}
