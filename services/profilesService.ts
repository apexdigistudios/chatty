import { requireUserId, supabase } from "@/lib/supabase";
import { defaultAvatarUrl, shortNameOf } from "@/lib/media";
import {
  isBrowserOffline,
  readOfflineValue,
  writeOfflineValue,
} from "@/lib/offlineCache";
import { COMPRESSION_PRESETS, compressImageWithStats } from "@/lib/imageCompression";
import type { AdminRoleRow, Profile, ProfileRow, PublicProfile } from "@/types/models";
import { uploadPreparedAvatar } from "@/services/storageService";
import { uploadFileToR2 } from "@/lib/r2Upload";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { findSchoolByName } from "@/services/schoolsService";

const PROFILE_SELECT = "id, username, school_id, avatar_url, bio, created_at";
const IDENTITY_SELECT = `${PROFILE_SELECT}, full_name, class_form`;
const COVER_SELECT = `${PROFILE_SELECT}, cover_url`;
const IDENTITY_COVER_SELECT = `${IDENTITY_SELECT}, cover_url`;
const VERIFICATION_SELECT = ", is_verified, verified_title, verified_expires_at, is_admin, role";

export function isValidUsername(username: string): boolean {
  const length = Array.from(username).length;
  return length >= 3 && length <= 24;
}

/** Step 10 profile identity columns are optional until migration-step10.sql runs. */
let identitySupportPromise: Promise<boolean> | null = null;
let coverSupportPromise: Promise<boolean> | null = null;
let websiteSupportPromise: Promise<boolean> | null = null;
let verificationSupportPromise: Promise<boolean> | null = null;
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

function supportsProfileWebsite(): Promise<boolean> {
  if (!websiteSupportPromise) {
    websiteSupportPromise = (async () => {
      try {
        const { error } = await supabase.from("profiles").select("website").limit(1);
        if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
        return true;
      } catch {
        return false;
      }
    })();
  }
  return websiteSupportPromise;
}

function supportsProfileVerification(): Promise<boolean> {
  if (!verificationSupportPromise) {
    verificationSupportPromise = (async () => {
      const { error } = await supabase
        .from("profiles")
        .select("is_verified, verified_title, verified_expires_at, is_admin, role")
        .limit(1);
      if (error && (error.code === "42703" || error.code === "PGRST204")) return false;
      if (error) throw new Error(error.message);
      return true;
    })();
  }
  return verificationSupportPromise;
}

async function profileSelect(): Promise<string> {
  const [identity, cover, website, verification] = await Promise.all([
    supportsProfileIdentity(),
    supportsProfileCover(),
    supportsProfileWebsite(),
    supportsProfileVerification(),
  ]);
  const baseSelect = identity && cover
    ? IDENTITY_COVER_SELECT
    : identity
      ? IDENTITY_SELECT
      : cover
        ? COVER_SELECT
        : PROFILE_SELECT;
  const select = website ? `${baseSelect}, website` : baseSelect;
  return verification ? `${select}${VERIFICATION_SELECT}` : select;
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
    website: row.website ?? null,
    isVerified: row.is_verified === true,
    verifiedTitle: row.verified_title ?? null,
    verifiedExpiresAt: row.verified_expires_at ?? null,
    isAdmin: row.is_admin ?? false,
    role: row.role ?? null,
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
export async function checkUsernameAvailable(
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  if (!isValidUsername(username)) return false;

  const pattern = username.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", pattern)
    .limit(1);
  if (error) throw new Error(error.message);
  return !(data ?? []).some((profile) => profile.id !== excludeUserId);
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
      avatar_url: cloudflareMediaUrl(meta.avatar_url || defaultAvatarUrl(candidate)),
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

interface RawSeedPublicProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  school_id: string;
  created_at: string;
  school: { name: string; crest_url: string | null } | null;
}

function mapPublicProfile(data: RawPublicProfile): PublicProfile {
  return {
    id: data.id,
    username: data.username,
    avatarUrl: data.avatar_url,
    coverUrl: data.cover_url ?? null,
    bio: data.bio ?? "",
    fullName: data.full_name ?? null,
    classForm: data.class_form ?? null,
    website: data.website ?? null,
    isVerified: data.is_verified === true,
    verifiedTitle: data.verified_title ?? null,
    verifiedExpiresAt: data.verified_expires_at ?? null,
    isAdmin: data.is_admin ?? false,
    role: data.role ?? null,
    schoolId: data.school_id,
    schoolName: data.school?.name ?? null,
    schoolShort: data.school ? shortNameOf(data.school.name) : null,
    schoolCrest: data.school?.crest_url ?? null,
    createdAt: data.created_at,
  };
}

function mapSeedPublicProfile(data: RawSeedPublicProfile): PublicProfile {
  return {
    id: data.id,
    username: data.username,
    avatarUrl: data.avatar_url,
    coverUrl: null,
    bio: "",
    fullName: data.full_name,
    classForm: null,
    website: null,
    schoolId: data.school_id,
    schoolName: data.school?.name ?? null,
    schoolShort: data.school ? shortNameOf(data.school.name) : null,
    schoolCrest: data.school?.crest_url ?? null,
    createdAt: data.created_at,
    isSeed: true,
  };
}

/** Read-only public profile for `/profile/:userId` (no email or private fields). */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const profiles = await fetchPublicProfiles([userId]);
  return profiles.get(userId) ?? null;
}

