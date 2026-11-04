import { MEDIA_BUCKET, requireUserId, supabase } from "../lib/supabase";
import { defaultAvatarUrl, shortNameOf } from "../lib/media";
import {
  isBrowserOffline,
  readOfflineValue,
  writeOfflineValue,
} from "../lib/offlineCache";
import { COMPRESSION_PRESETS, compressImageWithStats } from "../lib/imageCompression";
import type { AdminRoleRow, Profile, ProfileRow, PublicProfile } from "../types/models";
import { uploadImage } from "./storageService";
import { findSchoolByName } from "./schoolsService";

const PROFILE_SELECT = "id, username, school_id, avatar_url, bio, created_at";
const IDENTITY_SELECT = `${PROFILE_SELECT}, full_name, class_form`;
const COVER_SELECT = `${PROFILE_SELECT}, cover_url`;
const IDENTITY_COVER_SELECT = `${IDENTITY_SELECT}, cover_url`;

/** Step 10 profile identity columns are optional until migration-step10.sql runs. */
let identitySupportPromise: Promise<boolean> | null = null;
let coverSupportPromise: Promise<boolean> | null = null;
function supportsProfileIdentity(): Promise<boolean> {
  if (!identitySupportPromise) {
    identitySupportPromise = (async () => {
      try {
        const { error } = await supabase.from("profiles").select("full_name").limit(1);
        if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
        return true;
      } catch {
        return false;
      }
    })();
  }
  return identitySupportPromise;
}

function supportsProfileCover(): Promise<boolean> {
  if (!coverSupportPromise) {
    coverSupportPromise = (async () => {
      try {
        const { error } = await supabase.from("profiles").select("cover_url").limit(1);
        if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
        return true;
      } catch {
        return false;
      }
    })();
  }
  return coverSupportPromise;
}

async function profileSelect(): Promise<string> {
  const [identity, cover] = await Promise.all([
    supportsProfileIdentity(),
    supportsProfileCover(),
  ]);
  if (identity && cover) return IDENTITY_COVER_SELECT;
  if (identity) return IDENTITY_SELECT;
  if (cover) return COVER_SELECT;
  return PROFILE_SELECT;
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    schoolId: row.school_id,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url ?? null,
    bio: row.bio ?? "",
    fullName: row.full_name ?? null,
    classForm: row.class_form ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const cacheKey = `profile:private:${userId}`;
  if (isBrowserOffline()) return readOfflineValue<Profile>(cacheKey);

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(await profileSelect())
      .eq("id", userId)
      .maybeSingle<ProfileRow>();
    if (error) throw new Error(error.message);
    const profile = data ? mapProfile(data) : null;
    if (profile) {
      try {
        await writeOfflineValue(cacheKey, profile);
      } catch (cacheError) {
        console.warn("Could not save your profile for offline use.", cacheError);
      }
    }
    return profile;
  } catch (error) {
    if (!isBrowserOffline()) throw error;
    return readOfflineValue<Profile>(cacheKey);
  }
}

/**
 * Checks in real time whether a nickname is unclaimed in `public.profiles`
 * (case-insensitive). Works for unauthenticated visitors during onboarding.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const clean = username.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(clean)) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", clean)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length === 0;
}

/**
 * The signup trigger creates profiles automatically. This guards the rare case
 * where a user exists without one or races with `onAuthStateChange`.
 */
export async function ensureProfile(): Promise<Profile> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error("Please sign in to continue.");

  const existing = await fetchProfile(user.id);
  if (existing) return existing;

  const meta = (user.user_metadata ?? {}) as {
    username?: string;
    school_id?: string;
    avatar_url?: string;
  };
  const base =
    (meta.username ?? user.email?.split("@")[0] ?? "student")
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 20) || "student";
  const candidate = base.length >= 3 ? base : `${base}_${user.id.replace(/-/g, "").slice(0, 4)}`;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      username: candidate,
      school_id: meta.school_id || null,
      avatar_url: meta.avatar_url || defaultAvatarUrl(candidate),
      bio: "",
    })
    .select(await profileSelect())
    .single<ProfileRow>();

  if (error) {
    // Handle concurrent trigger/effect insert gracefully
    if (error.code === "23505") {
      const retry = await fetchProfile(user.id);
      if (retry) return retry;
    }
    throw new Error(error.message);
  }
  return mapProfile(data);
}

