'use client';

import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { ArrowLeft } from "lucide-react";
import { ConfessionCard } from "@/components/feed/ConfessionCard";
import { GistCard } from "@/components/feed/GistCard";
import { Button } from "@/components/ui/Button";
import { fetchApprovedConfession } from "@/services/confessionsService";
import { fetchPost } from "@/services/postsService";
import { useGistStore } from "@/store/gistStore";
import type { Confession, Post } from "@/types/models";

export function SharedContentPage({
  kind,
  id,
  initialPost,
  initialConfession,
  initialError = null,
}: {
  kind: "post" | "confession";
  id: string;
  initialPost?: Post | null;
  initialConfession?: Confession | null;
  initialError?: string | null;
}) {
  const [post, setPost] = useState<Post | null>(initialPost ?? null);
  const [confession, setConfession] = useState<Confession | null>(initialConfession ?? null);
  const [loading, setLoading] = useState(initialPost === undefined && initialConfession === undefined);
  const [error, setError] = useState<string | null>(initialError);
  const upsertPublicConfession = useGistStore((state) => state.upsertPublicConfession);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!id) throw new Error("This share link is missing its content ID.");
      if (kind === "post") {
        const result = await fetchPost(id);
        if (!result) throw new Error("This gist is no longer available.");
        setPost(result);
      } else {
        const result = await fetchApprovedConfession(id);
        if (!result) throw new Error("This confession is no longer available.");
        setConfession(result);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this shared content.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPost !== undefined || initialConfession !== undefined) return;
    void loadContent();
  }, [id, kind, initialPost, initialConfession]);

  useEffect(() => {
    if (kind === "post" && initialPost) {
      void fetchPost(id).then((latest) => {
        if (latest) setPost((current) => current ? { ...current, likedByMe: latest.likedByMe } : current);
      }).catch(() => undefined);
      return;
    }
    if (kind === "confession" && initialConfession) {
      void fetchApprovedConfession(id).then((latest) => {
        if (!latest) return;
        upsertPublicConfession(latest);
        setConfession((current) => current ? {
          ...current,
          reactions: latest.reactions,
          myReaction: latest.myReaction,
          commentCount: latest.commentCount,
        } : current);
      }).catch(() => undefined);
    }
  }, [id, initialConfession, initialPost, kind, upsertPublicConfession]);

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
          <Button className="mt-4" onClick={() => void loadContent()}>Try again</Button>
        </div>
      ) : post ? (
        <GistCard post={post} />
      ) : confession ? (
        <ConfessionCard confession={confession} />
      ) : null}
    </div>
  );
}
