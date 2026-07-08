import api from '@/lib/api';

export interface PrintTemplate {
  id: number;
  name: string;
  paper_type: 'GRID' | 'CONTINUOUS' | 'INDIVIDUAL' | 'CUSTOM';
  width_mm: number;
  height_mm: number;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  rows: number;
  cols: number;
  show_sku: boolean;
  show_barcode: boolean;
  show_price_usd: boolean;
  show_price_ves: boolean;
  show_price_iva: boolean;
  show_uom: boolean;
  show_brand: boolean;
  show_promo_price_usd?: boolean;
  show_promo_price_ves?: boolean;
  show_promo_price_usd_iva?: boolean;
  show_promo_price_ves_iva?: boolean;
  show_promo_end_date?: boolean;
  promo_text?: string;
  font_size_pt: number;
  layout_config?: Record<string, any> | null;
}

export const PrintTemplateService = {
  getTemplates: async () => {
    const { data } = await api.get('/print-templates/');
    return data as PrintTemplate[];
  },
  getTemplateById: async (id: number | string) => {
    const { data } = await api.get(`/print-templates/${id}`);
    return data as PrintTemplate;
  },
  createTemplate: async (payload: Omit<PrintTemplate, 'id'>) => {
    const { data } = await api.post('/print-templates/', payload);
    return data as PrintTemplate;
  },
  updateTemplate: async (id: number | string, payload: Partial<PrintTemplate>) => {
    const { data } = await api.put(`/print-templates/${id}`, payload);
    return data as PrintTemplate;
  },
  deleteTemplate: async (id: number | string) => {
    const { data } = await api.delete(`/print-templates/${id}`);
    return data as PrintTemplate;
  }
};
