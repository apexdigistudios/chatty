'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "@/lib/router";
import {
  AlertTriangle,
  Eye,
  Check,
  ChevronDown,
  FileImage,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  UserRoundPen,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeading } from "@/components/layout/PageHeading";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { isUserGlobalAdmin } from "@/lib/adminAccess";
import { describeError, supabase } from "@/lib/supabase";
import {
  clearAllSeedData,
  createSeedPost,
  createSeedProfiles,
  deleteSeedProfile,
  fetchSeedProfiles,
  mapSeedEngagementItems,
  removeSeedMedia,
  updateSeedProfile,
  type SeedEngagementItem,
  type SeedMedia,
} from "@/services/adminSeedService";
import { isVideoFile, uploadPostMedia } from "@/services/storageService";
import {
  addSeedConfessionComments,
  addSeedConfessionLikes,
  addSeedConfessionViews,
  addSeedPostComments,
  addSeedPostLikes,
  addSeedPostViews,
  addSeedProfileFollowers,
} from "@/services/postsService";
import { useGistStore } from "@/store/gistStore";
import type { AdminSeedProfile } from "@/types/models";

type DashboardTab = "profiles" | "publisher" | "engagement" | "purge";

const TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: "profiles", label: "Synthetic profiles" },
  { id: "publisher", label: "Post studio" },
  { id: "engagement", label: "Posts & confessions" },
  { id: "purge", label: "System clean-up" },
];

const CONFESSION_CATEGORIES = [
  "Crush Confession",
  "School Secret",
  "Relationship Gist",
  "Friendship Gist",
];

