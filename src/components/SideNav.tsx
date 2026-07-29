"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  Boxes,
  Settings,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardCheck,
  BarChart3,
} from "lucide-react";
import SyncStatusBadge from "./SyncStatusBadge";

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

function SideNavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentMode = searchParams.get("mode");

  return (
    <ul className="flex flex-1 flex-col gap-1">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isTabActive(href, pathname, currentMode);
        return (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--primary)" : "var(--ink-soft)",
                background: active ? "var(--primary-soft)" : "transparent",
              }}
            >
              <Icon size={20} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function SideNav() {
  return (
    <aside className="side-nav-desktop hidden h-screen flex-col border-r border-[var(--line)] bg-[var(--card)] px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <Package className="text-[var(--primary)]" size={26} />
        <span className="text-lg font-bold">재고관리</span>
      </div>

      <Suspense fallback={<ul className="flex-1" />}>
        <SideNavLinks />
      </Suspense>

      <SyncStatusBadge />
    </aside>
  );
}
