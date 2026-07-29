import { supabase } from "./supabase";

const TABLES = [
  "locations",
  "categories",
  "items",
  "item_photos",
  "stock_movements",
  "stock_counts",
  "stock_count_entries",
] as const;

export interface BackupFile {
  createdAt: string;
  version: 1;
  data: Record<(typeof TABLES)[number], unknown[]>;
}

// 전체 테이블을 JSON으로 내보내기 (사진 원본 파일은 Storage에 남아있고, 여기엔 경로만 포함)
export async function exportBackup(): Promise<BackupFile> {
  const data = {} as BackupFile["data"];

  for (const table of TABLES) {
    const { data: rows, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`${table} 백업 실패: ${error.message}`);
    data[table] = rows ?? [];
  }

  return { createdAt: new Date().toISOString(), version: 1, data };
}

export function downloadBackupFile(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = backup.createdAt.slice(0, 10);
  a.href = url;
  a.download = `inventory-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 백업 파일을 읽어 테이블별로 upsert (기존 id 기준 덮어쓰기 — 참조 순서를 지켜야 하므로 아래 순서 고정)
const RESTORE_ORDER: (typeof TABLES)[number][] = [
  "locations",
  "categories",
  "items",
  "item_photos",
  "stock_movements",
  "stock_counts",
  "stock_count_entries",
];

export async function restoreBackup(backup: BackupFile) {
  if (backup.version !== 1) {
    throw new Error("지원하지 않는 백업 파일 버전입니다.");
  }

  for (const table of RESTORE_ORDER) {
    const rows = backup.data[table];
    if (!rows || rows.length === 0) continue;

    const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`${table} 복원 실패: ${error.message}`);
  }
}

export function parseBackupFile(file: File): Promise<BackupFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        resolve(parsed);
      } catch {
        reject(new Error("올바른 백업 파일이 아닙니다."));
      }
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsText(file);
  });
}
