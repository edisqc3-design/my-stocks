import { NextResponse, type NextRequest } from "next/server";
import { createProxyClient } from "@/lib/supabase-proxy";

// 로그인 없이 접근 가능한 경로 (로그인 페이지 자체, 정적 자원 등은 matcher에서 이미 제외됨)
const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { supabase, getResponse } = createProxyClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return getResponse();
}

export const config = {
  matcher: [
    // 정적 파일, PWA 아이콘/매니페스트, 서비스워커, keepalive API는 인증 검사 없이 통과
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|api/keepalive|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)",
  ],
};
