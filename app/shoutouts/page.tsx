import type { Metadata } from "next";
import { Suspense } from "react";
import { ShoutoutsPage } from "@/views/ShoutoutsPage";

export const metadata: Metadata = {
  title: "Student Shoutouts | Gist me",
  description:
    "A private inbox and outbox for sending and receiving student shoutouts. Mail is available only to the signed-in sender and recipient.",
  alternates: { canonical: "https://www.gistme.online/shoutouts" },
};

export default function ShoutoutsRoute() {
  return (
    <Suspense fallback={<ShoutoutsRouteFallback />}>
      <ShoutoutsPage />
    </Suspense>
  );
}

function ShoutoutsRouteFallback() {
  return (
    <section
      aria-busy="true"
      aria-label="Private student shoutout mailbox"
      className="mx-auto w-full max-w-[1000px] px-4 pb-10 pt-5 sm:px-6 sm:pt-7"
    >
      <header className="rounded-[26px] border-2 border-line bg-card p-5 shadow-[0_4px_0_var(--border-color)] sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">
          Inter-School Post Office
        </p>
        <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
          Paper Plane Shoutouts
        </h1>
        <p className="mt-2 max-w-[48ch] text-sm font-semibold leading-relaxed text-ink-muted">
          A private student mailbox for sending and receiving sealed digital envelopes across SHSs.
          Only you and the recipient can read your letters.
        </p>
      </header>
      <div className="mt-5 h-24 rounded-2xl border-2 border-line bg-card motion-safe:animate-pulse" />
    </section>
  );
}
