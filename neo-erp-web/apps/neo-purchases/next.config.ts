import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/compras',
  async redirects() {
    return [
      {
        source: '/',
        destination: '/compras',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
