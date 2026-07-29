"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="app-shell min-h-screen">
        <SideNav />
        <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 lg:max-w-4xl lg:px-8 lg:pb-8 lg:pt-8">
          {children}
        </main>
      </div>
      <div className="bottom-nav-mobile">
        <BottomNav />
      </div>
    </>
  );
}
