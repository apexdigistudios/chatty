import { shortNameOf } from "../lib/media";
import { countOf, requireUserId, supabase } from "../lib/supabase";
import type { School, SchoolRow, SchoolType } from "../types/models";
import { uploadImage } from "./storageService";

/**
 * `profiles!school_id` disambiguates the two profiles↔schools relationships
 * (profiles.school_id vs schools.creator_id) by column rather than constraint name.
 */
const SCHOOL_SELECT = `id, name, region, school_type, crest_url, creator_id, created_at,
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
    crestUrl: row.crest_url,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    memberCount: countOf(row.members),
    postCount: countOf(row.posts),
  };
}

export async function fetchSchools(): Promise<School[]> {
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SELECT)
    .order("name", { ascending: true })
    .returns<RawSchool[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSchool);
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

export interface CreateSchoolInput {
  name: string;
  region: string;
  schoolType: SchoolType;
  crestFile?: File | null;
}

/** Inserts a community with the caller as founder → moderator. */
export async function createSchoolCommunity(input: CreateSchoolInput): Promise<School> {
  const userId = await requireUserId();
  const crestUrl = input.crestFile ? await uploadImage(input.crestFile, "crests") : null;

  const { data, error } = await supabase
    .from("schools")
    .insert({
      name: input.name.trim(),
      region: input.region.trim(),
      school_type: input.schoolType,
      crest_url: crestUrl,
      creator_id: userId,
    })
    .select(SCHOOL_SELECT)
    .single<RawSchool>();
  if (error) {
    if (error.code === "23505") throw new Error("A community with that name already exists.");
    throw new Error(error.message);
  }
  return mapSchool(data);
}

/** Becomes moderator of a seeded community that has no founder yet (RPC from migration-step7.sql). */
export async function claimSchool(schoolId: string): Promise<void> {
  const { error } = await supabase.rpc("claim_school", { target_school: schoolId });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Claiming needs migration-step7.sql to be applied first.");
    throw new Error(error.message);
  }
}

export async function updateSchoolCrest(schoolId: string, file: File): Promise<string> {
  const crestUrl = await uploadImage(file, "crests");
  const { error } = await supabase.from("schools").update({ crest_url: crestUrl }).eq("id", schoolId);
  if (error) throw new Error(error.message);
  return crestUrl;
}
