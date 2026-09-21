import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // No dev-tools badge in the corner. It sits over the bottom-left of
  // whatever is on screen — in this app, the left edge of the sidebar and,
  // when a panel is wide, the corner of a preview — and this is an
  // interface whose whole point is being looked at. Errors still arrive in
  // the terminal and in the browser console.
  devIndicators: false,
  // Loaded from node_modules at runtime rather than bundled: it ships its
  // own build of pdf.js that expects a plain Node environment.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
