import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Expose the data directory location to the app. We store canvas state
  // OUTSIDE the project root (in /tmp/canvas-data) so Turbopack's file watcher
  // doesn't see the frequent autosave writes — otherwise every 2s save triggers
  // a Fast Refresh rebuild (~8s each), creating an infinite recompile loop that
  // freezes the dev server and makes the preview gateway report "sandbox inactive".
  env: {
    CANVAS_DATA_DIR: process.env.CANVAS_DATA_DIR || path.join("/tmp", "canvas-data"),
  },
};

export default nextConfig;
