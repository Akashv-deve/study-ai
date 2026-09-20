import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.RENDER_BACKEND_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3001');
    if (!backendUrl) throw new Error('RENDER_BACKEND_URL is required in production');
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
