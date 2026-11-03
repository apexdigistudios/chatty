import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { SidebarNav } from "./SidebarNav";
import { TrendingSidebar } from "./TrendingSidebar";

interface AppLayoutProps {
  children: ReactNode;
}

/** Fluid mobile, tablet two-column, and large-screen three-column shell. */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-page text-ink transition-colors duration-200">
      <Header />
      <div className="mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-0 overflow-x-clip px-0 sm:px-4 md:grid-cols-[190px_minmax(0,1fr)] md:gap-5 md:px-5 lg:grid-cols-[190px_minmax(0,1fr)_260px] lg:gap-5 lg:px-6 xl:grid-cols-[208px_minmax(0,640px)_280px] xl:justify-center xl:gap-7">
        <div className="hidden min-w-0 md:block">
          <SidebarNav />
        </div>
        <main className="min-h-[calc(100dvh-4rem)] min-w-0 overflow-x-clip pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-12">
          {children}
        </main>
        <TrendingSidebar />
      </div>
      <BottomNav />
    </div>
  );
}
