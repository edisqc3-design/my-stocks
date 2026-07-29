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

      <ul className="divide-y divide-[var(--line)] rounded-2xl bg-[var(--card)] shadow-sm">
        {loading && <li className="p-4 text-center text-sm text-[var(--ink-soft)]">불러오는 중…</li>}
        {!loading && items.length === 0 && (
          <li className="p-4 text-center text-sm text-[var(--ink-soft)]">품목이 없습니다.</li>
        )}
        {items.map((item) => {
          const low = item.quantity <= item.min_quantity;
          const thumb = item.item_photos?.[0]?.storage_path;
          const thumbUrl = thumb ? supabase.storage.from("item-photos").getPublicUrl(thumb).data.publicUrl : null;
          return (
            <li key={item.id}>
              <Link href={`/items/${item.id}`} className="flex items-center gap-3 px-4 py-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--paper)]">
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
                      <Search size={14} />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {item.locations?.name ?? "위치 미지정"}
                  </p>
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: low ? "var(--danger)" : "var(--ink)" }}
                >
                  {item.quantity}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
