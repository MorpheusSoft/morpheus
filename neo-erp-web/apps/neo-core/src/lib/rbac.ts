export type NeoModuleKey =
  | 'neo_core'
  | 'neo_wms'
  | 'neo_inventory'
  | 'neo_purchases'
  | 'neo_pricing'
  | 'neo_production'
  | 'neo_b2b';

const MODULE_ALIASES: Record<string, string[]> = {
  neo_core: ['neo_core', 'core'],
  neo_wms: ['neo_wms', 'neo_logistics', 'wms', 'logistics'],
  neo_inventory: ['neo_inventory', 'inventory'],
  neo_purchases: ['neo_purchases', 'purchasing', 'purchases'],
  neo_pricing: ['neo_pricing', 'pricing'],
  neo_production: ['neo_production', 'production'],
  neo_b2b: ['neo_b2b', 'b2b'],
};

const FEATURE_ALIASES: Record<string, string[]> = {
  receipts: ['receipts', 'direct_receipts'],
  shipments: ['shipments', 'routes', 'vehicles'],
  pricing_reports: ['pricing_reports', 'pricing_metrics'],
  pricing_tags: ['pricing_tags', 'pricing_prices'],
  pricing_kiosk: ['pricing_kiosk', 'pricing_tags', 'pricing_prices'],
};

export function isSuperUser(user: any): boolean {
  if (!user) return false;
  return Boolean(user.is_superuser);
}

export function canAccessModule(user: any, moduleKey: NeoModuleKey | string): boolean {
  if (!user) return false;
  if (isSuperUser(user)) return true;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  const aliases = MODULE_ALIASES[moduleKey] || [moduleKey];

  for (const role of roles) {
    if (role?.is_active === false) continue;
    const perms = role?.permissions;
    if (!perms || typeof perms !== 'object') continue;

    for (const alias of aliases) {
      const modPerms = perms[alias];
      if (!modPerms) continue;

      if (Array.isArray(modPerms)) {
        if (modPerms.includes('read') || modPerms.includes('write')) return true;
      } else if (typeof modPerms === 'object') {
        for (const featKey of Object.keys(modPerms)) {
          const featVal = modPerms[featKey];
          if (featVal && typeof featVal === 'object' && (featVal.read === true || featVal.write === true)) {
            return true;
          }
          if (featVal === true) return true;
        }
      }
    }
  }

  return false;
}

export function canReadFeature(
  user: any,
  moduleKey: NeoModuleKey | string,
  featureKeys?: string | string[]
): boolean {
  if (!user) return false;
  if (isSuperUser(user)) return true;
  if (!featureKeys) return canAccessModule(user, moduleKey);

  const rawFeatures = Array.isArray(featureKeys) ? featureKeys : [featureKeys];
  const expandedFeatures = new Set<string>();
  for (const fk of rawFeatures) {
    expandedFeatures.add(fk);
    const mapped = FEATURE_ALIASES[fk];
    if (mapped) mapped.forEach((m) => expandedFeatures.add(m));
  }

  const roles = Array.isArray(user.roles) ? user.roles : [];
  const modAliases = MODULE_ALIASES[moduleKey] || [moduleKey];

  for (const role of roles) {
    if (role?.is_active === false) continue;
    const perms = role?.permissions;
    if (!perms || typeof perms !== 'object') continue;

    for (const modAlias of modAliases) {
      const modPerms = perms[modAlias];
      if (!modPerms) continue;

      if (Array.isArray(modPerms)) {
        if (modPerms.includes('read') || modPerms.includes('write')) return true;
      } else if (typeof modPerms === 'object') {
        for (const fk of Array.from(expandedFeatures)) {
          const featVal = modPerms[fk];
          if (featVal && typeof featVal === 'object' && (featVal.read === true || featVal.write === true)) {
            return true;
          }
          if (featVal === true) return true;
        }
      }
    }
  }

  return false;
}
