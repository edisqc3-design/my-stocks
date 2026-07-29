"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline-db";
import { syncAll } from "@/lib/sync";
import { WifiOff, RefreshCw, CloudCheck } from "lucide-react";

export default function SyncStatusBadge() {
  const [online, setOnline] = useState(true);

  const pendingCount = useLiveQuery(async () => {
    const items = await db.pendingItems.filter((row) => !row.synced).count();
    const moves = await db.pendingMovements.filter((row) => !row.synced).count();
    return items + moves;
  }, [], 0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      syncAll();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online && pendingCount === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(36,31,54,0.08)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
        <CloudCheck size={14} className="text-[var(--ok)]" /> 동기화됨
      </span>
    );
  }

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(36,31,54,0.08)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
        <WifiOff size={14} className="text-[var(--danger)]" /> 오프라인{pendingCount > 0 ? ` · 대기 ${pendingCount}` : ""}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(36,31,54,0.08)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
      <RefreshCw size={14} className="text-[var(--warn)]" /> 동기화 대기 {pendingCount}
    </span>
  );
}
