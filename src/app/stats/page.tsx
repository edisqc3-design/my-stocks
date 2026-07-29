"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRealtimeSync } from "@/lib/realtime";
import {
  BarChart3,
  ArrowDownCircle,
  ArrowUpCircle,
  Repeat,
  Scale,
} from "lucide-react";

type RangeKey = "7" | "30" | "90" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7", label: "최근 7일" },
  { key: "30", label: "최근 30일" },
  { key: "90", label: "최근 90일" },
  { key: "all", label: "전체" },
];

type MovementRow = {
  id: string;
  item_id: string;
  type: "in" | "out" | "move" | "adjust";
  quantity_change: number;
  created_at: string;
  items: { name: string; category_id: string | null; location_id: string | null } | null;
};

type ItemRow = {
  id: string;
  name: string;
  quantity: number;
  category_id: string | null;
  location_id: string | null;
};

type Option = { id: string; name: string };

function toDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function rangeStartDate(range: RangeKey): string | null {
  if (range === "all") return null;
  const days = Number(range);
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function StatsPage() {
  const [range, setRange] = useState<RangeKey>("30");
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: cats }, { data: locs }, { data: itemRows }] = await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("items").select("id, name, quantity, category_id, location_id"),
    ]);
    setCategories(cats ?? []);
    setLocations(locs ?? []);
    setItems((itemRows as ItemRow[]) ?? []);

    let q = supabase
      .from("stock_movements")
      .select("id, item_id, type, quantity_change, created_at, items(name, category_id, location_id)")
      .order("created_at", { ascending: true });

    const start = rangeStartDate(range);
    if (start) q = q.gte("created_at", start);

    const { data: moves } = await q;
    setMovements((moves as unknown as MovementRow[]) ?? []);

    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeSync(load);

  const summary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let adjustCount = 0;
    let moveCount = 0;
    for (const m of movements) {
      if (m.type === "in") totalIn += m.quantity_change;
      else if (m.type === "out") totalOut += Math.abs(m.quantity_change);
      else if (m.type === "adjust") adjustCount += 1;
      else if (m.type === "move") moveCount += 1;
    }
    return { totalIn, totalOut, net: totalIn - totalOut, adjustCount, moveCount };
  }, [movements]);

  const daily = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    for (const m of movements) {
      const key = toDateKey(m.created_at);
      const cur = map.get(key) ?? { in: 0, out: 0 };
      if (m.type === "in") cur.in += m.quantity_change;
      else if (m.type === "out") cur.out += Math.abs(m.quantity_change);
      map.set(key, cur);
    }
    const arr = Array.from(map.entries()).map(([label, v]) => ({ label, ...v }));
    // 데이터가 너무 많으면(전체 기간) 최근 30개만 표시
    return arr.slice(-30);
  }, [movements]);

  const maxDaily = useMemo(
    () => Math.max(1, ...daily.map((d) => Math.max(d.in, d.out))),
    [daily]
  );

  const topOut = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    for (const m of movements) {
      if (m.type !== "out") continue;
      const name = m.items?.name ?? "삭제된 품목";
      const cur = map.get(m.item_id) ?? { name, qty: 0 };
      cur.qty += Math.abs(m.quantity_change);
      map.set(m.item_id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [movements]);

  const topIn = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    for (const m of movements) {
      if (m.type !== "in") continue;
      const name = m.items?.name ?? "삭제된 품목";
      const cur = map.get(m.item_id) ?? { name, qty: 0 };
      cur.qty += m.quantity_change;
      map.set(m.item_id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [movements]);

  const categoryDist = useMemo(() => {
    const map = new Map<string, number>();
    let uncategorized = 0;
    for (const it of items) {
      if (!it.category_id) {
        uncategorized += it.quantity;
        continue;
      }
      map.set(it.category_id, (map.get(it.category_id) ?? 0) + it.quantity);
    }
    const total = items.reduce((s, i) => s + i.quantity, 0) || 1;
    const rows = categories.map((c) => ({
      name: c.name,
      qty: map.get(c.id) ?? 0,
      pct: Math.round(((map.get(c.id) ?? 0) / total) * 100),
    }));
    if (uncategorized > 0) {
      rows.push({ name: "미분류", qty: uncategorized, pct: Math.round((uncategorized / total) * 100) });
    }
    return rows.filter((r) => r.qty > 0).sort((a, b) => b.qty - a.qty);
  }, [items, categories]);

  const locationDist = useMemo(() => {
    const map = new Map<string, number>();
    let unassigned = 0;
    for (const it of items) {
      if (!it.location_id) {
        unassigned += it.quantity;
        continue;
      }
      map.set(it.location_id, (map.get(it.location_id) ?? 0) + it.quantity);
    }
    const total = items.reduce((s, i) => s + i.quantity, 0) || 1;
    const rows = locations.map((l) => ({
      name: l.name,
      qty: map.get(l.id) ?? 0,
      pct: Math.round(((map.get(l.id) ?? 0) / total) * 100),
    }));
    if (unassigned > 0) {
      rows.push({ name: "미지정", qty: unassigned, pct: Math.round((unassigned / total) * 100) });
    }
    return rows.filter((r) => r.qty > 0).sort((a, b) => b.qty - a.qty);
  }, [items, locations]);

  const maxTop = Math.max(1, ...topOut.map((r) => r.qty), ...topIn.map((r) => r.qty));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <BarChart3 size={22} className="text-[var(--primary)]" /> 통계
        </h1>
      </div>

      {/* 기간 선택 */}
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setRange(opt.key)}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              background: range === opt.key ? "var(--primary)" : "var(--card)",
              color: range === opt.key ? "#fff" : "var(--ink-soft)",
              border: "1px solid var(--line)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <ArrowDownCircle size={16} className="text-[var(--ok)]" /> <span className="text-xs">총 입고</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{loading ? "-" : summary.totalIn.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <ArrowUpCircle size={16} className="text-[var(--danger)]" /> <span className="text-xs">총 출고</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{loading ? "-" : summary.totalOut.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <Scale size={16} className="text-[var(--primary)]" /> <span className="text-xs">순증감</span>
          </div>
          <p
            className="mt-1 text-2xl font-bold"
            style={{ color: summary.net >= 0 ? "var(--ok)" : "var(--danger)" }}
          >
            {loading ? "-" : `${summary.net > 0 ? "+" : ""}${summary.net.toLocaleString()}`}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--ink-soft)]">
            <Repeat size={16} className="text-[var(--warn)]" /> <span className="text-xs">이동/조정 건수</span>
          </div>
          <p className="mt-1 text-2xl font-bold">
            {loading ? "-" : `${summary.moveCount} / ${summary.adjustCount}`}
          </p>
        </div>
      </div>

      {/* 일별 입출고 추이 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">일별 입출고 추이</h2>
        {!loading && daily.length === 0 && (
          <p className="py-4 text-center text-sm text-[var(--ink-soft)]">해당 기간 이력이 없습니다.</p>
        )}
        {daily.length > 0 && (
          <div className="overflow-x-auto">
            <div className="flex h-40 min-w-max items-end gap-3 pb-1">
              {daily.map((d) => (
                <div key={d.label} className="flex w-8 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end gap-0.5">
                    <div
                      className="w-1/2 rounded-t"
                      style={{ height: `${(d.in / maxDaily) * 100}%`, background: "var(--ok)", minHeight: d.in > 0 ? 2 : 0 }}
                      title={`입고 ${d.in}`}
                    />
                    <div
                      className="w-1/2 rounded-t"
                      style={{ height: `${(d.out / maxDaily) * 100}%`, background: "var(--danger)", minHeight: d.out > 0 ? 2 : 0 }}
                      title={`출고 ${d.out}`}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--ink-soft)]">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-[var(--ink-soft)]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--ok)" }} /> 입고
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} /> 출고
              </span>
            </div>
          </div>
        )}
      </section>

      {/* TOP 출고 / 입고 품목 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">출고 많은 품목 TOP 5</h2>
          {topOut.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--ink-soft)]">이력이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {topOut.map((r) => (
                <li key={r.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[var(--danger)]">{r.qty.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${(r.qty / maxTop) * 100}%`, background: "var(--danger)" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">입고 많은 품목 TOP 5</h2>
          {topIn.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--ink-soft)]">이력이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {topIn.map((r) => (
                <li key={r.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[var(--ok)]">{r.qty.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${(r.qty / maxTop) * 100}%`, background: "var(--ok)" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 카테고리 / 사무실별 재고 비중 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">카테고리별 재고 비중</h2>
          {categoryDist.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--ink-soft)]">데이터가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {categoryDist.map((r) => (
                <li key={r.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[var(--ink-soft)]">
                      {r.qty.toLocaleString()} ({r.pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div className="h-1.5 rounded-full" style={{ width: `${r.pct}%`, background: "var(--primary)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">사무실별 재고 비중</h2>
          {locationDist.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--ink-soft)]">데이터가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {locationDist.map((r) => (
                <li key={r.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-[var(--ink-soft)]">
                      {r.qty.toLocaleString()} ({r.pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div className="h-1.5 rounded-full" style={{ width: `${r.pct}%`, background: "var(--primary-2)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-center text-xs text-[var(--ink-soft)]">
        <Link href="/items" className="underline">
          재고현황으로 이동
        </Link>
      </p>
    </div>
  );
}
