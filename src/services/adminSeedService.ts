import { MEDIA_BUCKET, requireUserId, supabase } from "../lib/supabase";
import type { AdminSeedProfile } from "../types/models";

interface RawSeedProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  school_id: string;
  created_at: string;
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
  };
}

export async function fetchSeedProfiles(): Promise<AdminSeedProfile[]> {
  const { data, error } = await supabase.rpc("admin_list_seed_profiles");
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawSeedProfile[]).map(mapSeedProfile);
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
    p_username: profile.username,
    p_full_name: profile.fullName,
    p_avatar_url: profile.avatarUrl,
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
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const paths = urls.map((url) => {
    const parsed = new URL(url);
    const markerIndex = parsed.pathname.indexOf(marker);
    const path = markerIndex >= 0
      ? decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length))
      : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/seed-posts\/[^/]+$/i.test(path)) {
      throw new Error("Seed records were deleted, but a media path could not be safely verified.");
    }
    return path;
  });
  if (paths.length === 0) return;

  for (let index = 0; index < paths.length; index += 100) {
    const { error: removeError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove(paths.slice(index, index + 100));
    if (removeError) {
      throw new Error(`Seed records were deleted, but some media could not be removed: ${removeError.message}`);
    }
  }
}
