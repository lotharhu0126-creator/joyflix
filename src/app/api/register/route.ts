/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { createAccountCookieValue, getAuthSigningSecret } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db, getStorage } from '@/lib/db';

export const runtime = 'nodejs';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_LIMIT = 5;
const registrations = new Map<string, number[]>();

function canRegister(request: NextRequest): boolean {
  const address =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const attempts = (registrations.get(address) || []).filter(
    (timestamp) => now - timestamp < REGISTRATION_WINDOW_MS
  );

  if (attempts.length >= REGISTRATION_LIMIT) {
    registrations.set(address, attempts);
    return false;
  }

  attempts.push(now);
  registrations.set(address, attempts);
  return true;
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

    if (!canRegister(request)) {
      return NextResponse.json(
        { error: 'Bạn đã đăng ký quá nhiều lần, vui lòng thử lại sau.' },
        { status: 429 }
      );
    }

    const { username: rawUsername, password } = await request.json();
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';

    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        {
          error:
            'Tên đăng nhập phải dài 3–30 ký tự và chỉ gồm chữ, số, dấu gạch dưới hoặc gạch ngang.',
        },
        { status: 400 }
      );
    }
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return NextResponse.json(
        { error: 'Mật khẩu phải dài từ 8 đến 128 ký tự.' },
        { status: 400 }
      );
    }
    if (process.env.USERNAME && username === process.env.USERNAME) {
      return NextResponse.json(
        { error: 'Tên đăng nhập này không khả dụng.' },
        { status: 400 }
      );
    }

    const storage = getStorage();
    if (!storage) {
      return NextResponse.json(
        { error: 'Máy chủ chưa bật kho lưu trữ tài khoản.' },
        { status: 503 }
      );
    }
    if (await db.checkUserExist(username)) {
      return NextResponse.json(
        { error: 'Tên đăng nhập đã được sử dụng.' },
        { status: 409 }
      );
    }

    await db.registerUser(username, password);
    const config = await getConfig();
    if (!config.UserConfig.Users.some((user) => user.username === username)) {
      config.UserConfig.Users.push({ username, role: 'user' });
      if (typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(config);
      }
    }
    return setAccountCookie(
      NextResponse.json({ ok: true, role: 'user' }, { status: 201 }),
      await createAccountCookieValue(username, 'user')
    );
  } catch (error) {
    console.error('Đăng ký thất bại:', error);
    return NextResponse.json(
      { error: 'Không thể tạo tài khoản.' },
      { status: 500 }
    );
  }
}
