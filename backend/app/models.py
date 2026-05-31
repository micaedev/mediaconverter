from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    source_filename: Mapped[str] = mapped_column(String(512))
    output_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_size: Mapped[int] = mapped_column(Integer)
    output_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_id: Mapped[str] = mapped_column(String(32), default="default")
    output_storage_id: Mapped[str] = mapped_column(String(32), default="default")
    status: Mapped[str] = mapped_column(String(32), default="uploaded")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_codec: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_codec_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_container: Mapped[str | None] = mapped_column(String(32), nullable=True)
    fps: Mapped[str | None] = mapped_column(String(32), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_audio: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_codec: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audio_codec_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audio_channels: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(256))
    container_path: Mapped[str] = mapped_column(String(1024), unique=True)
    host_path: Mapped[str] = mapped_column(String(1024))
    root_id: Mapped[str] = mapped_column(String(64))
