"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRealtimeSync } from "@/lib/realtime";
import { Bell, AlertTriangle, X, Check } from "lucide-react";

type LowStockItem = {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  location_id: string | null;
  locations: { name: string } | null;
};
type LocationOption = { id: string; name: string };

// 읽음 상태는 품목별 (quantity, min_quantity) 스냅샷과 함께 저장합니다.
// 저장된 스냅샷과 현재 값이 다르면(재고가 더 줄었거나 새로 부족해진 경우) 다시 "안읽음"으로 취급합니다.
type ReadSnapshot = { quantity: number; min_quantity: number };
type ReadMap = Record<string, ReadSnapshot>;

const READ_STORAGE_KEY = "stock-notif-read-v1";
const LOCATION_FILTER_STORAGE_KEY = "stock-notif-location-filter-v1";

function loadReadMap(): ReadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReadMap) : {};
  } catch {
    return {};
  }
}

function saveReadMap(map: ReadMap) {
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage 사용 불가 환경은 조용히 무시(읽음 상태만 미저장)
  }
}

// 재고 부족(quantity <= min_quantity) 품목을 앱 전역에서 우측 하단 FAB로 안내합니다.
// 대시보드 상단의 동기화 배지(SyncStatusBadge)와 겹치지 않도록 화면에 고정 배치합니다.
export default function NotificationBell() {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [readMap, setReadMap] = useState<ReadMap>({});
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 초기 마운트 시 localStorage에서 읽음 상태 / 마지막 위치 필터 복원
  useEffect(() => {
    setReadMap(loadReadMap());
    try {
      const savedFilter = window.localStorage.getItem(LOCATION_FILTER_STORAGE_KEY);
      if (savedFilter) setLocationFilter(savedFilter);
    } catch {
      // 무시
    }
  }, []);

  const load = useCallback(async () => {
    const [{ data: itemData }, { data: locData }] = await Promise.all([
      supabase
        .from("items")
        .select("id, name, quantity, min_quantity, location_id, locations(name)")
        .order("quantity", { ascending: true }),
      supabase.from("locations").select("id, name").order("name"),
    ]);
    setItems((itemData ?? []).filter((i) => i.quantity <= i.min_quantity) as unknown as LowStockItem[]);
    setLocations(locData ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 대시보드 화면의 useRealtimeSync와 채널명이 겹치지 않도록 전용 채널 사용
  useRealtimeSync(load, "inventory-realtime-badge");

  // 더 이상 부족 상태가 아닌 품목의 읽음 기록은 정리(무한 누적 방지)
  useEffect(() => {
    if (items.length === 0) return;
    setReadMap((prev) => {
      const validIds = new Set(items.map((i) => i.id));
      const pruned: ReadMap = {};
      let changed = false;
      for (const [id, snap] of Object.entries(prev)) {
        if (validIds.has(id)) {
          pruned[id] = snap;
        } else {
          changed = true;
        }
      }
      if (!changed) return prev;
      saveReadMap(pruned);
      return pruned;
    });
  }, [items]);

  const isRead = useCallback(
    (item: LowStockItem) => {
      const snap = readMap[item.id];
      return !!snap && snap.quantity === item.quantity && snap.min_quantity === item.min_quantity;
    },
    [readMap]
  );

  const markRead = useCallback((item: LowStockItem) => {
    setReadMap((prev) => {
      const next = { ...prev, [item.id]: { quantity: item.quantity, min_quantity: item.min_quantity } };
      saveReadMap(next);
      return next;
    });
  }, []);

  const handleLocationFilterChange = useCallback((value: string) => {
    setLocationFilter(value);
    try {
      window.localStorage.setItem(LOCATION_FILTER_STORAGE_KEY, value);
    } catch {
      // 무시
    }
  }, []);

  // 위치 필터가 적용된 목록(패널에 표시). 배지 카운트는 필터와 무관하게 전체 기준으로 계산합니다.
  const filteredItems = useMemo(
    () => (locationFilter ? items.filter((i) => i.location_id === locationFilter) : items),
    [items, locationFilter]
  );

  const markAllVisibleRead = useCallback(() => {
    setReadMap((prev) => {
      const next = { ...prev };
      for (const item of filteredItems) {
        next[item.id] = { quantity: item.quantity, min_quantity: item.min_quantity };
      }
      saveReadMap(next);
      return next;
    });
  }, [filteredItems]);

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

  // 배지는 위치 필터와 무관하게 "전체 기준 안읽음" 개수를 보여줍니다.
  const unreadCount = items.filter((item) => !isRead(item)).length;
  const hasUnreadInView = filteredItems.some((item) => !isRead(item));

  return (
    <div ref={wrapRef} className="notification-fab">
      {open && (
        <div className="absolute bottom-16 right-0 flex max-h-[26rem] w-80 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_10px_28px_rgba(36,31,54,0.2)]">
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

          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2">
            <select
              value={locationFilter}
              onChange={(e) => handleLocationFilterChange(e.target.value)}
              className="flex-1 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--ink-soft)]"
            >
              <option value="">전체 사무실</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              onClick={markAllVisibleRead}
              disabled={!hasUnreadInView}
              aria-label="현재 목록 모두 읽음 처리"
              className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)] disabled:opacity-40"
            >
              <Check size={12} />
              모두 읽음
            </button>
          </div>

          <div className="overflow-y-auto">
            {filteredItems.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--ink-soft)]">
                {locationFilter ? "이 사무실엔 부족한 품목이 없습니다." : "부족한 품목이 없습니다."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {filteredItems.map((item) => {
                  const unread = !isRead(item);
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/items/${item.id}`}
                        onClick={() => {
                          markRead(item);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-[var(--primary-soft)]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: unread ? "var(--danger)" : "transparent" }}
                          />
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-sm ${unread ? "font-semibold" : "font-medium text-[var(--ink-soft)]"}`}
                            >
                              {item.name}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--ink-soft)]">
                              {item.locations?.name ?? "위치 미지정"}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-[var(--danger)]">
                          {item.quantity} / 최소 {item.min_quantity}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `재고 부족 알림 ${unreadCount}건` : "알림함"}
        className="relative flex h-13 w-13 items-center justify-center rounded-full text-white shadow-[0_6px_18px_rgba(124,92,240,0.45)] transition-transform active:scale-95"
        style={{ background: unreadCount > 0 ? "var(--danger)" : "var(--primary)", width: 52, height: 52 }}
      >
        {unreadCount > 0 ? <AlertTriangle size={22} /> : <Bell size={22} />}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-[var(--danger)] shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
