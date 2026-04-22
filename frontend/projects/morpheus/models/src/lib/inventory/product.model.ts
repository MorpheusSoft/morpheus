export interface ProductBarcode {
  id: number;
  product_variant_id: number;
  barcode: string;
  code_type: string;
  uom: string;
  conversion_factor: number;
  weight?: number;
  dimensions?: string;
}

export interface ProductFacilityPrice {
  id: number;
  variant_id: number;
  facility_id: number;
  sales_price: number;
  target_utility_pct?: number;
}

export interface ProductPackaging {
  id: number;
  product_id: number;
  name: string;
  qty_per_unit: number;
  weight_kg?: number;
  volume_m3?: number;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  sku: string;
  part_number?: string;
  barcode?: string;
  image?: string;
  
  costing_method: string;
  standard_cost: number;
  average_cost: number;
  last_cost: number;
  replacement_cost: number;
  sales_price: number;
  is_published: boolean;
  
  weight?: number;
  currency_id?: number;
  
  // This is the crucial JSONB mapping
  attributes?: Record<string, any>; 
  
  is_active: boolean;
  barcodes?: ProductBarcode[];
  facility_prices?: ProductFacilityPrice[];
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  brand?: string;
  model?: string;
  product_type: string;
  uom_base: string;
  tax_id?: number;
  
  image_main?: string;
  datasheet?: string;
  
  has_variants: boolean;
  is_active: boolean;
  created_at?: string;
  
  variants?: ProductVariant[];
  packagings?: ProductPackaging[];
}

export interface ProductCreate {
  category_id: number;
  name: string;
  description?: string;
  brand?: string;
  model?: string;
  product_type?: string;
  uom_base?: string;
  tax_id?: number;
  
  // Helpers
  sku?: string;
  standard_cost?: number;
  price?: number;
  replacement_cost?: number;
  has_variants?: boolean;
}

export interface ProductVariantCreate {
  product_id: number;
  sku: string;
  part_number?: string;
  barcode?: string;
  image?: string;
  
  costing_method?: string;
  standard_cost?: number;
  average_cost?: number;
  last_cost?: number;
  replacement_cost?: number;
  sales_price?: number;
  is_published?: boolean;
  
  weight?: number;
  currency_id?: number;
  
  attributes?: Record<string, any>; 
}