interface RawPublicProfile extends ProfileRow {
  school: { name: string; crest_url: string | null } | null;
}

/** Read-only public profile for `/profile/:userId` (no email or private fields). */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const cacheKey = `profile:public:${userId}`;
  if (isBrowserOffline()) return readOfflineValue<PublicProfile>(cacheKey);

  try {
    const select = await profileSelect();
    const { data, error } = await supabase
      .from("profiles")
      .select(`${select}, school:schools!school_id(name, crest_url:logo_url)`)
      .eq("id", userId)
      .maybeSingle<RawPublicProfile>();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const profile: PublicProfile = {
      id: data.id,
      username: data.username,
      avatarUrl: data.avatar_url,
      coverUrl: data.cover_url ?? null,
      bio: data.bio ?? "",
      fullName: data.full_name ?? null,
      classForm: data.class_form ?? null,
      schoolId: data.school_id,
      schoolName: data.school?.name ?? null,
      schoolShort: data.school ? shortNameOf(data.school.name) : null,
      schoolCrest: data.school?.crest_url ?? null,
      createdAt: data.created_at,
    };
    try {
      await writeOfflineValue(cacheKey, profile);
    } catch (cacheError) {
      console.warn("Could not save this profile for offline use.", cacheError);
    }
    return profile;
  } catch (error) {
    if (!isBrowserOffline()) throw error;
    return readOfflineValue<PublicProfile>(cacheKey);
  }
}

export interface ProfilePatch {
  username?: string;
  bio?: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  schoolId?: string | null;
  fullName?: string | null;
  classForm?: string | null;
}

export async function updateMyProfile(patch: ProfilePatch): Promise<Profile> {
  const userId = await requireUserId();
  const update: Partial<ProfileRow> = {};
  if (patch.username !== undefined) update.username = patch.username.trim().replace(/^@/, "");
  if (patch.bio !== undefined) update.bio = patch.bio.trim();
  if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
  if (patch.coverUrl !== undefined) {
    if (!(await supportsProfileCover())) {
      throw new Error("Cover photos need migration-step13.sql to be applied first.");
    }
    update.cover_url = patch.coverUrl;
  }
  if (patch.schoolId !== undefined) update.school_id = patch.schoolId;
  if (patch.fullName !== undefined || patch.classForm !== undefined) {
    const hasIdentityValues = Boolean(patch.fullName?.trim() || patch.classForm?.trim());
    const supportsIdentity = await supportsProfileIdentity();
    if (hasIdentityValues && !supportsIdentity) {
      throw new Error("Profile identity fields need migration-step10.sql to be applied first.");
    }
    if (supportsIdentity) {
      if (patch.fullName !== undefined) update.full_name = patch.fullName?.trim() || null;
      if (patch.classForm !== undefined) update.class_form = patch.classForm?.trim() || null;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select(await profileSelect())
    .single<ProfileRow>();
  if (error) {
    if (error.code === "23505") throw new Error("That nickname is already taken.");
    throw new Error(error.message);
  }
  return mapProfile(data);
}

export async function uploadMyAvatar(file: File): Promise<string> {
  return uploadImage(file, "avatars");
}

export async function uploadMyCover(file: File): Promise<Profile> {
  const userId = await requireUserId();
  if (!(await supportsProfileCover())) {
    throw new Error("Cover photos need migration-step13.sql to be applied first.");
  }
  const compressed = await compressImageWithStats(file, COMPRESSION_PRESETS.covers);
  const path = `${userId}/covers/${userId}.jpg`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, compressed.file, {
      cacheControl: "3600",
      upsert: true,
      contentType: compressed.file.type,
    });
  if (error) throw new Error(error.message);

  const publicUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  const coverUrl = `${publicUrl}?v=${Date.now()}`;
  return updateMyProfile({ coverUrl });
}

export async function fetchMyRoles(): Promise<AdminRoleRow[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("admin_roles")
    .select("role, school_id")
    .eq("user_id", userId)
    .returns<AdminRoleRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface ProfileSearchHit extends Profile {
  schoolShort: string | null;
  followersCount?: number;
}

/** Open postal lookup: students in one SHS by official name or nickname. */
export async function searchStudentsBySchool(
  schoolId: string,
  query: string,
  limit = 6
): Promise<ProfileSearchHit[]> {
  const clean = query.trim().replace(/[%,()]/g, "");
  if (!schoolId) return [];
  const supportsIdentity = await supportsProfileIdentity();
  const select = supportsIdentity ? IDENTITY_SELECT : PROFILE_SELECT;
  const { data, error } = await supabase
    .from("profiles")
    .select(`${select}, school:schools!school_id(name, crest_url:logo_url)`)
    .eq("school_id", schoolId)
    .or(supportsIdentity ? `full_name.ilike.%${clean}%,username.ilike.%${clean}%` : `username.ilike.%${clean}%`)
    .order("username", { ascending: true })
    .limit(limit)
    .returns<RawProfileSearch[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...mapProfile(row),
    schoolShort: row.school ? shortNameOf(row.school.name) : null,
  }));
}

