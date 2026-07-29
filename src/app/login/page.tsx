"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LogIn, Package } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    const next = searchParams.get("next") || "/";
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--paper)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] text-white shadow-[0_10px_24px_-10px_rgba(76,47,201,0.55)]">
            <Package size={24} />
          </span>
          <h1 className="font-display text-xl font-semibold text-[var(--ink)]">재고관리</h1>
          <p className="text-sm text-[var(--ink-soft)]">관리자 로그인이 필요합니다.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[0_1px_2px_rgba(36,31,54,0.04),0_16px_28px_-20px_rgba(36,31,54,0.16)]"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-soft)]">이메일</label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--primary)] focus:bg-white focus:ring-4 focus:ring-[var(--primary)]/12"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-soft)]">비밀번호</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--primary)] focus:bg-white focus:ring-4 focus:ring-[var(--primary)]/12"
            />
          </div>

          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(76,47,201,0.65)] transition active:scale-95 disabled:opacity-60"
          >
            <LogIn size={16} />
            {busy ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
