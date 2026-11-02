import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { GistCard } from "../components/feed/GistCard";
import { PageHeading } from "../components/layout/PageHeading";
import { Card } from "../components/ui/Card";
import { describeError } from "../lib/supabase";
import { fetchFeed } from "../services/postsService";
import type { Post } from "../types/models";

export function SpotlightPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchFeed({ limit: 40 })
      .then((feed) => {
        if (active) setPosts(feed.filter((post) => post.spotlightStatus === "active"));
      })
      .catch((cause) => {
        if (active) setError(describeError(cause, "Could not load Spotlight gists."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-[860px] min-w-0 px-3 pt-5 sm:px-4 sm:pt-7 lg:px-5 xl:px-7">
      <PageHeading
        eyebrow="Community picks"
        title="Spotlight"
        description="Discover active promoted gists shared with Ghanaian school communities."
      />
      {error && (
        <p role="alert" className="mb-4 rounded-2xl border-2 border-danger-soft bg-danger-wash px-4 py-3 text-sm font-bold text-danger-deep">
          {error}
        </p>
      )}
      {loading ? (
        <Card className="p-6 text-center text-sm font-bold text-ink-muted">Loading active Spotlight gists…</Card>
      ) : posts.length ? (
        <div className="space-y-4">
          {posts.map((post) => <GistCard key={post.id} post={post} />)}
        </div>
      ) : (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-deep">
            <Zap size={22} aria-hidden />
          </span>
          <h2 className="text-base font-black text-ink">No active Spotlights right now</h2>
          <p className="mt-1 max-w-sm text-sm font-semibold text-ink-muted">Check back soon for promoted gists from your school communities.</p>
        </Card>
      )}
    </main>
  );
}
