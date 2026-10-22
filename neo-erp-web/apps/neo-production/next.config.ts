import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/produccion',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'produccion.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'produccion.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'produccion.morpheussoft.net',
        '*.morpheussoft.net',
        'localhost:4007',
        '127.0.0.1:4007',
      ],
    },
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/produccion',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
