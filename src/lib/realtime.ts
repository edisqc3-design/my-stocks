"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";

// items / stock_movements 테이블 변경을 실시간으로 감지해 콜백 실행
// PC와 모바일에서 동시에 앱을 켜두면 한쪽에서 입출고 처리 시 다른 쪽 화면도 즉시 갱신됩니다.
export function useRealtimeSync(onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel("inventory-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
