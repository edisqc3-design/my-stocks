"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRealtimeSync } from "@/lib/realtime";
import { Search, Plus, Trash2, Pencil, X, ListChecks } from "lucide-react";
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
  const router = useRouter();
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개 품목을 삭제하시겠습니까?`)) return;
    await supabase.from("items").delete().in("id", Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectMode(false);
    load();
  }

  function handleEditSelected() {
    if (selectedIds.size !== 1) return;
    const [id] = Array.from(selectedIds);
    router.push(`/items/${id}`);
  }

  const gridCols = selectMode ? "grid-cols-[40px_110px_1fr_1fr_1fr_1fr]" : "grid-cols-[110px_1fr_1fr_1fr_1fr]";

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">재고현황</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectMode}
            className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold text-[var(--ink-soft)]"
          >
            {selectMode ? <X size={16} /> : <ListChecks size={16} />}
            {selectMode ? "선택 취소" : "선택"}
          </button>
          <Link
            href="/items/new"
            className="flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus size={16} /> 추가
          </Link>
        </div>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
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

        {selectMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink-soft)]">{selectedIds.size}개 선택됨</span>
            <button
              onClick={handleEditSelected}
              disabled={selectedIds.size !== 1}
              title={selectedIds.size !== 1 ? "수정은 1개 품목만 선택했을 때 가능합니다" : "수정"}
              className="flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-40"
            >
              <Pencil size={15} /> 수정
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 rounded-full bg-[var(--danger)] px-3 py-1.5 text-sm font-semibold text-white"
            >
              <Trash2 size={15} /> 삭제
            </button>
            <button
              onClick={toggleSelectMode}
              title="선택 취소"
              className="flex items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] p-1.5 text-[var(--ink-soft)]"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-[var(--card)] shadow-sm">
        <div className="min-w-[680px]">
          {/* 열 헤더 */}
          <div className={`grid ${gridCols} divide-x divide-[var(--line)] border-b border-[var(--line)] text-sm font-bold text-[var(--ink)]`}>
            {selectMode && <div className="px-2 py-3" />}
            <div className="truncate px-3 py-3 text-center">품목 사진</div>
            <div className="truncate px-3 py-3 text-center">품목명</div>
            <div className="truncate px-3 py-3 text-center">사무실(위치)</div>
            <div className="truncate px-3 py-3 text-center">최근입고일</div>
            <div className="truncate px-3 py-3 text-center">현재수량</div>
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
              const checked = selectedIds.has(item.id);

              const rowContent = (
                <>
                  {selectMode && (
                    <div className="flex items-center justify-center px-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-5 w-5 accent-[var(--primary)]"
                      />
                    </div>
                  )}
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
                </>
              );

              return (
                <li key={item.id}>
                  {selectMode ? (
                    <div
                      onClick={() => toggleSelected(item.id)}
                      className={`grid ${gridCols} cursor-pointer items-center divide-x divide-[var(--line)]`}
                      style={{ background: checked ? "var(--primary-soft)" : "transparent" }}
                    >
                      {rowContent}
                    </div>
                  ) : (
                    <Link href={`/items/${item.id}`} className={`grid ${gridCols} items-center divide-x divide-[var(--line)]`}>
                      {rowContent}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

    </div>
  );
}
