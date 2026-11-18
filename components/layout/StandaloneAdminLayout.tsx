"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";

export function StandaloneAdminLayout({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, profile, isGlobalAdmin, loading: authLoading } = useAuth();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const isVvip = pathname === "/vvip" || pathname.startsWith("/vvip/");

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    const deny = () => {
      if (!active) return;
      toast("Access denied. Administrator permissions are required.", "danger");
      router.replace("/");
      setChecking(false);
    };

    if (!user || (!profile?.isAdmin && !isGlobalAdmin)) {
      deny();
      return () => {
        active = false;
      };
    }

    setChecking(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("is_confession_admin", {
          p_user_id: user.id,
        });
        if (!active) return;
        if (error) {
          console.error("Could not verify standalone admin access.", error.message);
          deny();
          return;
        }
        if (data !== true) {
          deny();
          return;
        }
        setAuthorized(true);
      } catch (error) {
        if (!active) return;
        console.error("Could not verify standalone admin access.", error);
        deny();
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [authLoading, isGlobalAdmin, profile?.isAdmin, router, toast, user]);

  if (authLoading || checking || !authorized) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-page px-4 text-ink">
        <div role="status" className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card px-5 py-4 text-sm font-bold text-ink-muted">
          <Loader2 size={18} className="animate-spin text-brand" aria-hidden />
          Verifying administrator access…
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="sticky top-0 z-30 border-b-2 border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" aria-label="GistMe dashboard">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-deep text-base font-black text-brand-contrast">G</span>
            <span className="truncate text-base font-black tracking-tight text-ink">GistMe</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge tone="brand"><ShieldCheck size={12} aria-hidden />{isVvip ? "VVIP" : "Admin"}</Badge>
            <Link href="/" className="inline-flex min-h-10 items-center rounded-xl bg-brand-deep px-3 text-[10px] font-black uppercase tracking-wider text-brand-contrast shadow-[0_3px_0_var(--brand-edge)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:px-4 sm:text-xs">
              Exit to App
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
