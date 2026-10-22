export type EnvironmentType = 'catania' | 'qa' | 'morpheus' | 'development' | 'unknown';

export interface DomainConfig {
  env: EnvironmentType;
  protocol: 'https' | 'http';
  cookieDomain: string | undefined;
  hubUrl: string;
  loginUrl: string;
  apps: {
    core: string;
    purchases: string;
    inventory: string;
    wms: string;
    pricing: string;
    production: string;
    b2b: string;
    kiosco: string;
    consultor: string;
  };
}

export function extractHostname(hostOrUrl?: string): string {
  if (!hostOrUrl) return '';
  let clean = hostOrUrl.trim().toLowerCase();
  if (clean.includes('://')) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      clean = clean.split('://')[1] || clean;
    }
  }
  clean = clean.split('/')[0];
  clean = clean.split(':')[0];
  return clean;
}

export function isCataniaHost(hostname: string): boolean {
  return hostname === 'grupocatania.com' || hostname.endsWith('.grupocatania.com');
}

export function isQaHost(hostname: string): boolean {
  return hostname === 'qa.morpheussoft.net' || hostname.endsWith('.qa.morpheussoft.net');
}

export function isMorpheusProdHost(hostname: string): boolean {
  return (
    hostname === 'morpheussoft.net' ||
    (hostname.endsWith('.morpheussoft.net') && !hostname.endsWith('.qa.morpheussoft.net'))
  );
}

export function isDevHost(hostname: string): boolean {
  if (!hostname) return true;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)
  );
}

