import os
from pathlib import Path

VIDEOS_DIR = Path(os.getenv("VIDEOS_DIR", "/videos"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/app.db")
_default_max = 50 * 1024 * 1024 * 1024
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(_default_max)))

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v", ".ts", ".wmv", ".flv"}
