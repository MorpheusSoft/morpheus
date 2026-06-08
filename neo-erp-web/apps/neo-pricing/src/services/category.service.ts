import api from '@/lib/api';

export const CategoryService = {
  getTree: async () => {
    const { data } = await api.get('/categories/tree');
    return data;
  },
  getList: async () => {
    const { data } = await api.get('/categories');
    return data;
  },
  create: async (payload: any) => {
    const { data } = await api.post('/categories', payload);
    return data;
  },
  update: async (id: number, payload: any) => {
    const { data } = await api.put(`/categories/${id}`, payload);
    return data;
  }
};
