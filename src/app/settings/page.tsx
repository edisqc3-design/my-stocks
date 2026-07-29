"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { connectPrinter, isPrinterConnected } from "@/lib/label-printer";
import { exportBackup, downloadBackupFile, restoreBackup, parseBackupFile } from "@/lib/backup";
import { syncAll } from "@/lib/sync";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { Plus, Trash2, Printer, Download, Upload, RefreshCw } from "lucide-react";

type Location = { id: string; name: string };
type Category = { id: string; name: string };

export default function SettingsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [printerStatus, setPrinterStatus] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data: locs } = await supabase.from("locations").select("id, name").order("name");
    setLocations(locs ?? []);
    const { data: cats } = await supabase.from("categories").select("id, name").order("name");
    setCategories(cats ?? []);
    setPrinterStatus(isPrinterConnected());
  }

  useEffect(() => {
    load();
  }, []);

  async function addLocation() {
    if (!newLocation.trim()) return;
    await supabase.from("locations").insert({ name: newLocation.trim() });
    setNewLocation("");
    load();
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    await supabase.from("categories").insert({ name: newCategory.trim() });
    setNewCategory("");
    load();
  }

  async function removeLocation(id: string) {
    if (!confirm("이 사무실을 삭제하시겠습니까? 소속 품목은 위치 미지정으로 남습니다.")) return;
    await supabase.from("locations").delete().eq("id", id);
    load();
  }

  async function removeCategory(id: string) {
    await supabase.from("categories").delete().eq("id", id);
    load();
  }

  async function handleConnectPrinter() {
    try {
      const name = await connectPrinter();
      setPrinterStatus(true);
      alert(`"${name}" 프린터에 연결되었습니다.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "연결 실패");
    }
  }

  async function handleBackup() {
    setBusy("backup");
    try {
      const backup = await exportBackup();
      downloadBackupFile(backup);
    } catch (err) {
      alert(err instanceof Error ? err.message : "백업 실패");
    }
    setBusy(null);
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("백업 파일로 복원하면 동일 ID 데이터가 덮어써집니다. 계속하시겠습니까?")) {
      e.target.value = "";
      return;
    }
    setBusy("restore");
    try {
      const backup = await parseBackupFile(file);
      await restoreBackup(backup);
      alert("복원이 완료되었습니다.");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "복원 실패");
    }
    setBusy(null);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">설정</h1>
        <SyncStatusBadge />
      </div>

      {/* 사무실 관리 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">사무실(위치) 관리</h2>
        <ul className="mb-3 divide-y divide-[var(--line)]">
          {locations.map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2 text-sm">
              {l.name}
              <button onClick={() => removeLocation(l.id)} className="text-[var(--danger)]">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="예: C사무실"
            className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          />
          <button onClick={addLocation} className="rounded-xl bg-[var(--primary)] px-3 text-white">
            <Plus size={18} />
          </button>
        </div>
      </section>

      {/* 카테고리 관리 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">카테고리 관리</h2>
        <ul className="mb-3 divide-y divide-[var(--line)]">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              {c.name}
              <button onClick={() => removeCategory(c.id)} className="text-[var(--danger)]">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="예: 사무용품"
            className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          />
          <button onClick={addCategory} className="rounded-xl bg-[var(--primary)] px-3 text-white">
            <Plus size={18} />
          </button>
        </div>
      </section>

      {/* 프린터 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">라벨 프린터</h2>
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          {printerStatus ? "Ablemark M60 연결됨" : "연결된 프린터가 없습니다"}
        </p>
        <button
          onClick={handleConnectPrinter}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--primary)] py-3 font-medium text-[var(--primary)]"
        >
          <Printer size={18} /> 프린터 연결
        </button>
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          ※ 블루투스 라벨 출력은 안드로이드 Chrome에서만 지원됩니다.
        </p>
      </section>

      {/* 백업/복원 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">백업 / 복원</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled={busy === "backup"}
            onClick={handleBackup}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Download size={16} /> {busy === "backup" ? "내보내는 중…" : "백업 내보내기"}
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--primary)] py-3 text-sm font-semibold text-[var(--primary)]">
            <Upload size={16} /> {busy === "restore" ? "복원 중…" : "백업 복원"}
            <input type="file" accept="application/json" className="hidden" onChange={handleRestore} />
          </label>
        </div>
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          전체 품목/이력 데이터를 JSON 파일로 내려받거나, 파일을 선택해 복원할 수 있습니다.
        </p>
      </section>

      {/* 동기화 */}
      <section className="rounded-2xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">동기화</h2>
        <button
          onClick={() => syncAll()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] py-3 text-sm font-medium"
        >
          <RefreshCw size={16} /> 지금 동기화
        </button>
      </section>
    </div>
  );
}
