import api from '@/lib/api';

export const ValuationService = {
  getValuation: async (params: { facility_id?: number; warehouse_id?: number; category_id?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.facility_id) query.append('facility_id', params.facility_id.toString());
    if (params.warehouse_id) query.append('warehouse_id', params.warehouse_id.toString());
    if (params.category_id) query.append('category_id', params.category_id.toString());
    
    const { data } = await api.get(`/inventory-valuation/valuation?${query.toString()}`);
    return data;
  },
  
  getBookReport: async (params: { start_date: string; end_date: string; facility_id?: number; warehouse_id?: number; category_id?: number }) => {
    const query = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
    });
    if (params.facility_id) query.append('facility_id', params.facility_id.toString());
    if (params.warehouse_id) query.append('warehouse_id', params.warehouse_id.toString());
    if (params.category_id) query.append('category_id', params.category_id.toString());
    
    const { data } = await api.get(`/inventory-valuation/book?${query.toString()}`);
    return data;
  },

  getFacilities: async () => {
    const { data } = await api.get('/facilities/');
    return data;
  },

  getWarehouses: async (facilityId?: number) => {
    // If we have warehouses endpoint
    const { data } = await api.get('/warehouses/');
    if (facilityId) {
      return data.filter((w: any) => w.facility_id === facilityId);
    }
    return data;
  },

  getCategories: async () => {
    const { data } = await api.get('/categories/');
    return data;
  }
};
