'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('帳號或密碼錯誤');
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm p-8 bg-white rounded-3xl shadow-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">簡誼OS</h1>
        <p className="mt-1 text-sm text-muted-foreground">補習班管理系統</p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            帳號（Email）
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-border bg-[#fff9f9] px-4 py-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            placeholder="your@email.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            密碼
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-border bg-[#fff9f9] px-4 py-3 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gold py-3 text-sm font-semibold text-white transition-colors hover:bg-gold/90 disabled:opacity-60"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          登入
        </button>
      </form>
    </div>
  );
}
