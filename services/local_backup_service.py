"""Local backup service — automatic backup to local disk with rotation and compression.

Backups are stored in /app/backups/ as compressed tar.gz files.
Includes: conversations, config, accounts, auth codes, usage logs, images.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import shutil
import tarfile
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/app/backups"))
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
IMAGES_DIR = Path(os.environ.get("IMAGES_DIR", "images"))

# Files to include in backup
INCLUDE_FILES = [
    "conversations.json",
    "auth_codes.json",
    "auth_keys.json",
    "gemini_accounts.json",
    "deepseek_accounts.json",
    "grok_accounts.json",
    "opencode_accounts.json",
    "bansos_accounts.json",
    "manus_accounts.json",
    "custom_accounts.json",
    "canvas_accounts.json",
    "image_tasks.json",
    "image_tags.json",
    "usage_log.json",
    "backup_state.json",
]

# Max backups to keep
MAX_BACKUPS = 20


class LocalBackupService:
    """Automatic local backup with compression and rotation."""

    def __init__(self):
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        """Start the backup scheduler."""
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="local-backup-scheduler"
        )
        self._thread.start()
        logger.info("Local backup scheduler started")

    def stop(self) -> None:
        """Stop the backup scheduler."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Local backup scheduler stopped")

    def _run(self) -> None:
        """Run backup every 6 hours."""
        while not self._stop_event.is_set():
            try:
                self.run_backup(trigger="schedule")
            except Exception as exc:
                logger.error("Scheduled backup failed: %s", exc)
            # Sleep 6 hours (check every minute if stopped)
            for _ in range(360):
                if self._stop_event.is_set():
                    return
                time.sleep(10)

    def run_backup(self, trigger: str = "manual") -> dict[str, Any]:
        """Create a compressed backup of all data."""
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_name = f"becomeai_backup_{timestamp}.tar.gz"
        backup_path = BACKUP_DIR / backup_name

        start_time = time.time()
        file_count = 0
        total_size = 0

        try:
            with tarfile.open(backup_path, "w:gz") as tar:
                # Backup data files
                for filename in INCLUDE_FILES:
                    filepath = DATA_DIR / filename
                    if filepath.exists():
                        tar.add(filepath, arcname=f"data/{filename}")
                        file_count += 1
                        total_size += filepath.stat().st_size

                # Backup config
                config_path = Path("/app/config.json")
                if config_path.exists():
                    tar.add(config_path, arcname="config.json")
                    file_count += 1
                    total_size += config_path.stat().st_size

                # Backup images (last 100 images to save space)
                if IMAGES_DIR.exists():
                    image_files = sorted(
                        IMAGES_DIR.glob("*"),
                        key=lambda p: p.stat().st_mtime,
                        reverse=True,
                    )[:100]
                    for img in image_files:
                        if img.is_file():
                            tar.add(img, arcname=f"images/{img.name}")
                            file_count += 1
                            total_size += img.stat().st_size

                # Add metadata
                meta = {
                    "timestamp": timestamp,
                    "trigger": trigger,
                    "file_count": file_count,
                    "total_size_bytes": total_size,
                    "version": "1.0",
                }
                meta_json = json.dumps(meta, indent=2).encode("utf-8")
                import io
                meta_info = tarfile.TarInfo(name="backup_meta.json")
                meta_info.size = len(meta_json)
                tar.addfile(meta_info, io.BytesIO(meta_json))

        except Exception as exc:
            # Clean up failed backup
            if backup_path.exists():
                backup_path.unlink()
            raise RuntimeError(f"Backup failed: {exc}") from exc

        elapsed = time.time() - start_time
        compressed_size = backup_path.stat().st_size

        # Rotation: keep only MAX_BACKUPS
        self._rotate_backups()

        result = {
            "ok": True,
            "trigger": trigger,
            "filename": backup_name,
            "file_count": file_count,
            "original_size": total_size,
            "compressed_size": compressed_size,
            "compression_ratio": f"{(1 - compressed_size / max(total_size, 1)) * 100:.1f}%",
            "elapsed_seconds": round(elapsed, 2),
            "timestamp": timestamp,
        }
        logger.info("Backup completed: %s", result)
        return result

    def _rotate_backups(self) -> int:
        """Keep only MAX_BACKUPS most recent backups."""
        if not BACKUP_DIR.exists():
            return 0
        backups = sorted(
            BACKUP_DIR.glob("becomeai_backup_*.tar.gz"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        removed = 0
        for old_backup in backups[MAX_BACKUPS:]:
            old_backup.unlink()
            removed += 1
        return removed

    def list_backups(self) -> list[dict[str, Any]]:
        """List all available backups."""
        if not BACKUP_DIR.exists():
            return []
        backups = []
        for f in sorted(BACKUP_DIR.glob("becomeai_backup_*.tar.gz"), reverse=True):
            stat = f.stat()
            backups.append({
                "filename": f.name,
                "size_bytes": stat.st_size,
                "size_human": _human_size(stat.st_size),
                "created_at": time.strftime(
                    "%Y-%m-%d %H:%M:%S",
                    time.localtime(stat.st_mtime),
                ),
                "path": str(f),
            })
        return backups

    def get_backup_info(self, filename: str) -> dict[str, Any] | None:
        """Get metadata from a backup file."""
        backup_path = BACKUP_DIR / filename
        if not backup_path.exists():
            return None
        try:
            with tarfile.open(backup_path, "r:gz") as tar:
                try:
                    meta_file = tar.extractfile("backup_meta.json")
                    if meta_file:
                        return json.loads(meta_file.read())
                except KeyError:
                    pass
        except Exception:
            pass
        return {"filename": filename, "size_bytes": backup_path.stat().st_size}

    def delete_backup(self, filename: str) -> bool:
        """Delete a specific backup."""
        backup_path = BACKUP_DIR / filename
        if backup_path.exists():
            backup_path.unlink()
            return True
        return False

    def restore_backup(self, filename: str) -> dict[str, Any]:
        """Restore data from a backup file."""
        backup_path = BACKUP_DIR / filename
        if not backup_path.exists():
            raise RuntimeError(f"Backup not found: {filename}")

        restored = 0
        with tarfile.open(backup_path, "r:gz") as tar:
            for member in tar.getmembers():
                if member.name.startswith("data/"):
                    target = DATA_DIR / member.name.removeprefix("data/")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    # Extract to temp then move (atomic-ish)
                    tmp = DATA_DIR / f".restore_{member.name.removeprefix('data/')}"
                    with tar.extractfile(member) as src:
                        if src:
                            with open(tmp, "wb") as dst:
                                shutil.copyfileobj(src, dst)
                    tmp.rename(target)
                    restored += 1
                elif member.name == "config.json":
                    target = Path("/app/config.json")
                    with tar.extractfile(member) as src:
                        if src:
                            with open(target, "wb") as dst:
                                shutil.copyfileobj(src, dst)
                    restored += 1

        return {"ok": True, "restored_files": restored, "filename": filename}

    def export_backup(self, filename: str) -> Path | None:
        """Get the path for downloading a backup."""
        backup_path = BACKUP_DIR / filename
        if backup_path.exists():
            return backup_path
        return None


def _human_size(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


# Singleton
local_backup_service = LocalBackupService()
