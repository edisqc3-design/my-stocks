"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Trash2, ArrowLeft, Repeat, Pencil, Check, X } from "lucide-react";

type ItemDetail = {
  id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  min_quantity: number;
  category_id: string | null;
  location_id: string | null;
  locations: { name: string } | null;
};

type Photo = { id: string; storage_path: string };
type Movement = {
  id: string;
  type: string;
  quantity_change: number;
  created_at: string;
  note: string | null;
};
type Location = { id: string; name: string };
type Category = { id: string; name: string };

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", categoryId: "", minQuantity: 0 });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("items")
      .select("id, name, barcode, quantity, min_quantity, category_id, location_id, locations(name)")
      .eq("id", id)
      .single();
    const detail = data as unknown as ItemDetail;
    setItem(detail);
    if (detail) {
      setEditForm({
        name: detail.name,
        categoryId: detail.category_id ?? "",
        minQuantity: detail.min_quantity,
      });
    }

    const { data: ph } = await supabase.from("item_photos").select("id, storage_path").eq("item_id", id);
    setPhotos(ph ?? []);

    const { data: mv } = await supabase
      .from("stock_movements")
      .select("id, type, quantity_change, created_at, note")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setMovements(mv ?? []);

    const { data: locs } = await supabase.from("locations").select("id, name").order("name");
    setLocations(locs ?? []);
    const { data: cats } = await supabase.from("categories").select("id, name").order("name");
    setCategories(cats ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function photoUrl(path: string) {
    return supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
  }

  async function handleMove() {
    if (!item || !moveTarget) return;
    await supabase.from("stock_movements").insert({
      item_id: item.id,
      type: "move",
      quantity_change: 0,
      from_location_id: item.location_id,
      to_location_id: moveTarget,
      client_uuid: crypto.randomUUID(),
    });
    await supabase.from("items").update({ location_id: moveTarget }).eq("id", item.id);
    load();
  }

  async function handleSaveEdit() {
    if (!item || !editForm.name.trim()) return;
    await supabase
      .from("items")
      .update({
        name: editForm.name.trim(),
        category_id: editForm.categoryId || null,
        min_quantity: editForm.minQuantity,
      })
      .eq("id", item.id);
    setEditing(false);
    load();
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(`"${item.name}" 품목을 삭제하시겠습니까?`)) return;
    await supabase.from("items").delete().eq("id", item.id);
    router.push("/items");
  }

  if (!item) return <p className="p-4 text-sm text-[var(--ink-soft)]">불러오는 중…</p>;

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[var(--ink-soft)]">
        <ArrowLeft size={16} /> 뒤로
      </button>

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={photoUrl(p.storage_path)}
              alt={item.name}
              className="h-32 w-32 shrink-0 rounded-xl object-cover"
            />
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex-1 space-y-2">
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-lg font-bold"
            />
            <div className="flex gap-2">
              <select
                value={editForm.categoryId}
                onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              >
                <option value="">카테고리 선택 안함</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                value={editForm.minQuantity === 0 ? "" : editForm.minQuantity}
                onChange={(e) => {
                  const raw = e.target.value;
                  setEditForm({ ...editForm, minQuantity: raw === "" ? 0 : Math.max(0, Number(raw) || 0) });
                }}
                className="w-24 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                placeholder="최소수량"
              />
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-bold">{item.name}</h1>
            <p className="text-sm text-[var(--ink-soft)]">{item.locations?.name ?? "위치 미지정"}</p>
          </div>
        )}

        {editing ? (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={handleSaveEdit}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ok)] text-white"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)]"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink-soft)]"
          >
            <Pencil size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs text-[var(--ink-soft)]">현재 수량</p>
          <p
            className="text-2xl font-bold"
            style={{ color: item.quantity <= item.min_quantity ? "var(--danger)" : "var(--ink)" }}
          >
            {item.quantity}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs text-[var(--ink-soft)]">최소 재고</p>
          <p className="text-2xl font-bold">{item.min_quantity}</p>
        </div>
      </div>

      {/* 사무실 이동 */}
      <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Repeat size={16} /> 사무실 이동
        </h2>
        <div className="flex gap-2">
          <select
            value={moveTarget}
            onChange={(e) => setMoveTarget(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <option value="">이동할 사무실 선택</option>
            {locations.filter((l) => l.id !== item.location_id).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleMove}
            disabled={!moveTarget}
            className="rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            이동
          </button>
        </div>
      </div>

      {/* 입출고 이력 */}
      <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">입출고 이력</h2>
        {movements.length === 0 ? (
          <p className="py-3 text-center text-sm text-[var(--ink-soft)]">이력이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {movements.map((m) => (
              <li key={m.id} className="flex justify-between py-2 text-sm">
                <span className="text-[var(--ink-soft)]">
                  {new Date(m.created_at).toLocaleString("ko-KR")}
                </span>
                <span style={{ color: m.quantity_change >= 0 ? "var(--ok)" : "var(--danger)" }}>
                  {m.quantity_change > 0 ? "+" : ""}
                  {m.quantity_change}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={handleDelete}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)] py-3 font-medium text-[var(--danger)]"
      >
        <Trash2 size={16} /> 품목 삭제
      </button>
    </div>
  );
}
