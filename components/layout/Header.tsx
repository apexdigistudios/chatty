'use client';

import { Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { UniversalSearch } from "@/components/layout/UniversalSearch";

/**
 * Sticky brand bar. Mobile keeps only the search trigger (per Step 9 polish);
 * the signed-in avatar now lives exclusively in the navigation shell.
 */
export function Header({ hidden = false, spotlight = false }: { hidden?: boolean; spotlight?: boolean }) {
  const { user } = useAuth();

  return (
    <header
      className={`sticky top-0 z-50 border-b px-3 py-2.5 backdrop-blur-md transition-transform duration-300 ease-in-out sm:px-4 md:py-3 ${spotlight ? "border-white/10 bg-black text-white" : "border-line/60 bg-white/80 dark:border-neutral-800/50 dark:bg-neutral-950/80"} ${hidden ? "-translate-y-full md:translate-y-0" : "translate-y-0"}`}
      style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto flex w-full max-w-[1320px] items-center gap-3 md:gap-6">
        <NextLink
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:gap-2.5"
          aria-label="Gist me home"
        >
          <BrandLogo className="size-9 shrink-0 rounded-xl object-contain sm:size-10" />
          <span className={`truncate text-[18px] font-black leading-none tracking-tight sm:text-xl ${spotlight ? "text-white" : "text-ink"}`}>
            Gist me
          </span>
          <span className={`hidden rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] min-[380px]:inline ${spotlight ? "bg-white/10 text-white" : "bg-brand-wash text-brand-deep"}`}>
            SHS
          </span>
        </NextLink>

        <UniversalSearch />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ml-auto">
          <NotificationBell spotlight={spotlight} />

          <div className="hidden sm:block">
            <ThemeToggle spotlight={spotlight} className="size-11 min-h-11 p-0" />
          </div>

          {!user && (
            <NextLink
              href="/auth?mode=signup"
              className="hidden h-11 items-center gap-1.5 rounded-2xl bg-[#8B5CF6] px-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-[0_3px_0_#5B21B6] transition-transform hover:bg-[#7C3AED] active:translate-y-0.5 sm:inline-flex"
            >
              <Sparkles size={14} strokeWidth={2.7} aria-hidden />
              <span>Get Started</span>
            </NextLink>
          )}
        </div>
      </div>
    </header>
  );
}
