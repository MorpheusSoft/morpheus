import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/inventario',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'inventario.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'inventario.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'inventario.morpheussoft.net',
        '*.morpheussoft.net',
        'localhost:4001',
        'localhost:4002',
        '127.0.0.1:4001',
        '127.0.0.1:4002',
      ],
    },
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/inventario',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