function isSeedInput(value: unknown): value is {
  username: string;
  full_name: string;
  avatar_url?: string | null;
  school_id: string;
} {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.username === "string" &&
    typeof item.full_name === "string" &&
    typeof item.school_id === "string" &&
    (item.avatar_url === undefined || item.avatar_url === null || typeof item.avatar_url === "string");
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const schools = useGistStore((state) => state.schools);
  const [serverAuthorized, setServerAuthorized] = useState(false);
  const [accessChecking, setAccessChecking] = useState(true);
  const [tab, setTab] = useState<DashboardTab>("profiles");
  const [profiles, setProfiles] = useState<AdminSeedProfile[]>([]);
  const [engagementItems, setEngagementItems] = useState<SeedEngagementItem[]>([]);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followerIncrement, setFollowerIncrement] = useState("10");
  const [engagementIncrement, setEngagementIncrement] = useState("10");
  const [search, setSearch] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [editing, setEditing] = useState<AdminSeedProfile | null>(null);

  const [authorSearch, setAuthorSearch] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [isConfession, setIsConfession] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [category, setCategory] = useState(CONFESSION_CATEGORIES[1]);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isUserGlobalAdmin(user?.email)) {
      navigate("/", { replace: true });
      setAccessChecking(false);
      return;
    }

    let active = true;
    setAccessChecking(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("is_global_admin", {});
        if (!active) return;
        if (error) {
          toast(describeError(error, "Could not verify admin access."), "danger");
          navigate("/", { replace: true });
          return;
        }
        if (data !== true) {
          navigate("/", { replace: true });
          return;
        }
        setServerAuthorized(true);
      } catch (error) {
        if (active) toast(describeError(error, "Could not verify admin access."), "danger");
        if (active) navigate("/", { replace: true });
      } finally {
        if (active) setAccessChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authLoading, navigate, toast, user]);

  const reloadProfiles = async () => {
    setProfilesLoading(true);
    try {
      setProfiles(await fetchSeedProfiles());
    } catch (error) {
      toast(describeError(error, "Could not load seed profiles."), "danger");
    } finally {
      setProfilesLoading(false);
    }
  };

  useEffect(() => {
    if (serverAuthorized) void reloadProfiles();
    // Load once after the server confirms the admin role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverAuthorized]);

  useEffect(() => {
    if (!serverAuthorized || tab !== "engagement") return;
    let active = true;
    setEngagementItems([]);
    setEngagementLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("admin_list_seed_engagement");
        if (error) throw new Error(error.message);
        const items = mapSeedEngagementItems(data);
        if (active) setEngagementItems(items);
      } catch (error: unknown) {
        if (active) toast(describeError(error, "Could not load seed engagement items."), "danger");
      } finally {
        if (active) setEngagementLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [serverAuthorized, tab, toast]);

  const boostProfileFollowers = async (profile: AdminSeedProfile) => {
    const count = Number(followerIncrement);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100000) {
      toast("Enter a whole number between 1 and 100000.", "danger");
      return;
    }
    setBusy(true);
    try {
      const updatedCount = await addSeedProfileFollowers(profile.id, count);
      setProfiles((current) => current.map((item) =>
        item.id === profile.id ? { ...item, seedFollowersCount: updatedCount } : item
      ));
      toast(`Added ${count} seed followers to @${profile.username}.`, "success");
    } catch (error) {
      toast(describeError(error, "Could not add seed followers."), "danger");
    } finally {
      setBusy(false);
    }
  };

  const boostEngagement = async (item: SeedEngagementItem, metric: "likes" | "comments" | "views", increment: number) => {
    if (!Number.isSafeInteger(increment) || increment < 1 || increment > 100000) {
      toast("Enter a whole number between 1 and 100000.", "danger");
      return;
    }
    setBusy(true);
    try {
      const next = item.kind === "post"
        ? metric === "likes"
          ? await addSeedPostLikes(item.id, increment)
          : metric === "comments"
            ? await addSeedPostComments(item.id, increment)
            : await addSeedPostViews(item.id, increment)
        : metric === "likes"
          ? await addSeedConfessionLikes(item.id, increment)
          : metric === "comments"
            ? await addSeedConfessionComments(item.id, increment)
            : await addSeedConfessionViews(item.id, increment);
      setEngagementItems((current) => current.map((entry) =>
        entry.id !== item.id || entry.kind !== item.kind
          ? entry
          : {
              ...entry,
              ...(metric === "likes" ? { likesCount: next } : {}),
              ...(metric === "comments" ? { commentsCount: next } : {}),
              ...(metric === "views" ? { viewsCount: next } : {}),
            }
      ));
      toast(`Added ${increment} seed ${metric} to @${item.username}'s ${item.kind}.`, "success");
    } catch (error) {
      toast(describeError(error, `Could not add seed ${metric}.`), "danger");
    } finally {
      setBusy(false);
    }
  };

  const filteredProfiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return profiles.filter((profile) =>
      !term ||
      profile.username.toLowerCase().includes(term) ||
      profile.fullName.toLowerCase().includes(term)
    );
  }, [profiles, search]);

  const matchingAuthors = useMemo(() => {
    const term = authorSearch.trim().toLowerCase();
    return profiles.filter((profile) =>
      !term ||
      profile.username.toLowerCase().includes(term) ||
      profile.fullName.toLowerCase().includes(term)
    );
  }, [authorSearch, profiles]);

  const selectedAuthor = profiles.find((profile) => profile.id === authorId) ?? null;
  const previews = useMemo(
    () => mediaFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [mediaFiles]
  );
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  const createProfiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      toast("Please check the JSON format and try again.", "danger");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isSeedInput)) {
      toast("Use an array of profiles with username, full_name, and school_id.", "danger");
      return;
    }

    setBusy(true);
    try {
      const created = await createSeedProfiles(parsed.map((profile) => ({
        username: profile.username.trim(),
        full_name: profile.full_name.trim(),
        avatar_url: profile.avatar_url?.trim() || null,
        school_id: profile.school_id,
      })));
      setProfiles((current) => [...created, ...current]);
      setJsonInput("");
      toast(`${created.length} synthetic profile${created.length === 1 ? "" : "s"} created.`, "success");
    } catch (error) {
      toast(describeError(error, "Could not create those profiles."), "danger");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const updatedProfile = {
        ...editing,
        username: editing.username.trim(),
        fullName: editing.fullName.trim(),
        avatarUrl: editing.avatarUrl?.trim() || null,
      };
      await updateSeedProfile(updatedProfile);
      setProfiles((current) => current.map((profile) => profile.id === updatedProfile.id ? updatedProfile : profile));
      setEditing(null);
      toast("Profile updated.", "success");
    } catch (error) {
      toast(describeError(error, "Could not update that profile."), "danger");
    } finally {
      setBusy(false);
    }
  };

  const removeProfile = async (profile: AdminSeedProfile) => {
    if (!window.confirm(`Delete synthetic profile @${profile.username} and its seeded posts?`)) return;
    setBusy(true);
    try {
      await deleteSeedProfile(profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      toast("Synthetic profile and its seeded content were deleted.", "success");
    } catch (error) {
      if (error instanceof Error && error.message.includes("records were deleted")) {
        setProfiles((current) => current.filter((item) => item.id !== profile.id));
        toast("The profile was deleted, but some stored media could not be removed.", "danger");
      } else {
        toast(describeError(error, "Could not delete that profile."), "danger");
      }
    } finally {
      setBusy(false);
    }
  };

  const selectMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    const next = [...mediaFiles, ...incoming];
    if (next.length > 8) {
      toast("A post can include up to 5 images and 3 videos.", "danger");
      return;
    }
    if (next.some((file) => !file.type.startsWith("image/") && !isVideoFile(file))) {
      toast("Choose image or video files only.", "danger");
      return;
    }
    const imageCount = next.filter((file) => file.type.startsWith("image/")).length;
    const videoCount = next.filter(isVideoFile).length;
    if (imageCount > 5 || videoCount > 3) {
      toast("A post can include up to 5 images and 3 videos.", "danger");
      return;
    }
    setMediaFiles(next);
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authorId || !schoolId) {
      toast("Choose a synthetic author and school first.", "danger");
      return;
    }
    if (!content.trim() && mediaFiles.length === 0) {
      toast("Add text or an attachment before publishing.", "danger");
      return;
    }
    if (content.trim().length > 300) {
      toast("Posts are limited to 300 characters.", "danger");
      return;
    }

    setBusy(true);
    const uploaded: SeedMedia[] = [];
    try {
      for (const [index, file] of mediaFiles.entries()) {
        const result = await uploadPostMedia(file, "seed-posts");
        uploaded.push({
          url: result.url,
          media_type: result.mediaType,
          sort_order: index,
        });
      }
      await createSeedPost({
        seedProfileId: authorId,
        schoolId,
        content: content.trim(),
        media: uploaded,
        isConfession,
        isAnonymous,
        category,
      });
      setContent("");
      setMediaFiles([]);
      setIsConfession(false);
      toast(isConfession ? "Synthetic confession published." : "Synthetic post published.", "success");
    } catch (error) {
      if (uploaded.length > 0) {
        try {
          await removeSeedMedia(uploaded.map((item) => item.url));
        } catch {
          toast("Publishing failed, and some temporary media could not be removed.", "danger");
          return;
        }
      }
      toast(describeError(error, "Could not publish that content."), "danger");
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (purgeConfirmation !== "PURGE") return;
    setBusy(true);
    const clearPurgedUi = () => {
      setProfiles([]);
      setEditing(null);
      setAuthorId("");
      setAuthorSearch("");
      setSchoolId("");
      setContent("");
      setMediaFiles([]);
      setIsConfession(false);
      setIsAnonymous(true);
      setPurgeOpen(false);
      setPurgeConfirmation("");
    };
    try {
      await clearAllSeedData();
      clearPurgedUi();
      toast("All synthetic profiles and their posts have been purged.", "success");
    } catch (error) {
      if (error instanceof Error && error.message.includes("records were deleted")) {
        clearPurgedUi();
        toast("Synthetic records were purged, but some stored media could not be removed.", "danger");
      } else {
        toast(describeError(error, "Could not finish the seed data purge."), "danger");
      }
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || accessChecking || !serverAuthorized) return null;

  return (
    <div className="mx-auto w-full max-w-[980px] min-w-0 px-4 pb-12 pt-5 sm:px-6 sm:pt-7">
      <PageHeading
        eyebrow="Global admin"
        title="Synthetic Content Studio"
        description="Manage clearly labeled demo profiles and publish content without creating fake authentication accounts."
        action={<Badge tone="brand"><ShieldCheck size={12} aria-hidden />Admin only</Badge>}
      />

      <div role="tablist" aria-label="Synthetic content tools" className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border-2 border-line bg-page p-1.5 sm:grid-cols-4">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`seed-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`seed-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`min-h-11 rounded-xl px-2 text-[10px] font-extrabold transition-colors sm:text-xs ${
              tab === item.id ? "bg-card text-brand-deep shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profiles" && (
        <section id="seed-panel-profiles" role="tabpanel" aria-labelledby="seed-tab-profiles" className="space-y-5">
          <Card>
            <CardBody className="pt-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep"><Plus size={19} aria-hidden /></span>
                <div>
                  <h2 className="text-sm font-extrabold text-ink">Bulk profile creation</h2>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-ink-muted">Import at most 50 profiles per request. Each entry must include an existing school ID.</p>
                </div>
              </div>
              <form className="mt-4" onSubmit={(event) => void createProfiles(event)}>
                <label htmlFor="seed-profile-json" className="mb-1.5 block text-xs font-bold text-ink">Profile JSON</label>
                <textarea
                  id="seed-profile-json"
                  value={jsonInput}
                  onChange={(event) => setJsonInput(event.target.value)}
                  rows={5}
                  placeholder={'[{"username":"demo_student","full_name":"Demo Student","avatar_url":null,"school_id":"<school-uuid>"}]'}
                  className="w-full rounded-2xl border-2 border-line bg-card px-3 py-3 font-mono text-xs text-ink outline-none focus:border-brand"
                />
                <Button type="submit" size="sm" loading={busy} leftIcon={<Plus size={14} aria-hidden />} className="mt-3">Create profiles</Button>
              </form>
            </CardBody>
          </Card>

          <section aria-labelledby="seed-users-heading">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 id="seed-users-heading" className="text-sm font-extrabold text-ink">Synthetic profiles</h2>
              <Badge tone="neutral">{profiles.length}</Badge>
              <label className="ml-auto flex h-10 min-w-[180px] items-center gap-2 rounded-xl border-2 border-line bg-card px-3">
                <Search size={14} className="text-ink-muted" aria-hidden />
                <span className="sr-only">Search profiles</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="w-full bg-transparent text-xs font-semibold text-ink outline-none" />
              </label>
            </div>
            {profilesLoading ? (
              <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-brand" aria-label="Loading profiles" /></div>
            ) : filteredProfiles.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-line px-5 py-10 text-center text-xs font-semibold text-ink-muted">No matching synthetic profiles yet.</div>
            ) : (
              <div className="space-y-2">
                {filteredProfiles.map((profile) => {
                  const school = schools.find((item) => item.id === profile.schoolId);
                  return (
                    <Card key={profile.id}>
                      <CardBody className="flex flex-wrap items-center gap-3 py-3">
                        <Avatar name={profile.username} src={profile.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-xs font-extrabold text-ink">@{profile.username}</span>
                            <Badge tone="warning" className="px-1.5 py-0 text-[8px]">Synthetic</Badge>
                          </div>
                          <p className="truncate text-[11px] font-semibold text-ink-muted">{profile.fullName} · {school?.shortName ?? "School"}</p>
                        </div>
                        <Button size="sm" variant="outline" leftIcon={<UserRoundPen size={13} aria-hidden />} onClick={() => setEditing({ ...profile })}>Edit Profile</Button>
                        <Button size="sm" variant="danger" disabled={busy} aria-label={`Delete @${profile.username}`} onClick={() => void removeProfile(profile)}><Trash2 size={14} aria-hidden /></Button>
                        <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-2">
                          <span className="mr-auto text-[10px] font-bold text-ink-muted">
                            Seed followers: {profile.seedFollowersCount ?? 0}
                          </span>
                          <label className="sr-only" htmlFor={`followers-${profile.id}`}>Follower increment for @{profile.username}</label>
                          <input
                            id={`followers-${profile.id}`}
                            type="number"
                            min={1}
                            max={100000}
                            value={followerIncrement}
                            onChange={(event) => setFollowerIncrement(event.target.value)}
                            className="h-9 w-20 rounded-lg border-2 border-line bg-card px-2 text-xs font-bold text-ink outline-none focus:border-brand"
                          />
                          <Button size="sm" variant="outline" disabled={busy} leftIcon={<Users size={13} aria-hidden />} onClick={() => void boostProfileFollowers(profile)}>
                            Add followers
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}

      {tab === "publisher" && (
        <section id="seed-panel-publisher" role="tabpanel" aria-labelledby="seed-tab-publisher">
          <Card>
            <CardBody className="pt-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep"><FileImage size={18} aria-hidden /></span>
                <div>
                  <h2 className="text-sm font-extrabold text-ink">Post and confession studio</h2>
                  <p className="mt-1 text-xs font-semibold text-ink-muted">Published content is labeled synthetic. Confessions are public immediately; anonymous mode never exposes the selected seed identity.</p>
                </div>
              </div>
              <form onSubmit={(event) => void publish(event)} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-ink">
                    Search synthetic author
                    <div className="relative mt-1.5">
                      <input
                        value={authorSearch}
                        onChange={(event) => setAuthorSearch(event.target.value)}
                        placeholder="Find by name or username"
                        className="h-11 w-full rounded-xl border-2 border-line bg-card px-3 pr-9 text-xs font-semibold text-ink outline-none focus:border-brand"
                      />
                      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3.5 text-ink-muted" aria-hidden />
                    </div>
                  </label>
                  <label className="block text-xs font-bold text-ink">
                    Synthetic author
                    <select value={authorId} onChange={(event) => {
                      setAuthorId(event.target.value);
                      const profile = profiles.find((item) => item.id === event.target.value);
                      if (profile) setSchoolId(profile.schoolId);
                    }} required className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-xs font-semibold text-ink outline-none focus:border-brand">
                      <option value="">Choose a profile</option>
                      {matchingAuthors.map((profile) => <option key={profile.id} value={profile.id}>@{profile.username} — {profile.fullName}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-ink sm:col-span-2">
                    Publishing school
                    <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} required className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-xs font-semibold text-ink outline-none focus:border-brand">
                      <option value="">Choose a school</option>
                      {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                    </select>
                  </label>
                </div>

                {selectedAuthor && (
                  <div className="flex items-center gap-2 rounded-xl border-2 border-warning-soft bg-warning-wash px-3 py-2">
                    <Avatar name={selectedAuthor.username} src={selectedAuthor.avatarUrl} size="sm" />
                    <span className="text-xs font-bold text-warning-deep">Publishing as synthetic @{selectedAuthor.username}</span>
                  </div>
                )}

                <label className="block text-xs font-bold text-ink">
                  {isConfession ? "Confession" : "Gist"}
                  <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={300} rows={5} placeholder="Write the gist..." className="mt-1.5 w-full resize-y rounded-2xl border-2 border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none focus:border-brand" />
                  <span className="mt-1 block text-right text-[10px] font-semibold text-ink-muted">{content.length}/300</span>
                </label>

                <div>
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-line bg-card px-3 text-xs font-bold text-ink hover:border-brand">
                      <Upload size={15} aria-hidden />
                      Add photo/video
                      <input type="file" accept="image/*,video/*" multiple onChange={selectMedia} className="sr-only" />
                    </label>
                    <p className="mt-1.5 text-[10px] font-semibold text-ink-muted">Up to 5 images and 3 videos. Videos max 80 MB each.</p>
                    {previews.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {previews.map(({ file, url }, index) => (
                          <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border-2 border-line bg-page">
                            {isVideoFile(file) ? (
                              <video
                                src={url}
                                controlsList="nodownload noremoteplayback"
                                disablePictureInPicture
                                onContextMenu={(event) => event.preventDefault()}
                                className="size-full object-cover"
                                muted
                                playsInline
                              />
                            ) : (
                              <img src={url} alt={file.name} className="size-full object-cover" />
                            )}
                            {isVideoFile(file) && <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-bold text-white">VIDEO</span>}
                            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setMediaFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white"><X size={14} aria-hidden /></button>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-line bg-page px-3 py-2.5">
                  <label className="inline-flex min-h-8 items-center gap-2 text-xs font-bold text-ink">
                    <input type="checkbox" checked={isConfession} onChange={(event) => setIsConfession(event.target.checked)} className="size-4 accent-violet-500" />
                    Publish as confession
                  </label>
                  {isConfession && (
                    <>
                      <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 rounded-lg border-2 border-line bg-card px-2 text-[10px] font-bold text-ink">
                        {CONFESSION_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <label className="inline-flex min-h-8 items-center gap-2 text-xs font-bold text-ink">
                        <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} className="size-4 accent-violet-500" />
                        Keep identity anonymous
                      </label>
                    </>
                  )}
                </div>
                <Button type="submit" loading={busy} disabled={!authorId || !schoolId} leftIcon={<Check size={15} aria-hidden />}>
                  Publish {isConfession ? "confession" : "gist"}
                </Button>
              </form>
            </CardBody>
          </Card>
        </section>
      )}

      {tab === "purge" && (
        <section id="seed-panel-purge" role="tabpanel" aria-labelledby="seed-tab-purge">
          <Card>
            <CardBody className="pt-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-wash text-danger"><AlertTriangle size={18} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-extrabold text-ink">Purge all synthetic data</h2>
                  <p className="mt-1 max-w-prose text-xs font-semibold leading-relaxed text-ink-muted">This permanently removes seed profiles, their posts and media, and seeded confessions. Organic accounts and content are not included.</p>
                </div>
              </div>
              <Button variant="danger" className="mt-5" leftIcon={<Trash2 size={15} aria-hidden />} onClick={() => setPurgeOpen(true)}>Purge all seed data</Button>
            </CardBody>
          </Card>
        </section>
      )}

      {tab === "engagement" && (
        <section id="seed-panel-engagement" role="tabpanel" aria-labelledby="seed-tab-engagement" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <h2 className="text-sm font-extrabold text-ink">Seed engagement manager</h2>
              <p className="mt-1 text-[11px] font-semibold text-ink-muted">Add aggregate likes, comments, and views to seeded posts and confessions.</p>
            </div>
            <label htmlFor="seed-engagement-increment" className="sr-only">Custom engagement increment</label>
            <input
              id="seed-engagement-increment"
              type="number"
              min={1}
              max={100000}
              value={engagementIncrement}
              onChange={(event) => setEngagementIncrement(event.target.value)}
              className="h-10 w-24 rounded-xl border-2 border-line bg-card px-2 text-xs font-bold text-ink outline-none focus:border-brand"
            />
          </div>
          {engagementLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-brand" aria-label="Loading seeded posts and confessions" /></div>
          ) : engagementItems.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-line px-5 py-10 text-center text-xs font-semibold text-ink-muted">No seed posts or confessions yet. Publish synthetic content to manage its engagement here.</div>
          ) : engagementItems.map((item) => (
            <Card key={`${item.kind}-${item.id}`}>
              <CardBody className="space-y-3 py-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
                    {item.kind === "confession" ? <Eye size={16} aria-hidden /> : <FileImage size={16} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold text-ink">
                      <span>@{item.username}</span>
                      <Badge tone={item.kind === "confession" ? "warning" : "neutral"}>{item.kind}</Badge>
                      <span className="font-semibold text-ink-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs font-semibold text-ink-soft">{item.content || "Media-only post"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-ink-muted">
                  <span className="inline-flex items-center gap-1"><Heart size={12} aria-hidden /> {item.likesCount}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle size={12} aria-hidden /> {item.commentsCount}</span>
                  <span className="inline-flex items-center gap-1"><Eye size={12} aria-hidden /> {item.viewsCount}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void boostEngagement(item, "likes", 10)}>+10 Seed Likes</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void boostEngagement(item, "likes", 50)}>+50 Seed Likes</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void boostEngagement(item, "views", 100)}>+100 Seed Views</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void boostEngagement(item, "comments", 1)}>+1 Seed Comment</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void boostEngagement(item, "likes", Number(engagementIncrement))}>Add custom likes</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </section>
      )}

      {editing && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-seed-title" className="w-full max-w-md rounded-3xl border-2 border-line bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="edit-seed-title" className="text-base font-black text-ink">Edit synthetic profile</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close edit dialog" className="flex size-10 items-center justify-center rounded-xl text-ink-muted hover:bg-page"><X size={17} aria-hidden /></button>
            </div>
            <form onSubmit={(event) => void saveProfile(event)} className="space-y-3">
              <label className="block text-xs font-bold text-ink">Username<input value={editing.username} onChange={(event) => setEditing({ ...editing, username: event.target.value })} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" title="Use 3–24 letters, numbers, or underscores." autoComplete="off" className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-bold text-ink">Full name<input value={editing.fullName} onChange={(event) => setEditing({ ...editing, fullName: event.target.value })} required maxLength={80} className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-bold text-ink">Avatar URL<input type="url" value={editing.avatarUrl ?? ""} onChange={(event) => setEditing({ ...editing, avatarUrl: event.target.value || null })} placeholder="https://…" className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-bold text-ink">School<select value={editing.schoolId} onChange={(event) => setEditing({ ...editing, schoolId: event.target.value })} required className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand">{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
              <Button type="submit" loading={busy} fullWidth>Save profile</Button>
            </form>
          </div>
        </div>
      )}

      {purgeOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="purge-title" aria-describedby="purge-description" className="w-full max-w-md rounded-3xl border-2 border-danger-soft bg-card p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              <div>
                <h2 id="purge-title" className="text-base font-black text-ink">Confirm permanent purge</h2>
                <p id="purge-description" className="mt-1 text-xs font-semibold leading-relaxed text-ink-muted">All synthetic profiles and associated seeded content will be deleted. This cannot be undone.</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-bold text-ink">Type PURGE to continue<input value={purgeConfirmation} onChange={(event) => setPurgeConfirmation(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border-2 border-line bg-card px-3 font-mono text-sm text-ink outline-none focus:border-danger" /></label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => { setPurgeOpen(false); setPurgeConfirmation(""); }}>Cancel</Button>
              <Button variant="danger" disabled={purgeConfirmation !== "PURGE" || busy} loading={busy} onClick={() => void purge()}>Purge permanently</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
