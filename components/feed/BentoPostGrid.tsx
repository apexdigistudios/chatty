"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { Link } from "@/lib/router";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { isVideoUrl } from "@/lib/video";
import type { Post } from "@/types/models";
import { formatCompactNumber } from "@/lib/utils";

function BentoAuthorAvatar({ name, src }: { name: string; src: string | null }) {
  const [unavailable, setUnavailable] = useState(false);
  const initials = name.trim().replace(/^@/, "").slice(0, 2).toUpperCase() || "?";

  useEffect(() => setUnavailable(false), [src]);

  return (
    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-brand-deep text-[9px] font-extrabold text-white shadow-md">
      {src && !unavailable ? (
        <img
          src={cloudflareMediaUrl(src)}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setUnavailable(true)}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}

function BentoPostCard({
  post,
  active,
  onVisibilityChange,
  onIntentChange,
  registerVideo,
}: {
  post: Post;
  active: boolean;
  onVisibilityChange: (id: string, visible: boolean) => void;
  onIntentChange: (id: string | null) => void;
  registerVideo: (id: string, video: HTMLVideoElement | null) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const src = post.mediaUrls[0];
  const type = post.mediaTypes?.[0] ?? (src && isVideoUrl(src) ? "video" : post.mediaType);
  const poster = post.videoThumbnailUrls?.[0] ?? post.videoThumbnailUrl ?? undefined;
  const isVideo = Boolean(src && type === "video");

  useEffect(() => {
    const node = cardRef.current;
    if (!node || !isVideo) return;
    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(post.id, entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.65] }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      onVisibilityChange(post.id, false);
    };
  }, [isVideo, onVisibilityChange, post.id]);

  return (
    <div ref={cardRef} className="min-w-0">
      <Link
        to={`/posts/${post.id}`}
        onMouseEnter={() => onIntentChange(isVideo ? post.id : null)}
        onMouseLeave={() => onIntentChange(null)}
        onFocus={() => onIntentChange(isVideo ? post.id : null)}
        onBlur={() => onIntentChange(null)}
        aria-label={`View @${post.authorName}'s gist: ${post.content}`}
        className="group relative block aspect-[4/5] min-w-0 overflow-hidden rounded-xl border border-line bg-neutral-900 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:rounded-2xl"
      >
        {isVideo ? (
          <video
            ref={(video) => registerVideo(post.id, video)}
            src={cloudflareMediaUrl(src!)}
            poster={poster ? cloudflareMediaUrl(poster) : undefined}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`Video gist by @${post.authorName}`}
            data-active={active}
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
            <BentoAuthorAvatar name={post.authorName} src={post.authorAvatar} />
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
  const videoElements = useRef(new Map<string, HTMLVideoElement>());
  const [visibleVideos, setVisibleVideos] = useState<Set<string>>(() => new Set());
  const [intentVideoId, setIntentVideoId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const videoPostIds = posts.filter((post) => {
    const src = post.mediaUrls[0];
    return Boolean(src && (post.mediaTypes?.[0] ?? (isVideoUrl(src) ? "video" : post.mediaType)) === "video");
  }).map((post) => post.id);

  const reportVisibility = useCallback((id: string, visible: boolean) => {
    setVisibleVideos((current) => {
      const next = new Set(current);
      if (visible) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const registerVideo = useCallback((id: string, video: HTMLVideoElement | null) => {
    if (video) videoElements.current.set(id, video);
    else videoElements.current.delete(id);
  }, []);

  useEffect(() => {
    const validVideoIds = new Set(videoPostIds);
    const intentIsVisible = intentVideoId && validVideoIds.has(intentVideoId) && visibleVideos.has(intentVideoId);
    const nextActiveId = intentIsVisible
      ? intentVideoId
      : videoPostIds.find((id) => visibleVideos.has(id)) ?? null;
    setActiveVideoId(nextActiveId);
  }, [intentVideoId, videoPostIds.join("|"), visibleVideos]);

  useEffect(() => {
    for (const [id, video] of videoElements.current) {
      if (id !== activeVideoId) {
        video.pause();
        video.currentTime = 0;
      }
    }

    const activeVideo = activeVideoId ? videoElements.current.get(activeVideoId) : null;
    if (!activeVideo) return;

    const loopPreview = () => {
      if (activeVideo.currentTime >= 3) activeVideo.currentTime = 0;
    };
    activeVideo.currentTime = 0;
    activeVideo.addEventListener("timeupdate", loopPreview);
    void activeVideo.play().catch(() => undefined);
    return () => activeVideo.removeEventListener("timeupdate", loopPreview);
  }, [activeVideoId]);

  if (posts.length === 0) {
    return <p className="py-8 text-center text-xs font-semibold text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3" aria-label="Gists">
      {posts.map((post) => (
        <BentoPostCard
          key={post.id}
          post={post}
          active={activeVideoId === post.id}
          onVisibilityChange={reportVisibility}
          onIntentChange={setIntentVideoId}
          registerVideo={registerVideo}
        />
      ))}
    </div>
  );
}
