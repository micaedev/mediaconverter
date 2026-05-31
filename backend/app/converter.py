"""FFmpeg ile H.264 MP4 dönüştürme — kaynak FPS korunur."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from app import video_probe

logger = logging.getLogger(__name__)

_progress: dict[str, int] = {}
_active: set[str] = set()
_lock = asyncio.Lock()

_TIME_RE = re.compile(r"out_time_ms=(\d+)")


@dataclass
class ConvertOptions:
    strip_audio: bool = True
    preset: str = "medium"
    crf: int = 20


def get_progress(video_id: str) -> int:
    return _progress.get(video_id, 0)


def is_converting(video_id: str) -> bool:
    return video_id in _active


async def convert_to_h264(
    *,
    video_id: str,
    source: Path,
    output: Path,
    probe: dict,
    options: ConvertOptions,
) -> None:
    async with _lock:
        if video_id in _active:
            return
        _active.add(video_id)
        _progress[video_id] = 0

    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            output.unlink()

        duration_us = int((probe.get("duration") or 0) * 1_000_000)
        fps = probe.get("fps")
        has_audio = bool(probe.get("has_audio"))
        include_audio = has_audio and not options.strip_audio
        can_remux = (
            probe.get("is_h264")
            and probe.get("pix_fmt") in {"yuv420p", "yuvj420p"}
            and source.suffix.lower() in {".mp4", ".mov", ".mkv", ".m4v"}
            and (options.strip_audio or not has_audio or include_audio)
        )

        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
        use_progress = False

        if can_remux and not include_audio:
            cmd.extend(
                [
                    "-map",
                    "0:v:0",
                    "-c:v",
                    "copy",
                    "-movflags",
                    "+faststart",
                    "-an",
                    str(output),
                ]
            )
        elif can_remux and include_audio:
            cmd.extend(
                [
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0?",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-movflags",
                    "+faststart",
                    str(output),
                ]
            )
        else:
            cmd.extend(["-map", "0:v:0"])
            if include_audio:
                cmd.extend(["-map", "0:a:0?"])
            if fps is not None:
                cmd.extend(["-r", str(fps)])
            cmd.extend(
                [
                    "-c:v",
                    "libx264",
                    "-preset",
                    options.preset,
                    "-crf",
                    str(options.crf),
                    "-profile:v",
                    "high",
                    "-level",
                    "4.1",
                    "-pix_fmt",
                    "yuv420p",
                    "-vsync",
                    "cfr",
                    "-movflags",
                    "+faststart",
                ]
            )
            if include_audio:
                cmd.extend(["-c:a", "aac", "-b:a", "128k"])
            else:
                cmd.extend(["-an"])
            cmd.extend(["-progress", "pipe:1", "-nostats", str(output)])
            use_progress = True

        logger.info(
            "Dönüştürme id=%s remux=%s fps=%s audio=%s: %s -> %s",
            video_id,
            can_remux,
            fps,
            include_audio,
            source.name,
            output.name,
        )

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        if not use_progress:
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                err = stderr.decode(errors="replace").strip()[:500]
                raise RuntimeError(err or "Dönüştürme başarısız")
            _progress[video_id] = 100
            return

        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode(errors="replace").strip()
            match = _TIME_RE.match(text)
            if match and duration_us > 0:
                out_us = int(match.group(1))
                pct = min(99, int(out_us * 100 / duration_us))
                _progress[video_id] = 100 if pct >= 99 else pct

        stderr = await proc.stderr.read() if proc.stderr else b""
        rc = await proc.wait()
        if rc != 0:
            err = stderr.decode(errors="replace").strip()[:500]
            raise RuntimeError(err or "Dönüştürme başarısız")

        _progress[video_id] = 100
    finally:
        _active.discard(video_id)


async def probe_source(path: Path) -> dict:
    return await video_probe.probe_file(path)
