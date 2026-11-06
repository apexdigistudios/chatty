'use client';

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { TrendingSidebar } from "@/components/layout/TrendingSidebar";

interface AppLayoutProps {
  children: ReactNode;
  headerHidden: boolean;
  bottomNavHidden: boolean;
  fullscreen: boolean;
}

/** Fluid mobile, tablet two-column, and large-screen three-column shell. */
export function AppLayout({
  children,
  headerHidden,
  bottomNavHidden,
  fullscreen,
}: AppLayoutProps) {
  const pathname = usePathname();
  const isSpotlight = pathname === "/spotlight";
  const page = (
    <Suspense fallback={<PageContentFallback />}>
      {children}
    </Suspense>
  );
  const columns = isSpotlight
    ? "md:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[208px_minmax(0,1fr)]"
    : "md:grid-cols-[190px_minmax(0,1fr)] lg:grid-cols-[190px_minmax(0,1fr)_260px] xl:grid-cols-[208px_minmax(0,640px)_280px] xl:justify-center";

  return (
    <div className="min-h-dvh overflow-x-clip bg-page text-ink transition-colors duration-200">
      <Header hidden={headerHidden} spotlight={isSpotlight} />
      <div className={`mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-0 overflow-x-clip px-0 sm:px-4 md:gap-5 md:px-5 lg:gap-5 lg:px-6 xl:gap-7 ${fullscreen ? "contents" : columns}`}>
        <div className={`min-w-0 ${fullscreen ? "hidden" : "hidden md:block"}`}>
          <SidebarNav />
        </div>
        {fullscreen ? (
          <div className="contents">{page}</div>
        ) : (
          <main className={`min-h-[calc(100dvh-4rem)] min-w-0 overflow-x-clip ${isSpotlight ? "pb-0" : "pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-12"}`}>
            {page}
          </main>
        )}
        <div className={isSpotlight || fullscreen ? "hidden" : "block"}>
          <TrendingSidebar />
        </div>
      </div>
      <BottomNav hidden={bottomNavHidden} fullscreen={fullscreen} spotlight={isSpotlight} />
    </div>
  );
}

function PageContentFallback() {
  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 px-4 py-6 sm:px-6" role="status" aria-label="Loading page">
      <div className="h-24 animate-pulse rounded-3xl border-2 border-line bg-card motion-reduce:animate-none" />
      <div className="h-48 animate-pulse rounded-3xl border-2 border-line bg-card motion-reduce:animate-none" />
    </div>
  );
}
