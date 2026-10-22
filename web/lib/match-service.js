import { authFetch } from './api-client';

export const MatchService = {
  async matchCandidates(order, filters = {}, topK = 5, preFilterK = 20, teamId = null) {
    try {
      const response = await authFetch('/api/match/candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order,
          filters,
          topK,
          preFilterK,
          teamId
        }),
      });

      if (!response.ok) {
        throw new Error(`AI 服务请求失败 / AI service request failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message || 'AI 匹配失败 / AI matching failed');
      }

      return data.matches || [];
    } catch (error) {
      console.error('MatchService error:', error);
      if (error.name === 'TypeError' && (error.message?.includes('fetch') || error.message?.includes('NetworkError'))) {
        throw new Error('AI 匹配微服务正在冷启动唤醒或网络连接异常，请稍候重试 / AI matching service is waking up or network error, please retry shortly');
      }
      throw error;
    }
  },

  async syncEmbeddings(teamId) {
    try {
      const response = await authFetch('/api/embeddings/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teamId }),
      });

      if (!response.ok) {
        throw new Error(`AI 服务同步请求失败 / AI sync request failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message || '同步失败 / Sync failed');
      }

      return data;
    } catch (error) {
      console.error('MatchService sync error:', error);
      throw error;
    }
  }
};
