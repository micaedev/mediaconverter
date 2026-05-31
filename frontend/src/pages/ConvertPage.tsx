import { useEffect, useRef, useState } from "react";
import type { StorageVolume, Video } from "../api";
import {
  deleteVideo,
  fetchStorageVolumes,
  getPreferredOutputStorageId,
  getPreferredStorageId,
  uploadVideo,
} from "../api";
import AppNav from "../components/AppNav";
import ConvertDialog from "../components/ConvertDialog";
import StorageLocationSetup from "../components/StorageLocationSetup";
import StatusBadge from "../components/StatusBadge";
import { useVideos } from "../hooks/useVideos";
import {
  formatAudio,
  formatBytes,
  formatDate,
  formatResolution,
} from "../utils/format";

export default function ConvertPage() {
  const { videos, loading, error, setError, load } = useVideos();
  const [storageId, setStorageId] = useState(getPreferredStorageId);
  const [outputStorageId, setOutputStorageId] = useState(
    getPreferredOutputStorageId,
  );
  const [volumes, setVolumes] = useState<StorageVolume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [dialogVideo, setDialogVideo] = useState<Video | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchStorageVolumes().then(setVolumes).catch(() => {});
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      await uploadVideo(file, storageId, outputStorageId, setProgress);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Bu videoyu silmek istediğinize emin misiniz?")) return;
    try {
      await deleteVideo(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
    }
  };

  const sourceCount = videos.filter((v) => v.source_exists).length;

  return (
    <>
      <AppNav />
      <header className="page-header">
        <h1>Dönüştürme</h1>
        <p className="subtitle">
          Videoları yükleyin, dönüştürme ayarlarını kontrol edin, H.264 MP4
          olarak kaydedin.
        </p>
      </header>

      <StorageLocationSetup
        storageId={storageId}
        outputStorageId={outputStorageId}
        onStorageIdChange={setStorageId}
        onOutputStorageIdChange={setOutputStorageId}
        onError={setError}
      />

      <section className="card">
        <h2 className="section-title">Video yükle</h2>
        <div
          className={`dropzone ${dragOver ? "dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mkv,.mov,.webm,.avi,.m4v,.ts,.wmv,.flv,video/*"
            disabled={uploading}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {uploading ? (
            <p>Yükleniyor… %{progress}</p>
          ) : (
            <p>
              Sürükleyin veya seçin — kaynak: <strong>{storageId}</strong> ·
              çıktı: <strong>{outputStorageId}</strong>
            </p>
          )}
        </div>
        {uploading && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <p className="help">
          Yükleme sonrası dönüştürme otomatik başlamaz. Tablodan{" "}
          <strong>Dönüştür</strong> ile ayarları onaylayın.
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Video kütüphanesi</h2>
        {loading ? (
          <p className="empty">Yükleniyor…</p>
        ) : videos.length === 0 ? (
          <p className="empty">Henüz video yok.</p>
        ) : (
          <table className="library-table">
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Kaynak bilgisi</th>
                <th>Boyut</th>
                <th>Çıktı</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => {
                const missing = v.status === "missing";
                return (
                  <tr key={v.id} className={missing ? "row-missing" : undefined}>
                    <td>
                      <strong>{v.title}</strong>
                      {missing && (
                        <p className="missing-hint">
                          Dosya yok: <code>{v.source_filename}</code>
                        </p>
                      )}
                      {v.status === "failed" && v.error_message && (
                        <p className="missing-hint">{v.error_message}</p>
                      )}
                      <p className="help-muted">{formatDate(v.created_at)}</p>
                      <p className="help-muted">
                        Kaynak: {v.storage_label} · Çıktı: {v.output_storage_label}
                      </p>
                    </td>
                    <td>
                      <dl className="meta-list">
                        <div>
                          <dt>Format</dt>
                          <dd>{v.source_container ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Codec</dt>
                          <dd>
                            {v.source_codec_label ||
                              v.source_codec?.toUpperCase() ||
                              "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>FPS</dt>
                          <dd>{v.fps ? `${v.fps} fps` : "—"}</dd>
                        </div>
                        <div>
                          <dt>Çözünürlük</dt>
                          <dd>{formatResolution(v.width, v.height)}</dd>
                        </div>
                        <div>
                          <dt>Ses</dt>
                          <dd>{formatAudio(v)}</dd>
                        </div>
                      </dl>
                    </td>
                    <td>
                      {formatBytes(v.source_size)}
                      {v.output_size != null && (
                        <>
                          <br />
                          <span className="help-muted">
                            → {formatBytes(v.output_size)}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {v.output_exists ? (
                        <span className="storage-tag">H.264 MP4</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        status={v.status}
                        progressPct={
                          v.status === "converting" ? v.progress_pct : undefined
                        }
                      />
                      {v.status === "converting" && (
                        <div className="progress progress-inline">
                          <div
                            className="progress-bar"
                            style={{ width: `${v.progress_pct}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {v.output_exists && v.download_url && (
                          <a
                            className="btn btn-primary"
                            href={v.download_url}
                            download
                          >
                            İndir
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={
                            missing ||
                            !v.source_exists ||
                            v.status === "converting"
                          }
                          onClick={() => setDialogVideo(v)}
                        >
                          {v.status === "ready" ? "Yeniden" : "Dönüştür"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => void onDelete(v.id)}
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="help">
          {sourceCount} video · Dönüştürülmüş dosyalar çıktı klasöründe{" "}
          <code>{`{id}.mp4`}</code> olarak saklanır.
        </p>
      </section>

      {dialogVideo && (
        <ConvertDialog
          video={dialogVideo}
          outputVolumes={volumes}
          defaultOutputStorageId={outputStorageId}
          onClose={() => setDialogVideo(null)}
          onStarted={() => void load()}
          onError={(msg) => setError(msg || null)}
        />
      )}
    </>
  );
}
