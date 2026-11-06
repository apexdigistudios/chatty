'use client';

import { useMemo } from "react";
import { ArrowUpRight, Flame, GraduationCap, Users } from "lucide-react";
import { Link } from "@/lib/router";
import { useGistStore } from "@/store/gistStore";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { formatCompactNumber } from "@/lib/utils";

/** Live context rail derived from the loaded feed and school directory. */
export function TrendingSidebar() {
  const posts = useGistStore((state) => state.posts);
  const schools = useGistStore((state) => state.schools);
  const schoolsLoading = useGistStore((state) => state.schoolsLoading);

  const trending = useMemo(
    () => [...posts].sort((a, b) => b.likeCount + b.commentCount - (a.likeCount + a.commentCount)).slice(0, 4),
    [posts]
  );
  const topCommunities = useMemo(
    () => [...schools].sort((a, b) => b.memberCount + b.postCount - (a.memberCount + a.postCount)).slice(0, 4),
    [schools]
  );

  return (
    <aside className="hidden min-w-0 lg:block">
      <div className="sticky top-[88px] space-y-7 py-7">
        <section aria-labelledby="trending-title">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
              <Flame size={16} strokeWidth={2.5} aria-hidden />
            </span>
            <h2 id="trending-title" className="text-sm font-extrabold text-ink">Trending gists</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border-2 border-line bg-card">
            {trending.map((post, index) => (
              <Link
                key={post.id}
                to={post.schoolId ? `/schools/${post.schoolId}` : "/"}
                className={`flex items-start gap-3 px-3.5 py-3.5 transition-colors hover:bg-page ${index > 0 ? "border-t border-line" : ""}`}
              >
                <SchoolBadge schoolId={post.schoolId} crestUrl={post.schoolCrest} name={post.schoolShort} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-extrabold leading-snug text-ink">{post.content}</span>
                  <span className="mt-1 block text-[10px] font-bold text-ink-muted">
                    {post.schoolShort} · {formatCompactNumber(post.likeCount)} likes · {formatCompactNumber(post.commentCount)} replies
                  </span>
                </span>
                <ArrowUpRight size={15} className="mt-1 shrink-0 text-ink-faint" aria-hidden />
              </Link>
            ))}
            {trending.length === 0 && (
              <p className="px-3.5 py-6 text-center text-xs font-semibold text-ink-muted">
                Nothing trending yet — be the first to post.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="communities-title">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
              <GraduationCap size={17} strokeWidth={2.5} aria-hidden />
            </span>
            <h2 id="communities-title" className="text-sm font-extrabold text-ink">Top SHS communities</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border-2 border-line bg-card">
            {topCommunities.map((school, index) => (
              <Link
                key={school.id}
                to={`/schools/${school.id}`}
                className={`flex items-center gap-2.5 px-3 py-3 transition-colors hover:bg-page ${index > 0 ? "border-t border-line" : ""}`}
              >
                <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold text-ink">{school.shortName}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-ink-muted">
                    <Users size={11} aria-hidden /> {formatCompactNumber(school.memberCount)} students · {formatCompactNumber(school.postCount)} gists
                  </span>
                </span>
                <span className="rounded-lg px-2 py-1 text-[10px] font-extrabold text-brand-deep">Feed</span>
              </Link>
            ))}
            {topCommunities.length === 0 && (
              <p className="px-3.5 py-6 text-center text-xs font-semibold text-ink-muted">
                {schoolsLoading ? "Loading communities…" : "No communities yet."}
              </p>
            )}
          </div>
        </section>

        <p className="px-1 text-[10px] font-semibold leading-relaxed text-ink-muted">
          Let&apos;s Gist is moderated by each school&apos;s founders, with a global safety team for confessions.
        </p>
      </div>
    </aside>
  );
}
