"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";
import { Link } from "@/lib/router";
import { Avatar } from "@/components/ui/Avatar";
import { fetchFeed } from "@/services/postsService";
import { searchProfiles, type ProfileSearchHit } from "@/services/profilesService";
import type { Post } from "@/types/models";
import { cn } from "@/utils/cn";

type SearchResult =
  | { type: "post"; post: Post; label: string }
  | { type: "profile"; profile: ProfileSearchHit; label: string };

function sortedResults(posts: Post[], profiles: ProfileSearchHit[]): SearchResult[] {
  return [
    ...posts.map((post) => ({
      type: "post" as const,
      post,
      label: post.content.trim() || `Gist by @${post.authorName}`,
    })),
    ...profiles.map((profile) => ({
      type: "profile" as const,
      profile,
      label: profile.fullName?.trim() || `@${profile.username}`,
    })),
  ].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
    a.type.localeCompare(b.type)
  );
}

export function UniversalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileOpen) inputRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      Promise.all([fetchFeed({ search: term, limit: 8 }), searchProfiles(term, 8)])
        .then(([posts, profiles]) => {
          if (active) setResults(sortedResults(posts, profiles).slice(0, 10));
        })
        .catch((cause: unknown) => {
          if (!active) return;
          console.error("Could not load live search recommendations.", cause);
          setResults([]);
          setError("Search is unavailable right now.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const closeMobile = () => {
    setMobileOpen(false);
    setFocused(false);
  };

  const resultList = (
    <div className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain">
      {loading && (
        <p className="flex items-center gap-2 px-3 py-3 text-xs font-semibold text-ink-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Searching posts and profiles…
        </p>
      )}
      {!loading && error && <p className="px-3 py-3 text-xs font-semibold text-danger-deep">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <p className="px-3 py-3 text-xs font-semibold text-ink-muted">No matching posts or profiles.</p>
      )}
      {!loading && results.map((result) => result.type === "profile" ? (
        <Link
          key={`profile-${result.profile.id}`}
          to={`/profile/${result.profile.id}`}
          onClick={closeMobile}
          className="flex min-h-14 items-center gap-2.5 border-b border-line/70 px-3 py-2.5 last:border-0 hover:bg-page focus-visible:outline-none focus-visible:bg-page"
        >
          <Avatar name={result.profile.username} src={result.profile.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-extrabold text-ink">{result.label}</span>
            <span className="block truncate text-[10px] font-semibold text-ink-muted">@{result.profile.username} · Profile</span>
          </span>
          <span className="rounded-lg bg-brand-wash px-2.5 py-1.5 text-[10px] font-extrabold text-brand-deep">View</span>
        </Link>
      ) : (
        <Link
          key={`post-${result.post.id}`}
          to={`/posts/${result.post.id}`}
          onClick={closeMobile}
          className="flex min-h-14 items-center gap-2.5 border-b border-line/70 px-3 py-2.5 last:border-0 hover:bg-page focus-visible:outline-none focus-visible:bg-page"
        >
          <Avatar name={result.post.authorName} src={result.post.authorAvatar} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-extrabold text-ink">{result.label}</span>
            <span className="block truncate text-[10px] font-semibold text-ink-muted">Gist · @{result.post.authorName}</span>
          </span>
          <span className="rounded-lg bg-brand-wash px-2.5 py-1.5 text-[10px] font-extrabold text-brand-deep">View</span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <div className="relative ml-auto hidden min-w-0 max-w-[430px] flex-1 sm:block md:ml-0">
        <label className="flex h-10 items-center gap-2.5 rounded-2xl border-2 border-line bg-page px-3.5 text-sm font-semibold text-ink-muted transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
          <Search size={17} strokeWidth={2.5} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setFocused(false);
                event.currentTarget.blur();
              }
            }}
            placeholder="Search gists, students, schools…"
            aria-label="Search posts and profiles"
            aria-autocomplete="list"
            aria-expanded={focused && query.trim().length >= 2}
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-ink outline-none placeholder:text-ink-muted"
          />
          {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {query && (
            <button type="button" aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery("")} className="flex size-7 items-center justify-center rounded-lg hover:bg-line/50">
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
        <AnimatePresence>
          {focused && query.trim().length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-x-0 top-full z-[70] mt-2 overflow-hidden rounded-2xl border-2 border-line bg-card shadow-2xl"
            >
              {resultList}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Search posts and profiles"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-ink transition-colors hover:border-brand hover:text-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:hidden"
      >
        <Search size={19} strokeWidth={2.5} aria-hidden />
      </button>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/45 px-3 pt-[max(1rem,env(safe-area-inset-top))] sm:hidden"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeMobile();
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="overflow-hidden rounded-2xl border-2 border-line bg-card shadow-2xl"
            >
              <label className="flex h-12 items-center gap-2.5 border-b-2 border-line px-3">
                <Search size={17} className="text-ink-muted" aria-hidden />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeMobile();
                  }}
                  placeholder="Search gists and students…"
                  aria-label="Search posts and profiles"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-ink-muted"
                />
                {loading && <Loader2 size={15} className="animate-spin text-ink-muted" aria-hidden />}
                <button type="button" onClick={closeMobile} aria-label="Close search" className="flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-page">
                  <X size={17} aria-hidden />
                </button>
              </label>
              <p className={cn("px-3 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted", query.trim().length < 2 && "pb-3")}>
                {query.trim().length < 2 ? "Type at least 2 characters" : "Posts and profiles · A–Z"}
              </p>
              {query.trim().length >= 2 && resultList}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
