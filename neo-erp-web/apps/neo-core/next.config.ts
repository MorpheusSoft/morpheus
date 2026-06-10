import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['hub.qa.morpheussoft.net', '*.qa.morpheussoft.net', 'localhost:4000', '127.0.0.1:4000'],
    },
  },
  async rewrites() {
    return [
      {
        source: '/inventario',
        destination: 'http://localhost:4001/inventario',
      },
      {
        source: '/inventario/:path*',
        destination: 'http://localhost:4001/inventario/:path*',
      },
      {
        source: '/compras',
        destination: 'http://localhost:4002/compras',
      },
      {
        source: '/compras/:path*',
        destination: 'http://localhost:4002/compras/:path*',
      },
      {
        source: '/wms',
        destination: 'http://localhost:4003/wms',
      },
      {
        source: '/wms/:path*',
        destination: 'http://localhost:4003/wms/:path*',
      },
    ];
  },
};

export default nextConfig;
