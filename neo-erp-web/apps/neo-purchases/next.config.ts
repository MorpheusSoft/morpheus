import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/compras',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'compras.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'compras.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'compras.morpheussoft.net',
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
        destination: '/compras',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
