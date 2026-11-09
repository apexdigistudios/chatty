'use client';

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PREFETCH_ROUTES = ["/", "/profile", "/explore", "/schools", "/spotlight"];

export function NavigationFeedback() {
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const route of PREFETCH_ROUTES) router.prefetch(route);
  }, [router]);

  useEffect(() => {
    setComplete(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setComplete(false);
    }, 180);
  }, [pathname]);

  useEffect(() => {
    const clearTimers = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };

    const begin = () => {
      clearTimers();
      setComplete(false);
      setVisible(true);
      fallbackTimer.current = setTimeout(() => {
        setComplete(true);
        hideTimer.current = setTimeout(() => {
          setVisible(false);
          setComplete(false);
        }, 180);
      }, 12_000);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      begin();
    };

    const onPopState = () => begin();
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[120] h-1 transition-opacity duration-150 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`h-full origin-left bg-brand-deep shadow-[0_0_10px_var(--brand)] transition-[width,transform] duration-200 ease-out ${
          complete ? "w-full" : "w-[72%] animate-pulse"
        }`}
      />
    </div>
  );
}
