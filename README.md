# MediaConverter

**Sürüm 1.00** — Web tabanlı video dönüştürme paneli. Kaynak videoları analiz eder, H.264 MP4 formatına dönüştürür; kaynak FPS korunur, çıktı akış ve analiz için uygundur.

Detaylı sürüm notları: [docs/VERSION.md](docs/VERSION.md)

---

## Özellikler

### Web arayüzü

| Özellik | Açıklama |
|---------|----------|
| **Ana sayfa** | Proje tanıtımı ve dönüştürme ekranına geçiş |
| **Dönüştürme paneli** | Video yükleme, kütüphane tablosu, dönüştürme yönetimi |
| **Kaynak / çıktı klasörü** | Yükleme ve dönüştürülmüş dosyalar için ayrı depolama seçimi |
| **Disk sihirbazı** | `/media`, `/mnt` ve ek disklerde yeni klasör oluşturma |
| **Sürükle-bırak yükleme** | İlerleme çubuğu ile çok parçalı upload |
| **Kaynak analizi** | Format, codec (H.264, H.265…), FPS, çözünürlük, ses bilgisi |
| **Dönüştürme diyaloğu** | Kaynak → hedef önizleme; preset, CRF, ses kaldırma |
| **Kütüphane tablosu** | Durum rozeti, ilerleme, indir / dönüştür / sil |

### Dönüştürme

- **Hedef format:** H.264 MP4 (`libx264` veya uyumlu kaynakta remux)
- **FPS:** Kaynak `avg_frame_rate` / `r_frame_rate` okunur; encode sırasında korunur
- **Çıktı:** `-movflags +faststart` — web akışı ve oynatıcı uyumu
- **Ses:** Varsayılan olarak kaldırılır; isteğe bağlı AAC ile korunabilir
- **Parametreler:** FFmpeg preset (ultrafast…slow), CRF 18–28
- **Otomatik başlatma yok:** Yükleme sonrası kullanıcı diyalogdan onaylar

### Desteklenen kaynak formatları

`.mp4` · `.mkv` · `.mov` · `.avi` · `.webm` · `.m4v` · `.ts` · `.wmv` · `.flv`

### Depolama

- **Kaynak klasörü:** Ham yüklenen dosyalar (`{uuid}_source.{ext}`)
- **Çıktı klasörü:** Dönüştürülmüş dosyalar (`{uuid}.mp4`)
- **Varsayılan yollar:** `./data/videos` (kaynak), `./data/output` (çıktı)
- **Özel klasörler:** Panelden oluşturulabilir; SQLite’da kayıtlı
- **Host erişimi:** Oluşturulan dosyalar `PUID`/`PGID` ile host kullanıcısına devredilir

---

## Mimari

```
┌─────────────┐     /api/*      ┌──────────────┐
│  React UI   │ ──────────────► │   FastAPI    │
│  nginx:80   │                 │  + FFmpeg    │
│  port 3001  │                 │  port 8081   │
└─────────────┘                 └──────┬───────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              ./data/videos    ./data/output      /media, /mnt
              (kaynak)         (çıktı)            (özel diskler)
```

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19, TypeScript, Vite 6, React Router 7 |
| Backend | FastAPI, SQLAlchemy 2, SQLite |
| İşleme | FFmpeg / ffprobe |
| Dağıtım | Docker Compose (api + web) |

---

## Hızlı başlangıç

```bash
git clone https://github.com/micaedev/mediaconverter.git
cd mediaconverter
cp .env.example .env
docker compose up -d --build
```

| Servis | Adres |
|--------|-------|
| Web arayüzü | http://localhost:3001 |
| API | http://localhost:8081 |
| Sağlık kontrolü | http://localhost:8081/api/health |

---

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `STORAGE_VOLUMES` | `default:/videos:…;output:/output:…` | Kaynak ve çıktı volume tanımları |
| `STORAGE_BROWSE_ROOTS` | `output`, `media`, `mnt`, `extra` | Disk gezgini kökleri |
| `MAX_UPLOAD_BYTES` | `53687091200` (~50 GB) | Yükleme boyutu limiti; `0` = sınırsız |
| `PUID` / `PGID` | `1000` | Host dosya sahipliği |

Biçim: `id:konteyner_yolu:Etiket|pc_yolu`

---

## API uç noktaları

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/health` | Durum ve sürüm |
| GET | `/api/storage/volumes` | Depolama birimleri |
| GET | `/api/storage/roots` | Gezilebilir disk kökleri |
| GET | `/api/storage/browse` | Klasör gezintisi |
| POST | `/api/storage/locations` | Yeni kayıt yeri |
| GET | `/api/videos` | Video listesi |
| POST | `/api/videos` | Video yükle (multipart) |
| POST | `/api/videos/{id}/convert` | Dönüştürme başlat (JSON ayarlar) |
| GET | `/api/videos/{id}/download` | Dönüştürülmüş MP4 indir |
| DELETE | `/api/videos/{id}` | Video ve dosyaları sil |

---

## Proje yapısı

```
mediaconverter/
├── backend/           # FastAPI + FFmpeg
│   └── app/
│       ├── main.py
│       ├── converter.py
│       ├── video_probe.py
│       ├── storage.py
│       └── permissions.py
├── frontend/          # React SPA
│   └── src/
│       ├── pages/ConvertPage.tsx
│       └── components/ConvertDialog.tsx
├── docker-compose.yml
├── VERSION            # 1.00
└── docs/VERSION.md
```

---

## Bilinen sınırlamalar (v1.00)

- Aynı anda tek video dönüştürülür.
- Çok büyük dosyalarda dönüştürme uzun sürebilir.
- Media server / canlı yayın yok — yalnızca dosya dönüştürme.

---

## Lisans

Bu proje kişisel kullanım içindir. Lisans belirtilmedi.
