import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // ffmpeg-static __dirname'ini bundler'da bozar (\ROOT\... ENOENT); harici tut + sharp da güvenli.
  serverExternalPackages: ['ffmpeg-static', 'sharp'],
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
