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
  supplier?: string;
  purchaseDate?: string;
  unitPrice?: number;
  reorderUrl?: string;
  expiryDate?: string;
  memo?: string;
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

type InventoryDB = Dexie & {
  pendingMovements: EntityTable<PendingMovement, "id">;
  pendingItems: EntityTable<PendingItem, "id">;
  cachedItems: EntityTable<CachedItem, "id">;
};

function createDb(): InventoryDB {
  const instance = new Dexie("InventoryOfflineDB") as InventoryDB;
  instance.version(1).stores({
    pendingMovements: "++id, clientUuid, itemBarcode",
    pendingItems: "++id, clientUuid, barcode",
    cachedItems: "id, barcode, locationId",
  });
  return instance;
}

// Next.js는 클라이언트 컴포넌트도 서버에서 먼저 렌더링(SSR)하는데,
// 서버 환경에는 indexedDB가 없어 여기서 Dexie를 바로 생성하면 페이지 자체가 깨집니다.
// 그래서 브라우저에서만 실제 인스턴스를 만들고, 서버에서는 사용 시점(useEffect 등, 클라이언트 전용)에만
// 접근하도록 프록시로 대체해 SSR 단계에서 오류가 나지 않게 합니다.
export const db: InventoryDB =
  typeof window !== "undefined"
    ? createDb()
    : (new Proxy(
        {},
        {
          get() {
            throw new Error("offline-db는 브라우저에서만 사용할 수 있습니다.");
          },
        }
      ) as InventoryDB);
