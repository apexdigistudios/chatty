'use client';

import type { ReactNode } from "react";
import { useLocation } from "@/lib/router";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { TrendingSidebar } from "@/components/layout/TrendingSidebar";

interface AppLayoutProps {
  children: ReactNode;
  navigationHidden: boolean;
}

/** Fluid mobile, tablet two-column, and large-screen three-column shell. */
export function AppLayout({ children, navigationHidden }: AppLayoutProps) {
  const { pathname } = useLocation();
  const isSpotlight = pathname === "/spotlight";
  const showBottomNav = pathname === "/" || pathname === "/spotlight";
  const columns = isSpotlight
    ? "md:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[208px_minmax(0,1fr)]"
    : "md:grid-cols-[190px_minmax(0,1fr)] lg:grid-cols-[190px_minmax(0,1fr)_260px] xl:grid-cols-[208px_minmax(0,640px)_280px] xl:justify-center";

  return (
    <div className="min-h-dvh overflow-x-clip bg-page text-ink transition-colors duration-200">
      <Header hidden={navigationHidden} />
      <div className={`mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-0 overflow-x-clip px-0 sm:px-4 md:gap-5 md:px-5 lg:gap-5 lg:px-6 xl:gap-7 ${columns}`}>
        <div className="hidden min-w-0 md:block">
          <SidebarNav />
        </div>
        <main className={`min-h-[calc(100dvh-4rem)] min-w-0 overflow-x-clip ${isSpotlight ? "pb-0" : showBottomNav ? "pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-12" : "pb-6 md:pb-12"}`}>
          {children}
        </main>
        {!isSpotlight && <TrendingSidebar />}
      </div>
      {showBottomNav && <BottomNav hidden={navigationHidden} />}
    </div>
  );
}
