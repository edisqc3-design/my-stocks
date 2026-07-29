import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SideNav from "@/components/SideNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "재고관리",
  description: "스캔 기반 오프라인 지원 재고관리 앱",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#7c5cf0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <ServiceWorkerRegister />
        <div className="app-shell min-h-screen">
          <SideNav />
          <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 lg:max-w-4xl lg:px-8 lg:pb-8 lg:pt-8">
            {children}
          </main>
        </div>
        <div className="bottom-nav-mobile">
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
