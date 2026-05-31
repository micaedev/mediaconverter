# Video Converter — sürüm notları

---

## v1.00 (2026-05-31) — ilk sürüm

**Etiket:** `v1.00`

### Özet

Web arayüzü ile video yükleme, H.264 MP4 dönüştürme ve kütüphane yönetimi. Mediaserver kurulum ekranına benzer kaynak/çıktı klasör seçimi; dönüştürme otomatik değil — ayar penceresinden onaylanır.

### Özellikler

| Alan | Açıklama |
|------|----------|
| **Yükleme** | Sürükle-bırak; AVI, MOV, MKV, MP4, WebM ve diğer formatlar |
| **Kaynak analizi** | Codec (H.264, H.265…), FPS, çözünürlük, ses var/yok |
| **Dönüştürme** | H.264 MP4, kaynak FPS korunur, faststart |
| **Ayar penceresi** | Kaynak→hedef önizleme, preset, CRF, ses kaldırma |
| **Depolama** | Ayrı kaynak ve çıktı klasörü; disk sihirbazı |
| **İzinler** | Çıktı dosyaları host kullanıcısına (PUID/PGID) devredilir |
| **Stack** | FastAPI + FFmpeg + React + Docker Compose |

### Bileşenler

- **API:** `8081` — `video-converter-api`
- **Web:** `3001` — `video-converter-web`
- **Varsayılan kaynak:** `./data/videos`
- **Varsayılan çıktı:** `./data/output`

### Bilinen sınırlamalar

- Aynı anda tek video dönüştürülür (kuyruk).
- Çok büyük dosyalarda dönüştürme uzun sürebilir.
