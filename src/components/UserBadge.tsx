"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { User, LogOut } from "lucide-react";

export default function UserBadge() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    setBusy(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!email) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(36,31,54,0.08)]">
      <User size={14} className="shrink-0 text-[var(--primary)]" />
      <span title={email} className="min-w-0 flex-1 truncate">
        {email}
      </span>
      <button
        onClick={handleLogout}
        disabled={busy}
        title="로그아웃"
        className="flex shrink-0 items-center justify-center rounded-full p-1 text-[var(--ink-soft)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] disabled:opacity-60"
      >
        <LogOut size={13} />
      </button>
    </div>
  );
}
