"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { supabase } from "@/lib/supabase";
import { ClipboardCheck, Check, X, Search } from "lucide-react";

type Location = { id: string; name: string };
type CountEntry = { itemId: string; name: string; barcode: string; systemQuantity: number; countedQuantity: number };
type CountSearchResult = { id: string; name: string; barcode: string; quantity: number };

const SCANNER_ID = "count-scan-reader";

export default function StockCountPage() {
  const [phase, setPhase] = useState<"setup" | "scanning" | "result">("setup");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [countId, setCountId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CountEntry[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CountSearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.from("locations").select("id, name").order("name").then(({ data }) => setLocations(data ?? []));
  }, []);

  useEffect(() => {
    if (phase !== "scanning" || manualMode) return;
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    // 카메라를 안전하게 정지 + 비디오 엘리먼트 정리 (정지 없이 DOM만 사라지면 브라우저가 죽는 문제 방지)
    const shutdown = async () => {
      try {
        if (
          scanner.getState() === Html5QrcodeScannerState.SCANNING ||
          scanner.getState() === Html5QrcodeScannerState.PAUSED
        ) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch {
        // 이미 정지되었거나 정리된 상태면 무시
      }
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => handleScan(decodedText),
        () => {}
      )
      .then(() => {
        if (cancelled) {
          // 시작이 끝나기 전에 이미 다른 화면으로 이동한 경우 바로 정지
          shutdown();
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, manualMode]);

  async function startCount() {
    const { data, error } = await supabase
      .from("stock_counts")
      .insert({ location_id: locationId || null, status: "in_progress" })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setCountId(data.id);
    setEntries([]);
    setManualMode(false);
    setManualQuery("");
    setSearchResults([]);
    setPhase("scanning");
  }

  async function handleScan(barcode: string) {
    let q = supabase.from("items").select("id, name, barcode, quantity");
    q = locationId ? q.eq("location_id", locationId) : q;
    const { data: item } = await q.eq("barcode", barcode).maybeSingle();

    if (!item) return; // 등록되지 않은 코드는 실사 중 무시

    setEntries((prev) => {
      const existing = prev.find((e) => e.itemId === item.id);
      if (existing) {
        return prev.map((e) => (e.itemId === item.id ? { ...e, countedQuantity: e.countedQuantity + 1 } : e));
      }
      return [
        ...prev,
        { itemId: item.id, name: item.name, barcode: item.barcode, systemQuantity: item.quantity, countedQuantity: 1 },
      ];
    });
  }

  function handleManualQueryChange(value: string) {
    setManualQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      let q = supabase.from("items").select("id, name, barcode, quantity");
      q = locationId ? q.eq("location_id", locationId) : q;
      const { data } = await q.ilike("name", `%${value.trim()}%`).limit(8);
      setSearchResults(data ?? []);
    }, 300);
  }

  function addManualEntry(item: CountSearchResult) {
    setEntries((prev) => {
      const existing = prev.find((e) => e.itemId === item.id);
      if (existing) {
        return prev.map((e) => (e.itemId === item.id ? { ...e, countedQuantity: e.countedQuantity + 1 } : e));
      }
      return [
        ...prev,
        { itemId: item.id, name: item.name, barcode: item.barcode, systemQuantity: item.quantity, countedQuantity: 1 },
      ];
    });
    setManualQuery("");
    setSearchResults([]);
  }

  function adjustCount(itemId: string, delta: number) {
    setEntries((prev) =>
      prev.map((e) => (e.itemId === itemId ? { ...e, countedQuantity: Math.max(0, e.countedQuantity + delta) } : e))
    );
  }

  async function finishCount() {
    if (!countId) return;

    for (const e of entries) {
      await supabase.from("stock_count_entries").insert({
        stock_count_id: countId,
        item_id: e.itemId,
        counted_quantity: e.countedQuantity,
        system_quantity: e.systemQuantity,
      });
    }

    await supabase
      .from("stock_counts")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", countId);

    setPhase("result");
  }

  async function applyAdjustments() {
    for (const e of entries) {
      const diff = e.countedQuantity - e.systemQuantity;
      if (diff === 0) continue;
      await supabase.from("stock_movements").insert({
        item_id: e.itemId,
        type: "adjust",
        quantity_change: diff,
        note: "재고 실사 반영",
        client_uuid: crypto.randomUUID(),
      });
      // items.quantity는 DB 트리거(trg_stock_movements_apply)가 자동으로 반영합니다.
    }
    alert("실사 결과가 재고 수량에 반영되었습니다.");
    setPhase("setup");
    setEntries([]);
    setCountId(null);
  }

  if (phase === "setup") {
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ClipboardCheck size={22} /> 재고 실사
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">
          실사할 사무실을 선택하고 시작하세요. 스캔할 때마다 자동으로 수량이 집계됩니다.
        </p>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          <option value="">전체 사무실 대상</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          onClick={startCount}
          className="w-full rounded-xl bg-[var(--primary)] py-3 font-semibold text-white"
        >
          실사 시작
        </button>
      </div>
    );
  }

  if (phase === "scanning") {
    return (
      <div className="space-y-4 pb-40">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">재고 실사 진행 중</h1>
          <span className="text-sm text-[var(--ink-soft)]">스캔 {entries.length}개 품목</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setManualMode(false)}
            className="flex-1 rounded-xl py-2 text-sm font-semibold"
            style={{
              background: !manualMode ? "var(--primary)" : "var(--card)",
              color: !manualMode ? "#fff" : "var(--ink-soft)",
              border: !manualMode ? "none" : "1px solid var(--line)",
            }}
          >
            카메라로 스캔
          </button>
          <button
            onClick={() => setManualMode(true)}
            className="flex-1 rounded-xl py-2 text-sm font-semibold"
            style={{
              background: manualMode ? "var(--primary)" : "var(--card)",
              color: manualMode ? "#fff" : "var(--ink-soft)",
              border: manualMode ? "none" : "1px solid var(--line)",
            }}
          >
            수동 입력
          </button>
        </div>

        {manualMode ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]" />
              <input
                value={manualQuery}
                onChange={(e) => handleManualQueryChange(e.target.value)}
                placeholder="품목명으로 검색"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] py-2.5 pl-9 pr-3 text-sm"
                autoFocus
              />
            </div>
            {searchResults.length > 0 && (
              <ul className="divide-y divide-[var(--line)] rounded-2xl bg-[var(--card)] shadow-sm">
                {searchResults.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => addManualEntry(r)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium">{r.name}</span>
                      <span className="text-sm text-[var(--ink-soft)]">현재 {r.quantity}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {manualQuery.trim() && searchResults.length === 0 && (
              <p className="py-3 text-center text-sm text-[var(--ink-soft)]">검색 결과가 없습니다.</p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-black">
            <div id={SCANNER_ID} className="mx-auto aspect-square w-full max-w-xs" />
          </div>
        )}

        <ul className="divide-y divide-[var(--line)] rounded-2xl bg-[var(--card)] shadow-sm">
          {entries.length === 0 && (
            <li className="p-4 text-center text-sm text-[var(--ink-soft)]">아직 스캔한 품목이 없습니다.</li>
          )}
          {entries.map((e) => (
            <li key={e.itemId} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-[var(--ok)]" />
                <span className="text-sm font-medium">{e.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustCount(e.itemId, -1)} className="h-7 w-7 rounded-full border border-[var(--line)]">
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold">{e.countedQuantity}</span>
                <button onClick={() => adjustCount(e.itemId, 1)} className="h-7 w-7 rounded-full border border-[var(--line)]">
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-md px-4 lg:static lg:px-0">
          <button
            onClick={finishCount}
            className="w-full rounded-xl bg-[var(--primary)] py-3 font-semibold text-white shadow-lg"
          >
            실사 완료
          </button>
        </div>
      </div>
    );
  }

  // result
  const diffOnly = entries.filter((e) => e.countedQuantity !== e.systemQuantity);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">실사 결과</h1>
      <p className="text-sm text-[var(--ink-soft)]">
        총 {entries.length}개 품목 실사 · 차이 발생 {diffOnly.length}개
      </p>

      <ul className="divide-y divide-[var(--line)] rounded-2xl bg-[var(--card)] shadow-sm">
        {entries.map((e) => {
          const diff = e.countedQuantity - e.systemQuantity;
          return (
            <li key={e.itemId} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">{e.name}</span>
              <span className="text-sm text-[var(--ink-soft)]">
                시스템 {e.systemQuantity} → 실사 {e.countedQuantity}{" "}
                <span style={{ color: diff === 0 ? "var(--ok)" : "var(--danger)" }}>
                  ({diff > 0 ? "+" : ""}
                  {diff})
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-3">
        <button
          onClick={applyAdjustments}
          className="flex-1 rounded-xl bg-[var(--primary)] py-3 font-semibold text-white"
        >
          실사 결과 재고에 반영
        </button>
        <button
          onClick={() => {
            setPhase("setup");
            setEntries([]);
            setCountId(null);
          }}
          className="rounded-xl border border-[var(--line)] px-4 py-3 font-medium"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
