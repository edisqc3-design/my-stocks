"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/offline-db";
import { syncAll } from "@/lib/sync";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import { ArrowDownCircle, ArrowUpCircle, X, ClipboardCheck, Search } from "lucide-react";

type ScannedItem = {
  id: string;
  name: string;
  quantity: number;
  location_id: string | null;
  barcode: string;
  locationName: string | null;
  thumbnailUrl: string | null;
};

type SearchResult = {
  id: string;
  name: string;
  quantity: number;
  location_id: string | null;
  barcode: string;
  locations: { name: string } | null;
  item_photos: { storage_path: string }[];
};

const SCANNER_ID = "scan-reader";

function ScanForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawMode = params.get("mode");
  const mode: "in" | "out" | null = rawMode === "in" || rawMode === "out" ? rawMode : null;
  const title = mode === "in" ? "입고" : mode === "out" ? "출고" : "스캔";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<ScannedItem | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (manualMode) return; // 수동 입력 모드에서는 카메라를 켜지 않음

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
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => handleDecoded(decodedText),
        () => {}
      )
      .then(() => {
        if (cancelled) {
          // 시작이 끝나기 전에 이미 다른 화면으로 이동한 경우 바로 정지
          shutdown();
          return;
        }
        setScanning(true);
      })
      .catch(() => setScanning(false));

    return () => {
      cancelled = true;
      shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode]);

  async function handleDecoded(value: string) {
    if (found || notFoundBarcode) return; // 이미 처리 중인 스캔 결과 있으면 무시

    // 같은 코드를 카메라가 계속 비추는 동안 팝업이 반복 뜨는 것을 막기 위해 스캔 일시정지
    scannerRef.current?.pause(true);

    if (navigator.onLine) {
      const { data } = await supabase
        .from("items")
        .select("id, name, quantity, location_id, barcode, locations(name), item_photos(storage_path)")
        .eq("barcode", value)
        .maybeSingle();

      if (data) {
        const d = data as unknown as {
          id: string;
          name: string;
          quantity: number;
          location_id: string | null;
          barcode: string;
          locations: { name: string } | null;
          item_photos: { storage_path: string }[];
        };
        const thumb = d.item_photos?.[0]?.storage_path;
        const thumbnailUrl = thumb ? supabase.storage.from("item-photos").getPublicUrl(thumb).data.publicUrl : null;

        setFound({
          id: d.id,
          name: d.name,
          quantity: d.quantity,
          location_id: d.location_id,
          barcode: d.barcode,
          locationName: d.locations?.name ?? null,
          thumbnailUrl,
        });

        // 오프라인 대비 캐시 갱신 (온라인 조회에 성공할 때마다 최신 정보로 저장)
        await db.cachedItems.put({
          id: d.id,
          name: d.name,
          barcode: d.barcode,
          quantity: d.quantity,
          minQuantity: 0,
          locationId: d.location_id,
          categoryId: null,
          thumbnailUrl,
          updatedAt: new Date().toISOString(),
        });
      } else {
        setNotFoundBarcode(value);
      }
    } else {
      // 오프라인: 이전에 온라인 상태에서 캐시해둔 품목에서만 조회 가능
      const cached = await db.cachedItems.where("barcode").equals(value).first();
      if (cached) {
        setFound({
          id: cached.id,
          name: cached.name,
          quantity: cached.quantity,
          location_id: cached.locationId,
          barcode: cached.barcode,
          locationName: null,
          thumbnailUrl: cached.thumbnailUrl,
        });
      } else {
        setNotFoundBarcode(value);
      }
    }
  }

  function handleManualQueryChange(value: string) {
    setManualQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      if (navigator.onLine) {
        const { data } = await supabase
          .from("items")
          .select("id, name, quantity, location_id, barcode, locations(name), item_photos(storage_path)")
          .ilike("name", `%${value.trim()}%`)
          .limit(8);
        setSearchResults((data ?? []) as unknown as SearchResult[]);
      } else {
        // 오프라인: 캐시된 품목 중에서만 이름으로 검색
        const cached = await db.cachedItems.toArray();
        const matched = cached.filter((c) => c.name.includes(value.trim())).slice(0, 8);
        setSearchResults(
          matched.map((c) => ({
            id: c.id,
            name: c.name,
            quantity: c.quantity,
            location_id: c.locationId,
            barcode: c.barcode,
            locations: null,
            item_photos: [],
          }))
        );
      }
    }, 300);
  }

  function selectManualResult(d: SearchResult) {
    const thumb = d.item_photos?.[0]?.storage_path;
    const thumbnailUrl = thumb ? supabase.storage.from("item-photos").getPublicUrl(thumb).data.publicUrl : null;
    setFound({
      id: d.id,
      name: d.name,
      quantity: d.quantity,
      location_id: d.location_id,
      barcode: d.barcode,
      locationName: d.locations?.name ?? null,
      thumbnailUrl,
    });
    setManualQuery("");
    setSearchResults([]);
  }

  function reset() {
    setFound(null);
    setNotFoundBarcode(null);
    setAmount(1);
    setManualQuery("");
    setSearchResults([]);
    scannerRef.current?.resume();
  }

  async function applyMovement(type: "in" | "out") {
    if (!found) return;
    setBusy(true);
    const change = type === "in" ? amount : -amount;
    const clientUuid = crypto.randomUUID();

    if (navigator.onLine) {
      await supabase.from("stock_movements").insert({
        item_id: found.id,
        type,
        quantity_change: change,
        client_uuid: clientUuid,
      });
      // items.quantity는 DB 트리거(trg_stock_movements_apply)가 자동으로 반영합니다.
    } else {
      await db.pendingMovements.add({
        clientUuid,
        itemBarcode: found.barcode,
        type,
        quantityChange: change,
        createdAt: new Date().toISOString(),
        synced: false,
      });
    }

    setBusy(false);
    reset();
    syncAll();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="flex items-center gap-2">
          {mode === null && (
            <button
              onClick={() => router.push("/count")}
              className="flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)]"
            >
              <ClipboardCheck size={14} /> 재고 실사
            </button>
          )}
          <SyncStatusBadge />
        </div>
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
                    onClick={() => selectManualResult(r)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-[var(--ink-soft)]">{r.locations?.name ?? "위치 미지정"}</p>
                    </div>
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
        <>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <div id={SCANNER_ID} className="mx-auto aspect-square w-full max-w-sm" />
            {scanning && (
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 bg-[var(--signal)] scanline" />
            )}
          </div>
          <p className="text-center text-sm text-[var(--ink-soft)]">
            {mode === "in"
              ? "입고할 품목의 바코드 또는 QR코드를 카메라에 비춰주세요"
              : mode === "out"
              ? "출고할 품목의 바코드 또는 QR코드를 카메라에 비춰주세요"
              : "바코드 또는 QR코드를 카메라에 비춰주세요"}
          </p>
        </>
      )}

      {/* 등록된 품목 스캔 시 하단 시트 */}
      {found && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-[var(--line)] bg-[var(--card)] p-5 shadow-2xl lg:static lg:rounded-2xl lg:shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--paper)]">
                {found.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={found.thumbnailUrl} alt={found.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--ink-soft)] text-xs">
                    사진 없음
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold">{found.name}</h2>
                <p className="text-xs text-[var(--ink-soft)]">{found.locationName ?? "위치 미지정"}</p>
              </div>
            </div>
            <button onClick={reset} aria-label="닫기">
              <X size={20} />
            </button>
          </div>
          <p className="mb-4 text-sm text-[var(--ink-soft)]">현재 수량: {found.quantity}</p>

          <div className="mb-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setAmount((a) => Math.max(1, a - 1))}
              className="h-10 w-10 rounded-full border border-[var(--line)] text-lg"
            >
              −
            </button>
            <span className="w-12 text-center text-xl font-bold">{amount}</span>
            <button
              onClick={() => setAmount((a) => a + 1)}
              className="h-10 w-10 rounded-full border border-[var(--line)] text-lg"
            >
              +
            </button>
          </div>

          {mode === "in" ? (
            <button
              disabled={busy}
              onClick={() => applyMovement("in")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ok)] py-3 font-semibold text-white disabled:opacity-60"
            >
              <ArrowDownCircle size={18} /> 입고
            </button>
          ) : mode === "out" ? (
            <button
              disabled={busy}
              onClick={() => applyMovement("out")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--danger)] py-3 font-semibold text-white disabled:opacity-60"
            >
              <ArrowUpCircle size={18} /> 출고
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={busy}
                onClick={() => applyMovement("in")}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--ok)] py-3 font-semibold text-white disabled:opacity-60"
              >
                <ArrowDownCircle size={18} /> 입고
              </button>
              <button
                disabled={busy}
                onClick={() => applyMovement("out")}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--danger)] py-3 font-semibold text-white disabled:opacity-60"
              >
                <ArrowUpCircle size={18} /> 출고
              </button>
            </div>
          )}
        </div>
      )}

      {/* 미등록 바코드 */}
      {notFoundBarcode && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-[var(--line)] bg-[var(--card)] p-5 shadow-2xl lg:static lg:rounded-2xl lg:shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">등록되지 않은 코드</h2>
            <button onClick={reset} aria-label="닫기">
              <X size={20} />
            </button>
          </div>
          <p className="mb-4 break-all text-sm text-[var(--ink-soft)]">{notFoundBarcode}</p>
          <button
            onClick={() => router.push(`/items/new?barcode=${encodeURIComponent(notFoundBarcode)}`)}
            className="w-full rounded-xl bg-[var(--primary)] py-3 font-semibold text-white"
          >
            신규 품목으로 등록
          </button>
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <ScanForm />
    </Suspense>
  );
}
