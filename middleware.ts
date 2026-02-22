import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow login page and login API
  if (pathname === '/login' || pathname.startsWith('/api/login')) {
    return NextResponse.next()
  }

  // Check for auth token in cookies or localStorage token from client
  const authToken = request.cookies.get('authToken')?.value

  // If no auth token and trying to access protected route, redirect to login
  if (!authToken && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
