import Dexie, { type EntityTable } from "dexie";

// 오프라인 상태에서 쌓아두는 입출고/신규품목 작업 큐
export interface PendingMovement {
  id?: number;
  clientUuid: string;
  itemBarcode: string;      // 오프라인 중엔 item_id를 모를 수 있어 barcode로 식별
  type: "in" | "out" | "move" | "adjust";
  quantityChange: number;
  toLocationId?: string;
  note?: string;
  createdAt: string;
  synced: boolean;
}

export interface PendingItem {
  id?: number;
  clientUuid: string;
  name: string;
  barcode: string;
  codeType: "barcode" | "qr";
  categoryId?: string;
  locationId?: string;
  quantity: number;
  minQuantity: number;
  photoDataUrls: string[]; // 오프라인 중 촬영한 사진(base64), 동기화 시 Storage 업로드
  createdAt: string;
  synced: boolean;
}

// 오프라인 열람용 품목 캐시(마지막 온라인 동기화 스냅샷)
export interface CachedItem {
  id: string; // supabase item id
  name: string;
  barcode: string;
  quantity: number;
  minQuantity: number;
  locationId: string | null;
  categoryId: string | null;
  thumbnailUrl: string | null;
  updatedAt: string;
}

const db = new Dexie("InventoryOfflineDB") as Dexie & {
  pendingMovements: EntityTable<PendingMovement, "id">;
  pendingItems: EntityTable<PendingItem, "id">;
  cachedItems: EntityTable<CachedItem, "id">;
};

db.version(1).stores({
  pendingMovements: "++id, clientUuid, itemBarcode",
  pendingItems: "++id, clientUuid, barcode",
  cachedItems: "id, barcode, locationId",
});

export { db };
