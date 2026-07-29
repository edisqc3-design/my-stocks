"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Trash2, ArrowLeft, Repeat, Pencil, Check, X, ImagePlus, ImageOff, Camera } from "lucide-react";

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
  const [editForm, setEditForm] = useState({ name: "", categoryId: "", minQuantity: 0, quantity: 0 });
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [editMovementValue, setEditMovementValue] = useState(0);
  const [editMovementNote, setEditMovementNote] = useState("");
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Set<string>>(new Set());
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

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
        quantity: detail.quantity,
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

  // 수정 모드에서 "다른 이미지로 불러오기" 버튼 클릭 시 파일 선택창을 연다.
  function handlePhotoButtonClick() {
    photoInputRef.current?.click();
  }

  // 선택/촬영한 이미지들을 새로 업로드하고, 기존 사진들은 모두 교체한다.
  async function uploadPhotos(files: File[]) {
    if (!item || files.length === 0) return;

    setPhotoUploading(true);
    try {
      // 기존 사진 삭제 (스토리지 + 레코드)
      for (const p of photos) {
        await supabase.storage.from("item-photos").remove([p.storage_path]);
        await supabase.from("item_photos").delete().eq("id", p.id);
      }

      // 새 사진 업로드
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${item.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("item-photos")
          .upload(path, file, { contentType: file.type || "image/jpeg" });
        if (uploadError) {
          alert(`이미지 업로드 실패: ${uploadError.message}`);
          continue;
        }
        await supabase.from("item_photos").insert({ item_id: item.id, storage_path: path });
      }

      setBrokenPhotoIds(new Set());
      await load();
    } finally {
      setPhotoUploading(false);
    }
  }

  // 갤러리에서 선택한 이미지 처리
  async function handlePhotoReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await uploadPhotos(files);
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

  function closeCamera() {
    stopCameraStream();
    setCameraOpen(false);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    closeCamera();
    if (!blob) return;
    const file = new File([blob], `${crypto.randomUUID()}.jpg`, { type: "image/jpeg" });
    await uploadPhotos([file]);
  }

  // 카메라 스트림 연결 및 정리
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  useEffect(() => {
    return () => stopCameraStream();
  }, []);

  // 사진 한 장 삭제
  async function handleDeletePhoto(p: Photo) {
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    await supabase.storage.from("item-photos").remove([p.storage_path]);
    await supabase.from("item_photos").delete().eq("id", p.id);
    await load();
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

    const diff = editForm.quantity - item.quantity;
    if (diff !== 0) {
      await supabase.from("stock_movements").insert({
        item_id: item.id,
        type: "adjust",
        quantity_change: diff,
        note: "현재 수량 직접 수정",
        client_uuid: crypto.randomUUID(),
      });
      // items.quantity는 DB 트리거(trg_stock_movements_apply)가 자동으로 반영합니다.
    }

    setEditing(false);
    load();
  }

  function startEditMovement(m: Movement) {
    setEditingMovementId(m.id);
    setEditMovementValue(m.quantity_change);
    setEditMovementNote(m.note ?? "");
  }

  function cancelEditMovement() {
    setEditingMovementId(null);
  }

  async function handleSaveMovement(m: Movement) {
    if (!item) return;
    await supabase
      .from("stock_movements")
      .update({ quantity_change: editMovementValue, note: editMovementNote.trim() || null })
      .eq("id", m.id);
    // items.quantity는 DB 트리거(trg_stock_movements_apply)가 자동으로 반영합니다.
    setEditingMovementId(null);
    load();
  }

  async function handleDeleteMovement(m: Movement) {
    if (!item) return;
    if (!confirm("이 입출고 기록을 삭제하시겠습니까? 재고 수량이 원복됩니다.")) return;
    await supabase.from("stock_movements").delete().eq("id", m.id);
    // items.quantity는 DB 트리거(trg_stock_movements_apply)가 자동으로 반영합니다.
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

      {(photos.length > 0 || editing) && (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((p) => {
              const broken = brokenPhotoIds.has(p.id);
              return (
                <div key={p.id} className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-[var(--paper)]">
                  {broken ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--ink-soft)]">
                      <ImageOff size={20} />
                      <span className="text-[10px]">이미지를 불러올 수 없음</span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(p.storage_path)}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      onError={() => setBrokenPhotoIds((prev) => new Set(prev).add(p.id))}
                    />
                  )}
                  {editing && (
                    <button
                      onClick={() => handleDeletePhoto(p)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                      aria-label="사진 삭제"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
            {editing && (
              <button
                onClick={openCamera}
                disabled={photoUploading}
                className="flex h-32 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--line)] text-[var(--ink-soft)] disabled:opacity-60"
              >
                <Camera size={20} />
                <span className="text-xs">촬영</span>
              </button>
            )}
            {editing && (
              <button
                onClick={handlePhotoButtonClick}
                disabled={photoUploading}
                className="flex h-32 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--line)] text-[var(--ink-soft)] disabled:opacity-60"
              >
                <ImagePlus size={20} />
                <span className="text-xs">{photoUploading ? "업로드 중…" : photos.length > 0 ? "다른 이미지로 변경" : "이미지 추가"}</span>
              </button>
            )}
          </div>
          {editing && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotoReplace}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoReplace}
              />
            </>
          )}
          {cameraError && <p className="text-xs text-red-500">{cameraError}</p>}
        </div>
      )}

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
          </div>
          <p className="mt-3 text-xs text-white/60">촬영 버튼을 누르면 사진이 즉시 업로드되어 기존 사진을 대체합니다.</p>
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
            <select
              value={editForm.categoryId}
              onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
              className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            >
              <option value="">카테고리 선택 안함</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
          {editing ? (
            <input
              type="number"
              inputMode="numeric"
              value={editForm.quantity}
              onChange={(e) =>
                setEditForm({ ...editForm, quantity: Math.max(0, Number(e.target.value) || 0) })
              }
              className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-lg font-bold"
            />
          ) : (
            <p
              className="text-2xl font-bold"
              style={{ color: item.quantity <= item.min_quantity ? "var(--danger)" : "var(--ink)" }}
            >
              {item.quantity}
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs text-[var(--ink-soft)]">최소 재고</p>
          {editing ? (
            <input
              type="number"
              inputMode="numeric"
              value={editForm.minQuantity}
              onChange={(e) =>
                setEditForm({ ...editForm, minQuantity: Math.max(0, Number(e.target.value) || 0) })
              }
              className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-lg font-bold"
            />
          ) : (
            <p className="text-2xl font-bold">{item.min_quantity}</p>
          )}
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
            {movements.map((m) => {
              const editable = m.type !== "move";
              const isEditing = editingMovementId === m.id;
              return (
                <li key={m.id} className="py-2 text-sm">
                  {isEditing ? (
                    <div className="space-y-2">
                      <span className="text-[var(--ink-soft)]">
                        {new Date(m.created_at).toLocaleString("ko-KR")}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editMovementValue}
                          onChange={(e) => setEditMovementValue(Number(e.target.value) || 0)}
                          className="w-20 rounded-lg border border-[var(--line)] px-2 py-1 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="메모"
                          value={editMovementNote}
                          onChange={(e) => setEditMovementNote(e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--line)] px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => handleSaveMovement(m)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ok)] text-white"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEditMovement}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line)]"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[var(--ink-soft)]">
                          {new Date(m.created_at).toLocaleString("ko-KR")}
                        </span>
                        {m.note && <p className="text-xs text-[var(--ink-soft)]">{m.note}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: m.quantity_change >= 0 ? "var(--ok)" : "var(--danger)" }}>
                          {m.quantity_change > 0 ? "+" : ""}
                          {m.quantity_change}
                        </span>
                        {editable && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => startEditMovement(m)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink-soft)]"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteMovement(m)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--danger)] text-[var(--danger)]"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
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