interface RawProfileSearch extends ProfileRow {
  school: { name: string } | null;
}

export async function searchProfiles(query: string, limit = 8): Promise<ProfileSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const select = await profileSelect();
  const { data, error } = await supabase
    .from("profiles")
    .select(`${select}, school:schools!school_id(name)`)
    .ilike("username", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<RawProfileSearch[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...mapProfile(row),
    schoolShort: row.school ? shortNameOf(row.school.name) : null,
  }));
}

export async function fetchPopularProfiles(limit = 8): Promise<ProfileSearchHit[]> {
  const { data: counts, error: countError } = await supabase
    .from("profile_follow_counts")
    .select("profile_id, followers_count")
    .gt("followers_count", 100)
    .order("followers_count", { ascending: false })
    .limit(limit)
    .returns<Array<{ profile_id: string; followers_count: number }>>();
  if (countError) throw new Error(countError.message);
  if (!counts?.length) return [];

  const select = await profileSelect();
  const { data, error } = await supabase
    .from("profiles")
    .select(`${select}, school:schools!school_id(name)`)
    .in("id", counts.map((item) => item.profile_id))
    .returns<RawProfileSearch[]>();
  if (error) throw new Error(error.message);

  const countById = new Map(counts.map((item) => [item.profile_id, item.followers_count]));
  return (data ?? [])
    .map((row) => ({
      ...mapProfile(row),
      schoolShort: row.school ? shortNameOf(row.school.name) : null,
      followersCount: countById.get(row.id) ?? 0,
    }))
    .sort((a, b) => (b.followersCount ?? 0) - (a.followersCount ?? 0));
}

/* ───────────── Auth ───────────── */

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
  schoolId?: string | null;
  schoolName?: string | null;
  schoolRegion?: string | null;
  schoolType?: "public" | "private" | "mission" | "technical";
  avatarUrl?: string | null;
  avatarFile?: File | null;
}

export interface SignUpResult {
  hasSession: boolean;
  profile: Profile | null;
}

/**
 * Registers a student via Supabase Auth and immediately syncs their chosen
 * nickname, SHS community, and preset or uploaded profile photo when a session is active.
 */
export async function signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
  const cleanUsername = input.username.trim().replace(/^@/, "");
  const fallbackAvatar = input.avatarUrl || defaultAvatarUrl(cleanUsername);
  let schoolId = input.schoolId ?? null;
  let schoolName = input.schoolName?.trim() ?? "";

  if (schoolName) {
    const existingSchool = await findSchoolByName(schoolName);
    if (existingSchool) {
      schoolId = existingSchool.id;
      schoolName = "";
    } else {
      schoolId = null;
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        username: cleanUsername,
        school_id: schoolId ?? "",
        school_name: schoolName,
        school_region: input.schoolRegion?.trim() || "",
        school_type: input.schoolType ?? "public",
        avatar_url: fallbackAvatar,
      },
    },
  });
  if (error) throw new Error(error.message);

  if (!data.session) {
    return { hasSession: false, profile: null };
  }

  const profile = await ensureProfile();

  let finalAvatarUrl = fallbackAvatar;
  if (input.avatarFile) {
    try {
      finalAvatarUrl = await uploadMyAvatar(input.avatarFile);
    } catch {
      // Keep fallback illustrated avatar if storage upload fails so signup still completes
      finalAvatarUrl = fallbackAvatar;
    }
  }

  const updatedProfile = await updateMyProfile({
    username: cleanUsername,
    schoolId: schoolId ?? profile.schoolId,
    avatarUrl: finalAvatarUrl,
  });

  return { hasSession: true, profile: updatedProfile };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
