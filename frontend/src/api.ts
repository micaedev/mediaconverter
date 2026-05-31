export type StorageVolume = {
  id: string;
  label: string;
  host_path: string;
  container_path: string;
  custom: boolean;
};

export type StorageRoot = {
  id: string;
  label: string;
  host_path: string;
  container_path: string;
  available: boolean;
};

export type BrowseEntry = { name: string; path: string };

export type BrowseResult = {
  root_id: string;
  root_label: string;
  current_path: string;
  parent_path: string | null;
  host_display: string;
  entries: BrowseEntry[];
};

export type Video = {
  id: string;
  title: string;
  source_filename: string;
  output_filename: string | null;
  source_size: number;
  output_size: number | null;
  storage_id: string;
  storage_label: string;
  output_storage_id: string;
  output_storage_label: string;
  created_at: string;
  status: string;
  error_message: string | null;
  source_codec: string | null;
  source_codec_label: string | null;
  source_container: string | null;
  fps: string | null;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  audio_codec: string | null;
  audio_codec_label: string | null;
  audio_channels: number | null;
  progress_pct: number;
  file_exists: boolean;
  source_exists: boolean;
  output_exists: boolean;
  thumbnail_url: string;
  download_url: string;
  target_format: string;
};

export type ConvertOptions = {
  strip_audio: boolean;
  preset: string;
  crf: number;
  output_storage_id?: string;
};

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "object" && item && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return String(item);
      })
      .join("; ");
  }
  return fallback;
}

const SOURCE_STORAGE_KEY = "videoconverter.storage_id";
const OUTPUT_STORAGE_KEY = "videoconverter.output_storage_id";

export function getPreferredStorageId(): string {
  return localStorage.getItem(SOURCE_STORAGE_KEY) || "default";
}

export function setPreferredStorageId(id: string): void {
  localStorage.setItem(SOURCE_STORAGE_KEY, id);
}

export function getPreferredOutputStorageId(): string {
  return localStorage.getItem(OUTPUT_STORAGE_KEY) || "output";
}

export function setPreferredOutputStorageId(id: string): void {
  localStorage.setItem(OUTPUT_STORAGE_KEY, id);
}

export async function fetchStorageVolumes(): Promise<StorageVolume[]> {
  const res = await fetch("/api/storage/volumes");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Depolama listesi alınamadı"));
  }
  return res.json();
}

export async function fetchStorageRoots(): Promise<StorageRoot[]> {
  const res = await fetch("/api/storage/roots");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Disk listesi alınamadı"));
  }
  return res.json();
}

export async function browseStorage(
  rootId: string,
  path = "",
): Promise<BrowseResult> {
  const q = new URLSearchParams({ root_id: rootId, path });
  const res = await fetch(`/api/storage/browse?${q}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Klasör gezilemedi"));
  }
  return res.json();
}

export async function createStorageLocation(body: {
  root_id: string;
  browse_path: string;
  folder_name: string;
  label: string;
}): Promise<StorageVolume> {
  const res = await fetch("/api/storage/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(parseApiError(data, "Kayıt yeri oluşturulamadı"));
  }
  return res.json();
}

export async function deleteStorageLocation(id: string): Promise<void> {
  const res = await fetch(`/api/storage/locations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Kayıt yeri silinemedi"));
  }
}

export async function fetchVideos(): Promise<Video[]> {
  const res = await fetch("/api/videos");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Video listesi alınamadı"));
  }
  return res.json();
}

export async function uploadVideo(
  file: File,
  storageId: string,
  outputStorageId: string,
  onProgress?: (pct: number) => void,
): Promise<Video> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("storage_id", storageId);
    form.append("output_storage_id", outputStorageId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = `Yükleme başarısız (HTTP ${xhr.status})`;
        try {
          msg = parseApiError(JSON.parse(xhr.responseText), msg);
        } catch {
          if (xhr.responseText) msg = xhr.responseText.slice(0, 300);
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Ağ hatası — API veya web servisi çalışıyor mu?"));
    xhr.open("POST", "/api/videos");
    xhr.send(form);
  });
}

export async function startConversion(
  id: string,
  options: ConvertOptions,
): Promise<void> {
  const res = await fetch(`/api/videos/${id}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Dönüştürme başlatılamadı"));
  }
}

export async function convertAll(): Promise<void> {
  const res = await fetch("/api/videos/convert-all", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Toplu dönüştürme başarısız"));
  }
}

export async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Silme başarısız"));
  }
}
