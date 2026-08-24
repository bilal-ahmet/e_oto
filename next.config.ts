import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // ffmpeg-static __dirname'ini bundler'da bozar (\ROOT\... ENOENT); harici tut + sharp da güvenli.
  serverExternalPackages: ['ffmpeg-static', 'sharp'],
  /**
   * Güvenlik başlıkları — hiç yoktu.
   * - X-Frame-Options: panelin başka bir sitenin iframe'ine gömülüp tıklama hırsızlığına
   *   (clickjacking) alet edilmesini engeller.
   * - X-Content-Type-Options: tarayıcının içerik tipini "tahmin etmesini" kapatır.
   * - Referrer-Policy: dış sitelere tam URL (ve içindeki id'ler) sızmasın.
   * - Permissions-Policy: kullanılmayan cihaz izinlerini baştan kapatır.
   * CSP BİLEREK YOK: Next.js'in inline script'leri için nonce altyapısı gerekir; yanlış
   * yapılandırılmış bir CSP paneli sessizce bozar. Ayrı bir iş olarak ele alınmalı.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  // Admin panel /admin altına taşındı (/ artık public marka sitesi) — eski yer imleri için güvenlik ağı.
  async redirects() {
    return [
      { source: '/generate', destination: '/admin/generate', permanent: false },
      { source: '/drafts', destination: '/admin/drafts', permanent: false },
      { source: '/competitors', destination: '/admin/competitors', permanent: false },
    ];
  },
};

export default nextConfig;
