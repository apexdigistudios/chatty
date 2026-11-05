import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Heart, MessageCircle, RefreshCw, Share2, Volume2, VolumeX, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { describeError } from "../lib/supabase";
import { timeAgo } from "../lib/time";
import { recordPostShare } from "../services/followsService";
import { fetchApprovedConfessions, toggleReaction } from "../services/confessionsService";
import { fetchFeed, toggleLike } from "../services/postsService";
import { useAuthGateStore } from "../store/authGateStore";
import { useGistStore } from "../store/gistStore";
import type { Confession, Post } from "../types/models";
import { useToast } from "../components/ui/Toast";
import { Avatar } from "../components/ui/Avatar";
import { rotateBySeed } from "../lib/feedRotation";
import { isNativeSharePreferred, sharePreviewUrl } from "../lib/shareLinks";

type SpotlightItem =
  | { kind: "post"; key: string; videoUrl: string; post: Post }
  | { kind: "confession"; key: string; videoUrl: string; confession: Confession };

function extractTags(text: string): string[] {
  return [...new Set([...text.matchAll(/#([A-Za-z0-9_]{1,50})/g)].map((match) => match[1]!.toLowerCase()))];
}

export function SpotlightPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const openComments = useGistStore((state) => state.openComments);
  const commentsByThread = useGistStore((state) => state.commentsByThread);
  const slideListRef = useRef<HTMLDivElement>(null);
  const schools = useGistStore((state) => state.schools);
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const [items, setItems] = useState<SpotlightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [feed, confessions] = await Promise.all([
        fetchFeed({ limit: 100 }),
        fetchApprovedConfessions(100),
      ]);
      const videoPosts = feed
        .filter((post) => post.mediaTypes?.includes("video") || post.mediaType === "video")
        .flatMap((post) =>
          post.mediaUrls.flatMap((videoUrl, index) =>
            post.mediaTypes?.[index] === "video" || (index === 0 && post.mediaType === "video")
              ? [{ kind: "post" as const, key: `post:${post.id}:${index}`, videoUrl, post }]
              : []
          )
        );
      const videoConfessions = confessions.flatMap((confession) =>
        confession.mediaUrls?.flatMap((videoUrl, index) =>
          confession.mediaTypes?.[index] === "video"
            ? [{
                kind: "confession" as const,
                key: `confession:${confession.id}:${index}`,
                videoUrl,
                confession,
              }]
            : []
        ) ?? []
      );
      const chronologicalItems = [...videoPosts, ...videoConfessions].sort((left, right) => {
        const leftCreatedAt = left.kind === "post" ? left.post.createdAt : left.confession.publishedAt ?? left.confession.createdAt;
        const rightCreatedAt = right.kind === "post" ? right.post.createdAt : right.confession.publishedAt ?? right.confession.createdAt;
        return Date.parse(rightCreatedAt) - Date.parse(leftCreatedAt);
      });
      setItems(rotateBySeed(chronologicalItems, Math.random()));
    } catch (cause) {
      setError(describeError(cause, "Could not load Spotlight videos."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const share = async (post: Post) => {
    const url = sharePreviewUrl("post", post.id);
    if (isNativeSharePreferred()) {
      try {
        await navigator.share({ title: "Spotlight on Gist me", text: post.content.slice(0, 120), url });
        void recordPostShare(post.id).catch((cause: unknown) => console.error("Could not record this gist share.", cause));
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        console.error("Could not open the native share sheet.", cause);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Gist link copied.", "success");
      void recordPostShare(post.id).catch((cause: unknown) => console.error("Could not record this gist share.", cause));
    } catch (cause) {
      toast("Could not copy the gist link.", "danger");
      console.error("Could not copy gist link.", cause);
    }
  };

  const shareConfession = async (confession: Confession) => {
    const url = sharePreviewUrl("confession", confession.id);
    if (isNativeSharePreferred()) {
      try {
        await navigator.share({ title: "Anonymous confession on Gist me", text: "Click to read and reply anonymously.", url });
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        console.error("Could not open the native share sheet.", cause);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Confession link copied.", "success");
    } catch (cause) {
      toast("Could not copy the confession link.", "danger");
      console.error("Could not copy confession link.", cause);
    }
  };

  const scrollSlide = (direction: -1 | 1) => {
    const list = slideListRef.current;
    if (!list) return;
    list.scrollBy({ top: direction * list.clientHeight, behavior: "smooth" });
  };

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-neutral-950 text-white">
      <section className="relative h-full min-w-0 flex-1 bg-neutral-950">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pb-5 pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center justify-between">
          <Link
            to="/"
            aria-label="Back to feed"
            className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft size={20} strokeWidth={2.7} aria-hidden />
          </Link>
          <h1 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.16em] text-white drop-shadow">
            <Zap size={16} fill="currentColor" className="text-purple-300" aria-hidden />
            Spotlight
          </h1>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh Spotlight"
            className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md disabled:opacity-60"
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} aria-hidden />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex h-full items-center justify-center text-sm font-bold text-white/75">Finding your next favorite…</div>
      ) : error ? (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-sm text-sm font-bold text-white">{error}</p>
          <button type="button" onClick={() => void load(true)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-neutral-950">Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <Zap size={28} className="mb-3 text-purple-300" aria-hidden />
          <p className="text-base font-black">No videos to spotlight yet</p>
          <p className="mt-1 max-w-xs text-sm font-semibold text-white/65">
            Video gists and approved confession clips will show up here.
          </p>
        </div>
      ) : (
        <div ref={slideListRef} className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {items.map((item) => {
            const threadId = item.kind === "post" ? item.post.id : item.confession.id;
            const cachedCount = commentsByThread[`${item.kind}:${threadId}`]?.length;
            const slideItem = item.kind === "post"
              ? { ...item, post: { ...item.post, commentCount: Math.max(item.post.commentCount, cachedCount ?? 0) } }
              : { ...item, confession: { ...item.confession, commentCount: Math.max(item.confession.commentCount, cachedCount ?? 0) } };
            return (
              <SpotlightSlide
                key={slideItem.key}
                item={slideItem}
                schoolName={
                  item.kind === "post"
                    ? item.post.schoolShort
                    : item.confession.schoolId
                      ? schools.find((school) => school.id === item.confession.schoolId)?.shortName ?? "School"
                      : "Gist me"
                }
                onLike={async () => {
                  if (item.kind !== "post") return;
                  if (!user) {
                    openAuthGate({ title: "Like this Spotlight", speech: "Join Gist me to react to campus videos.", returnTo: "/spotlight" });
                    return;
                  }
                  try {
                    const liked = await toggleLike(item.post.id);
                    setItems((current) => current.map((entry) => entry.key === item.key && entry.kind === "post"
                      ? { ...entry, post: { ...entry.post, likedByMe: liked, likeCount: Math.max(0, entry.post.likeCount + (liked ? 1 : -1)) } }
                      : entry));
                  } catch (cause) {
                    toast(describeError(cause, "Could not update your reaction."), "danger");
                  }
                }}
                onComment={() => {
                  openComments(item.kind === "post"
                    ? { type: "post", id: item.post.id }
                    : { type: "confession", id: item.confession.id });
                }}
                onShare={() => {
                  if (item.kind === "post") void share(item.post);
                }}
                onShareConfession={() => {
                  if (item.kind === "confession") void shareConfession(item.confession);
                }}
                onConfessionReaction={async () => {
                  if (item.kind !== "confession") return;
                  if (!user) {
                    openAuthGate({ title: "React anonymously", speech: "Join Gist me to react to campus confessions.", returnTo: "/spotlight" });
                    return;
                  }
                  try {
                    const confession = item.confession;
                    const current = confession.myReaction;
                    const next = current === "heart" ? null : "heart";
                    await toggleReaction(confession.id, "heart", current);
                    setItems((currentItems) => currentItems.map((entry) => {
                      if (entry.kind !== "confession" || entry.confession.id !== confession.id) return entry;
                      const reactions = { ...entry.confession.reactions };
                      if (current) reactions[current] = Math.max(0, reactions[current] - 1);
                      if (next) reactions[next] += 1;
                      return { ...entry, confession: { ...entry.confession, reactions, myReaction: next } };
                    }));
                  } catch (cause) {
                    toast(describeError(cause, "Could not update your reaction."), "danger");
                  }
                }}
              />
            );
          })}
        </div>
      )}
      </section>
      {!loading && !error && items.length > 0 && (
        <div className="hidden w-16 shrink-0 items-center justify-center lg:flex">
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => scrollSlide(-1)} aria-label="Previous Spotlight video" className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/80">
              <ArrowUp size={20} aria-hidden />
            </button>
            <button type="button" onClick={() => scrollSlide(1)} aria-label="Next Spotlight video" className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/80">
              <ArrowDown size={20} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCaption(content: string) {
  return content.split(/(#[A-Za-z0-9_]{1,50})/g).map((part, index) =>
    part.startsWith("#")
      ? <Link key={`${part}-${index}`} to={`/explore?tag=${encodeURIComponent(part.slice(1).toLowerCase())}`} className="font-extrabold text-white underline decoration-white/60 underline-offset-2">{part}</Link>
      : <span key={index}>{part}</span>
  );
}

function SpotlightSlide({
  item,
  schoolName,
  onLike,
  onComment,
  onShare,
  onShareConfession,
  onConfessionReaction,
}: {
  item: SpotlightItem;
  schoolName: string;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onShareConfession: () => void;
  onConfessionReaction: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const confession = item.kind === "confession" ? item.confession : null;
  const post = item.kind === "post" ? item.post : null;
  const caption = post?.content ?? confession?.content ?? "";
  const author = post
    ? post.authorFullName || `@${post.authorName}`
    : confession?.seedFullName || (confession?.seedUsername ? `@${confession.seedUsername}` : "Anonymous");
  const username = post?.authorName ?? confession?.seedUsername ?? null;
  const tags = extractTags(caption);

  useEffect(() => {
    const video = videoRef.current;
    const slide = video?.parentElement;
    if (!video || !slide) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
        video.muted = false;
        void video.play().catch(async () => {
          setAudioBlocked(true);
          video.muted = true;
          setMuted(true);
          try {
            await video.play();
          } catch {
            setPlaying(false);
          }
        });
      } else {
        video.pause();
      }
    }, { threshold: [0, 0.65, 1] });
    observer.observe(slide);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [item.videoUrl]);

  const reactionCount = confession
    ? Object.values(confession.reactions).reduce((total, count) => total + count, 0)
    : post?.likeCount ?? 0;

  return (
    <article className="relative h-full w-full snap-start snap-always overflow-hidden bg-neutral-950">
      <video
        ref={videoRef}
        src={item.videoUrl}
        playsInline
        loop
        muted={muted}
        preload="metadata"
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play().catch(() => undefined);
          else video.pause();
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 size-full object-contain"
        aria-label={`Spotlight video by ${author}`}
      />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-black/20" aria-hidden />
      {audioBlocked && muted && (
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = false;
            setMuted(false);
            setAudioBlocked(false);
            void video.play().catch(() => {
              video.muted = true;
              setMuted(true);
              setAudioBlocked(true);
            });
          }}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/65 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur"
        >
          Tap to enable sound
        </button>
      )}

      <div className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 right-19 z-10 space-y-2 text-white md:bottom-24">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black">{author}</span>
          {username && author !== `@${username}` && <span className="text-[11px] font-semibold text-white/75">@{username}</span>}
          {confession && <span className="text-[11px] font-bold text-white/75">· Anonymous confession</span>}
        </div>
        <p className="text-[11px] font-semibold text-white/75">{schoolName} · {timeAgo(post?.createdAt ?? confession?.publishedAt ?? confession?.createdAt ?? "")}</p>
        {caption && <p className="line-clamp-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed drop-shadow">{renderCaption(caption)}</p>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag) => (
              <Link key={tag} to={`/explore?tag=${encodeURIComponent(tag)}`} className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur">#{tag}</Link>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-white/75">
          <span aria-hidden>♫</span>
          Original audio · {author}
        </p>
      </div>

      <aside className="absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-3 z-10 flex flex-col items-center gap-4 text-white md:bottom-24">
        <Link to={post ? `/profile/${post.authorId}` : "/confessions"} aria-label={`View ${author}`} className="mb-1 rounded-full shadow-lg">
          <Avatar
            name={post?.authorName ?? confession?.seedUsername ?? "Anonymous"}
            src={post?.authorAvatar ?? confession?.seedAvatarUrl}
            size="md"
          />
        </Link>
        {post ? (
          <>
            <ActionButton label={`${post.likedByMe ? "Unlike" : "Like"} · ${reactionCount}`} onClick={onLike} active={post.likedByMe} detail={reactionCount}>
              <Heart size={25} fill={post.likedByMe ? "currentColor" : "none"} />
            </ActionButton>
            <ActionButton label={`Comments · ${post.commentCount}`} onClick={onComment} detail={post.commentCount}>
              <MessageCircle size={24} />
            </ActionButton>
            <ActionButton label="Share video" onClick={onShare} detail={post.shareCount ?? "Share"}>
              <Share2 size={23} />
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton label={`React · ${reactionCount}`} onClick={onConfessionReaction} active={confession?.myReaction === "heart"} detail={reactionCount}>
              <Heart size={25} fill={confession?.myReaction === "heart" ? "currentColor" : "none"} />
            </ActionButton>
            <ActionButton label={`Comments · ${confession?.commentCount ?? 0}`} onClick={onComment} detail={confession?.commentCount ?? 0}>
              <MessageCircle size={24} />
            </ActionButton>
            <ActionButton label="Share confession" onClick={onShareConfession}>
              <Share2 size={23} />
            </ActionButton>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
            if (!video.muted) setAudioBlocked(false);
          }}
          aria-label={muted ? "Turn sound on" : "Mute video"}
          className="flex min-h-11 flex-col items-center gap-1 text-[10px] font-extrabold drop-shadow"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur"><span className="sr-only">{playing ? "Playing" : "Paused"}</span>{muted ? <VolumeX size={21} /> : <Volume2 size={21} />}</span>
          Sound
        </button>
      </aside>
    </article>
  );
}

function ActionButton({
  label,
  onClick,
  active = false,
  children,
  detail,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex min-h-11 flex-col items-center gap-1 text-[10px] font-extrabold drop-shadow ${active ? "text-pink-400" : "text-white"}`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur">{children}</span>
      {detail !== undefined && <span>{detail}</span>}
    </button>
  );
}
