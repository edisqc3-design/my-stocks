"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import NotificationBell from "./NotificationBell";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  // 목록/대시보드형 화면(홈, 재고현황, 통계)은 넓게, 폼 위주 화면은 기존 폭 유지
  const wideRoutes = ["/", "/items", "/stats"];
  const isWide = wideRoutes.includes(pathname);

  return (
    <>
      <div className="app-shell min-h-screen">
        <SideNav />
        <main
          className={`mx-auto w-full max-w-2xl px-4 pb-24 pt-4 lg:px-8 lg:pb-8 lg:pt-8 ${
            isWide ? "lg:max-w-6xl" : "lg:max-w-4xl"
          }`}
        >
          {children}
        </main>
      </div>
      <div className="bottom-nav-mobile">
        <BottomNav />
      </div>
      <NotificationBell />
    </>
  );
}
