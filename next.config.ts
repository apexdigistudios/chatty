import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/api/upload": [
      "./node_modules/@ffmpeg-installer/**/*",
      "./node_modules/@ffprobe-installer/**/*",
    ],
  },
  reactStrictMode: true,
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "@ffprobe-installer/ffprobe"],
};

export default nextConfig;
