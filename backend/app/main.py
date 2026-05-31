import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import converter, models, permissions, storage, thumbnails, video_probe
from app.config import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, VIDEOS_DIR
from app.database import Base, SessionLocal, engine, get_db
from app.migrate import run_migrations
from app.schemas import (
    BrowseEntryOut,
    BrowseOut,
    ConvertOptionsIn,
    ConvertStartOut,
    CreateStorageLocationIn,
    StorageRootOut,
    StorageVolumeOut,
    VideoOut,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _source_volume(video: models.Video, db: Session) -> storage.StorageVolume:
    try:
        return storage.get_volume(video.storage_id, db)
    except KeyError:
        return storage.get_volume(storage.DEFAULT_VOLUME_ID, db)


def _output_volume(video: models.Video, db: Session) -> storage.StorageVolume:
    vid = video.output_storage_id or video.storage_id
    try:
        return storage.get_volume(vid, db)
    except KeyError:
        return _source_volume(video, db)


def _source_path(video: models.Video, db: Session) -> Path:
    return _source_volume(video, db).path / video.source_filename


def _output_path(video: models.Video, db: Session) -> Path:
    name = video.output_filename or f"{video.id}.mp4"
    return _output_volume(video, db).path / name


def _thumb_path(video: models.Video, db: Session) -> Path:
    if video.status == "ready" and _output_exists(video, db):
        return _output_path(video, db).with_suffix(".jpg")
    return _source_path(video, db).with_suffix(".jpg")


def _source_exists(video: models.Video, db: Session) -> bool:
    return _source_path(video, db).is_file()


def _output_exists(video: models.Video, db: Session) -> bool:
    return video.output_filename is not None and _output_path(video, db).is_file()


def _to_video_out(video: models.Video, db: Session) -> VideoOut:
    src_ok = _source_exists(video, db)
    out_ok = _output_exists(video, db)
    status = video.status
    if status == "converting" and not converter.is_converting(video.id):
        status = "uploaded" if src_ok else "failed"
    elif status != "converting" and not src_ok and not out_ok:
        status = "missing"
    elif status == "ready" and not out_ok:
        status = "uploaded" if src_ok else "missing"

    src_vol = _source_volume(video, db)
    out_vol = _output_volume(video, db)
    thumb = ""
    if src_ok or out_ok:
        tp = _thumb_path(video, db)
        if tp.is_file():
            thumb = f"/api/videos/{video.id}/thumbnail"

    return VideoOut(
        id=video.id,
        title=video.title,
        source_filename=video.source_filename,
        output_filename=video.output_filename,
        source_size=video.source_size,
        output_size=video.output_size,
        storage_id=src_vol.id,
        storage_label=src_vol.label,
        output_storage_id=out_vol.id,
        output_storage_label=out_vol.label,
        created_at=video.created_at,
        status=status,
        error_message=video.error_message,
        source_codec=video.source_codec,
        source_codec_label=video.source_codec_label,
        source_container=video.source_container,
        fps=video.fps,
        width=video.width,
        height=video.height,
        has_audio=bool(video.has_audio),
        audio_codec=video.audio_codec,
        audio_codec_label=video.audio_codec_label,
        audio_channels=video.audio_channels,
        progress_pct=converter.get_progress(video.id),
        file_exists=src_ok or out_ok,
        source_exists=src_ok,
        output_exists=out_ok,
        thumbnail_url=thumb,
        download_url=f"/api/videos/{video.id}/download" if out_ok else "",
    )


async def _apply_probe(video: models.Video, db: Session) -> dict:
    source = _source_path(video, db)
    probe = await converter.probe_source(source)
    if probe.get("ok"):
        video_probe.apply_probe_to_video(video, probe)
        db.commit()
    return probe


async def _run_conversion(video_id: str, options: converter.ConvertOptions) -> None:
    db = SessionLocal()
    try:
        video = db.get(models.Video, video_id)
        if not video:
            return

        source = _source_path(video, db)
        if not source.is_file():
            video.status = "failed"
            video.error_message = "Kaynak dosya bulunamadı"
            db.commit()
            return

        output_name = f"{video.id}.mp4"
        out_vol = _output_volume(video, db)
        output = out_vol.path / output_name
        out_vol.path.mkdir(parents=True, exist_ok=True)

        video.status = "converting"
        video.error_message = None
        video.output_filename = output_name
        db.commit()

        probe = await converter.probe_source(source)
        if not probe.get("ok"):
            video.status = "failed"
            video.error_message = probe.get("error", "Video analiz edilemedi")
            db.commit()
            return

        video_probe.apply_probe_to_video(video, probe)
        db.commit()

        try:
            await converter.convert_to_h264(
                video_id=video_id,
                source=source,
                output=output,
                probe=probe,
                options=options,
            )
        except Exception as exc:
            logger.exception("Dönüştürme hatası id=%s", video_id)
            video = db.get(models.Video, video_id)
            if video:
                video.status = "failed"
                video.error_message = str(exc)[:500]
                db.commit()
            return

        video = db.get(models.Video, video_id)
        if not video:
            return

        if output.is_file():
            video.status = "ready"
            video.output_size = output.stat().st_size
            video.error_message = None
            db.commit()
            permissions.fix_path_permissions(output)
            await thumbnails.generate_thumbnail(output)
        else:
            video.status = "failed"
            video.error_message = "Çıktı dosyası oluşturulamadı"
            db.commit()
    finally:
        db.close()


def _schedule_conversion(
    video_id: str,
    background: BackgroundTasks,
    options: converter.ConvertOptions,
) -> None:
    if converter.is_converting(video_id):
        return
    background.add_task(_run_conversion, video_id, options)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    db = SessionLocal()
    try:
        for vol in storage.list_volumes(db):
            permissions.fix_volume_access(vol.path)
        for root in storage.BROWSE_ROOTS.values():
            if root.path.is_dir():
                permissions.fix_volume_access(root.path)
    finally:
        db.close()
    permissions.fix_volume_access(VIDEOS_DIR)
    yield


app = FastAPI(title="Video Converter API", version="1.01", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "ffmpeg": "available", "version": "1.01"}


@app.get("/api/storage/volumes", response_model=list[StorageVolumeOut])
def list_storage_volumes(db: Session = Depends(get_db)):
    return [
        StorageVolumeOut(
            id=v.id,
            label=v.label,
            host_path=v.host_path,
            container_path=v.container_path,
            custom=v.custom,
        )
        for v in storage.list_volumes(db)
    ]


@app.get("/api/storage/roots", response_model=list[StorageRootOut])
def list_storage_roots():
    return [
        StorageRootOut(
            id=r.id,
            label=r.label,
            host_path=r.host_path,
            container_path=r.container_path,
            available=r.path.is_dir(),
        )
        for r in storage.BROWSE_ROOTS.values()
    ]


@app.get("/api/storage/browse", response_model=BrowseOut)
def browse_storage(root_id: str, path: str = ""):
    try:
        result = storage.browse_directory(root_id, path)
    except KeyError as exc:
        raise HTTPException(400, str(exc)) from exc
    except (FileNotFoundError, NotADirectoryError, ValueError, PermissionError) as exc:
        raise HTTPException(400, str(exc)) from exc

    host_display = result.host_prefix
    if result.current_path:
        host_display = f"{result.host_prefix}/{result.current_path}"

    return BrowseOut(
        root_id=result.root_id,
        root_label=result.root_label,
        current_path=result.current_path,
        parent_path=result.parent_path,
        host_display=host_display,
        entries=[BrowseEntryOut(name=e.name, path=e.path) for e in result.entries],
    )


@app.post("/api/storage/locations", response_model=StorageVolumeOut)
def create_storage_location(body: CreateStorageLocationIn, db: Session = Depends(get_db)):
    try:
        vol = storage.create_storage_location(
            db,
            root_id=body.root_id,
            browse_path=body.browse_path,
            folder_name=body.folder_name,
            label=body.label,
        )
    except KeyError as exc:
        raise HTTPException(400, str(exc)) from exc
    except (FileNotFoundError, NotADirectoryError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return StorageVolumeOut(
        id=vol.id,
        label=vol.label,
        host_path=vol.host_path,
        container_path=vol.container_path,
        custom=vol.custom,
    )


@app.delete("/api/storage/locations/{location_id}")
def delete_storage_location(location_id: str, db: Session = Depends(get_db)):
    try:
        storage.delete_storage_location(db, location_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


@app.get("/api/videos", response_model=list[VideoOut])
def list_videos(db: Session = Depends(get_db)):
    rows = db.query(models.Video).order_by(models.Video.created_at.desc()).all()
    dirty = False
    for video in rows:
        if video.source_codec and not video.source_codec_label:
            video.source_codec_label = video_probe.codec_label(video.source_codec)
            dirty = True
        if not video.source_container and video.source_filename:
            ext = Path(video.source_filename).suffix.lstrip(".").upper()
            if ext:
                video.source_container = ext
                dirty = True
    if dirty:
        db.commit()
    return [_to_video_out(v, db) for v in rows]


@app.post("/api/videos", response_model=VideoOut)
async def upload_video(
    file: UploadFile = File(...),
    storage_id: str = Form("default"),
    output_storage_id: str = Form("default"),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "Dosya adı yok")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Desteklenmeyen uzantı: {ext}. İzin verilen: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    try:
        vol = storage.get_volume(storage_id, db)
        out_vol = storage.get_volume(output_storage_id, db)
    except KeyError as exc:
        raise HTTPException(400, str(exc)) from exc

    vid = str(uuid.uuid4())
    source_name = f"{vid}_source{ext}"
    dest = vol.path / source_name
    vol.path.mkdir(parents=True, exist_ok=True)
    out_vol.path.mkdir(parents=True, exist_ok=True)

    total = 0
    chunk_size = 1024 * 1024
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if MAX_UPLOAD_BYTES > 0 and total > MAX_UPLOAD_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        413,
                        f"Dosya çok büyük (limit: {MAX_UPLOAD_BYTES // (1024**3)} GB)",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Yazma hatası: {exc}") from exc

    os.chmod(dest, 0o644)
    permissions.fix_path_permissions(dest)
    title = Path(file.filename).stem

    row = models.Video(
        id=vid,
        title=title,
        source_filename=source_name,
        source_size=total,
        storage_id=vol.id,
        output_storage_id=out_vol.id,
        status="uploaded",
        source_container=ext.lstrip(".").upper(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    await _apply_probe(row, db)
    await thumbnails.generate_thumbnail(dest)
    db.refresh(row)

    return _to_video_out(row, db)


@app.post("/api/videos/{video_id}/convert", response_model=ConvertStartOut)
def start_conversion(
    video_id: str,
    body: ConvertOptionsIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")
    if not _source_exists(video, db):
        raise HTTPException(404, "Kaynak dosya bulunamadı")
    if converter.is_converting(video_id):
        return ConvertStartOut(id=video_id, status="converting", message="Zaten dönüştürülüyor")

    if body.output_storage_id:
        try:
            storage.get_volume(body.output_storage_id, db)
            video.output_storage_id = body.output_storage_id
        except KeyError as exc:
            raise HTTPException(400, str(exc)) from exc

    video.status = "pending"
    video.error_message = None
    db.commit()

    options = converter.ConvertOptions(
        strip_audio=body.strip_audio,
        preset=body.preset,
        crf=body.crf,
    )
    _schedule_conversion(video_id, background, options)
    return ConvertStartOut(id=video_id, status="pending", message="Dönüştürme başlatıldı")


@app.post("/api/videos/convert-all")
def convert_all(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    rows = db.query(models.Video).all()
    count = 0
    options = converter.ConvertOptions()
    for video in rows:
        if not _source_exists(video, db):
            continue
        if video.status in {"converting", "ready"}:
            continue
        if converter.is_converting(video.id):
            continue
        video.status = "pending"
        video.error_message = None
        count += 1
        _schedule_conversion(video.id, background, options)
    db.commit()
    return {"queued": count}


@app.delete("/api/videos/{video_id}")
def delete_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")

    paths = [
        _source_path(video, db),
        _source_path(video, db).with_suffix(".jpg"),
    ]
    if video.output_filename:
        paths.extend(
            [
                _output_path(video, db),
                _output_path(video, db).with_suffix(".jpg"),
            ]
        )
    for path in paths:
        if path.is_file():
            path.unlink()

    db.delete(video)
    db.commit()
    return {"ok": True}


@app.get("/api/videos/{video_id}/download")
def download_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")
    path = _output_path(video, db)
    if not path.is_file():
        raise HTTPException(404, "Dönüştürülmüş dosya henüz hazır değil")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"{video.title}.mp4",
    )


@app.get("/api/videos/{video_id}/thumbnail")
def video_thumbnail(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")
    path = _thumb_path(video, db)
    if not path.is_file():
        raise HTTPException(404, "Önizleme yok")
    return FileResponse(path, media_type="image/jpeg")
