import type { NextConfig } from "next";

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",

  // Proxy mọi request /api/v1/* và /swagger/* sang Gateway (port 8080).
  // Điều này cần thiết để frontend (port 3000) giao tiếp với backend
  // mà không bị CORS block và không bị 404.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${GATEWAY_URL}/api/v1/:path*`,
      },
      {
        source: "/swagger/:path*",
        destination: `${GATEWAY_URL}/swagger/:path*`,
      },
      {
        source: "/health/:path*",
        destination: `${GATEWAY_URL}/health/:path*`,
      },
    ];
  },
};

export default nextConfig;
