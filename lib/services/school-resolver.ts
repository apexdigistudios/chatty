import { countOf, supabase } from "@/lib/supabase";
import { shortNameOf } from "@/lib/media";
import type { School, SchoolRow, SchoolType } from "@/types/models";

const RESOLVED_SCHOOL_SELECT = `id, name, region, school_type, code, motto, category, aliases, normalized_name,
  crest_url:logo_url, creator_id, created_at,
  members:profiles!school_id(count), posts(count)`;

interface ResolvedSchoolRow extends SchoolRow {
  code: string | null;
  motto: string | null;
  category: string | null;
  aliases: string[];
  normalized_name: string;
  members: { count: number }[];
  posts: { count: number }[];
}

interface FuzzySchoolMatch {
  id: string;
  name: string;
  region: string;
  school_type: string;
  code: string | null;
  motto: string | null;
  category: string | null;
  aliases: string[];
  normalized_name: string;
  similarity_score: number;
}

function isFuzzySchoolMatch(value: unknown): value is FuzzySchoolMatch {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.region === "string" &&
    typeof row.school_type === "string" &&
    (typeof row.code === "string" || row.code === null) &&
    (typeof row.motto === "string" || row.motto === null) &&
    (typeof row.category === "string" || row.category === null) &&
    Array.isArray(row.aliases) &&
    row.aliases.every((alias: unknown) => typeof alias === "string") &&
    typeof row.normalized_name === "string" &&
    typeof row.similarity_score === "number" &&
    Number.isFinite(row.similarity_score);
}

function mapResolvedSchool(row: ResolvedSchoolRow): School {
  return {
    id: row.id,
    name: row.name,
    shortName: shortNameOf(row.name),
    region: row.region,
    schoolType: (row.school_type?.toLowerCase() as SchoolType) ?? "public",
    code: row.code,
    motto: row.motto,
    category: row.category,
    aliases: row.aliases,
    normalizedName: row.normalized_name,
    crestUrl: row.crest_url,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    memberCount: countOf(row.members),
    postCount: countOf(row.posts),
  };
}

export function normalizeSchoolName(inputName: string): string {
  return inputName
    .toLocaleLowerCase("en")
    .replace(/[\p{P}]+/gu, " ")
    .replace(/\b(?:shs|senior\s+high|college|school)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a supplied name to an existing canonical school.
 * Returns null when no known school matches; creating a new community still
 * requires the separate region and school-type details.
 */
export async function findOrCreateSchool(inputName: string): Promise<School | null> {
  const normalizedName = normalizeSchoolName(inputName);
  if (!normalizedName) return null;

  const { data: exactMatch, error: exactError } = await supabase
    .from("schools")
    .select(RESOLVED_SCHOOL_SELECT)
    .eq("normalized_name", normalizedName)
    .maybeSingle<ResolvedSchoolRow>();
  if (exactError) throw new Error(`Could not resolve the school name: ${exactError.message}`);
  if (exactMatch) return mapResolvedSchool(exactMatch);

  const { data: aliasMatch, error: aliasError } = await supabase
    .from("schools")
    .select(RESOLVED_SCHOOL_SELECT)
    .contains("aliases", [normalizedName])
    .limit(1)
    .maybeSingle<ResolvedSchoolRow>();
  if (aliasError) throw new Error(`Could not search school aliases: ${aliasError.message}`);
  if (aliasMatch) return mapResolvedSchool(aliasMatch);

  const { data: fuzzyData, error: fuzzyError } = await supabase.rpc(
    "search_schools_fuzzy",
    { search_term: inputName }
  );
  if (fuzzyError) {
    throw new Error(`Could not search for a similar school: ${fuzzyError.message}`);
  }
  if (!Array.isArray(fuzzyData) || !fuzzyData.every(isFuzzySchoolMatch)) {
    throw new Error("The school search returned invalid data.");
  }
  const bestMatch = fuzzyData[0];
  if (!bestMatch) return null;

  const { data: canonicalMatch, error: canonicalError } = await supabase
    .from("schools")
    .select(RESOLVED_SCHOOL_SELECT)
    .eq("id", bestMatch.id)
    .maybeSingle<ResolvedSchoolRow>();
  if (canonicalError) {
    throw new Error(`Could not load the matching school: ${canonicalError.message}`);
  }
  return canonicalMatch ? mapResolvedSchool(canonicalMatch) : null;
}
