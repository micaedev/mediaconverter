"""ffprobe ile video bilgisi — codec, çözünürlük, FPS, ses."""

from __future__ import annotations

import asyncio
import json
from fractions import Fraction
from pathlib import Path

H264_NAMES = frozenset({"h264", "avc", "avc1"})
HEVC_NAMES = frozenset({"hevc", "h265"})

CODEC_LABELS: dict[str, str] = {
    "h264": "H.264",
    "avc": "H.264",
    "avc1": "H.264",
    "hevc": "H.265 (HEVC)",
    "h265": "H.265 (HEVC)",
    "mpeg4": "MPEG-4",
    "mpeg2video": "MPEG-2",
    "vp9": "VP9",
    "vp8": "VP8",
    "av1": "AV1",
    "wmv3": "WMV3",
    "mjpeg": "MJPEG",
    "prores": "ProRes",
    "dnxhd": "DNxHD",
}

AUDIO_CODEC_LABELS: dict[str, str] = {
    "aac": "AAC",
    "mp3": "MP3",
    "ac3": "AC-3",
    "eac3": "E-AC-3",
    "opus": "Opus",
    "vorbis": "Vorbis",
    "pcm_s16le": "PCM",
    "pcm_s24le": "PCM",
}


def codec_label(codec: str | None) -> str | None:
    if not codec:
        return None
    key = codec.lower()
    return CODEC_LABELS.get(key, key.upper())


def audio_codec_label(codec: str | None) -> str | None:
    if not codec:
        return None
    key = codec.lower()
    return AUDIO_CODEC_LABELS.get(key, key.upper())


def parse_fps(rate_str: str | None) -> float | None:
    if not rate_str or rate_str in {"0/0", "N/A"}:
        return None
    try:
        value = float(Fraction(rate_str))
        if value <= 0:
            return None
        return value
    except (ValueError, ZeroDivisionError):
        return None


def format_fps(fps: float | None) -> str | None:
    if fps is None:
        return None
    if abs(fps - round(fps)) < 0.01:
        return str(int(round(fps)))
    return f"{fps:.3f}".rstrip("0").rstrip(".")


def best_fps(avg_rate: str | None, r_rate: str | None) -> float | None:
    for rate in (avg_rate, r_rate):
        fps = parse_fps(rate)
        if fps is not None:
            return fps
    return None


async def probe_file(path: Path) -> dict:
    if not path.is_file():
        return {"ok": False, "error": f"Dosya yok: {path}"}

    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,codec_type,width,height,avg_frame_rate,r_frame_rate,pix_fmt,channels,sample_rate",
        "-show_entries",
        "format=format_name,duration",
        "-of",
        "json",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode(errors="replace").strip()[:400]
        return {"ok": False, "error": err or "ffprobe başarısız"}

    try:
        data = json.loads(stdout.decode())
        streams = data.get("streams") or []
        video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
        audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
        if not video_stream:
            return {"ok": False, "error": "Video akışı bulunamadı"}

        codec = str(video_stream.get("codec_name", "")).lower()
        avg_rate = video_stream.get("avg_frame_rate")
        r_rate = video_stream.get("r_frame_rate")
        fps_value = best_fps(avg_rate, r_rate)
        duration = None
        fmt = data.get("format") or {}
        if fmt.get("duration") is not None:
            try:
                duration = float(fmt["duration"])
            except (TypeError, ValueError):
                duration = None

        pix_fmt = str(video_stream.get("pix_fmt", "")).lower()
        format_name = str(fmt.get("format_name", "")).lower()
        container = path.suffix.lstrip(".").upper() or format_name.split(",")[0].upper()

        audio_codec = None
        audio_channels = None
        has_audio = audio_stream is not None
        if audio_stream:
            audio_codec = str(audio_stream.get("codec_name", "")).lower()
            audio_channels = audio_stream.get("channels")

        return {
            "ok": True,
            "codec": codec,
            "codec_label": codec_label(codec),
            "width": video_stream.get("width"),
            "height": video_stream.get("height"),
            "fps": fps_value,
            "fps_display": format_fps(fps_value),
            "duration": duration,
            "pix_fmt": pix_fmt,
            "container": container,
            "is_h264": codec in H264_NAMES,
            "is_hevc": codec in HEVC_NAMES,
            "needs_transcode": codec not in H264_NAMES
            or pix_fmt not in {"yuv420p", "yuvj420p"},
            "has_audio": has_audio,
            "audio_codec": audio_codec,
            "audio_codec_label": audio_codec_label(audio_codec),
            "audio_channels": audio_channels,
        }
    except (json.JSONDecodeError, KeyError) as exc:
        return {"ok": False, "error": f"ffprobe çıktısı okunamadı: {exc}"}


def apply_probe_to_video(video, probe: dict) -> None:
    video.source_codec = probe.get("codec")
    video.source_codec_label = probe.get("codec_label")
    video.fps = probe.get("fps_display")
    video.width = probe.get("width")
    video.height = probe.get("height")
    video.source_container = probe.get("container")
    video.has_audio = bool(probe.get("has_audio"))
    video.audio_codec = probe.get("audio_codec")
    video.audio_codec_label = probe.get("audio_codec_label")
    video.audio_channels = probe.get("audio_channels")
