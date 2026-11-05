'use client';

import NextLink from "next/link";
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import { useCallback, useMemo } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  href?: string;
  children?: ReactNode;
};

export function Link({ to, href, children, ...props }: LinkProps) {
  return (
    <NextLink href={href ?? to} {...props}>
      {children}
    </NextLink>
  );
}

type NavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children"> & {
  to: string;
  end?: boolean;
  className?: string | ((state: { isActive: boolean; isPending: boolean }) => string | undefined);
  children?: ReactNode | ((state: { isActive: boolean; isPending: boolean }) => ReactNode);
};

export function NavLink({ to, end = false, className, children, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = end || to === "/"
    ? pathname === to
    : pathname === to || pathname.startsWith(`${to}/`);
  const resolvedClassName = typeof className === "function"
    ? className({ isActive, isPending: false })
    : className;
  const resolvedChildren = typeof children === "function"
    ? children({ isActive, isPending: false })
    : children;

  return (
    <NextLink href={to} className={resolvedClassName} aria-current={isActive ? "page" : undefined} {...props}>
      {resolvedChildren}
    </NextLink>
  );
}

export function useNavigate() {
  const router = useRouter();

  return useCallback((to: string | number, options?: { replace?: boolean }) => {
    if (typeof to === "number") {
      router.back();
      return;
    }
    if (options?.replace) router.replace(to);
    else router.push(to);
  }, [router]);
}

export function useLocation() {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  return {
    pathname,
    search: searchParams.toString() ? `?${searchParams.toString()}` : "",
    hash: "",
    state: null,
    key: pathname,
  };
}

export function useParams<T extends Record<string, string | string[]>>() {
  return useNextParams<T>();
}

type SearchParamsUpdate = URLSearchParams | Record<string, string> | string;

export function useSearchParams(): [
  URLSearchParams,
  (next: SearchParamsUpdate, options?: { replace?: boolean }) => void,
] {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useNextSearchParams();
  const search = currentSearchParams.toString();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const setSearchParams = useCallback((next: SearchParamsUpdate, options?: { replace?: boolean }) => {
    const updated = typeof next === "string"
      ? new URLSearchParams(next)
      : next instanceof URLSearchParams
        ? new URLSearchParams(next)
        : new URLSearchParams(next);
    const query = updated.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (options?.replace) router.replace(href);
    else router.push(href);
  }, [pathname, router]);

  return [params, setSearchParams];
}
