import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/costos',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'costos.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'costos.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'costos.morpheussoft.net',
        '*.morpheussoft.net',
        'localhost:4004',
        '127.0.0.1:4004',
      ],
    },
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/costos',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
