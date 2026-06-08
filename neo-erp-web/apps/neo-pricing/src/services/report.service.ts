import api from '@/lib/api';

export const ReportService = {
  getPricingMarginReport: async (params: {
    supplier_ids?: number[];
    category_ids?: number[];
    brands?: string[];
    models?: string[];
    attribute_key?: string;
    attribute_value?: string;
    search_term?: string;
    cost_type?: string;
    skip?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.attribute_key) queryParams.append('attribute_key', params.attribute_key);
    if (params.attribute_value) queryParams.append('attribute_value', params.attribute_value);
    if (params.search_term) queryParams.append('search_term', params.search_term);
    if (params.cost_type) queryParams.append('cost_type', params.cost_type);
    
    if (params.supplier_ids && params.supplier_ids.length > 0) {
      params.supplier_ids.forEach(id => queryParams.append('supplier_ids', id.toString()));
    }
    if (params.category_ids && params.category_ids.length > 0) {
      params.category_ids.forEach(id => queryParams.append('category_ids', id.toString()));
    }
    if (params.brands && params.brands.length > 0) {
      params.brands.forEach(b => queryParams.append('brands', b));
    }
    if (params.models && params.models.length > 0) {
      params.models.forEach(m => queryParams.append('models', m));
    }
    
    const { data } = await api.get(`/reports/pricing-margin?${queryParams.toString()}`);
    return data;
  },
  
  sendAIChat: async (message: string, history: any[] = []) => {
    const { data } = await api.post('/reports/ai-chat', { message, history });
    return data;
  }
};
