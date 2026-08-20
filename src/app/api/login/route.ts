/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { createAccountCookieValue, getAuthSigningSecret } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db, getStorage } from '@/lib/db';

export const runtime = 'nodejs';

function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function setAccountCookie(response: NextResponse, value: string): NextResponse {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  response.cookies.set('auth', value, {
    path: '/',
    expires,
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    if (!getAuthSigningSecret()) {
      return NextResponse.json(
        { error: 'Máy chủ chưa cấu hình AUTH_SECRET' },
        { status: 500 }
      );
    }

    const { username: rawUsername, password } = await request.json();
    const username = normalizeUsername(rawUsername);

    if (!username || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Vui lòng nhập tên đăng nhập và mật khẩu' },
        { status: 400 }
      );
    }

    if (
      process.env.USERNAME &&
      username === process.env.USERNAME &&
      password === (process.env.OWNER_PASSWORD || process.env.PASSWORD)
    ) {
      return setAccountCookie(
        NextResponse.json({ ok: true, role: 'owner' }),
        await createAccountCookieValue(username, 'owner')
      );
    }

    const storage = getStorage();
    if (!storage) {
      return NextResponse.json(
        { error: 'Máy chủ chưa bật kho lưu trữ tài khoản' },
        { status: 503 }
      );
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find(
      (item) => item.username === username
    );
    if (user?.banned) {
      return NextResponse.json(
        { error: 'Tài khoản đã bị khóa' },
        { status: 401 }
      );
    }

    if (!(await db.verifyUser(username, password))) {
      return NextResponse.json(
        { error: 'Tên đăng nhập hoặc mật khẩu không đúng' },
        { status: 401 }
      );
    }

    const role = user?.role || 'user';
    return setAccountCookie(
      NextResponse.json({ ok: true, role }),
      await createAccountCookieValue(username, role)
    );
  } catch (error) {
    console.error('Đăng nhập thất bại:', error);
    return NextResponse.json({ error: 'Không thể đăng nhập' }, { status: 500 });
  }
}
