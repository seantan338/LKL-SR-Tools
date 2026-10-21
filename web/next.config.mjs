/** @type {import('next').NextConfig} */

// 统一规范 AI 后端地址：去掉结尾多余的 "/" 和 "/api"，
// 否则前端拼接 `${url}/api/...` 会变成 "//api/..." 或 "/api/api/..."，后端返回 404
const pythonApiUrl = (process.env.PYTHON_API_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

const nextConfig = {
  env: {
    NEXT_PUBLIC_PYTHON_API_URL: pythonApiUrl,
  },
  async rewrites() {
    // If deployed on Render/Vercel, point to the live Python API URL, otherwise fallback to local
    const destinationBase = pythonApiUrl || 'http://127.0.0.1:8000';

    return [
      {
        source: '/api/:path*',
        destination: `${destinationBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
