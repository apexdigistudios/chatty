'use client';

import { Search, Sparkles } from "lucide-react";
import NextLink from "next/link";
import { useAuth } from "@/context/AuthContext";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
          <BrandLogo className="h-9 w-auto max-w-10 shrink-0 object-contain sm:h-10" />
          <span className={`truncate text-[18px] font-black leading-none tracking-tight sm:text-xl ${spotlight ? "text-white" : "text-ink"}`}>
            Gist me
          </span>
          <span className={`hidden rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] min-[380px]:inline ${spotlight ? "bg-white/10 text-white" : "bg-brand-wash text-brand-deep"}`}>
            SHS
          </span>
        </NextLink>

        {/* Desktop search field */}
        <NextLink
          href="/explore"
          aria-label="Search gists and schools"
          className={`ml-auto hidden h-10 min-w-0 max-w-[430px] flex-1 items-center gap-2.5 rounded-2xl border-2 px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 sm:flex md:ml-0 ${spotlight ? "border-white/15 bg-white/10 text-white/75 hover:border-white/30 hover:text-white focus-visible:ring-white/25" : "border-line bg-page text-ink-muted hover:border-brand hover:text-ink focus-visible:ring-brand-soft"}`}
        >
          <Search size={17} strokeWidth={2.5} aria-hidden />
          <span className="truncate">Search gists, students, schools…</span>
        </NextLink>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ml-auto">
          {/* Mobile: only the search icon trigger */}
          <NextLink
            href="/explore"
            aria-label="Search gists, students and schools"
            className={`flex size-11 items-center justify-center rounded-2xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-4 sm:hidden ${spotlight ? "border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 hover:text-white focus-visible:ring-white/25" : "border-line bg-card text-ink hover:border-brand hover:text-brand-deep focus-visible:ring-brand-soft"}`}
          >
            <Search size={19} strokeWidth={2.5} aria-hidden />
          </NextLink>

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
