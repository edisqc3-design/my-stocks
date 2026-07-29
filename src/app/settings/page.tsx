"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { exportBackup, downloadBackupFile, restoreBackup, parseBackupFile } from "@/lib/backup";
import { syncAll } from "@/lib/sync";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { Plus, Trash2, Download, Upload, RefreshCw, LogOut, Pencil, Check, X } from "lucide-react";

type Location = { id: string; name: string };
type Category = { id: string; name: string };

export default function SettingsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncResultLabel, setSyncResultLabel] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  async function load() {
    const { data: locs } = await supabase.from("locations").select("id, name").order("name");
    setLocations(locs ?? []);
    const { data: cats } = await supabase.from("categories").select("id, name").order("name");
    setCategories(cats ?? []);
  }

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function addLocation() {
    if (!newLocation.trim()) return;
    const { error } = await supabase.from("locations").insert({ name: newLocation.trim() });
    if (error) {
      alert(`사무실 추가 실패: ${error.message}`);
      return;
    }
    setNewLocation("");
    load();
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: newCategory.trim() });
    if (error) {
      alert(`카테고리 추가 실패: ${error.message}`);
      return;
    }
    setNewCategory("");
    load();
  }

  async function removeLocation(id: string) {
    if (!confirm("이 사무실을 삭제하시겠습니까? 소속 품목은 위치 미지정으로 남습니다.")) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      alert(`사무실 삭제 실패: ${error.message}`);
      return;
    }
    load();
  }

  async function removeCategory(id: string) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      alert(`카테고리 삭제 실패: ${error.message}`);
      return;
    }
    load();
  }

  function startEditLocation(l: Location) {
    setEditingLocationId(l.id);
    setEditingLocationName(l.name);
  }

  async function saveEditLocation() {
    if (!editingLocationId || !editingLocationName.trim()) return;
    const { error } = await supabase
      .from("locations")
      .update({ name: editingLocationName.trim() })
      .eq("id", editingLocationId);
    if (error) {
      alert(`사무실 수정 실패: ${error.message}`);
      return;
    }
    setEditingLocationId(null);
    load();
  }

  function startEditCategory(c: Category) {
    setEditingCategoryId(c.id);
    setEditingCategoryName(c.name);
  }

  async function saveEditCategory() {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    const { error } = await supabase
      .from("categories")
      .update({ name: editingCategoryName.trim() })
      .eq("id", editingCategoryId);
    if (error) {
      alert(`카테고리 수정 실패: ${error.message}`);
      return;
    }
    setEditingCategoryId(null);
    load();
  }

  async function handleSyncNow() {
    setBusy("sync");
    setSyncResultLabel(null);
    const result = await syncAll();
    setBusy(null);
    const label =
      result.reason === "offline"
        ? "오프라인 상태입니다"
        : result.reason === "error"
        ? "동기화 실패"
        : "동기화 완료";
    setSyncResultLabel(label);
    setTimeout(() => setSyncResultLabel(null), 2000);
    load();
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
    <div className="space-y-5">
      {/* 헤더 — 물류 관리대장 스타일 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] px-5 py-6 text-white shadow-[0_20px_40px_-20px_rgba(76,47,201,0.55)]">
        <div className="barcode-texture pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="font-tag text-[11px] uppercase tracking-[0.22em] text-white/70">
              Inventory Control
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">설정</h1>
          </div>
          <SyncStatusBadge />
        </div>
      </div>

      {/* 사무실 관리 */}
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(36,31,54,0.04),0_16px_28px_-20px_rgba(36,31,54,0.16)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(36,31,54,0.05),0_20px_36px_-16px_rgba(76,47,201,0.2)]">
        <div className="tag-notch flex items-center gap-3 border-b border-dashed border-[var(--line)] px-5 py-4">
          <span className="font-tag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[10px] font-semibold text-[var(--primary)]">
            LOC
          </span>
          <div>
            <p className="font-tag text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">Section</p>
            <h2 className="font-display text-[15px] font-semibold text-[var(--ink)]">사무실(위치) 관리</h2>
          </div>
        </div>
        <div className="p-5">
          <ul className="mb-3 max-h-64 divide-y divide-dashed divide-[var(--line)] overflow-y-auto pr-1">
            {locations.map((l) =>
              editingLocationId === l.id ? (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <input
                    autoFocus
                    value={editingLocationName}
                    onChange={(e) => setEditingLocationName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEditLocation()}
                    className="flex-1 rounded-lg border border-[var(--primary)] bg-white px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none"
                  />
                  <button onClick={saveEditLocation} className="text-[var(--ok)]">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditingLocationId(null)} className="text-[var(--ink-soft)]">
                    <X size={16} />
                  </button>
                </li>
              ) : (
                <li key={l.id} className="group flex items-center justify-between py-2.5 text-sm">
                  <button
                    onClick={() => startEditLocation(l)}
                    className="flex flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                    {l.name}
                    <Pencil size={13} className="text-[var(--ink-soft)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                  <button
                    onClick={() => removeLocation(l.id)}
                    className="text-[var(--ink-soft)] transition-colors hover:text-[var(--danger)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              )
            )}
            {locations.length === 0 && (
              <li className="py-2 text-sm text-[var(--ink-soft)]">등록된 사무실이 없습니다.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <input
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="예: C사무실"
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)]/70 focus:border-[var(--primary)] focus:bg-white focus:ring-4 focus:ring-[var(--primary)]/12"
            />
            <button
              onClick={addLocation}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] text-white shadow-[0_8px_18px_-8px_rgba(76,47,201,0.65)] transition active:scale-95"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* 카테고리 관리 */}
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(36,31,54,0.04),0_16px_28px_-20px_rgba(36,31,54,0.16)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(36,31,54,0.05),0_20px_36px_-16px_rgba(76,47,201,0.2)]">
        <div className="tag-notch flex items-center gap-3 border-b border-dashed border-[var(--line)] px-5 py-4">
          <span className="font-tag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[10px] font-semibold text-[var(--primary)]">
            CAT
          </span>
          <div>
            <p className="font-tag text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">Section</p>
            <h2 className="font-display text-[15px] font-semibold text-[var(--ink)]">카테고리 관리</h2>
          </div>
        </div>
        <div className="p-5">
          <ul className="mb-3 max-h-64 divide-y divide-dashed divide-[var(--line)] overflow-y-auto pr-1">
            {categories.map((c) =>
              editingCategoryId === c.id ? (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <input
                    autoFocus
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEditCategory()}
                    className="flex-1 rounded-lg border border-[var(--primary)] bg-white px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none"
                  />
                  <button onClick={saveEditCategory} className="text-[var(--ok)]">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditingCategoryId(null)} className="text-[var(--ink-soft)]">
                    <X size={16} />
                  </button>
                </li>
              ) : (
                <li key={c.id} className="group flex items-center justify-between py-2.5 text-sm">
                  <button
                    onClick={() => startEditCategory(c)}
                    className="flex flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                    {c.name}
                    <Pencil size={13} className="text-[var(--ink-soft)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                  <button
                    onClick={() => removeCategory(c.id)}
                    className="text-[var(--ink-soft)] transition-colors hover:text-[var(--danger)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              )
            )}
            {categories.length === 0 && (
              <li className="py-2 text-sm text-[var(--ink-soft)]">등록된 카테고리가 없습니다.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="예: 사무용품"
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)]/70 focus:border-[var(--primary)] focus:bg-white focus:ring-4 focus:ring-[var(--primary)]/12"
            />
            <button
              onClick={addCategory}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] text-white shadow-[0_8px_18px_-8px_rgba(76,47,201,0.65)] transition active:scale-95"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* 백업 / 복원 */}
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(36,31,54,0.04),0_16px_28px_-20px_rgba(36,31,54,0.16)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(36,31,54,0.05),0_20px_36px_-16px_rgba(76,47,201,0.2)]">
        <div className="tag-notch flex items-center gap-3 border-b border-dashed border-[var(--line)] px-5 py-4">
          <span className="font-tag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[10px] font-semibold text-[var(--primary)]">
            BAK
          </span>
          <div>
            <p className="font-tag text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">Section</p>
            <h2 className="font-display text-[15px] font-semibold text-[var(--ink)]">백업 / 복원</h2>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={busy === "backup"}
              onClick={handleBackup}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary-soft)]/50 py-3 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] active:scale-[0.98] disabled:opacity-60"
            >
              <Download size={16} /> {busy === "backup" ? "내보내는 중…" : "백업 내보내기"}
            </button>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary-soft)]/50 py-3 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]">
              <Upload size={16} /> {busy === "restore" ? "복원 중…" : "백업 복원"}
              <input type="file" accept="application/json" className="hidden" onChange={handleRestore} />
            </label>
          </div>
          <p className="font-tag mt-3 text-[11px] tracking-wide text-[var(--ink-soft)]">
            전체 품목/이력 데이터를 JSON 파일로 내려받거나, 파일을 선택해 복원할 수 있습니다.
          </p>
        </div>
      </section>

      {/* 동기화 */}
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(36,31,54,0.04),0_16px_28px_-20px_rgba(36,31,54,0.16)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(36,31,54,0.05),0_20px_36px_-16px_rgba(76,47,201,0.2)]">
        <div className="tag-notch flex items-center gap-3 border-b border-dashed border-[var(--line)] px-5 py-4">
          <span className="font-tag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[10px] font-semibold text-[var(--primary)]">
            SYN
          </span>
          <div>
            <p className="font-tag text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">Section</p>
            <h2 className="font-display text-[15px] font-semibold text-[var(--ink)]">동기화</h2>
          </div>
        </div>
        <div className="p-5">
          <button
            disabled={busy === "sync"}
            onClick={handleSyncNow}
            className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--line)] py-3 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--primary)]/40 hover:bg-[var(--paper)] disabled:cursor-default disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={`transition-transform duration-500 ${busy === "sync" ? "animate-spin" : "group-hover:rotate-180"}`}
            />
            {busy === "sync" ? "동기화 중…" : syncResultLabel ?? "지금 동기화"}
          </button>
        </div>
      </section>

      {/* 계정 */}
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(36,31,54,0.04),0_16px_28px_-20px_rgba(36,31,54,0.16)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(36,31,54,0.05),0_20px_36px_-16px_rgba(76,47,201,0.2)]">
        <div className="tag-notch flex items-center gap-3 border-b border-dashed border-[var(--line)] px-5 py-4">
          <span className="font-tag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[10px] font-semibold text-[var(--primary)]">
            ACC
          </span>
          <div>
            <p className="font-tag text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">Section</p>
            <h2 className="font-display text-[15px] font-semibold text-[var(--ink)]">계정</h2>
          </div>
        </div>
        <div className="p-5">
          {email && (
            <p className="mb-3 text-sm text-[var(--ink-soft)]">
              <span className="font-medium text-[var(--ink)]">{email}</span>(으)로 로그인됨
            </p>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 py-3 text-sm font-medium text-[var(--danger)] transition hover:border-[var(--danger)]/50 hover:bg-[var(--danger)]/10 active:scale-[0.99]"
          >
            <LogOut size={16} /> 로그아웃
          </button>
        </div>
      </section>
    </div>
  );
}
