import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-expect-error — campo válido en runtime aunque el tipo lo omita en esta versión
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
