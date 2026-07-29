"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, Boxes, Settings } from "lucide-react";

const TABS = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/scan", label: "스캔", icon: ScanLine },
  { href: "/items", label: "품목", icon: Boxes },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="주요 메뉴"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--signal)]"
                style={{ color: active ? "var(--signal)" : "var(--ink-soft)" }}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
