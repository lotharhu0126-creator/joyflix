import { NextRequest } from 'next/server';

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  role?: 'owner' | 'admin' | 'user';
} | null {
  const authCookie = request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(authCookie.value);
    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}

export function getAuthSigningSecret(): string {
  return process.env.AUTH_SECRET || process.env.PASSWORD || '';
}

export async function createAuthSignature(
  username: string,
  role: 'owner' | 'admin' | 'user'
): Promise<string> {
  const secret = getAuthSigningSecret();
  if (!secret) {
    throw new Error('AUTH_SECRET chưa được cấu hình');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${username}:${role}`)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createAccountCookieValue(
  username: string,
  role: 'owner' | 'admin' | 'user' = 'user'
): Promise<string> {
  return encodeURIComponent(
    JSON.stringify({
      username,
      role,
      signature: await createAuthSignature(username, role),
      timestamp: Date.now(),
    })
  );
}

export async function hasValidAccountSession(
  request: NextRequest
): Promise<boolean> {
  const authInfo = getAuthInfoFromCookie(request);
  const secret = getAuthSigningSecret();
  if (
    !authInfo?.username ||
    !authInfo.signature ||
    !authInfo.role ||
    !['owner', 'admin', 'user'].includes(authInfo.role) ||
    !secret
  )
    return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signature = new Uint8Array(
      authInfo.signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ||
        []
    );

    return crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(`${authInfo.username}:${authInfo.role}`)
    );
  } catch {
    return false;
  }
}

// 从cookie获取认证信息 (客户端使用)
export function getAuthInfoFromBrowserCookie(): {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  role?: 'owner' | 'admin' | 'user';
} | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 解析 document.cookie
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const trimmed = cookie.trim();
      const firstEqualIndex = trimmed.indexOf('=');

      if (firstEqualIndex > 0) {
        const key = trimmed.substring(0, firstEqualIndex);
        const value = trimmed.substring(firstEqualIndex + 1);
        if (key && value) {
          acc[key] = value;
        }
      }

      return acc;
    }, {} as Record<string, string>);

    const authCookie = cookies['auth'];
    if (!authCookie) {
      return null;
    }

    // 处理可能的双重编码
    let decoded = decodeURIComponent(authCookie);

    // 如果解码后仍然包含 %，说明是双重编码，需要再次解码
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }

    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}