/** Fetches regular and seed profiles in batches, preserving input IDs in the result map. */
export async function fetchPublicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const cacheKey = (userId: string) => `profile:public:${userId}`;
  if (isBrowserOffline()) {
    const cached = await Promise.all(ids.map(async (id) => [id, await readOfflineValue<PublicProfile>(cacheKey(id))] as const));
    return new Map(cached.flatMap(([id, profile]) => profile ? [[id, profile] as const] : []));
  }

  try {
    const select = await profileSelect();
    const { data, error } = await supabase
      .from("profiles")
      .select(`${select}, school:schools!school_id(name, crest_url:logo_url)`)
      .in("id", ids)
      .returns<RawPublicProfile[]>();
    if (error) throw new Error(error.message);
    const profiles = new Map((data ?? []).map((row) => [row.id, mapPublicProfile(row)]));
    const missingIds = ids.filter((id) => !profiles.has(id));
    if (missingIds.length > 0) {
      const { data: seedProfiles, error: seedError } = await supabase
        .from("admin_seed_profiles")
        .select("id, username, full_name, avatar_url, school_id, created_at, school:schools!school_id(name, crest_url:logo_url)")
        .in("id", missingIds)
        .returns<RawSeedPublicProfile[]>();
      if (seedError) {
        if (seedError.code !== "42P01" && seedError.code !== "PGRST205") throw new Error(seedError.message);
      } else {
        for (const row of seedProfiles ?? []) profiles.set(row.id, mapSeedPublicProfile(row));
      }
    }

    await Promise.all([...profiles].map(async ([id, profile]) => {
      try {
        await writeOfflineValue(cacheKey(id), profile);
      } catch (cacheError) {
        console.warn("Could not save this profile for offline use.", cacheError);
      }
    }));
    return profiles;
  } catch (error) {
    if (!isBrowserOffline()) throw error;
    const cached = await Promise.all(ids.map(async (id) => [id, await readOfflineValue<PublicProfile>(cacheKey(id))] as const));
    return new Map(cached.flatMap(([id, profile]) => profile ? [[id, profile] as const] : []));
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
  website?: string | null;
}

type ProfileUpdatePayload = Partial<
  Pick<
    ProfileRow,
    | "username"
    | "bio"
    | "website"
    | "avatar_url"
    | "cover_url"
    | "school_id"
    | "full_name"
    | "class_form"
  >
