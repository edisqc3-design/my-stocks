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
    if (error) throw error;

    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
