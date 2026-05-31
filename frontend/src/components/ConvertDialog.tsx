import { useState } from "react";
import type { ConvertOptions, StorageVolume, Video } from "../api";
import { startConversion } from "../api";
import { formatBytes, formatResolution } from "../utils/format";

type Props = {
  video: Video;
  outputVolumes: StorageVolume[];
  defaultOutputStorageId: string;
  onClose: () => void;
  onStarted: () => void;
  onError: (msg: string) => void;
};

const PRESETS = [
  { id: "ultrafast", label: "Ultrafast (hızlı, büyük dosya)" },
  { id: "veryfast", label: "Veryfast" },
  { id: "fast", label: "Fast" },
  { id: "medium", label: "Medium (önerilen)" },
  { id: "slow", label: "Slow (küçük dosya)" },
];

export default function ConvertDialog({
  video,
  outputVolumes,
  defaultOutputStorageId,
  onClose,
  onStarted,
  onError,
}: Props) {
  const [stripAudio, setStripAudio] = useState(true);
  const [preset, setPreset] = useState("medium");
  const [crf, setCrf] = useState(20);
  const [outputStorageId, setOutputStorageId] = useState(
    video.output_storage_id || defaultOutputStorageId,
  );
  const [starting, setStarting] = useState(false);

  const sourceLabel =
    video.source_codec_label ||
    video.source_codec?.toUpperCase() ||
    video.source_container ||
    "Bilinmiyor";
  const sourceFmt = video.source_container || "—";
  const audioText = video.has_audio
    ? `${video.audio_codec_label || video.audio_codec || "Ses"}${video.audio_channels ? ` · ${video.audio_channels} kanal` : ""}`
    : "Ses yok";

  const onStart = async () => {
    setStarting(true);
    onError("");
    try {
      const opts: ConvertOptions = {
        strip_audio: stripAudio,
        preset,
        crf,
        output_storage_id: outputStorageId,
      };
      await startConversion(video.id, opts);
      onStarted();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Dönüştürme başlatılamadı");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-labelledby="convert-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="convert-dialog-title" className="section-title">
            Dönüştürme ayarları
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="help">
          <strong>{video.title}</strong> — {formatBytes(video.source_size)}
        </p>

        <div className="convert-flow">
          <div className="convert-box convert-box-source">
            <span className="convert-box-label">Kaynak</span>
            <strong>{sourceFmt}</strong>
            <span>{sourceLabel}</span>
            <span className="help-muted">
              {video.fps ? `${video.fps} fps` : "FPS ?"} ·{" "}
              {formatResolution(video.width, video.height)}
            </span>
            <span className="help-muted">{audioText}</span>
          </div>
          <div className="convert-arrow" aria-hidden>
            →
          </div>
          <div className="convert-box convert-box-target">
            <span className="convert-box-label">Hedef</span>
            <strong>MP4</strong>
            <span>H.264 (libx264)</span>
            <span className="help-muted">FPS korunur · faststart</span>
            <span className="help-muted">
              {stripAudio || !video.has_audio ? "Ses yok" : "AAC ses"}
            </span>
          </div>
        </div>

        <div className="field-row">
          <label className="field-label">
            Çıktı klasörü
            <select
              value={outputStorageId}
              onChange={(e) => setOutputStorageId(e.target.value)}
            >
              {outputVolumes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.host_path}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Encode hızı (preset)
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field-label">
          Kalite (CRF {crf}) — düşük = daha iyi kalite, büyük dosya
          <input
            type="range"
            min={18}
            max={28}
            value={crf}
            onChange={(e) => setCrf(Number(e.target.value))}
          />
        </label>

        {video.has_audio && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={stripAudio}
              onChange={(e) => setStripAudio(e.target.checked)}
            />
            Sesi kaldır (yalnızca video)
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            İptal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={starting}
            onClick={() => void onStart()}
          >
            {starting ? "Başlatılıyor…" : "Dönüştürmeyi başlat"}
          </button>
        </div>
      </div>
    </div>
  );
}
