import api from '@/lib/api';

export const CoreService = {
  getCompanies: async () => {
    const { data } = await api.get('/companies/');
    return data;
  },
  createCompany: async (payload: any) => {
    const { data } = await api.post('/companies/', payload);
    return data;
  },
  getCurrencies: async () => {
    const { data } = await api.get('/currencies/');
    return data;
  },
  createCurrency: async (payload: any) => {
    const { data } = await api.post('/currencies/', payload);
    return data;
  },
  getFacilities: async () => {
    const { data } = await api.get('/facilities/');
    return data;
  },
  createFacility: async (payload: any) => {
    const { data } = await api.post('/facilities/', payload);
    return data;
  },
  updateFacility: async (id: number, payload: any) => {
    const { data } = await api.put(`/facilities/${id}`, payload);
    return data;
  },
  
  // WAREHOUSES
  getWarehouses: async () => {
    const { data } = await api.get('/warehouses/');
    return data;
  },
  createWarehouse: async (payload: any) => {
    const { data } = await api.post('/warehouses/', payload);
    return data;
  },
  updateWarehouse: async (id: number, payload: any) => {
    const { data } = await api.put(`/warehouses/${id}`, payload);
    return data;
  },
  deleteWarehouse: async (id: number) => {
    const { data } = await api.delete(`/warehouses/${id}`);
    return data;
  },

  // LOCATIONS
  getLocations: async (params?: { warehouse_id?: number, usage?: string, type?: string }) => {
    const { data } = await api.get('/locations/', { params });
    return data;
  },
  createLocation: async (payload: any) => {
    const { data } = await api.post('/locations/', payload);
    return data;
  },
  updateLocation: async (id: number, payload: any) => {
    const { data } = await api.put(`/locations/${id}`, payload);
    return data;
  },
  deleteLocation: async (id: number) => {
    const { data } = await api.delete(`/locations/${id}`);
    return data;
  },
};
