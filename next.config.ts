import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: process.env.GITHUB_PAGES === "true" ? "export" : undefined,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
