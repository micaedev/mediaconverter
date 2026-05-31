import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="landing">
      <h1 className="landing-title">Video Converter</h1>
      <p className="landing-lead">
        AVI, MOV, MKV ve diğer formatları H.264 MP4&apos;e dönüştürün. Kaynak FPS
        korunur; analiz ve akış için uygun çıktı üretilir.
      </p>

      <div className="landing-cards">
        <Link to="/convert" className="landing-card">
          <span className="landing-card-icon" aria-hidden>
            ⚙
          </span>
          <h2>Dönüştürme</h2>
          <p>
            Video yükleme, disk seçimi, H.264 dönüştürme ve kütüphane yönetimi.
          </p>
          <span className="landing-card-cta">Dönüştürmeye git →</span>
        </Link>
      </div>

      <p className="help landing-foot">
        Çıktı: <strong>H.264</strong> · <strong>MP4</strong> ·{" "}
        <strong>faststart</strong> · kaynak FPS korunur
        <br />
        Sürüm <strong>1.00</strong>
      </p>
    </div>
  );
}
