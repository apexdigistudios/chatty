import { requireUserId, supabase } from "@/lib/supabase";
import type { AdminSeedProfile } from "@/types/models";

interface RawSeedProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  school_id: string;
  created_at: string;
  seed_followers_count?: number;
}

export interface SeedEngagementItem {
  id: string;
  kind: "post" | "confession";
  seedProfileId: string;
  username: string;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
}

interface RawSeedEngagementItem {
  item_id: string;
  item_kind: "post" | "confession";
  seed_profile_id: string;
  username: string;
  content: string;
  created_at: string;
  seed_likes_count: number;
  seed_comments_count: number;
  seed_views_count: number;
}

export interface SeedMedia {
  url: string;
  media_type: "image" | "video";
  sort_order: number;
}

function mapSeedProfile(row: RawSeedProfile): AdminSeedProfile {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    schoolId: row.school_id,
    createdAt: row.created_at,
    seedFollowersCount: row.seed_followers_count ?? 0,
  };
}

export async function fetchSeedProfiles(): Promise<AdminSeedProfile[]> {
  const { data, error } = await supabase.rpc("admin_list_seed_profiles");
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawSeedProfile[]).map(mapSeedProfile);
}

export async function fetchSeedEngagementItems(): Promise<SeedEngagementItem[]> {
  const { data, error } = await supabase.rpc("admin_list_seed_engagement");
  if (error) throw new Error(error.message);
  return mapSeedEngagementItems(data);
}

export function mapSeedEngagementItems(data: unknown): SeedEngagementItem[] {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new Error("Unexpected seed engagement response.");
  if (!data.every(isRawSeedEngagementItem)) {
    throw new Error("Seed engagement response contains invalid items.");
  }
  return data.map((row) => ({
    id: row.item_id,
    kind: row.item_kind,
    seedProfileId: row.seed_profile_id,
    username: row.username,
    content: row.content,
    createdAt: row.created_at,
    likesCount: row.seed_likes_count,
    commentsCount: row.seed_comments_count,
    viewsCount: row.seed_views_count,
  }));
}

function isRawSeedEngagementItem(value: unknown): value is RawSeedEngagementItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (row.item_kind === "post" || row.item_kind === "confession") &&
    typeof row.item_id === "string" &&
    typeof row.seed_profile_id === "string" &&
    typeof row.username === "string" &&
    typeof row.content === "string" &&
    typeof row.created_at === "string" &&
    typeof row.seed_likes_count === "number" &&
    typeof row.seed_comments_count === "number" &&
    typeof row.seed_views_count === "number";
}

export async function createSeedProfiles(profiles: Array<{
  username: string;
  full_name: string;
  avatar_url: string | null;
  school_id: string;
}>): Promise<AdminSeedProfile[]> {
  const { data, error } = await supabase.rpc("admin_create_seed_profiles", {
    p_profiles: profiles,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawSeedProfile[]).map(mapSeedProfile);
}

export async function updateSeedProfile(profile: AdminSeedProfile): Promise<void> {
  const { error } = await supabase.rpc("admin_update_seed_profile", {
    p_seed_profile_id: profile.id,
    p_username: profile.username.trim(),
    p_full_name: profile.fullName.trim(),
    p_avatar_url: profile.avatarUrl?.trim() || null,
    p_school_id: profile.schoolId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSeedProfile(id: string): Promise<void> {
  const { data, error } = await supabase.rpc("admin_delete_seed_profile", {
    p_seed_profile_id: id,
  });
  if (error) throw new Error(error.message);
  await removeSeedMedia((data ?? []) as string[]);
}

export async function createSeedPost(input: {
  seedProfileId: string;
  schoolId: string;
  content: string;
  media: SeedMedia[];
  isConfession: boolean;
  isAnonymous: boolean;
  category: string;
}): Promise<void> {
  const { error } = await supabase.rpc("admin_create_post_as_seed", {
    p_seed_profile_id: input.seedProfileId,
    p_school_id: input.schoolId,
    p_content: input.content,
    p_media: input.media,
    p_is_confession: input.isConfession,
    p_is_anonymous: input.isAnonymous,
    p_category: input.category,
  });
  if (error) throw new Error(error.message);
}

export async function clearAllSeedData(): Promise<void> {
  const { data, error } = await supabase.rpc("admin_clear_all_seed_data");
  if (error) throw new Error(error.message);
  await removeSeedMedia((data ?? []) as string[]);
}

export async function removeSeedMedia(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await requireUserId();
  const configuredPublicUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL;
  if (!configuredPublicUrl) throw new Error("Cloudflare R2 is not configured.");
  const publicBase = new URL(configuredPublicUrl);
  const basePath = publicBase.pathname.replace(/\/+$/, "");
  const keys = urls.flatMap((url) => {
    const parsed = new URL(url);
    if (parsed.origin !== publicBase.origin || !parsed.pathname.startsWith(`${basePath}/`)) {
      return [];
    }
    const key = decodeURIComponent(parsed.pathname.slice(basePath.length + 1));
    if (!/^seed-posts\/\d+-[0-9a-f-]{36}\/[0-9a-f-]{36}\/seed-posts\/[a-zA-Z0-9._-]+$/i.test(key)) {
      throw new Error("Seed records were deleted, but a media path could not be safely verified.");
    }
    return [key];
  });
  if (keys.length === 0) return;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to continue.");
  for (let index = 0; index < keys.length; index += 100) {
    const response = await fetch("/api/upload", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keys: keys.slice(index, index + 100) }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(
        `Seed records were deleted, but some media could not be removed: ${result?.error ?? "unknown error"}`
      );
    }
  }
}
