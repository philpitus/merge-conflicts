import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the stage clean for screen recordings; compile and runtime errors still show.
  devIndicators: false,
};

export default nextConfig;
