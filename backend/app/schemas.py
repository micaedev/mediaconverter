from datetime import datetime

from pydantic import BaseModel, Field


class StorageVolumeOut(BaseModel):
    id: str
    label: str
    host_path: str
    container_path: str
    custom: bool = False


class StorageRootOut(BaseModel):
    id: str
    label: str
    host_path: str
    container_path: str
    available: bool


class BrowseEntryOut(BaseModel):
    name: str
    path: str


class BrowseOut(BaseModel):
    root_id: str
    root_label: str
    current_path: str
    parent_path: str | None
    host_display: str
    entries: list[BrowseEntryOut]


class CreateStorageLocationIn(BaseModel):
    root_id: str
    browse_path: str = ""
    folder_name: str
    label: str = ""


class ConvertOptionsIn(BaseModel):
    strip_audio: bool = True
    preset: str = "medium"
    crf: int = Field(default=20, ge=18, le=28)
    output_storage_id: str | None = None


class VideoOut(BaseModel):
    id: str
    title: str
    source_filename: str
    output_filename: str | None
    source_size: int
    output_size: int | None
    storage_id: str = "default"
    storage_label: str = ""
    output_storage_id: str = "default"
    output_storage_label: str = ""
    created_at: datetime
    status: str = "uploaded"
    error_message: str | None = None
    source_codec: str | None = None
    source_codec_label: str | None = None
    source_container: str | None = None
    fps: str | None = None
    width: int | None = None
    height: int | None = None
    has_audio: bool = False
    audio_codec: str | None = None
    audio_codec_label: str | None = None
    audio_channels: int | None = None
    progress_pct: int = 0
    file_exists: bool = True
    source_exists: bool = True
    output_exists: bool = False
    thumbnail_url: str = ""
    download_url: str = ""
    target_format: str = "H.264 MP4"

    model_config = {"from_attributes": True}


class ConvertStartOut(BaseModel):
    id: str
    status: str
    message: str = ""
