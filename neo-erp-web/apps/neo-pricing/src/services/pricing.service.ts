import api from '@/lib/api';

export const PricingService = {
  getSessions: async (skip: number = 0, limit: number = 100) => {
    const { data } = await api.get(`/pricing-sessions/?skip=${skip}&limit=${limit}`);
    return data;
  },
  getSessionById: async (id: string | number) => {
    const { data } = await api.get(`/pricing-sessions/${id}`);
    return data;
  },
  createSession: async (payload: any) => {
    const { data } = await api.post('/pricing-sessions/', payload);
    return data;
  },
  updateSessionLine: async (sessionId: string | number, lineId: string | number, payload: any) => {
    const { data } = await api.put(`/pricing-sessions/${sessionId}/lines/${lineId}`, payload);
    return data;
  },
  applySession: async (id: string | number) => {
    const { data } = await api.post(`/pricing-sessions/${id}/apply`);
    return data;
  },
  uploadCsv: async (id: string | number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(`/pricing-sessions/${id}/upload-csv`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  },
  uploadPdf: async (id: string | number, file: File, currency?: string, exchangeRate?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    let url = `/pricing-sessions/${id}/upload-pdf`;
    const params = [];
    if (currency) params.push(`currency=${encodeURIComponent(currency)}`);
    if (exchangeRate) params.push(`exchange_rate=${exchangeRate}`);
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    const { data } = await api.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  },
  applyExchangeRate: async (id: string | number, rate: number, op: string = 'DIVIDE') => {
    const { data } = await api.post(`/pricing-sessions/${id}/apply-rate`, { rate, op });
    return data;
  },
  associateLine: async (sessionId: string | number, lineId: string | number, variantId: number) => {
    const { data } = await api.post(`/pricing-sessions/${sessionId}/lines/${lineId}/associate`, { variant_id: variantId });
    return data;
  },
  createProductFromLine: async (sessionId: string | number, lineId: string | number, payload: any) => {
    const { data } = await api.post(`/pricing-sessions/${sessionId}/lines/${lineId}/create-product`, payload);
    return data;
  },
  addSessionLine: async (id: string | number, payload: any) => {
    const { data } = await api.post(`/pricing-sessions/${id}/lines`, payload);
    return data;
  },
  bulkFilterLines: async (id: string | number, payload: any) => {
    const { data } = await api.post(`/pricing-sessions/${id}/lines/bulk-filter`, payload);
    return data;
  },
  deleteSession: async (id: string) => {
    const { data } = await api.delete(`/pricing-sessions/${id}`);
    return data;
  },
  deleteSessionLine: async (sessionId: string | number, lineId: string | number) => {
    const { data } = await api.delete(`/pricing-sessions/${sessionId}/lines/${lineId}`);
    return data;
  },
  getMetrics: async () => {
    const { data } = await api.get('/pricing-sessions/dashboard/metrics');
    return data;
  }
};
