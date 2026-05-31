import { useCallback, useEffect, useState } from "react";
import type { Video } from "../api";
import { fetchVideos } from "../api";

export function useVideos(activePollMs = 3000, idlePollMs = 8000) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchVideos();
      setVideos(list);
      const noFile = list.filter((v) => v.status === "missing").length;
      const failed = list.filter((v) => v.status === "failed").length;
      if (noFile > 0) {
        setError(
          `${noFile} kayıt var ama dosya diskte yok. Sil ile kaldırın veya yeniden yükleyin.`,
        );
      } else if (failed > 0) {
        setError(`${failed} video dönüştürülemedi — ayrıntılar tabloda.`);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const hasActive = videos.some(
    (v) => v.status === "converting" || v.status === "pending",
  );

  useEffect(() => {
    void load();
    const ms = hasActive ? activePollMs : idlePollMs;
    const t = setInterval(() => void load(), ms);
    return () => clearInterval(t);
  }, [load, hasActive, activePollMs, idlePollMs]);

  return { videos, loading, error, setError, load, hasActive };
}
