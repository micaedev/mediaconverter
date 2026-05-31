import { useCallback, useEffect, useState } from "react";
import type { BrowseResult, StorageRoot, StorageVolume } from "../api";
import {
  browseStorage,
  createStorageLocation,
  deleteStorageLocation,
  fetchStorageRoots,
  fetchStorageVolumes,
  getPreferredOutputStorageId,
  getPreferredStorageId,
  setPreferredOutputStorageId,
  setPreferredStorageId,
} from "../api";

type Props = {
  storageId: string;
  outputStorageId: string;
  onStorageIdChange: (id: string) => void;
  onOutputStorageIdChange: (id: string) => void;
  onError: (msg: string | null) => void;
};

export default function StorageLocationSetup({
  storageId,
  outputStorageId,
  onStorageIdChange,
  onOutputStorageIdChange,
  onError,
}: Props) {
  const [volumes, setVolumes] = useState<StorageVolume[]>([]);
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [rootId, setRootId] = useState("");
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [newFolder, setNewFolder] = useState("video-converter");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardTarget, setWizardTarget] = useState<"source" | "output">("source");

  const reloadVolumes = useCallback(async () => {
    const list = await fetchStorageVolumes();
    setVolumes(list);
    const srcPref = getPreferredStorageId();
    const outPref = getPreferredOutputStorageId();
    if (list.some((v) => v.id === srcPref)) onStorageIdChange(srcPref);
    else if (list[0]) onStorageIdChange(list[0].id);
    if (list.some((v) => v.id === outPref)) onOutputStorageIdChange(outPref);
    else if (list.length > 1) onOutputStorageIdChange(list[1].id);
    else if (list[0]) onOutputStorageIdChange(list[0].id);
    return list;
  }, [onStorageIdChange, onOutputStorageIdChange]);

  useEffect(() => {
    void (async () => {
      try {
        const [vols, rts] = await Promise.all([
          fetchStorageVolumes(),
          fetchStorageRoots(),
        ]);
        setVolumes(vols);
        setRoots(rts.filter((r) => r.available));
        const srcPref = getPreferredStorageId();
        const outPref = getPreferredOutputStorageId();
        if (vols.some((v) => v.id === srcPref)) onStorageIdChange(srcPref);
        else if (vols[0]) onStorageIdChange(vols[0].id);
        if (vols.some((v) => v.id === outPref)) onOutputStorageIdChange(outPref);
        else if (vols.length > 1) onOutputStorageIdChange(vols[1].id);
        else if (vols[0]) onOutputStorageIdChange(vols[0].id);
        if (rts.length > 0)
          setRootId(rts.find((r) => r.available)?.id ?? rts[0].id);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Depolama yüklenemedi");
      }
    })();
  }, [onStorageIdChange, onOutputStorageIdChange, onError]);

  const loadBrowse = useCallback(
    async (rid: string, path: string) => {
      setBrowseLoading(true);
      try {
        const data = await browseStorage(rid, path);
        setBrowse(data);
        onError(null);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Klasör listelenemedi");
      } finally {
        setBrowseLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    if (showWizard && rootId) void loadBrowse(rootId, "");
  }, [showWizard, rootId, loadBrowse]);

  const onPickSource = (id: string) => {
    onStorageIdChange(id);
    setPreferredStorageId(id);
  };

  const onPickOutput = (id: string) => {
    onOutputStorageIdChange(id);
    setPreferredOutputStorageId(id);
  };

  const onCreateLocation = async () => {
    if (!rootId || !browse) return;
    setCreating(true);
    onError(null);
    try {
      const vol = await createStorageLocation({
        root_id: rootId,
        browse_path: browse.current_path,
        folder_name: newFolder.trim(),
        label: newLabel.trim() || newFolder.trim(),
      });
      await reloadVolumes();
      if (wizardTarget === "source") onPickSource(vol.id);
      else onPickOutput(vol.id);
      setShowWizard(false);
      setNewFolder("video-converter");
      setNewLabel("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Kayıt yeri oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  const onDeleteLocation = async (id: string) => {
    if (!confirm("Bu kayıt yerini silmek istiyor musunuz? (Klasör diskte kalır)"))
      return;
    try {
      await deleteStorageLocation(id);
      await reloadVolumes();
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Silinemedi");
    }
  };

  const selectedSource = volumes.find((v) => v.id === storageId);
  const selectedOutput = volumes.find((v) => v.id === outputStorageId);
  const availableRoots = roots.filter((r) => r.available);

  const renderGrid = (
    selected: string,
    onPick: (id: string) => void,
    name: string,
  ) => (
    <div className="storage-grid">
      {volumes.map((v) => (
        <div
          key={`${name}-${v.id}`}
          className={
            selected === v.id
              ? "storage-option-wrap storage-option-wrap-active"
              : "storage-option-wrap"
          }
        >
          <label className="storage-option">
            <input
              type="radio"
              name={name}
              checked={selected === v.id}
              onChange={() => onPick(v.id)}
            />
            <strong>{v.label}</strong>
            {v.custom && <span className="storage-custom-tag">Özel</span>}
            <span className="storage-host">PC: {v.host_path}</span>
          </label>
          {v.custom && (
            <button
              type="button"
              className="btn btn-ghost btn-tiny"
              onClick={() => void onDeleteLocation(v.id)}
            >
              Kaldır
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <section className="card">
      <h2 className="section-title">Kayıt yerleri</h2>
      <p className="help">
        Yüklenen kaynak videolar ve dönüştürülmüş çıktılar ayrı klasörlerde
        saklanır. Disklerin PC&apos;de görünmesi için{" "}
        <code>docker-compose</code> içinde mount tanımlı olmalıdır.
      </p>

      {volumes.length === 0 ? (
        <p className="empty">Kayıt yeri yükleniyor…</p>
      ) : (
        <>
          <h3 className="storage-section-label">Kaynak (yükleme) klasörü</h3>
          {renderGrid(storageId, onPickSource, "source-storage")}
          {selectedSource && (
            <p className="help">
              PC: <code>{selectedSource.host_path}</code>
            </p>
          )}

          <h3 className="storage-section-label">Çıktı klasörü</h3>
          {renderGrid(outputStorageId, onPickOutput, "output-storage")}
          {selectedOutput && (
            <p className="help">
              PC: <code>{selectedOutput.host_path}</code>
            </p>
          )}
        </>
      )}

      <div className="storage-wizard-toggle">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setWizardTarget("source");
            setShowWizard((s) => !s);
          }}
        >
          {showWizard && wizardTarget === "source"
            ? "Sihirbazı gizle"
            : "+ Kaynak klasörü oluştur"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setWizardTarget("output");
            setShowWizard(true);
          }}
        >
          + Çıktı klasörü oluştur
        </button>
      </div>

      {showWizard && (
        <div className="storage-wizard">
          <p className="help">
            Oluşturulan klasör{" "}
            <strong>
              {wizardTarget === "source" ? "kaynak (yükleme)" : "çıktı"}
            </strong>{" "}
            olarak seçilecek.
          </p>
          {availableRoots.length === 0 ? (
            <p className="error">
              Gezilebilir disk yok. .env içinde STORAGE_BROWSE_ROOTS ekleyin.
            </p>
          ) : (
            <>
              <label className="field-label">
                Disk / kök
                <select
                  value={rootId}
                  onChange={(e) => {
                    setRootId(e.target.value);
                    void loadBrowse(e.target.value, "");
                  }}
                >
                  {availableRoots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.host_path}
                    </option>
                  ))}
                </select>
              </label>

              <div className="browse-panel">
                <div className="browse-toolbar">
                  <button
                    type="button"
                    className="btn btn-ghost btn-tiny"
                    disabled={browse?.current_path === "" || browseLoading}
                    onClick={() =>
                      browse &&
                      void loadBrowse(rootId, browse.parent_path ?? "")
                    }
                  >
                    ↑ Üst
                  </button>
                  <code className="browse-path">
                    {browse?.host_display ?? "…"}
                  </code>
                </div>
                <ul className="browse-list">
                  {(browse?.entries ?? []).map((entry) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        className="browse-item"
                        onClick={() => void loadBrowse(rootId, entry.path)}
                      >
                        📁 {entry.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="field-row">
                <label className="field-label">
                  Yeni klasör adı
                  <input
                    type="text"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Panelde görünen ad
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </label>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                disabled={creating || !newFolder.trim() || browseLoading}
                onClick={() => void onCreateLocation()}
              >
                {creating ? "Oluşturuluyor…" : "Klasörü oluştur ve seç"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
