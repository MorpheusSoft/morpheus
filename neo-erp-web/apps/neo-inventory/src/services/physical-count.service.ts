import api from '@/lib/api';

export const PhysicalCountService = {
  getSessions: async (skip: number = 0, limit: number = 100) => {
    const { data } = await api.get(`/inventory-session/?skip=${skip}&limit=${limit}`);
    return data;
  },
  
  getSession: async (id: number) => {
    const { data } = await api.get(`/inventory-session/${id}`);
    return data;
  },
  
  createSession: async (payload: { name: string; facility_id?: number; warehouse_id?: number; scope_type: string; scope_value?: string }) => {
    const { data } = await api.post('/inventory-session/', payload);
    return data;
  },
  
  uploadLinesBulk: async (id: number, lines: Array<{ sku: string; location_code: string; counted_qty: number; notes?: string; cost?: number }>) => {
    const { data } = await api.post(`/inventory-session/${id}/lines/bulk`, { lines });
    return data;
  },
  
  validateSession: async (id: number) => {
    const { data } = await api.post(`/inventory-session/${id}/validate`);
    return data;
  }
};
