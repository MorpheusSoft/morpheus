import api from '@/lib/api';

export const ReportService = {
  sendAIChat: async (message: string, history: any[] = []) => {
    const { data } = await api.post('/reports/ai-chat', { message, history });
    return data;
  }
};
