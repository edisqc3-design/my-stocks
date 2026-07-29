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
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ok)]/10 px-2.5 py-1 text-xs font-medium text-[var(--ok)]">
        <CloudCheck size={14} /> 동기화됨
      </span>
    );
  }

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)]/10 px-2.5 py-1 text-xs font-medium text-[var(--danger)]">
        <WifiOff size={14} /> 오프라인{pendingCount > 0 ? ` · 대기 ${pendingCount}` : ""}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warn)]/15 px-2.5 py-1 text-xs font-medium text-[var(--warn)]">
      <RefreshCw size={14} /> 동기화 대기 {pendingCount}
    </span>
  );
}
