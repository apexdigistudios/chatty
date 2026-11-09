import { shortNameOf } from "@/lib/media";
import { countOf, requireUserId, supabase } from "@/lib/supabase";
import { isBrowserOffline, readOfflineValue, writeOfflineValue } from "@/lib/offlineCache";
import type { School, SchoolRow, SchoolType } from "@/types/models";
import { uploadSchoolLogo } from "@/lib/images/imageUpload";

export const GHANA_REGIONS = [
  "Greater Accra Region", "Ashanti Region", "Central Region", "Eastern Region", "Western Region",
  "Volta Region", "Northern Region", "Upper East Region", "Upper West Region", "Bono Region",
  "Bono East Region", "Ahafo Region", "Oti Region", "Savannah Region", "North East Region", "Western North Region",
] as const;

let schoolsCache: School[] | null = null;
let schoolsCacheUpdatedAt = 0;
let schoolsRequest: Promise<School[]> | null = null;
const SCHOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateSchoolsCache(): void {
  schoolsCache = null;
  schoolsCacheUpdatedAt = 0;
}

/**
 * `profiles!school_id` disambiguates the two profiles↔schools relationships
 * (profiles.school_id vs schools.creator_id) by column rather than constraint name.
 */
const SCHOOL_SELECT = `id, name, region, school_type, code, motto, category, aliases, normalized_name,
  crest_url:logo_url, creator_id, created_at,
  members:profiles!school_id(count), posts(count)`;

interface RawSchool extends SchoolRow {
  members: { count: number }[];
  posts: { count: number }[];
}

export function mapSchool(row: RawSchool): School {
  return {
    id: row.id,
    name: row.name,
    shortName: shortNameOf(row.name),
    region: row.region,
    schoolType: (row.school_type?.toLowerCase() as SchoolType) ?? "public",
    code: row.code ?? null,
    motto: row.motto ?? null,
    category: row.category ?? null,
    aliases: row.aliases ?? [],
    normalizedName: row.normalized_name ?? undefined,
    crestUrl: row.crest_url,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    memberCount: countOf(row.members),
    postCount: countOf(row.posts),
  };
}

async function fetchSchoolsFromStorageOrNetwork(): Promise<School[]> {
  const cacheKey = "schools:all";
  if (isBrowserOffline()) return (await readOfflineValue<School[]>(cacheKey)) ?? [];
  try {
    const { data, error } = await supabase
      .from("schools")
      .select(SCHOOL_SELECT)
      .order("name", { ascending: true })
      .returns<RawSchool[]>();
    if (error) throw new Error(error.message);
    const schools = (data ?? []).map(mapSchool);
    try {
      await writeOfflineValue(cacheKey, schools);
    } catch (cacheError) {
      console.warn("Could not cache school communities for offline use.", cacheError);
    }
    return schools;
  } catch (error) {
    if (isBrowserOffline()) return (await readOfflineValue<School[]>(cacheKey)) ?? [];
    throw error;
  }
}

export function fetchSchools(): Promise<School[]> {
  if (schoolsCache && Date.now() - schoolsCacheUpdatedAt < SCHOOLS_CACHE_TTL_MS) {
    return Promise.resolve(schoolsCache);
  }
  if (schoolsRequest) return schoolsRequest;
  schoolsRequest = fetchSchoolsFromStorageOrNetwork()
    .then((schools) => {
      if (!isBrowserOffline()) {
        schoolsCache = schools;
        schoolsCacheUpdatedAt = Date.now();
      }
      return schools;
    })
    .finally(() => {
      schoolsRequest = null;
    });
  return schoolsRequest;
}

export async function fetchSchool(schoolId: string): Promise<School | null> {
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SELECT)
    .eq("id", schoolId)
    .maybeSingle<RawSchool>();
  if (error) throw new Error(error.message);
  return data ? mapSchool(data) : null;
}

export async function findSchoolByName(name: string): Promise<School | null> {
  const cleanName = name.trim();
  if (!cleanName) return null;
  const pattern = cleanName.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SELECT)
    .ilike("name", pattern)
    .maybeSingle<RawSchool>();
  if (error) throw new Error(error.message);
  return data ? mapSchool(data) : null;
}

export interface CreateSchoolInput {
  name: string;
  region: string;
  schoolType: SchoolType;
  logoFile?: File | null;
  crestFile?: File | null;
}

/** Inserts a community with the caller as founder → moderator. */
export async function createSchoolCommunity(input: CreateSchoolInput): Promise<School> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("schools")
    .insert({
      name: input.name.trim(),
      region: input.region.trim(),
      school_type: input.schoolType,
      creator_id: userId,
    })
    .select(SCHOOL_SELECT)
    .single<RawSchool>();
  if (error) {
    if (error.code === "23505") throw new Error("A community with that name already exists.");
    throw new Error(error.message);
  }
  invalidateSchoolsCache();
  const school = mapSchool(data);
  const logoFile = input.logoFile ?? input.crestFile;
  if (!logoFile) return school;
  try {
    const logoUrl = await uploadSchoolLogo(school.id, logoFile);
    return { ...school, crestUrl: logoUrl };
  } catch (error) {
    throw new Error(`The community was created, but its logo could not be uploaded: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

/** Becomes moderator of an unowned community (RPC from migration-step7.sql). */
export async function claimSchool(schoolId: string): Promise<void> {
  const { error } = await supabase.rpc("claim_school", { target_school: schoolId });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Claiming needs migration-step7.sql to be applied first.");
    throw new Error(error.message);
  }
  invalidateSchoolsCache();
}

export async function updateSchoolCrest(schoolId: string, file: File): Promise<string> {
  const url = await uploadSchoolLogo(schoolId, file);
  invalidateSchoolsCache();
  return url;
}
