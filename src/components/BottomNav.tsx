"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  Boxes,
  Settings,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardCheck,
  BarChart3,
} from "lucide-react";

const TABS = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/scan", label: "스캔", icon: ScanLine },
  { href: "/scan?mode=in", label: "입고", icon: ArrowDownCircle },
  { href: "/scan?mode=out", label: "출고", icon: ArrowUpCircle },
  { href: "/count", label: "재고실사", icon: ClipboardCheck },
  { href: "/items", label: "재고현황", icon: Boxes },
  { href: "/stats", label: "통계", icon: BarChart3 },
  { href: "/settings", label: "설정", icon: Settings },
];

function isTabActive(href: string, pathname: string, currentMode: string | null) {
  const [hPath, hQuery] = href.split("?");
  if (hPath === "/") return pathname === "/";
  if (hPath === "/scan") {
    const wantMode = hQuery ? new URLSearchParams(hQuery).get("mode") : null;
    return pathname === "/scan" && currentMode === wantMode;
  }
  return pathname.startsWith(hPath);
}

function BottomNavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentMode = searchParams.get("mode");

  return (
    <ul className="mx-auto flex max-w-2xl">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isTabActive(href, pathname, currentMode);
        return (
          <li key={href} className="flex-1">
            <Link
              href={href}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--signal)]"
              style={{ color: active ? "var(--signal)" : "var(--ink-soft)" }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="주요 메뉴"
    >
      <Suspense fallback={<ul className="flex" />}>
        <BottomNavLinks />
      </Suspense>
    </nav>
  );
}
