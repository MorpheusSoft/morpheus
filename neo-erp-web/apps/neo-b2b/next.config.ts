import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/b2b',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'b2b.grupocatania.com',
        '*.grupocatania.com',
        'grupocatania.com',
        'b2b.qa.morpheussoft.net',
        '*.qa.morpheussoft.net',
        'b2b.morpheussoft.net',
        '*.morpheussoft.net',
        'localhost:4005',
        '127.0.0.1:4005',
      ],
    },
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/b2b',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
