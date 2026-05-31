"""Bind mount üzerindeki dosyaların host kullanıcısı tarafından erişilebilir olması."""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def host_uid() -> int:
    return int(os.getenv("PUID", "1000"))


def host_gid() -> int:
    return int(os.getenv("PGID", "1000"))


def fix_path_permissions(path: Path, *, is_dir: bool | None = None) -> None:
    if not path.exists():
        return
    is_directory = is_dir if is_dir is not None else path.is_dir()
    mode = 0o777 if is_directory else 0o666
    try:
        os.chmod(path, mode)
        os.chown(path, host_uid(), host_gid())
    except OSError as exc:
        logger.debug("İzin güncellenemedi %s: %s", path, exc)


def fix_volume_access(path: Path) -> None:
    """Klasör ve içindeki dosyaları host kullanıcısına aç."""
    path.mkdir(parents=True, exist_ok=True)
    fix_path_permissions(path, is_dir=True)
    try:
        for child in path.iterdir():
            fix_path_permissions(child)
    except OSError as exc:
        logger.debug("Volume taraması başarısız %s: %s", path, exc)
