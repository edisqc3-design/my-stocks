"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/offline-db";
import { syncAll } from "@/lib/sync";
import { Camera, ImagePlus, X, ArrowLeft } from "lucide-react";

type Location = { id: string; name: string };
type Category = { id: string; name: string };

function NewItemForm() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillBarcode = params.get("barcode") ?? "";

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<"sm" | "md" | "lg">("lg");

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
    e.target.value = "";
  }

  function stopCameraStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function openCamera() {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      // 카메라 API를 지원하지 않는 환경 → 파일 선택창으로 대체
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err) {
      // 카메라 접근 거부/실패 → 파일 선택창으로 대체
      console.error("카메라 접근 실패:", err);
      setCameraError("카메라에 접근할 수 없습니다. 파일 선택으로 대신 진행해주세요.");
      cameraInputRef.current?.click();
    }
  }

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  useEffect(() => {
    return () => stopCameraStream();
  }, []);

  function closeCamera() {
    stopCameraStream();
    setCameraOpen(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPhotos((prev) => [...prev, dataUrl]);
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

  const photoBoxClass = {
    sm: "h-24 w-24",
    md: "h-40 w-40",
    lg: "h-56 w-56",
  }[photoSize];
  const photoDeleteBtnClass = {
    sm: "p-0.5",
    md: "p-1",
    lg: "p-1.5",
  }[photoSize];
  const photoDeleteIconSize = { sm: 12, md: 16, lg: 20 }[photoSize];

  return (
    <div className="space-y-5">
      <Link href="/items" className="flex items-center gap-1 text-sm text-[var(--ink-soft)]">
        <ArrowLeft size={16} /> 품목 목록
      </Link>
      <h1 className="text-xl font-bold">신규 품목 등록</h1>

      {/* 사진 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[var(--ink-soft)]">사진</label>
            <button
              onClick={openCamera}
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--ink-soft)]"
            >
              <Camera size={14} />
              촬영
            </button>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--ink-soft)]"
            >
              <ImagePlus size={14} />
              이미지 첨부
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] p-0.5">
            {(["sm", "md", "lg"] as const).map((size) => (
              <button
                key={size}
                onClick={() => setPhotoSize(size)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  photoSize === size
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {size === "sm" ? "소" : size === "md" ? "중" : "대"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className={`relative ${photoBoxClass} overflow-hidden rounded-xl border border-[var(--line)]`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                className={`absolute right-1 top-1 rounded-full bg-black/60 text-white ${photoDeleteBtnClass}`}
              >
                <X size={photoDeleteIconSize} />
              </button>
            </div>
          ))}
          {photos.length === 0 && (
            <p className="text-xs text-[var(--ink-soft)]">
              위의 &quot;촬영&quot; 또는 &quot;이미지 첨부&quot; 버튼을 눌러 사진을 추가해주세요.
            </p>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>
        {cameraError && (
          <p className="mt-1.5 text-xs text-red-500">{cameraError}</p>
        )}
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={closeCamera}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X size={20} />
            </button>
            <button
              onClick={capturePhoto}
              className="h-16 w-16 rounded-full border-4 border-white/70 bg-white"
              aria-label="촬영"
            />
            <button
              onClick={closeCamera}
              className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              완료
            </button>
          </div>
          <p className="mt-3 text-xs text-white/60">촬영 버튼을 누르면 사진이 목록에 추가됩니다. 여러 장 연속 촬영 가능</p>
        </div>
      )}

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
