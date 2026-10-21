export const MatchService = {
  getApiBaseUrl() {
    const custom = process.env.NEXT_PUBLIC_PYTHON_API_URL;
    if (custom) {
      const cleanCustom = custom.replace(/\/+$/, '');
      return cleanCustom.endsWith('/api') ? cleanCustom : `${cleanCustom}/api`;
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:8000/api';
    }
    return '/api';
  },

  async matchCandidates(order, filters = {}, topK = 5, preFilterK = 20) {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/match/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order,
          filters,
          topK,
          preFilterK
        }),
      });

      if (!response.ok) {
        throw new Error(`AI 服务请求失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message || 'AI 匹配失败');
      }

      return data.matches || [];
    } catch (error) {
      console.error('MatchService error:', error);
      if (error.name === 'TypeError' && (error.message?.includes('fetch') || error.message?.includes('NetworkError'))) {
        throw new Error('AI 匹配微服务正在冷启动唤醒或网络连接异常，请稍候重试');
      }
      throw error;
    }
  },

  async syncEmbeddings(teamId) {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/embeddings/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teamId }),
      });

      if (!response.ok) {
        throw new Error(`AI 服务同步请求失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message || '同步失败');
      }

      return data;
    } catch (error) {
      console.error('MatchService sync error:', error);
      throw error;
    }
  }
};
