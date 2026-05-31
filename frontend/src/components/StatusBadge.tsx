export default function StatusBadge({
  status,
  progressPct,
}: {
  status: string;
  progressPct?: number;
}) {
  if (status === "missing") {
    return <span className="badge badge-missing">Dosya yok</span>;
  }
  if (status === "converting") {
    return (
      <span className="badge badge-converting">
        Dönüştürülüyor{progressPct != null ? ` %${progressPct}` : ""}
      </span>
    );
  }
  if (status === "ready") {
    return <span className="badge badge-ready">Hazır</span>;
  }
  if (status === "failed") {
    return <span className="badge badge-failed">Hata</span>;
  }
  if (status === "uploaded") {
    return <span className="badge badge-idle">Yüklendi</span>;
  }
  if (status === "pending") {
    return <span className="badge badge-idle">Kuyrukta</span>;
  }
  return <span className="badge badge-idle">{status}</span>;
}
