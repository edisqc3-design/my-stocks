import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase 무료 플랜은 7일간 API 호출이 없으면 프로젝트가 자동 일시정지됩니다.
// 이 라우트를 Vercel Cron으로 매일 호출해 최소한의 쿼리를 실행, 활성 상태를 유지합니다.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.from("locations").select("id").limit(1);
    // RLS 적용 이후에는 익명 키로 이 쿼리가 permission denied(42501)를 반환하는 게 정상입니다.
    // 이 라우트의 목적은 API를 호출해 프로젝트를 활성 상태로 유지하는 것뿐이므로, 그 경우도 성공으로 처리합니다.
    if (error && error.code !== "42501") throw error;

    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
