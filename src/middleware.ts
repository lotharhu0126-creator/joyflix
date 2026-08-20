import { NextRequest, NextResponse } from 'next/server';

import { hasValidAccountSession } from '@/lib/auth';

function requiresAccount(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin/') ||
    [
      '/api/playrecords',
      '/api/favorites',
      '/api/searchhistory',
      '/api/skipconfigs',
      '/api/change-password',
    ].some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Trang xem phim là công khai. Chỉ dữ liệu tài khoản và khu vực quản trị
  // mới cần một phiên đăng nhập hợp lệ.
  if (!requiresAccount(pathname)) {
    return NextResponse.next();
  }

  if (await hasValidAccountSession(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
