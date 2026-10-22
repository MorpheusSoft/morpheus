import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'hub.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'hub.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'hub.morpheussoft.net',
        '*.morpheussoft.net',
        'localhost:4000',
        '127.0.0.1:4000',
      ],
    },
  },
  async rewrites() {
    // En producción los subdominios se atienden de forma independiente por Nginx/PM2
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
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
      {
        source: '/costos',
        destination: 'http://localhost:4004/costos',
      },
      {
        source: '/costos/:path*',
        destination: 'http://localhost:4004/costos/:path*',
      },
      {
        source: '/produccion',
        destination: 'http://localhost:4007/produccion',
      },
      {
        source: '/produccion/:path*',
        destination: 'http://localhost:4007/produccion/:path*',
      },
    ];
  },
};

export default nextConfig;
