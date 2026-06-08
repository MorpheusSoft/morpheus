import api from '@/lib/api';

export const ProductService = {
  getProducts: async (skip: number = 0, limit: number = 10, q?: string, category_ids?: number[], supplier_ids?: number[]) => {
    const params = new URLSearchParams({ skip: skip.toString(), limit: limit.toString() });
    if (q) params.append("q", q);
    if (category_ids && category_ids.length > 0) {
      category_ids.forEach(id => params.append("category_ids", id.toString()));
    }
    if (supplier_ids && supplier_ids.length > 0) {
      supplier_ids.forEach(id => params.append("supplier_ids", id.toString()));
    }
    const { data } = await api.get(`/products/?${params.toString()}`);
    return data;
  },
  getFacilities: async () => {
    const { data } = await api.get('/facilities/');
    return data;
  },
  getCategories: async () => {
    const { data } = await api.get('/categories?limit=1000');
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
  getVariantById: async (variantId: string | number) => {
    const { data } = await api.get(`/products/variants/${variantId}`);
    return data;
  },
  updateVariant: async (variantId: string | number, payload: any) => {
    const { data } = await api.put(`/products/variants/${variantId}`, payload);
    return data;
  },
  createVariantBatch: async (id: string | number, payload: any[]) => {
    const { data } = await api.post(`/products/${id}/variants/batch`, payload);
    return data;
  },
  syncVariantSuppliers: async (variantId: string | number, payload: any[]) => {
    const { data } = await api.put(`/products/variants/${variantId}/suppliers`, payload);
    return data;
  },
  getSuppliers: async () => {
    const { data } = await api.get('/suppliers?limit=1000');
    return data;
  }
};
