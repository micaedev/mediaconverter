"""SQLite şema güncellemeleri."""

from sqlalchemy import inspect, text

from app.database import engine


def _columns(table: str) -> set[str]:
    insp = inspect(engine)
    return {c["name"] for c in insp.get_columns(table)}


def run_migrations() -> None:
    if "videos" not in inspect(engine).get_table_names():
        return

    cols = _columns("videos")
    alters: list[str] = []
    if "output_storage_id" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN output_storage_id VARCHAR(32) DEFAULT 'default'")
    if "source_codec_label" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN source_codec_label VARCHAR(64)")
    if "source_container" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN source_container VARCHAR(32)")
    if "has_audio" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN has_audio BOOLEAN DEFAULT 0")
    if "audio_codec" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN audio_codec VARCHAR(64)")
    if "audio_codec_label" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN audio_codec_label VARCHAR(64)")
    if "audio_channels" not in cols:
        alters.append("ALTER TABLE videos ADD COLUMN audio_channels INTEGER")

    if not alters:
        return

    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))
