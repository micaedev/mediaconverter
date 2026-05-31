export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR");
}

export function formatResolution(w: number | null, h: number | null): string {
  if (!w || !h) return "—";
  return `${w}×${h}`;
}

export function formatAudio(v: {
  has_audio: boolean;
  audio_codec_label: string | null;
  audio_codec: string | null;
  audio_channels: number | null;
}): string {
  if (!v.has_audio) return "Ses yok";
  const codec = v.audio_codec_label || v.audio_codec || "Ses";
  const ch = v.audio_channels ? ` · ${v.audio_channels} kanal` : "";
  return `${codec}${ch}`;
}
