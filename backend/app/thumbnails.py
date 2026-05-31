from pathlib import Path

import asyncio

from app import permissions


async def generate_thumbnail(video: Path) -> Path | None:
    thumb = video.with_suffix(".jpg")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video),
        "-frames:v",
        "1",
        "-q:v",
        "4",
        "-vf",
        "scale=192:-1",
        str(thumb),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0 or not thumb.is_file():
        return None
    permissions.fix_path_permissions(thumb)
    return thumb
