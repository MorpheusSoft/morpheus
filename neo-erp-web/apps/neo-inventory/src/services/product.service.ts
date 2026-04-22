import api from '@/lib/api';

export const ProductService = {
  getProducts: async () => {
    const { data } = await api.get('/products/');
    return data;
  },
  getFacilities: async () => {
    const { data } = await api.get('/facilities/');
    return data;
  },
  getCategories: async () => {
    const { data } = await api.get('/categories/');
    return data;
  },
  getTributes: async () => {
    const { data } = await api.get('/tributes/');
    return data;
  },
  createProduct: async (payload: any) => {
    const { data } = await api.post('/products/', payload);
    return data;
  },
  updateProduct: async (id: string | number, payload: any) => {
    const { data } = await api.put(`/products/${id}`, payload);
    return data;
  },
  getProductById: async (id: string | number) => {
    const { data } = await api.get(`/products/${id}`);
    return data;
  },
  createVariantBatch: async (id: string | number, payload: any[]) => {
    const { data } = await api.post(`/products/${id}/variants/batch`, payload);
    return data;
  },
  syncVariantSuppliers: async (variantId: string | number, payload: any[]) => {
    const { data } = await api.put(`/products/variants/${variantId}/suppliers`, payload);
    return data;
  }
};
