import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveDomain, getLoginUrl } from '@/lib/domain'

export function proxy(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  
  if (!token) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const domainConfig = resolveDomain(host)
    const proto = request.headers.get('x-forwarded-proto') || domainConfig.protocol

    const basePath = request.nextUrl.basePath || ''
    let pathname = request.nextUrl.pathname
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
    const loginUrl = getLoginUrl(currentUrl, host)

    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export default proxy

export const config = {
  matcher: [
    '/',
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
