"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRealtimeSync } from "@/lib/realtime";
import { Bell, AlertTriangle, X } from "lucide-react";

type LowStockItem = { id: string; name: string; quantity: number; min_quantity: number };

// 재고 부족(quantity <= min_quantity) 품목을 앱 전역에서 우측 하단 FAB로 안내합니다.
// 대시보드 상단의 동기화 배지(SyncStatusBadge)와 겹치지 않도록 화면에 고정 배치합니다.
export default function NotificationBell() {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("items")
      .select("id, name, quantity, min_quantity")
      .order("quantity", { ascending: true });
    setItems((data ?? []).filter((i) => i.quantity <= i.min_quantity));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 대시보드 화면의 useRealtimeSync와 채널명이 겹치지 않도록 전용 채널 사용
  useRealtimeSync(load, "inventory-realtime-badge");

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const count = items.length;

  return (
    <div ref={wrapRef} className="notification-fab">
      {open && (
        <div className="absolute bottom-16 right-0 flex max-h-96 w-72 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_10px_28px_rgba(36,31,54,0.2)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h3 className="text-sm font-semibold">재고 부족 알림</h3>
            <button
              onClick={() => setOpen(false)}
              aria-label="알림함 닫기"
              className="text-[var(--ink-soft)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="overflow-y-auto">
            {count === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--ink-soft)]">
                부족한 품목이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/items/${item.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[var(--primary-soft)]"
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs font-medium text-[var(--danger)]">
                        {item.quantity} / 최소 {item.min_quantity}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `재고 부족 알림 ${count}건` : "알림함"}
        className="relative flex h-13 w-13 items-center justify-center rounded-full text-white shadow-[0_6px_18px_rgba(124,92,240,0.45)] transition-transform active:scale-95"
        style={{ background: count > 0 ? "var(--danger)" : "var(--primary)", width: 52, height: 52 }}
      >
        {count > 0 ? <AlertTriangle size={22} /> : <Bell size={22} />}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-[var(--danger)] shadow-sm">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
    </div>
  );
}
