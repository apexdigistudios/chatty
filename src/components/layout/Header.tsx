import { Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../brand/BrandLogo";
import { NotificationBell } from "../notifications/NotificationBell";
import { ThemeToggle } from "../ui/ThemeToggle";

/**
 * Sticky brand bar. Mobile keeps only the search trigger (per Step 9 polish);
 * the signed-in avatar now lives exclusively in the navigation shell.
 */
export function Header() {
  const { user } = useAuth();

  return (
    <header
      className="sticky top-0 z-30 border-b-2 border-line bg-card/95 px-3 py-2.5 backdrop-blur transition-colors duration-200 sm:px-4 md:py-3"
      style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto flex w-full max-w-[1320px] items-center gap-3 md:gap-6">
        <Link
          to="/"
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:gap-2.5"
          aria-label="Gist me home"
        >
          <BrandLogo className="h-9 w-auto max-w-10 shrink-0 object-contain sm:h-10" />
          <span className="truncate text-[18px] font-black leading-none tracking-tight text-ink sm:text-xl">
            Gist me
          </span>
          <span className="hidden rounded-lg bg-brand-wash px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-brand-deep min-[380px]:inline">
            SHS
          </span>
        </Link>

        {/* Desktop search field */}
        <Link
          to="/explore"
          aria-label="Search gists and schools"
          className="ml-auto hidden h-10 min-w-0 max-w-[430px] flex-1 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 text-sm font-semibold text-ink-muted transition-colors hover:border-brand hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:flex md:ml-0"
        >
          <Search size={17} strokeWidth={2.5} aria-hidden />
          <span className="truncate">Search gists, students, schools…</span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ml-auto">
          {/* Mobile: only the search icon trigger */}
          <Link
            to="/explore"
            aria-label="Search gists, students and schools"
            className="flex size-11 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:hidden"
          >
            <Search size={19} strokeWidth={2.5} aria-hidden />
          </Link>

          <NotificationBell />

          <div className="hidden sm:block">
            <ThemeToggle className="size-11 min-h-11 p-0" />
          </div>

          {!user && (
            <Link
              to="/auth?mode=signup"
              className="hidden h-11 items-center gap-1.5 rounded-2xl bg-[#8B5CF6] px-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-[0_3px_0_#5B21B6] transition-transform hover:bg-[#7C3AED] active:translate-y-0.5 sm:inline-flex"
            >
              <Sparkles size={14} strokeWidth={2.7} aria-hidden />
              <span>Get Started</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
