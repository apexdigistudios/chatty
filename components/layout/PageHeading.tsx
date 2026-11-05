'use client';

import type { ReactNode } from "react";

interface PageHeadingProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function PageHeading({ title, description, eyebrow, action }: PageHeadingProps) {
  return (
    <header className="mb-6 flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-brand-deep">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[28px] font-black leading-[1.05] tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[34ch] text-sm font-semibold leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="w-full min-w-0 sm:w-auto sm:shrink-0 sm:pt-1">{action}</div>}
    </header>
  );
}