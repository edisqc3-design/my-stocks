"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { User } from "lucide-react";

export default function UserBadge() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!email) return null;

  return (
    <span
      title={email}
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(36,31,54,0.08)]"
    >
      <User size={14} className="shrink-0 text-[var(--primary)]" />
      <span className="truncate">{email}</span>
    </span>
  );
}
