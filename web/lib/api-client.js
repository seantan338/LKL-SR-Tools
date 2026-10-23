import { auth } from './firebase';

/**
 * 统一解析 Python AI 后端 URL
 * @param {string} path 以 /api/... 开头的路径
 */
export function getAiBackendUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const custom = (process.env.NEXT_PUBLIC_PYTHON_API_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (custom) {
    return `${custom}${normalizedPath}`;
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `http://localhost:8000${normalizedPath}`;
  }
  return normalizedPath;
}

/**
 * 自动携带 Firebase ID Token 的安全 fetch 封装
 * @param {string} pathOrUrl 相对路径（如 '/api/parse/cv'）或完整 URL
 * @param {RequestInit} options 标准 fetch 配置项
 */
export async function authFetch(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
    ? pathOrUrl
    : getAiBackendUrl(pathOrUrl);

  const headers = new Headers(options.headers || {});

  if (auth?.currentUser && typeof auth.currentUser.getIdToken === 'function') {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (err) {
      console.warn('[authFetch] 获取 Firebase ID Token 失败:', err);
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
