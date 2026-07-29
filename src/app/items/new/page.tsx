"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/offline-db";
import { syncAll } from "@/lib/sync";
import { Camera, X } from "lucide-react";

type Location = { id: string; name: string };
type Category = { id: string; name: string };

function NewItemForm() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillBarcode = params.get("barcode") ?? "";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    barcode: prefillBarcode || `QR-${Date.now().toString(36).toUpperCase()}`,
    codeType: prefillBarcode ? ("barcode" as const) : ("qr" as const),
    categoryId: "",
    locationId: "",
    quantity: 0,
    minQuantity: 0,
  });

  useEffect(() => {
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
    supabase.from("categories").select("id, name").order("name").then(({ data }) => setCategories(data ?? []));
  }, []);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert("품목명을 입력해주세요.");
      return;
    }
    setSaving(true);
    const clientUuid = crypto.randomUUID();

    if (navigator.onLine) {
      const { data, error } = await supabase
        .from("items")
        .insert({
          name: form.name,
          barcode: form.barcode,
          code_type: form.codeType,
          category_id: form.categoryId || null,
          location_id: form.locationId || null,
          quantity: form.quantity,
          min_quantity: form.minQuantity,
        })
        .select()
        .single();

      if (error) {
        alert(`저장 실패: ${error.message}`);
        setSaving(false);
        return;
      }

      for (const photo of photos) {
        const res = await fetch(photo);
        const blob = await res.blob();
        const path = `${data.id}/${crypto.randomUUID()}.jpg`;
        await supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
        await supabase.from("item_photos").insert({ item_id: data.id, storage_path: path });
      }
    } else {
      await db.pendingItems.add({
        clientUuid,
        name: form.name,
        barcode: form.barcode,
        codeType: form.codeType,
        categoryId: form.categoryId || undefined,
        locationId: form.locationId || undefined,
        quantity: form.quantity,
        minQuantity: form.minQuantity,
        photoDataUrls: photos,
        createdAt: new Date().toISOString(),
        synced: false,
      });
    }

    setSaving(false);
    syncAll();
    router.push("/items");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">신규 품목 등록</h1>

      {/* 사진 */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--ink-soft)]">사진</label>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-[var(--line)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--line)] text-[var(--ink-soft)]"
          >
            <Camera size={20} />
            <span className="text-[10px]">촬영/첨부</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>
      </div>

      <Field label="품목명">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="input"
          placeholder="예: A4 복사용지"
        />
      </Field>

      <Field label="바코드 / QR 값">
        <input
          value={form.barcode}
          onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          className="input font-mono text-sm"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="카테고리">
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="input"
          >
            <option value="">선택 안함</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="사무실(위치)">
          <select
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            className="input"
          >
            <option value="">선택 안함</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="초기 수량">
          <input
            type="number"
            inputMode="numeric"
            value={form.quantity === 0 ? "" : form.quantity}
            onChange={(e) => {
              const raw = e.target.value;
              setForm({ ...form, quantity: raw === "" ? 0 : Math.max(0, Number(raw) || 0) });
            }}
            placeholder="0"
            className="input"
          />
        </Field>
        <Field label="최소 재고 수량">
          <input
            type="number"
            inputMode="numeric"
            value={form.minQuantity === 0 ? "" : form.minQuantity}
            onChange={(e) => {
              const raw = e.target.value;
              setForm({ ...form, minQuantity: raw === "" ? 0 : Math.max(0, Number(raw) || 0) });
            }}
            placeholder="0"
            className="input"
          />
        </Field>
      </div>

      <button
        disabled={saving}
        onClick={handleSave}
        className="w-full rounded-xl bg-[var(--primary)] py-3 font-semibold text-white disabled:opacity-60"
      >
        {saving ? "저장 중…" : "저장"}
      </button>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid var(--line);
          background: var(--card);
          border-radius: 0.75rem;
          padding: 0.6rem 0.75rem;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--ink-soft)]">{label}</label>
      {children}
    </div>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={null}>
      <NewItemForm />
    </Suspense>
  );
}
