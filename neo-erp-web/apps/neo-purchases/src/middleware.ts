import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  
  if (!token) {
    const host = request.headers.get('host') || '';
    const isProd = host.includes('.morpheussoft.net');
    
    // Construir la URL de Login del Hub Central
    const loginBase = isProd ? 'https://hub.qa.morpheussoft.net/login' : 'http://localhost:3000/login';
    
    // Anexar la ruta actual completa como callbackUrl
    const currentUrl = encodeURIComponent(request.url);
    return NextResponse.redirect(`${loginBase}?callbackUrl=${currentUrl}`);
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
