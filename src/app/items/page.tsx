"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRealtimeSync } from "@/lib/realtime";
import { Search, Plus } from "lucide-react";
import { db } from "@/lib/offline-db";

type Item = {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  barcode: string | null;
  location_id: string | null;
  category_id: string | null;
  locations: { name: string } | null;
  item_photos: { storage_path: string }[];
};
type FilterOption = { id: string; name: string };

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locations, setLocations] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const [lastInDates, setLastInDates] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("items")
      .select("id, name, quantity, min_quantity, barcode, location_id, category_id, locations(name), item_photos(storage_path)")
      .order("name");

    if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
    if (locationFilter) q = q.eq("location_id", locationFilter);
    if (categoryFilter) q = q.eq("category_id", categoryFilter);

    const { data } = await q;
    let rows = (data as unknown as Item[]) ?? [];
    if (lowOnly) rows = rows.filter((i) => i.quantity <= i.min_quantity);
    setItems(rows);
    setLoading(false);

    // 목록에 표시된 품목들의 "최근 입고일"을 한 번에 조회 (품목별 최신 입고 건만 사용)
    if (rows.length > 0) {
      const { data: inMoves } = await supabase
        .from("stock_movements")
        .select("item_id, created_at")
        .in(
          "item_id",
          rows.map((i) => i.id)
        )
        .eq("type", "in")
        .order("created_at", { ascending: false });
      const map: Record<string, string> = {};
      for (const mv of inMoves ?? []) {
        if (!map[mv.item_id]) map[mv.item_id] = mv.created_at;
      }
      setLastInDates(map);
    } else {
      setLastInDates({});
    }

    // 목록을 한 번 조회할 때마다 오프라인 스캔 대비 캐시를 갱신 (바코드가 있는 품목만)
    if (navigator.onLine) {
      for (const item of rows) {
        if (!item.barcode) continue;
        const thumb = item.item_photos?.[0]?.storage_path;
        const thumbnailUrl = thumb ? supabase.storage.from("item-photos").getPublicUrl(thumb).data.publicUrl : null;
        await db.cachedItems.put({
          id: item.id,
          name: item.name,
          barcode: item.barcode,
          quantity: item.quantity,
          minQuantity: item.min_quantity,
          locationId: item.location_id,
          categoryId: item.category_id,
          thumbnailUrl,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }, [query, lowOnly, locationFilter, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeSync(load);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">재고현황</h1>
        <Link
          href="/items/new"
          className="flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> 추가
        </Link>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">
        <Search size={18} className="text-[var(--ink-soft)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="품목명 검색"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setLowOnly((v) => !v)}
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: lowOnly ? "var(--danger)" : "var(--card)",
            color: lowOnly ? "#fff" : "var(--ink-soft)",
            border: "1px solid var(--line)",
          }}
        >
          재고 부족만 보기
        </button>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--ink-soft)]"
        >
          <option value="">전체 사무실</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--ink-soft)]"
        >
          <option value="">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-[var(--card)] shadow-sm">
        <div className="min-w-[680px]">
          {/* 열 헤더 */}
          <div className="grid grid-cols-[110px_1fr_1fr_1fr_1fr] divide-x divide-[var(--line)] border-b border-[var(--line)] text-xs font-medium text-[var(--ink-soft)]">
            <div className="truncate px-3 py-2 text-center">품목 사진</div>
            <div className="truncate px-3 py-2 text-center">품목명</div>
            <div className="truncate px-3 py-2 text-center">사무실(위치)</div>
            <div className="truncate px-3 py-2 text-center">최근입고일</div>
            <div className="truncate px-3 py-2 text-center">현재수량</div>
          </div>

          <ul className="divide-y divide-[var(--line)]">
            {loading && <li className="p-4 text-center text-sm text-[var(--ink-soft)]">불러오는 중…</li>}
            {!loading && items.length === 0 && (
              <li className="p-4 text-center text-sm text-[var(--ink-soft)]">품목이 없습니다.</li>
            )}
            {items.map((item) => {
              const low = item.quantity <= item.min_quantity;
              const thumb = item.item_photos?.[0]?.storage_path;
              const thumbUrl = thumb ? supabase.storage.from("item-photos").getPublicUrl(thumb).data.publicUrl : null;
              const lastIn = lastInDates[item.id];
              return (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="grid grid-cols-[110px_1fr_1fr_1fr_1fr] items-center divide-x divide-[var(--line)]"
                  >
                    <div className="flex items-center justify-center p-2">
                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--paper)]">
                        {thumbUrl && !brokenThumbs.has(item.id) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={() => setBrokenThumbs((prev) => new Set(prev).add(item.id))}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--ink-soft)]">
                            <Search size={22} />
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="truncate px-3 py-4 text-center text-base font-medium">{item.name}</p>
                    <p className="truncate px-3 py-4 text-center text-sm text-[var(--ink-soft)]">
                      {item.locations?.name ?? "위치 미지정"}
                    </p>
                    <p className="truncate px-3 py-4 text-center text-sm text-[var(--ink-soft)]">
                      {lastIn ? new Date(lastIn).toLocaleDateString("ko-KR") : "-"}
                    </p>
                    <p
                      className="truncate px-3 py-4 text-center text-base font-semibold"
                      style={{ color: low ? "var(--danger)" : "var(--ink)" }}
                    >
                      {item.quantity}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
