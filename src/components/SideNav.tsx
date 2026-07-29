"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, Boxes, Settings, Package } from "lucide-react";
import SyncStatusBadge from "./SyncStatusBadge";

const TABS = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/scan", label: "스캔", icon: ScanLine },
  { href: "/items", label: "품목", icon: Boxes },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="side-nav-desktop hidden h-screen flex-col border-r border-[var(--line)] bg-[var(--card)] px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <Package className="text-[var(--primary)]" size={26} />
        <span className="text-lg font-bold">재고관리</span>
      </div>

      <ul className="flex flex-1 flex-col gap-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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

      <SyncStatusBadge />
    </aside>
  );
}
