import { createClient } from "@supabase/supabase-js";
import { normalizeSchoolName } from "@/lib/services/school-resolver";
import type { School, SchoolType } from "@/types/models";

export const runtime = "nodejs";

interface GoogleSearchItem {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

interface SchoolRow {
  id: string;
  name: string;
  region: string;
  school_type: string | null;
  code: string | null;
  motto: string | null;
  category: string | null;
  aliases: string[] | null;
  normalized_name: string | null;
  logo_url: string | null;
  creator_id: string | null;
  created_at: string;
}

const GHANA_REGIONS = [
  "Greater Accra Region",
  "Ashanti Region",
  "Central Region",
  "Eastern Region",
  "Western Region",
  "Volta Region",
  "Northern Region",
  "Upper East Region",
  "Upper West Region",
  "Bono Region",
  "Bono East Region",
  "Ahafo Region",
  "Oti Region",
  "Savannah Region",
  "North East Region",
  "Western North Region",
] as const;

const requestsByIp = new Map<string, number[]>();
const SCHOOL_ROW_SELECT =
  "id, name, region, school_type, code, motto, category, aliases, normalized_name, logo_url, creator_id, created_at";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function enforceRateLimit(ip: string): boolean {
  const now = Date.now();
  const recentRequests = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recentRequests.length >= 8) return false;
  recentRequests.push(now);
  requestsByIp.set(ip, recentRequests);
  return true;
}

function readName(item: GoogleSearchItem): string | null {
  if (typeof item.title !== "string" || typeof item.link !== "string" || typeof item.snippet !== "string") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(item.link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const sourceText = `${item.title} ${item.snippet}`;
  if (!/(senior\s+high|high\s+school|secondary\s+school|\bshs\b|ghana)/i.test(sourceText)) {
    return null;
  }

  const title = item.title
    .split(/\s(?:\||–|—|-)\s/u, 1)[0]
    ?.replace(/^(?:welcome to|home of)\s+/i, "")
    .replace(/\s+\((?:official|ghana)\)$/i, "")
    .trim();
  if (!title || title.length < 3 || title.length > 160) return null;
  return title;
}

function inferRegion(text: string): string {
  const normalizedText = normalizeSchoolName(text);
  return GHANA_REGIONS.find((region) => normalizedText.includes(normalizeSchoolName(region))) ?? "Unknown Region";
}

function mapSchool(row: SchoolRow): School {
  return {
    id: row.id,
    name: row.name,
    shortName: row.name.replace(/\s+(?:senior\s+high\s+school|senior\s+high|high\s+school|school)$/i, "").trim(),
    region: row.region,
    schoolType: (row.school_type?.toLowerCase() as SchoolType | undefined) ?? "public",
    code: row.code,
    motto: row.motto,
    category: row.category,
    aliases: row.aliases ?? [],
    normalizedName: row.normalized_name ?? normalizeSchoolName(row.name),
    crestUrl: row.logo_url,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    memberCount: 0,
    postCount: 0,
  };
}

function schoolResult(row: SchoolRow | null): School | null {
  return row ? mapSchool(row) : null;
}

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!enforceRateLimit(ip)) return jsonError("Too many school searches. Please wait a minute and try again.", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Enter a school name to search.", 400);
  }
  if (!body || typeof body !== "object" || !("query" in body) || typeof body.query !== "string") {
    return jsonError("Enter a school name to search.", 400);
  }

  const query = body.query.trim();
  const normalizedQuery = normalizeSchoolName(query);
  if (normalizedQuery.length < 3 || query.length > 120) {
    return jsonError("Enter at least 3 characters for the school name.", 400);
  }

  const googleKey = process.env.GOOGLE_CSE_API_KEY;
  const googleCx = process.env.GOOGLE_CSE_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!googleKey || !googleCx) {
    return jsonError("Live school search is not configured. Please contact support.", 503);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Live school search cannot save results without server-side Supabase credentials.");
    return jsonError("School search is unavailable right now. Please try again later.", 503);
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
    searchUrl.search = new URLSearchParams({
      key: googleKey,
      cx: googleCx,
      q: `${query} Ghana Senior High School SHS`,
      num: "10",
    }).toString();
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      console.error("Google Custom Search failed with status", response.status);
      return jsonError("Live school search failed. Please try again.", 502);
    }

    const searchResults = (await response.json()) as GoogleSearchResponse;
    const match = searchResults.items?.map((item) => ({
      item,
      name: readName(item),
    })).find(({ name }) => name !== null);
    if (!match?.name) {
      return Response.json({ school: null, message: "No matching school was found." }, { status: 404 });
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const normalizedName = normalizeSchoolName(match.name);
    const aliases = [...new Set([normalizedQuery].filter((alias) => alias !== normalizedName))];

    const { data: existing, error: existingError } = await client
      .from("schools")
      .select(SCHOOL_ROW_SELECT)
      .eq("normalized_name", normalizedName)
      .maybeSingle<SchoolRow>();
    if (existingError) throw new Error(existingError.message);
    if (existing) return Response.json({ school: mapSchool(existing) });

    const region = inferRegion(`${match.item.title ?? ""} ${match.item.snippet ?? ""}`);
    const { data: inserted, error: insertError } = await client
      .from("schools")
      .upsert(
        {
          name: match.name,
          region,
          school_type: "public",
          normalized_name: normalizedName,
          aliases,
        },
        { onConflict: "normalized_name", ignoreDuplicates: true }
      )
      .select(SCHOOL_ROW_SELECT)
      .maybeSingle<SchoolRow>();
    if (insertError) throw new Error(insertError.message);
    if (inserted) return Response.json({ school: mapSchool(inserted) });

    const { data: racedSchool, error: racedError } = await client
      .from("schools")
      .select(SCHOOL_ROW_SELECT)
      .eq("normalized_name", normalizedName)
      .maybeSingle<SchoolRow>();
    if (racedError) throw new Error(racedError.message);
    const school = schoolResult(racedSchool);
    if (!school) throw new Error("The discovered school could not be saved.");
    return Response.json({ school });
  } catch (error) {
    console.error("Could not complete live school search.", error);
    return jsonError("Could not search or save that school. Please try again.", 500);
  }
}
