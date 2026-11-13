"use client";

import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { Link } from "@/lib/router";
import { Avatar } from "@/components/ui/Avatar";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { isVideoUrl } from "@/lib/video";
import type { Post } from "@/types/models";
import { formatCompactNumber } from "@/lib/utils";

function BentoPostCard({ post }: { post: Post }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);
  const src = post.mediaUrls[0];
  const type = post.mediaTypes?.[0] ?? (src && isVideoUrl(src) ? "video" : post.mediaType);
  const poster = post.videoThumbnailUrls?.[0] ?? post.videoThumbnailUrl ?? undefined;

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.65] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView || hovered) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [hovered, inView]);

  return (
    <div ref={cardRef} className="min-w-0">
    <Link
      to={`/posts/${post.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`View @${post.authorName}'s gist: ${post.content}`}
      className="group relative block aspect-[4/5] min-w-0 overflow-hidden rounded-xl border border-line bg-neutral-900 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:rounded-2xl"
    >
      {src && type === "video" ? (
        <video
          ref={videoRef}
          src={cloudflareMediaUrl(src)}
          poster={poster ? cloudflareMediaUrl(poster) : undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={`Video gist by @${post.authorName}`}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : src ? (
        <img
          src={cloudflareMediaUrl(src)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-brand-deep via-purple-700 to-neutral-950" />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/15 to-black/10" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 min-w-0 p-2.5 text-white sm:p-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar name={post.authorName} src={post.authorAvatar} size="sm" className="size-7 border border-white/60 shadow-md" />
          <span className="min-w-0 truncate text-[10px] font-extrabold drop-shadow sm:text-xs">
            @{post.authorName}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-3 break-words text-[10px] font-semibold leading-snug text-white/95 drop-shadow sm:text-xs">
          {post.content}
        </p>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold tabular-nums text-white/85 sm:text-[10px]">
          <Heart size={11} fill="currentColor" aria-hidden />
          {formatCompactNumber(post.likeCount)}
        </span>
      </div>
    </Link>
    </div>
  );
}

export function BentoPostGrid({
  posts,
  emptyMessage = "No posts to show yet.",
}: {
  posts: Post[];
  emptyMessage?: string;
}) {
  if (posts.length === 0) {
    return <p className="py-8 text-center text-xs font-semibold text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3" aria-label="Gists">
      {posts.map((post) => <BentoPostCard key={post.id} post={post} />)}
    </div>
  );
}
