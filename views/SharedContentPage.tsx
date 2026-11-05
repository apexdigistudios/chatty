'use client';

import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { ArrowLeft } from "lucide-react";
import { ConfessionCard } from "@/components/feed/ConfessionCard";
import { GistCard } from "@/components/feed/GistCard";
import { Button } from "@/components/ui/Button";
import { fetchApprovedConfession } from "@/services/confessionsService";
import { fetchPost } from "@/services/postsService";
import type { Confession, Post } from "@/types/models";

export function SharedContentPage({ kind, id }: { kind: "post" | "confession"; id: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [confession, setConfession] = useState<Confession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (!id) throw new Error("This share link is missing its content ID.");
        if (kind === "post") {
          const result = await fetchPost(id);
          if (!result) throw new Error("This gist is no longer available.");
          if (active) setPost(result);
        } else {
          const result = await fetchApprovedConfession(id);
          if (!result) throw new Error("This confession is no longer available.");
          if (active) setConfession(result);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this shared content.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, kind]);

  return (
    <div className="mx-auto w-full max-w-[740px] px-4 pb-10 pt-5 sm:px-6 sm:pt-7">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-xs font-extrabold text-ink-muted hover:text-brand-deep">
        <ArrowLeft size={14} aria-hidden /> Back to Gist me
      </Link>
      {loading ? (
        <div className="h-52 animate-pulse rounded-3xl border-2 border-line bg-card" />
      ) : error ? (
        <div role="alert" className="rounded-3xl border-2 border-line bg-card px-5 py-10 text-center">
          <p className="text-sm font-extrabold text-ink">{error}</p>
          <Button className="mt-4" onClick={() => window.location.assign("/")}>Explore Gist me</Button>
        </div>
      ) : post ? (
        <GistCard post={post} />
      ) : confession ? (
        <ConfessionCard confession={confession} />
      ) : null}
    </div>
  );
}
