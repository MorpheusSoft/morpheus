import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveDomain, getLoginUrl, sanitizeCallbackUrl } from '@/lib/domain'

export function proxy(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  const pathname = request.nextUrl.pathname
  const search = request.nextUrl.search || ''
  const isLoginPage = pathname.startsWith('/login')
  const isPublicPage = isLoginPage || pathname === '/'

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const domainConfig = resolveDomain(host)

  // En entornos con subdominios (Catania, QA, Morpheus Prod), redirigir directamente al subdominio
  if (domainConfig.env !== 'development' && domainConfig.env !== 'unknown') {
    if (pathname.startsWith('/compras')) {
      const target = `${domainConfig.apps.purchases}${pathname.replace(/^\/compras/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      return NextResponse.redirect(target)
    }
    if (pathname.startsWith('/inventario')) {
      const target = `${domainConfig.apps.inventory}${pathname.replace(/^\/inventario/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      return NextResponse.redirect(target)
    }
    if (pathname.startsWith('/wms')) {
      const target = `${domainConfig.apps.wms}${pathname.replace(/^\/wms/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      return NextResponse.redirect(target)
    }
    if (pathname.startsWith('/costos')) {
      const target = `${domainConfig.apps.pricing}${pathname.replace(/^\/costos/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      return NextResponse.redirect(target)
    }
    if (pathname.startsWith('/produccion')) {
      const target = `${domainConfig.apps.production}${pathname.replace(/^\/produccion/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      return NextResponse.redirect(target)
    }
    if (pathname.startsWith('/b2b')) {
      const target = `${domainConfig.apps.b2b}${pathname.replace(/^\/b2b/, '')}${search}`
      if (!token) return NextResponse.redirect(getLoginUrl(target, host))
      return NextResponse.redirect(target)
    }
  }

  // Redirigir al usuario no logueado a la vista de login preservando la ruta solicitada
  if (!token && !isPublicPage) {
    const proto = request.headers.get('x-forwarded-proto') || domainConfig.protocol
    const currentUrl = `${proto}://${host}${pathname}${search}`
    const loginUrl = getLoginUrl(currentUrl, host)
    return NextResponse.redirect(loginUrl)
  }

  // Si tiene token y está en el login, redirigir al destino adecuado
  if (token && isLoginPage) {
    const rawCallback = request.nextUrl.searchParams.get('callbackUrl')
    if (rawCallback) {
      const sanitized = sanitizeCallbackUrl(rawCallback, host)
      return NextResponse.redirect(sanitized)
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export default proxy

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
