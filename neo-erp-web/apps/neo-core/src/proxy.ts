import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveDomain, getLoginUrl, sanitizeCallbackUrl } from '@/lib/domain'

function isValidJwt(token?: string): boolean {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(padded))
    if (!payload || typeof payload.exp !== 'number') return false
    return payload.exp * 1000 > Date.now() + 5000
  } catch {
    return false
  }
}

function clearServerAuthCookies(res: NextResponse, cookieDomain?: string, isHttps?: boolean) {
  // Limpiar cookie host-only
  res.cookies.set('access_token', '', { maxAge: 0, expires: new Date(0), path: '/' })
  res.cookies.set('neo_last_activity', '', { maxAge: 0, expires: new Date(0), path: '/' })
  // Limpiar cookie de dominio compartido (.grupocatania.com / .qa.morpheussoft.net)
  if (cookieDomain) {
    res.cookies.set('access_token', '', {
      maxAge: 0,
      expires: new Date(0),
      domain: cookieDomain,
      path: '/',
      secure: isHttps,
      sameSite: 'lax',
    })
    res.cookies.set('neo_last_activity', '', {
      maxAge: 0,
      expires: new Date(0),
      domain: cookieDomain,
      path: '/',
      secure: isHttps,
      sameSite: 'lax',
    })
  }
}

function ensureSharedTokenCookie(res: NextResponse, token: string, cookieDomain?: string, isHttps?: boolean) {
  res.cookies.set('access_token', token, {
    httpOnly: false,
    secure: Boolean(isHttps),
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain,
    maxAge: 60 * 60 * 12,
  })
}

export function proxy(request: NextRequest) {
  const rawToken = request.cookies.get('access_token')?.value
  const token = isValidJwt(rawToken) ? rawToken : undefined
  const pathname = request.nextUrl.pathname
  const search = request.nextUrl.search || ''
  const isLoginPage = pathname.startsWith('/login')
  const isPublicPage = isLoginPage || pathname.startsWith('/public') || pathname.startsWith('/register')

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const domainConfig = resolveDomain(host)
  const isHttps = domainConfig.protocol === 'https'

  const isLogout =
    request.nextUrl.searchParams.get('logout') === '1' ||
    request.nextUrl.searchParams.get('expired') === '1'

  if (isLoginPage && (isLogout || (rawToken && !token))) {
    const res = NextResponse.next()
    clearServerAuthCookies(res, domainConfig.cookieDomain, isHttps)
    return res
  }

  // En entornos con subdominios (Catania, QA, Morpheus Prod), redirigir directamente al subdominio
  if (domainConfig.env !== 'development' && domainConfig.env !== 'unknown') {
    if (pathname.startsWith('/compras')) {
      const target = `${domainConfig.apps.purchases}${pathname.replace(/^\/compras/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      const res = NextResponse.redirect(target)
      ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
      return res
    }
    if (pathname.startsWith('/inventario')) {
      const target = `${domainConfig.apps.inventory}${pathname.replace(/^\/inventario/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      const res = NextResponse.redirect(target)
      ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
      return res
    }
    if (pathname.startsWith('/wms')) {
      const target = `${domainConfig.apps.wms}${pathname.replace(/^\/wms/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      const res = NextResponse.redirect(target)
      ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
      return res
    }
    if (pathname.startsWith('/costos')) {
      const target = `${domainConfig.apps.pricing}${pathname.replace(/^\/costos/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      const res = NextResponse.redirect(target)
      ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
      return res
    }
    if (pathname.startsWith('/produccion')) {
      const target = `${domainConfig.apps.production}${pathname.replace(/^\/produccion/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      const res = NextResponse.redirect(target)
      ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
      return res
    }
    if (pathname.startsWith('/b2b')) {
      const target = `${domainConfig.apps.b2b}${pathname.replace(/^\/b2b/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      const res = NextResponse.redirect(target)
      ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
      return res
    }
  }

  // Redirigir al usuario no logueado a la vista de login preservando la ruta solicitada
  if (!token && !isPublicPage) {
    const proto = request.headers.get('x-forwarded-proto') || domainConfig.protocol
    const currentUrl = `${proto}://${host}${pathname}${search}`
    const loginUrl = getLoginUrl(currentUrl, host)
    const res = NextResponse.redirect(loginUrl)
    if (rawToken) {
      clearServerAuthCookies(res, domainConfig.cookieDomain, isHttps)
    }
    return res
  }

  // Si tiene token válido y está en el login, redirigir al destino adecuado propagando la cookie compartida
  if (token && isLoginPage && !isLogout) {
    const rawCallback = request.nextUrl.searchParams.get('callbackUrl')
    const targetUrl = rawCallback ? sanitizeCallbackUrl(rawCallback, host) : new URL('/dashboard', request.url).toString()
    const res = NextResponse.redirect(targetUrl)
    ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
    return res
  }

  const res = NextResponse.next()
  if (token) {
    ensureSharedTokenCookie(res, token, domainConfig.cookieDomain, isHttps)
  }
  return res
}

export default proxy

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
