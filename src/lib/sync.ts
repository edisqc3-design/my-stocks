import { supabase } from "./supabase";
import { db } from "./offline-db";

// data URL(base64) -> Supabase Storage 업로드 후 item_photos에 기록
async function uploadPhoto(itemId: string, dataUrl: string) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${itemId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("item-photos")
    .upload(path, blob, { contentType: "image/jpeg" });

  if (uploadError) throw uploadError;

  await supabase.from("item_photos").insert({
    item_id: itemId,
    storage_path: path,
  });
}

// 오프라인 중 등록된 신규 품목 동기화
async function syncPendingItems() {
  const pending = await db.pendingItems.filter((row) => !row.synced).toArray();

  for (const p of pending) {
    const { data, error } = await supabase
      .from("items")
      .insert({
        name: p.name,
        barcode: p.barcode,
        code_type: p.codeType,
        category_id: p.categoryId ?? null,
        location_id: p.locationId ?? null,
        quantity: p.quantity,
        min_quantity: p.minQuantity,
        supplier: p.supplier ?? null,
        purchase_date: p.purchaseDate ?? null,
        unit_price: p.unitPrice ?? null,
        reorder_url: p.reorderUrl ?? null,
        expiry_date: p.expiryDate ?? null,
        memo: p.memo ?? null,
      })
      .select()
      .single();

    if (error) {
      // 바코드 중복 등 충돌은 건너뛰고 다음 항목 처리 (사용자에게 별도 안내 필요)
      console.error("품목 동기화 실패:", p.clientUuid, error.message);
      continue;
    }

    for (const photo of p.photoDataUrls) {
      await uploadPhoto(data.id, photo);
    }

    await db.pendingItems.update(p.id!, { synced: true });
  }
}

// 오프라인 중 쌓인 입출고/이동 이력 동기화
async function syncPendingMovements() {
  const pending = await db.pendingMovements.filter((row) => !row.synced).toArray();

  for (const m of pending) {
    const { data: item } = await supabase
      .from("items")
      .select("id")
      .eq("barcode", m.itemBarcode)
      .single();

    if (!item) {
      console.error("동기화할 품목을 찾을 수 없음:", m.itemBarcode);
      continue;
    }

    // client_uuid로 중복 동기화 방지 (이미 반영된 이력이면 스킵)
    const { data: existing } = await supabase
      .from("stock_movements")
      .select("id")
      .eq("client_uuid", m.clientUuid)
      .maybeSingle();

    if (existing) {
      await db.pendingMovements.update(m.id!, { synced: true });
      continue;
    }

    await supabase.from("stock_movements").insert({
      item_id: item.id,
      type: m.type,
      quantity_change: m.quantityChange,
      to_location_id: m.toLocationId ?? null,
      note: m.note ?? null,
      client_uuid: m.clientUuid,
    });
    // items.quantity는 DB 트리거(trg_stock_movements_apply)가 자동으로 반영합니다.

    await db.pendingMovements.update(m.id!, { synced: true });
  }
}

export async function syncAll() {
  if (!navigator.onLine) return { synced: false, reason: "offline" as const };

  try {
    await syncPendingItems();
    await syncPendingMovements();
    return { synced: true };
  } catch (err) {
    console.error("동기화 중 오류:", err);
    return { synced: false, reason: "error" as const };
  }
}
