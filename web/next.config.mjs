/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_PYTHON_API_URL: process.env.PYTHON_API_URL || '',
  },
  async rewrites() {
    // If deployed on Render/Vercel, point to the live Python API URL, otherwise fallback to local
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    
    return [
      {
        source: '/api/:path*',
        destination: `${pythonApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
