import { createClient } from "@supabase/supabase-js";
import { shortNameOf } from "@/lib/media";
import { countOf } from "@/lib/supabase";
import type { School, SchoolType } from "@/types/models";

interface PublicSchoolRow {
  id: string;
  name: string;
  region: string;
  school_type: string | null;
  crest_url: string | null;
  creator_id: string | null;
  created_at: string;
  members: unknown;
  posts: unknown;
}

const SCHOOL_SELECT =
  "id, name, region, school_type, crest_url:logo_url, creator_id, created_at, members:profiles!school_id(count), posts(count)";

function publicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapPublicSchool(row: PublicSchoolRow): School {
  return {
    id: row.id,
    name: row.name,
    shortName: shortNameOf(row.name),
    region: row.region,
    schoolType: (row.school_type?.toLowerCase() as SchoolType | undefined) ?? "public",
    crestUrl: row.crest_url,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    memberCount: countOf(row.members),
    postCount: countOf(row.posts),
  };
}

export async function fetchPublicSchool(id: string): Promise<School | null> {
  const client = publicSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from("schools")
    .select(SCHOOL_SELECT)
    .eq("id", id)
    .maybeSingle<PublicSchoolRow>();
  if (error) throw new Error(error.message);
  return data ? mapPublicSchool(data) : null;
}

export async function fetchPublicSchools(): Promise<School[]> {
  const client = publicSupabase();
  if (!client) return [];

  const schools: School[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("schools")
      .select(SCHOOL_SELECT)
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1)
      .returns<PublicSchoolRow[]>();
    if (error) throw new Error(error.message);
    const page = data ?? [];
    schools.push(...page.map(mapPublicSchool));
    if (page.length < pageSize) return schools;
  }
}
