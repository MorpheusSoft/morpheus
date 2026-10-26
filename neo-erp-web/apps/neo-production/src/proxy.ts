import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveDomain, getLoginUrl } from '@/lib/domain'

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

export function proxy(request: NextRequest) {
  const rawToken = request.cookies.get('access_token')?.value
  const token = isValidJwt(rawToken) ? rawToken : undefined

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const domainConfig = resolveDomain(host)
  const isHttps = domainConfig.protocol === 'https'

  if (!token) {
    const proto = request.headers.get('x-forwarded-proto') || domainConfig.protocol

    const basePath = request.nextUrl.basePath || ''
    const pathname = request.nextUrl.pathname
    let fullPath = pathname
    if (basePath) {
      if (pathname === '/' || !pathname) {
        fullPath = basePath
      } else if (!pathname.startsWith(basePath)) {
        fullPath = `${basePath}${pathname}`
      }
    }
    const search = request.nextUrl.search || ''
    const currentUrl = `${proto}://${host}${fullPath}${search}`
    const baseLoginUrl = getLoginUrl(currentUrl, host)
    const loginUrl = rawToken
      ? `${baseLoginUrl}${baseLoginUrl.includes('?') ? '&' : '?'}expired=1`
      : baseLoginUrl

    const res = NextResponse.redirect(loginUrl)
    if (rawToken) {
      res.cookies.set('access_token', '', { maxAge: 0, expires: new Date(0), path: '/' })
      res.cookies.set('neo_last_activity', '', { maxAge: 0, expires: new Date(0), path: '/' })
      if (domainConfig.cookieDomain) {
        res.cookies.set('access_token', '', {
          maxAge: 0,
          expires: new Date(0),
          domain: domainConfig.cookieDomain,
          path: '/',
          secure: isHttps,
          sameSite: 'lax',
        })
        res.cookies.set('neo_last_activity', '', {
          maxAge: 0,
          expires: new Date(0),
          domain: domainConfig.cookieDomain,
          path: '/',
          secure: isHttps,
          sameSite: 'lax',
        })
      }
    }
    return res
  }

  const res = NextResponse.next()
  res.cookies.set('access_token', token, {
    httpOnly: false,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    domain: domainConfig.cookieDomain,
    maxAge: 60 * 60 * 12,
  })
  return res
}

export default proxy

export const config = {
  matcher: [
    '/',
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
