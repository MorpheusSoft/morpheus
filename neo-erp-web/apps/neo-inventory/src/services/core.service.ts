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
};