>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateMyProfile(patch: ProfilePatch): Promise<Profile> {
  const userId = await requireUserId();
  const update: ProfileUpdatePayload = {};
  if (patch.username !== undefined) {
    const username = patch.username;
    if (!isValidUsername(username)) {
      throw new Error("Usernames must be between 3 and 24 characters.");
    }
    const { data: current, error: currentError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle<{ username: string }>();
    if (currentError) {
      throw new Error(currentError.message);
    }
    if (!current) throw new Error("Your profile could not be found.");

    if (username !== current.username) {
      const { data: usernameRules, error: usernameRulesError } = await supabase
        .from("profiles")
        .select("username_last_changed_at")
        .eq("id", userId)
        .maybeSingle<{ username_last_changed_at: string | null }>();
      if (usernameRulesError) {
        if (usernameRulesError.code === "42703" || usernameRulesError.code === "PGRST204") {
          throw new Error("Username change rules need the profile_username_rules.sql migration.");
        }
        throw new Error(usernameRulesError.message);
      }
      if (!usernameRules) throw new Error("Your profile could not be found.");

      const lastChangedAt = usernameRules.username_last_changed_at
        ? Date.parse(usernameRules.username_last_changed_at)
        : null;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (lastChangedAt !== null && Date.now() - lastChangedAt < sevenDaysMs) {
        throw new Error("You can only change your username once every 7 days.");
      }
      update.username = username;
    }
  }
  if (patch.bio !== undefined) update.bio = patch.bio.trim();
  if (patch.website !== undefined) {
    const website = patch.website?.trim() ?? "";
    const supportsWebsite = await supportsProfileWebsite();
    if (website && !supportsWebsite) {
      throw new Error("Profile website links need the profile_identity_and_cover.sql migration to be applied first.");
    }
    if (supportsWebsite) update.website = website || null;
  }
  if (patch.avatarUrl !== undefined) {
    update.avatar_url = patch.avatarUrl ? cloudflareMediaUrl(patch.avatarUrl) : null;
  }
  if (patch.coverUrl !== undefined) {
    if (!(await supportsProfileCover())) {
      throw new Error("Cover photos need migration-step13.sql to be applied first.");
    }
    update.cover_url = patch.coverUrl ? cloudflareMediaUrl(patch.coverUrl) : null;
  }
  if (patch.schoolId !== undefined) {
    const schoolId = patch.schoolId?.trim() ?? "";
    if (schoolId && !UUID_PATTERN.test(schoolId)) {
      throw new Error("Choose a valid school before saving your profile.");
    }
    update.school_id = schoolId || null;
  }
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

  if (Object.keys(update).length === 0) {
    const profile = await fetchProfile(userId);
    if (!profile) throw new Error("Your profile could not be reloaded.");
    return profile;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);
  if (error) {
    if (error.code === "23505") throw new Error("That nickname is already taken.");
    if (error.message.includes("You can only change your username once every 7 days.")) {
      throw new Error("You can only change your username once every 7 days.");
    }
    throw new Error(error.message);
  }

  const savedProfile = await fetchProfile(userId);
  if (!savedProfile) throw new Error("Your profile could not be reloaded after saving.");

  const matchesUpdate =
    (update.username === undefined || savedProfile.username === update.username) &&
    (update.bio === undefined || savedProfile.bio === update.bio) &&
    (update.website === undefined || savedProfile.website === update.website) &&
    (update.avatar_url === undefined || savedProfile.avatarUrl === update.avatar_url) &&
    (update.cover_url === undefined || savedProfile.coverUrl === update.cover_url) &&
    (update.school_id === undefined || savedProfile.schoolId === update.school_id) &&
    (update.full_name === undefined || savedProfile.fullName === update.full_name) &&
    (update.class_form === undefined || savedProfile.classForm === update.class_form);
  if (!matchesUpdate) throw new Error("Your profile update was not saved. Please try again.");
  return savedProfile;
}

export async function uploadMyAvatar(file: File): Promise<string> {
  return uploadPreparedAvatar(file);
}

export async function uploadMyCover(file: File): Promise<Profile> {
  await requireUserId();
  if (!(await supportsProfileCover())) {
    throw new Error("Cover photos need migration-step13.sql to be applied first.");
  }
  const compressed = await compressImageWithStats(file, COMPRESSION_PRESETS.covers);
  const coverUrl = await uploadFileToR2(compressed.file, "covers", compressed.file.type);
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
  const select = await profileSelect();
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
  accountId: string;
  hasSession: boolean;
  profile: Profile | null;
  avatarUploadError?: string;
}

/**
 * Registers a student via Supabase Auth and immediately syncs their chosen
 * nickname, SHS community, and preset or uploaded profile photo when a session is active.
 */
export async function signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
  const username = input.username;
  if (!isValidUsername(username)) {
    throw new Error("Usernames must be between 3 and 24 characters.");
  }
  const fallbackAvatar = input.avatarUrl || defaultAvatarUrl(username);
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
        username,
        school_id: schoolId ?? "",
        school_name: schoolName,
        school_region: input.schoolRegion?.trim() || "",
        school_type: input.schoolType ?? "public",
        avatar_url: fallbackAvatar,
      },
    },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Signup completed, but account details were not returned.");

  if (!data.session) {
    return {
      accountId: data.user.id,
      hasSession: false,
      profile: null,
      ...(input.avatarFile
        ? {
            avatarUploadError:
              "Your account was created, but the selected photo can only be uploaded after email confirmation and sign-in.",
          }
        : {}),
    };
  }

  const profile = await ensureProfile();

  let finalAvatarUrl = fallbackAvatar;
  let avatarUploadError: string | undefined;
  if (input.avatarFile) {
    try {
      finalAvatarUrl = await uploadMyAvatar(input.avatarFile);
    } catch (error) {
      finalAvatarUrl = fallbackAvatar;
      avatarUploadError =
        error instanceof Error ? error.message : "The selected profile photo could not be uploaded.";
    }
  }

  const updatedProfile = await updateMyProfile({
    username,
    schoolId: schoolId ?? profile.schoolId,
    avatarUrl: finalAvatarUrl,
  });

  return {
    accountId: data.user.id,
    hasSession: true,
    profile: updatedProfile,
    ...(avatarUploadError ? { avatarUploadError } : {}),
  };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
