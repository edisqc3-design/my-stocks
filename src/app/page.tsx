"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRealtimeSync } from "@/lib/realtime";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Repeat, Package } from "lucide-react";

type Location = { id: string; name: string };
type LowStockItem = { id: string; name: string; quantity: number; min_quantity: number };
type Movement = {
  id: string;
  type: "in" | "out" | "move" | "adjust";
  quantity_change: number;
  created_at: string;
  items: { name: string } | null;
};

export default function DashboardPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeLocation, setActiveLocation] = useState<string>("all");
  const [totalItems, setTotalItems] = useState(0);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [recent, setRecent] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: locs } = await supabase.from("locations").select("id, name").order("name");
    setLocations(locs ?? []);

    let itemsQuery = supabase.from("items").select("id, name, quantity, min_quantity, location_id");
    if (activeLocation !== "all") itemsQuery = itemsQuery.eq("location_id", activeLocation);
    const { data: items } = await itemsQuery;

    setTotalItems(items?.length ?? 0);
    setTotalQuantity((items ?? []).reduce((sum, i) => sum + (i.quantity ?? 0), 0));
    setLowStock((items ?? []).filter((i) => i.quantity <= i.min_quantity).slice(0, 50));

    const { data: moves } = await supabase
      .from("stock_movements")
      .select("id, type, quantity_change, created_at, items(name)")
      .order("created_at", { ascending: false })
      .limit(30);
    setRecent((moves as unknown as Movement[]) ?? []);

    setLoading(false);
  }, [activeLocation]);

  useEffect(() => {
    load();
  }, [load]);

  // PC/모바일 동시 사용 시 실시간 반영
  useRealtimeSync(load);

  const movementIcon = {
    in: <ArrowDownCircle size={18} className="text-[var(--ok)]" />,
    out: <ArrowUpCircle size={18} className="text-[var(--danger)]" />,
    move: <Repeat size={18} className="text-[var(--primary)]" />,
    adjust: <Repeat size={18} className="text-[var(--warn)]" />,
  };

  const movementLabel = { in: "입고", out: "출고", move: "이동", adjust: "조정" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">홈</h1>
        <SyncStatusBadge />
      </div>

      {/* 사무실(위치) 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveLocation("all")}
          className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium"
          style={{
            background: activeLocation === "all" ? "var(--primary)" : "var(--card)",
            color: activeLocation === "all" ? "#fff" : "var(--ink-soft)",
            border: "1px solid var(--line)",
          }}
        >
          전체
        </button>
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => setActiveLocation(loc.id)}
            className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium"
            style={{
              background: activeLocation === loc.id ? "var(--primary)" : "var(--card)",
              color: activeLocation === loc.id ? "#fff" : "var(--ink-soft)",
              border: "1px solid var(--line)",
            }}
          >
            {loc.name}
          </button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm lg:p-6">
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <Package size={16} /> <span className="text-xs">총 품목</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{loading ? "-" : totalItems}</p>
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm lg:p-6">
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <Package size={16} /> <span className="text-xs">총 재고 수량</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{loading ? "-" : totalQuantity}</p>
        </div>
      </div>

      {/* 재고 부족 알림 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm lg:p-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-[var(--danger)]" />
          <h2 className="font-semibold">재고 부족 품목</h2>
        </div>
        {lowStock.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--ink-soft)]">
            부족한 품목이 없습니다.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto pr-1">
            <ul className="divide-y divide-[var(--line)]">
              {lowStock.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2.5">
                  <Link href={`/items/${item.id}`} className="font-medium">
                    {item.name}
                  </Link>
                  <span className="text-sm text-[var(--danger)]">
                    {item.quantity} / 최소 {item.min_quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 최근 입출고 이력 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm lg:p-6">
        <h2 className="mb-3 font-semibold">최근 입출고 이력</h2>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--ink-soft)]">이력이 없습니다.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto pr-1">
            <ul className="divide-y divide-[var(--line)]">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  {movementIcon[m.type]}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.items?.name ?? "삭제된 품목"}</p>
                    <p className="text-xs text-[var(--ink-soft)]">
                      {movementLabel[m.type]} · {new Date(m.created_at).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: m.quantity_change >= 0 ? "var(--ok)" : "var(--danger)" }}
                  >
                    {m.quantity_change > 0 ? "+" : ""}
                    {m.quantity_change}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
