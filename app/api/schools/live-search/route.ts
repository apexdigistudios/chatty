import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
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
  searchInformation?: { totalResults?: string };
}

interface GoogleSchoolCandidate {
  name: string;
  snippet: string;
  link: string;
}

interface LiveSchoolResult {
  id: string;
  name: string;
  snippet: string;
  link: string;
  school: School;
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

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function emptySchoolsResponse(status = 200): NextResponse {
  return NextResponse.json({ schools: [] }, { status });
}

function enforceRateLimit(ip: string): boolean {
  const now = Date.now();
  const recentRequests = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (recentRequests.length >= 8) return false;
  recentRequests.push(now);
  requestsByIp.set(ip, recentRequests);
  return true;
}

function readSchoolCandidate(item: GoogleSearchItem): GoogleSchoolCandidate | null {
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
    .replace(/\s+-\s+(?:Wikipedia|Google Search)$/i, "")
    .split(/\s(?:\||–|—|-)\s/u, 1)[0]
    ?.replace(/^(?:welcome to|home of)\s+/i, "")
    .replace(/\s+\((?:official|ghana)\)$/i, "")
    .trim();
  if (!title || title.length < 3 || title.length > 160) return null;
  return { name: title, snippet: item.snippet, link: url.toString() };
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

async function searchSchools(request: NextRequest, submittedQuery?: string | null): Promise<NextResponse> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!enforceRateLimit(ip)) return jsonError("Too many school searches. Please wait a minute and try again.", 429);

    let query = submittedQuery ?? request.nextUrl.searchParams.get("query") ?? request.nextUrl.searchParams.get("q");
    if (!query && request.method === "POST") {
      try {
        const body: unknown = await request.json();
        if (body && typeof body === "object" && "query" in body && typeof body.query === "string") {
          query = body.query;
        }
      } catch {
        return jsonError("Enter a school name to search.", 400);
      }
    }
    if (typeof query !== "string") {
      return jsonError("Enter a school name to search.", 400);
    }

    query = query.trim();
    const normalizedQuery = normalizeSchoolName(query);
    if (normalizedQuery.length < 3 || query.length > 120) {
      return jsonError("Enter at least 3 characters for the school name.", 400);
    }

    const googleKey = process.env.GOOGLE_CSE_API_KEY;
    const googleCx = process.env.GOOGLE_CSE_ID;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.info("Google Custom Search configuration:", {
      apiKeyConfigured: Boolean(googleKey),
      searchEngineConfigured: Boolean(googleCx),
    });
    if (!googleKey || !googleCx) {
      console.warn("Live school search is not configured; returning no external results.");
      return emptySchoolsResponse();
    }
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Live school search cannot save results without server-side Supabase credentials.");
      return emptySchoolsResponse(503);
    }

    const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
    searchUrl.search = new URLSearchParams({
      key: googleKey,
      cx: googleCx,
      q: `${query} Ghana Senior High School SHS`,
      num: "10",
    }).toString();
    let response: Response;
    try {
      response = await fetch(searchUrl, { signal: AbortSignal.timeout(8_000) });
    } catch (error) {
      console.warn("Google Custom Search request failed.", error);
      return emptySchoolsResponse();
    }
    if (!response.ok) {
      console.warn("Google Custom Search failed with status", response.status);
      return emptySchoolsResponse();
    }

    let searchResults: GoogleSearchResponse;
    try {
      searchResults = (await response.json()) as GoogleSearchResponse;
    } catch (error) {
      console.warn("Google Custom Search returned an invalid response.", error);
      return emptySchoolsResponse();
    }
    const candidates = [...new Map(
      (searchResults.items ?? [])
        .map(readSchoolCandidate)
        .filter((candidate): candidate is GoogleSchoolCandidate => candidate !== null)
        .map((candidate) => [normalizeSchoolName(candidate.name), candidate])
    ).values()].slice(0, 8);
    console.info("Google Custom Search results:", {
      totalResults: searchResults.searchInformation?.totalResults ?? "0",
      items: searchResults.items ?? [],
    });
    if (candidates.length === 0) {
      return emptySchoolsResponse();
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const normalizedNames = candidates.map(({ name }) => normalizeSchoolName(name));
    const { error: insertError } = await client
      .from("schools")
      .upsert(
        candidates.map(({ name, snippet }) => {
          const normalizedName = normalizeSchoolName(name);
          return {
            name,
            region: inferRegion(`${name} ${snippet}`),
            school_type: "public",
            normalized_name: normalizedName,
            aliases: normalizedName === normalizedQuery ? [normalizedQuery] : [],
          };
        }),
        { onConflict: "normalized_name", ignoreDuplicates: true }
      );
    if (insertError) throw new Error(insertError.message);
    const { data: schoolRows, error: schoolsError } = await client
      .from("schools")
      .select(SCHOOL_ROW_SELECT)
      .in("normalized_name", normalizedNames)
      .returns<SchoolRow[]>();
    if (schoolsError) throw new Error(schoolsError.message);

    const schoolsByName = new Map((schoolRows ?? []).map((row) => [row.normalized_name ?? normalizeSchoolName(row.name), row]));
    const schools: LiveSchoolResult[] = candidates.flatMap((candidate) => {
      const row = schoolsByName.get(normalizeSchoolName(candidate.name));
      if (!row) return [];
      const school = mapSchool(row);
      return [{
        id: school.id,
        name: school.name,
        snippet: candidate.snippet,
        link: candidate.link,
        school,
      }];
    });
    return NextResponse.json({ schools });
  } catch (error) {
    console.error("Could not complete live school search.", error);
    return emptySchoolsResponse(500);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return searchSchools(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return searchSchools(request);
}
