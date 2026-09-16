import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Loaded from node_modules at runtime rather than bundled: it ships its
  // own build of pdf.js that expects a plain Node environment.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
