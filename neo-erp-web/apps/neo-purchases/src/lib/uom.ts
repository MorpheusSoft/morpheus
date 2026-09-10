export const WEIGHT_UOMS = [
  'KG', 'KGS', 'KILOGRAMO', 'KILOGRAMOS',
  'LBS', 'LIBRA', 'LIBRAS',
  'G', 'GR', 'GRS', 'GRAMO', 'GRAMOS',
  'L', 'LT', 'LTS', 'LITRO', 'LITROS',
  'M', 'MT', 'MTS', 'METRO', 'METROS'
];

export function isWeightUom(uom?: string | null): boolean {
  if (!uom) return false;
  return WEIGHT_UOMS.includes(uom.trim().toUpperCase());
}

export function getUomDecimals(uom?: string | null): number {
  return isWeightUom(uom) ? 3 : 0;
}

export function formatQuantity(
  qty: number | string | null | undefined, 
  uom?: string | null, 
  includeUom: boolean = false
): string {
  if (qty === null || qty === undefined || isNaN(Number(qty))) {
    return includeUom ? `0 ${uom || 'UND'}` : '0';
  }
  const num = Number(qty);
  const isWeight = isWeightUom(uom);
  const formatted = isWeight
    ? num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
    : Math.round(num).toLocaleString('en-US');

  return includeUom ? `${formatted} ${uom || 'UND'}` : formatted;
}

export function sanitizeQuantity(
  val: number | string | null | undefined, 
  uom?: string | null,
  isPack: boolean = false
): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
  if (isNaN(num) || num < 0) return 0;
  
  if (isPack || !isWeightUom(uom)) {
    return Math.round(num);
  }
  return Number(num.toFixed(3));
}

export function preventDecimalKey(e: React.KeyboardEvent<HTMLInputElement>, isDecimalAllowed: boolean) {
  if (!isDecimalAllowed && (e.key === '.' || e.key === ',' || e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
  }
}
