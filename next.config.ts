import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // ffmpeg-static __dirname'ini bundler'da bozar (\ROOT\... ENOENT); harici tut + sharp da güvenli.
  serverExternalPackages: ['ffmpeg-static', 'sharp'],
};

export default nextConfig;
