import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Hash, Loader2, MapPin, Search, Users, X } from "lucide-react";
import { PageHeading } from "../components/layout/PageHeading";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Card, CardBody } from "../components/ui/Card";
import { ImageLightbox } from "../components/ui/ImageLightbox";
import { ProgressiveImage } from "../components/ui/ProgressiveImage";
import { SchoolBadge } from "../components/ui/SchoolBadge";
import { describeError } from "../lib/supabase";
import { timeAgo } from "../lib/time";
import { searchProfiles, type ProfileSearchHit } from "../services/profilesService";
import { fetchFeed } from "../services/postsService";
import { useGistStore } from "../store/gistStore";
import type { Post } from "../types/models";
import { cn } from "../utils/cn";

type ExploreFilter = "All" | "Gists" | "People" | "Schools";
const filters: ExploreFilter[] = ["All", "Gists", "People", "Schools"];

/** Explore — server-side search across posts and profiles, client filter over schools. */
export function ExplorePage() {
  const navigate = useNavigate();
  const schools = useGistStore((state) => state.schools);
  const loadSchools = useGistStore((state) => state.loadSchools);
  const setFeedSchool = useGistStore((state) => state.setFeedSchool);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<ExploreFilter>("All");
  const [gists, setGists] = useState<Post[]>([]);
  const [people, setPeople] = useState<ProfileSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (schools.length === 0) void loadSchools();
  }, [schools.length, loadSchools]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchFeed({ search: debounced || undefined, limit: debounced ? 20 : 8 }),
      debounced ? searchProfiles(debounced) : Promise.resolve([] as ProfileSearchHit[]),
    ])
      .then(([nextGists, nextPeople]) => {
        if (!active) return;
        setGists(
          debounced
            ? nextGists
            : [
                ...nextGists.filter((post) => post.spotlightStatus === "active"),
                ...nextGists
                  .filter((post) => post.spotlightStatus !== "active")
                  .sort((a, b) => b.likeCount - a.likeCount),
              ]
        );
        setPeople(nextPeople);
      })
      .catch((err) => active && setError(describeError(err, "Search failed.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debounced]);

  const schoolHits = useMemo(() => {
    const q = debounced.toLowerCase();
    return schools.filter((school) => !q || `${school.name} ${school.shortName} ${school.region}`.toLowerCase().includes(q)).slice(0, 8);
  }, [debounced, schools]);

  const showGists = filter === "All" || filter === "Gists";
  const showPeople = filter === "All" || filter === "People";
  const showSchools = filter === "All" || filter === "Schools";
  const empty = !loading && (showGists ? gists.length === 0 : true) && (showPeople ? people.length === 0 : true) && (showSchools ? schoolHits.length === 0 : true);

  const openSchoolFeed = (schoolId: string) => {
    setFeedSchool(schoolId);
    navigate("/");
  };

  return (
    <div className="mx-auto w-full max-w-[860px] min-w-0 px-3 pt-5 sm:px-4 sm:pt-7 lg:px-5 xl:px-7">
      <PageHeading eyebrow="Find your people" title="Explore" description="Search live gists, students and SHS communities across Ghana." />

      <label className="flex h-12 items-center gap-3 rounded-2xl border-2 border-line bg-card px-3.5 transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
        <Search size={19} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try NSMQ, interco, PRESEC or a nickname" aria-label="Search" className="min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-faint" />
        {loading ? <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden /> : query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-page hover:text-ink"><X size={15} strokeWidth={2.6} aria-hidden /></button>
        )}
      </label>

      <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Filter results">
        {filters.map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={cn("min-w-0 rounded-xl border-2 px-1.5 py-2 text-[11px] font-extrabold transition-colors sm:px-3 sm:text-xs", filter === item ? "border-ink bg-ink text-card dark:border-brand-deep dark:bg-brand-deep dark:text-brand-contrast" : "border-line bg-card text-ink-muted hover:border-line-deep hover:text-ink")}>
            {item}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3 text-xs font-semibold text-danger-deep">{error}</p>}

      {empty ? (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-line px-5 py-12 text-center">
          <p className="text-sm font-extrabold text-ink">No matches yet</p>
          <p className="mx-auto mt-1 max-w-[32ch] text-xs font-semibold leading-relaxed text-ink-muted">Try a school name, a topic or a student nickname.</p>
        </div>
      ) : (
        <div className="space-y-8 pb-8">
          {showGists && gists.length > 0 && (
            <section aria-labelledby="gists-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="gists-heading" className="text-sm font-extrabold text-ink sm:text-base">{debounced ? "Gists matching your search" : "Popular gists"}</h2>
                <Badge tone="brand">{gists.length}</Badge>
              </div>
              <div className="divide-y-2 divide-line overflow-hidden rounded-2xl border-2 border-line bg-card">
                {gists.map((post) => (
                  <div key={post.id} className="flex items-start gap-3 px-3.5 py-3.5">
                    {post.mediaUrls[0] ? (
                      <button type="button" onClick={() => setPreview({ src: post.mediaUrls[0]!, alt: `Photo from ${post.schoolShort}` })} aria-label="View full-screen image" className="shrink-0 cursor-zoom-in overflow-hidden rounded-xl border-2 border-line transition-transform hover:scale-105">
                        <ProgressiveImage
                          src={post.mediaUrls[0]}
                          alt={`Photo from ${post.schoolShort}`}
                          referrerPolicy="no-referrer"
                          containerClassName="size-14"
                        />
                      </button>
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-page text-ink-muted"><Hash size={17} strokeWidth={2.4} aria-hidden /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{post.content}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-ink-muted">
                        <SchoolBadge schoolId={post.schoolId} crestUrl={post.schoolCrest} name={post.schoolShort} size="xs" />
                        {post.schoolShort}
                        <span className="size-1 rounded-full bg-ink-faint" aria-hidden />@{post.authorName}
                        <span className="size-1 rounded-full bg-ink-faint" aria-hidden />{post.likeCount} likes
                        <span className="size-1 rounded-full bg-ink-faint" aria-hidden />{timeAgo(post.createdAt)}
                      </p>
                    </div>
                    <Link to={`/schools/${post.schoolId}`} aria-label={`Open ${post.schoolShort} community`} className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-page hover:text-brand-deep"><ArrowUpRight size={16} strokeWidth={2.5} aria-hidden /></Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showPeople && people.length > 0 && (
            <section aria-labelledby="people-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="people-heading" className="text-sm font-extrabold text-ink sm:text-base">Students</h2>
                <Badge tone="success">{people.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {people.map((student) => (
                  <Card key={student.id} interactive>
                    <CardBody className="flex items-center gap-3 px-3.5 py-3.5">
                      <Avatar name={student.username} src={student.avatarUrl} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-extrabold text-ink">@{student.username}</p>
                        <p className="truncate text-[11px] font-semibold text-ink-muted">{student.schoolShort ?? "No school yet"}</p>
                        {student.bio && <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-ink-muted">{student.bio}</p>}
                      </div>
                      {student.schoolId && (
                        <button type="button" onClick={() => openSchoolFeed(student.schoolId as string)} className="shrink-0 rounded-xl border-2 border-line px-2.5 py-1.5 text-[10px] font-extrabold text-ink hover:border-brand hover:text-brand-deep">School</button>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {showSchools && schoolHits.length > 0 && (
            <section aria-labelledby="schools-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="schools-heading" className="text-sm font-extrabold text-ink sm:text-base">Communities</h2>
                <Link to="/schools" className="text-[10px] font-extrabold uppercase tracking-wider text-brand-deep hover:underline">View all</Link>
              </div>
              <div className="divide-y-2 divide-line overflow-hidden rounded-2xl border-2 border-line bg-card">
                {schoolHits.map((school) => (
                  <div key={school.id} className="flex items-center gap-3 px-3.5 py-3">
                    <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold text-ink">{school.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-ink-muted">
                        <MapPin size={11} strokeWidth={2.5} aria-hidden />{school.region}
                        <span className="size-1 rounded-full bg-ink-faint" aria-hidden />
                        <Users size={11} strokeWidth={2.5} aria-hidden />{school.memberCount.toLocaleString()}
                      </p>
                    </div>
                    <button type="button" onClick={() => navigate(`/schools/${school.id}`)} className="shrink-0 rounded-xl bg-brand-deep px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-contrast shadow-[0_3px_0_var(--brand-edge)] active:translate-y-[2px]">Feed</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ImageLightbox images={preview ? [preview] : []} index={preview ? 0 : null} onClose={() => setPreview(null)} />
    </div>
  );
}
