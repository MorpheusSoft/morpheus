import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/wms',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'logistica.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'logistica.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'logistica.morpheussoft.net',
        '*.morpheussoft.net',
        'localhost:4003',
        '127.0.0.1:4003',
      ],
    },
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/wms',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