export function resolveDomain(hostOrUrl?: string): DomainConfig {
  let host = hostOrUrl;
  if (!host && typeof window !== 'undefined') {
    host = window.location.host;
  }
  const hostname = extractHostname(host || '');

  // 1. Producción Grupo Catania (*.grupocatania.com)
  if (isCataniaHost(hostname)) {
    return {
      env: 'catania',
      protocol: 'https',
      cookieDomain: '.grupocatania.com',
      hubUrl: 'https://hub.grupocatania.com',
      loginUrl: 'https://hub.grupocatania.com/login',
      apps: {
        core: 'https://hub.grupocatania.com/dashboard',
        purchases: 'https://compras.grupocatania.com/compras',
        inventory: 'https://inventario.grupocatania.com/inventario',
        wms: 'https://logistica.grupocatania.com/wms',
        pricing: 'https://costos.grupocatania.com/costos',
        production: 'https://produccion.grupocatania.com/produccion',
        b2b: 'https://b2b.grupocatania.com',
        kiosco: 'https://costos.grupocatania.com/costos/habladores/tienda',
        consultor: 'https://costos.grupocatania.com/costos/kiosco/consultor',
      },
    };
  }

  // 2. Entorno QA (*.qa.morpheussoft.net)
  if (isQaHost(hostname)) {
    return {
      env: 'qa',
      protocol: 'https',
      cookieDomain: '.qa.morpheussoft.net',
      hubUrl: 'https://hub.qa.morpheussoft.net',
      loginUrl: 'https://hub.qa.morpheussoft.net/login',
      apps: {
        core: 'https://hub.qa.morpheussoft.net/dashboard',
        purchases: 'https://compras.qa.morpheussoft.net/compras',
        inventory: 'https://inventario.qa.morpheussoft.net/inventario',
        wms: 'https://logistica.qa.morpheussoft.net/wms',
        pricing: 'https://costos.qa.morpheussoft.net/costos',
        production: 'https://produccion.qa.morpheussoft.net/produccion',
        b2b: 'https://b2b.qa.morpheussoft.net',
        kiosco: 'https://costos.qa.morpheussoft.net/costos/habladores/tienda',
        consultor: 'https://costos.qa.morpheussoft.net/costos/kiosco/consultor',
      },
    };
  }

  // 3. Producción Morpheus Soft (*.morpheussoft.net)
  if (isMorpheusProdHost(hostname)) {
    return {
      env: 'morpheus',
      protocol: 'https',
      cookieDomain: '.morpheussoft.net',
      hubUrl: 'https://hub.morpheussoft.net',
      loginUrl: 'https://hub.morpheussoft.net/login',
      apps: {
        core: 'https://hub.morpheussoft.net/dashboard',
        purchases: 'https://compras.morpheussoft.net/compras',
        inventory: 'https://inventario.morpheussoft.net/inventario',
        wms: 'https://logistica.morpheussoft.net/wms',
        pricing: 'https://costos.morpheussoft.net/costos',
        production: 'https://produccion.morpheussoft.net/produccion',
        b2b: 'https://b2b.morpheussoft.net',
        kiosco: 'https://costos.morpheussoft.net/costos/habladores/tienda',
        consultor: 'https://costos.morpheussoft.net/costos/kiosco/consultor',
      },
    };
  }

  // 4. Desarrollo Local (localhost / LAN IPs)
  if (isDevHost(hostname)) {
    const devHost = hostname || 'localhost';
    return {
      env: 'development',
      protocol: 'http',
      cookieDomain: undefined,
      hubUrl: `http://${devHost}:4000`,
      loginUrl: `http://${devHost}:4000/login`,
      apps: {
        core: `http://${devHost}:4000/dashboard`,
        purchases: `http://${devHost}:4002/compras`,
        inventory: `http://${devHost}:4001/inventario`,
        wms: `http://${devHost}:4003/wms`,
        pricing: `http://${devHost}:4004/costos`,
        production: `http://${devHost}:4007/produccion`,
        b2b: `http://${devHost}:4005`,
        kiosco: `http://${devHost}:4004/costos/habladores/tienda`,
        consultor: `http://${devHost}:4004/costos/kiosco/consultor`,
      },
    };
  }

  // 5. Fallback seguro para hosts externos/desconocidos (previene open redirect)
  return {
    env: 'unknown',
    protocol: 'https',
    cookieDomain: undefined,
    hubUrl: 'https://hub.grupocatania.com',
    loginUrl: 'https://hub.grupocatania.com/login',
    apps: {
      core: 'https://hub.grupocatania.com/dashboard',
      purchases: 'https://compras.grupocatania.com/compras',
      inventory: 'https://inventario.grupocatania.com/inventario',
      wms: 'https://logistica.grupocatania.com/wms',
      pricing: 'https://costos.grupocatania.com/costos',
      production: 'https://produccion.grupocatania.com/produccion',
      b2b: 'https://b2b.grupocatania.com',
      kiosco: 'https://costos.grupocatania.com/costos/habladores/tienda',
      consultor: 'https://costos.grupocatania.com/costos/kiosco/consultor',
    },
  };
}

function getUrlOrigin(urlStr: string): string {
  try {
    return new URL(urlStr).origin;
  } catch {
    return urlStr;
  }
}

