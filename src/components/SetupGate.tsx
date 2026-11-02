import { Database, KeyRound, TerminalSquare } from "lucide-react";
import { BrandLogo } from "./brand/BrandLogo";

/** Shown only when Supabase env vars are missing — the app never falls back to mock data. */
export function SetupGate() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4 py-10 text-ink">
      <div className="w-full max-w-lg rounded-3xl border-2 border-line bg-card p-6 shadow-[0_5px_0_var(--border-color)] sm:p-8">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-12 w-auto max-w-12 shrink-0 object-contain" />
          <div>
            <p className="text-sm font-black text-ink">Gist me</p>
            <h1 className="text-xl font-black tracking-tight sm:text-2xl">Connect to Supabase</h1>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
          This build talks to a live Supabase project for every post, school and confession.
          Add your project keys to get started.
        </p>

        <ol className="mt-5 space-y-3">
          {[
            { icon: TerminalSquare, text: <>Run <code className="rounded bg-page px-1.5 py-0.5 font-black">schema.sql</code> in the Supabase SQL Editor.</> },
            { icon: KeyRound, text: <>Copy <code className="rounded bg-page px-1.5 py-0.5 font-black">.env.example</code> to <code className="rounded bg-page px-1.5 py-0.5 font-black">.env</code> and paste your project URL + anon key.</> },
            { icon: Database, text: <>Restart <code className="rounded bg-page px-1.5 py-0.5 font-black">npm run dev</code>. Sign up, then grant yourself <code className="rounded bg-page px-1.5 py-0.5 font-black">global_admin</code> with the snippet at the end of the schema.</> },
          ].map(({ icon: Icon, text }, index) => (
            <li key={index} className="flex items-start gap-3 rounded-2xl border-2 border-line bg-page px-3.5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
                <Icon size={16} strokeWidth={2.6} aria-hidden />
              </span>
              <p className="text-sm font-semibold leading-relaxed text-ink-soft">{text}</p>
            </li>
          ))}
        </ol>

        <pre className="mt-5 overflow-x-auto rounded-2xl border-2 border-line bg-page p-4 text-[12px] font-bold leading-relaxed text-ink">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}
        </pre>
      </div>
    </div>
  );
}
