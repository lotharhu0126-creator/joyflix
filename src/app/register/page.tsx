'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ThemeProvider } from '@/components/ThemeProvider';
import { useSite } from '@/components/SiteProvider';

function RegisterPageClient() {
  const router = useRouter();
  const { siteName } = useSite();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Không thể tạo tài khoản.');
        return;
      }

      router.replace('/');
    } catch {
      setError('Lỗi mạng, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 w-full rounded-3xl bg-black bg-opacity-70 p-10 shadow-2xl animate-slideUp sm:max-w-md">
      <h1 className="mb-2 text-center text-4xl font-bold text-white">
        {siteName}
      </h1>
      <p className="mb-8 text-center text-sm text-gray-300">
        Tạo tài khoản để lưu lịch sử của riêng bạn.
      </p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <input
          type="text"
          autoComplete="username"
          placeholder="Tên đăng nhập (3–30 ký tự)"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="block w-full rounded-md border border-gray-400 bg-transparent px-4 py-3 text-white placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-white"
          required
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Mật khẩu (ít nhất 8 ký tự)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="block w-full rounded-md border border-gray-400 bg-transparent px-4 py-3 text-white placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-white"
          minLength={8}
          required
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Xác nhận mật khẩu"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="block w-full rounded-md border border-gray-400 bg-transparent px-4 py-3 text-white placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-white"
          minLength={8}
          required
        />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={
            !username.trim() || !password || !confirmPassword || loading
          }
          className="inline-flex w-full justify-center rounded-lg bg-blue-400/70 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-blue-500/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-300">
        Đã có tài khoản?{' '}
        <Link
          href="/login"
          className="font-semibold text-blue-300 hover:text-blue-200"
        >
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <ThemeProvider forcedTheme="dark">
      <RegisterPageClient />
    </ThemeProvider>
  );
}
