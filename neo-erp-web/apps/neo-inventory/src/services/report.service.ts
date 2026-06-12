import api from '@/lib/api';

export const ReportService = {
  sendAIChat: async (message: string, history: any[] = []) => {
    const { data } = await api.post('/reports/ai-chat', { message, history });
    return data;
  },
  getKardex: async (payload: { product_ids: number[], facility_ids?: number[], location_ids?: number[], date_from?: string, date_to?: string }) => {
    const { data } = await api.post('/reports/kardex', payload);
    return data;
  }
};