export function sanitizeCallbackUrl(callbackUrl: string | null | undefined, currentHost?: string): string {
  const currentConfig = resolveDomain(currentHost);
  const fallback = `${currentConfig.hubUrl}/dashboard`;

  if (!callbackUrl || typeof callbackUrl !== 'string') return fallback;
  const trimmed = callbackUrl.trim();
  if (!trimmed) return fallback;

  // Manejo de URLs relativas (/compras, /dashboard, etc.)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Si estamos en un entorno con subdominios (catania, qa, morpheus)
    if (currentConfig.env !== 'development' && currentConfig.env !== 'unknown') {
      if (trimmed.startsWith('/compras')) {
        return `${getUrlOrigin(currentConfig.apps.purchases)}${trimmed}`;
      }
      if (trimmed.startsWith('/inventario')) {
        return `${getUrlOrigin(currentConfig.apps.inventory)}${trimmed}`;
      }
      if (trimmed.startsWith('/wms')) {
        return `${getUrlOrigin(currentConfig.apps.wms)}${trimmed}`;
      }
      if (trimmed.startsWith('/costos')) {
        return `${getUrlOrigin(currentConfig.apps.pricing)}${trimmed}`;
      }
      if (trimmed.startsWith('/produccion')) {
        return `${getUrlOrigin(currentConfig.apps.production)}${trimmed}`;
      }
      if (trimmed.startsWith('/b2b')) {
        return `${getUrlOrigin(currentConfig.apps.b2b)}${trimmed}`;
      }
      if (trimmed.startsWith('/dashboard')) {
        return `${getUrlOrigin(currentConfig.hubUrl)}${trimmed}`;
      }
    }
    return trimmed;
  }

  // Manejo de URLs absolutas
  try {
    const urlObj = new URL(trimmed);
    const targetHostname = urlObj.hostname.toLowerCase();
    const targetEnv = resolveDomain(targetHostname).env;

    // Si el host de destino es desconocido / malicioso (ej: evil.com), bloquear
    if (targetEnv === 'unknown') {
      return fallback;
    }

    // Si coincide el entorno (ambos catania, ambos qa, ambos dev)
    if (targetEnv === currentConfig.env) {
      return trimmed;
    }

    // Si viene de otro entorno (ej: localhost mapeado hacia catania o qa)
    const path = urlObj.pathname + urlObj.search;
    if (path.startsWith('/compras')) {
      return `${getUrlOrigin(currentConfig.apps.purchases)}${path}`;
    }
    if (path.startsWith('/inventario')) {
      return `${getUrlOrigin(currentConfig.apps.inventory)}${path}`;
    }
    if (path.startsWith('/wms')) {
      return `${getUrlOrigin(currentConfig.apps.wms)}${path}`;
    }
    if (path.startsWith('/costos')) {
      return `${getUrlOrigin(currentConfig.apps.pricing)}${path}`;
    }
    if (path.startsWith('/produccion')) {
      return `${getUrlOrigin(currentConfig.apps.production)}${path}`;
    }
    if (path.startsWith('/b2b')) {
      return `${getUrlOrigin(currentConfig.apps.b2b)}${path}`;
    }
    if (path.startsWith('/dashboard')) {
      return `${getUrlOrigin(currentConfig.hubUrl)}${path}`;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function getLoginUrl(callbackUrl?: string, currentHost?: string): string {
  const config = resolveDomain(currentHost);
  const base = config.loginUrl;
  if (!callbackUrl) return base;
  const sanitized = sanitizeCallbackUrl(callbackUrl, currentHost);
  return `${base}?callbackUrl=${encodeURIComponent(sanitized)}`;
}

export function clearAuthCookies(currentHost?: string): void {
  if (typeof document === 'undefined') return;
  const config = resolveDomain(currentHost);
  if (config.cookieDomain) {
    document.cookie = `access_token=; Max-Age=0; path=/; domain=${config.cookieDomain};`;
  }
  document.cookie = 'access_token=; Max-Age=0; path=/;';
  document.cookie = 'access_token=; Max-Age=0; path=/; domain=.grupocatania.com;';
  document.cookie = 'access_token=; Max-Age=0; path=/; domain=.qa.morpheussoft.net;';
  document.cookie = 'access_token=; Max-Age=0; path=/; domain=.morpheussoft.net;';
}

export function getInternalApiUrl(host?: string): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/+$/, "");
  }
  const hostname = extractHostname(host || "");
  if (isQaHost(hostname)) {
    return "http://127.0.0.1:8100/api/v1";
  }
  return "http://127.0.0.1:8000/api/v1";
}

export function getPublicApiUrl(host?: string): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  const hostname = extractHostname(host || (typeof window !== "undefined" ? window.location.host : ""));
  if (isQaHost(hostname)) {
    return "https://api.qa.morpheussoft.net/api/v1";
  }
  if (isCataniaHost(hostname)) {
    return "https://api.grupocatania.com/api/v1";
  }
  if (isMorpheusProdHost(hostname)) {
    return "https://api.morpheussoft.net/api/v1";
  }
  return "http://localhost:8000/api/v1";
}

