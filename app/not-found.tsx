import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found | Gist me",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-deep">404 · Lost the gist?</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">This page isn&apos;t here.</h1>
      <p className="mt-2 text-sm font-semibold text-ink-muted">
        The link may be outdated, or the page may have moved.
      </p>
      <a
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-deep px-5 text-sm font-extrabold text-brand-contrast"
      >
        Back to the feed
      </a>
    </main>
  );
}
