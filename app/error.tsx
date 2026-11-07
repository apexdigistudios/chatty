'use client';

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("A route failed to render.", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-black uppercase tracking-[0.16em] text-danger-deep">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-ink">The page couldn&apos;t load.</h1>
      <p className="mt-2 text-sm font-semibold text-ink-muted">
        Check your connection and try again. Your account data has not been changed.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-deep px-5 text-sm font-extrabold text-brand-contrast"
      >
        Try again
      </button>
    </main>
  );
}
