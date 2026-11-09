import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

interface SeedSchool {
  name: string;
  normalized_name: string;
  code: string | null;
  region: string | null;
  category: string | null;
  motto: string | null;
  aliases: string[];
  school_type?: "public" | "private" | "mission" | "technical";
}

const BATCH_SIZE = 100;
const DEFAULT_DATA_PATH = path.resolve(process.cwd(), "supabase/seed-schools.json");

const WELL_KNOWN_ALIASES: Array<{ names: string[]; aliases: string[] }> = [
  {
    names: ["presbyterian boys", "presbyterian boys senior high"],
    aliases: ["presec", "odade3", "presby boys", "presec legon"],
  },
  {
    names: ["st margaret mary", "saint margaret mary"],
    aliases: ["motown", "mo town"],
  },
  {
    names: ["wesley girls high", "wesley girls"],
    aliases: ["weygheyhey", "we gyhey", "wesley girls"],
  },
];

function normalizeSchoolName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(?:senior\s+high|shs|college|school)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSeedSchool(value: unknown, index: number): SeedSchool {
  if (!isRecord(value)) throw new Error(`School row ${index + 1} is not an object.`);
  const { name, region, code, category, motto, aliases, school_type } = value;
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`School row ${index + 1} has no name.`);
  }
  if (region !== null && typeof region !== "string") {
    throw new Error(`School row ${index + 1} has an invalid region.`);
  }
  if (code !== null && typeof code !== "string") {
    throw new Error(`School row ${index + 1} has an invalid CSSPS code.`);
  }
  if (category !== null && typeof category !== "string") {
    throw new Error(`School row ${index + 1} has an invalid category.`);
  }
  if (motto !== null && typeof motto !== "string") {
    throw new Error(`School row ${index + 1} has an invalid motto.`);
  }
  if (!Array.isArray(aliases) || !aliases.every((alias) => typeof alias === "string")) {
    throw new Error(`School row ${index + 1} has invalid aliases.`);
  }
  if (
    school_type !== undefined &&
    school_type !== "public" &&
    school_type !== "private" &&
    school_type !== "mission" &&
    school_type !== "technical"
  ) {
    throw new Error(`School row ${index + 1} has an invalid school type.`);
  }
  const normalizedName = normalizeSchoolName(name);
  if (!normalizedName) throw new Error(`School row ${index + 1} has an empty normalized name.`);
  return {
    name: name.trim(),
    normalized_name: normalizedName,
    code: typeof code === "string" ? code.trim() || null : null,
    region: typeof region === "string" ? region.trim() || null : null,
    category: typeof category === "string" ? category.trim() || null : null,
    motto: typeof motto === "string" ? motto.trim() || null : null,
    aliases: aliases.map(normalizeSchoolName).filter(Boolean),
    ...(school_type ? { school_type } : {}),
  };
}

function attachWellKnownAliases(school: SeedSchool): SeedSchool {
  const wellKnown = WELL_KNOWN_ALIASES.find(({ names }) =>
    names.some((name) => school.normalized_name === name)
  );
  if (!wellKnown) return school;
  return {
    ...school,
    aliases: [...new Set([...school.aliases, ...wellKnown.aliases.map(normalizeSchoolName)])],
  };
}

async function main() {
  loadEnvConfig(process.cwd());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const dataPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DATA_PATH;
  const rawData: unknown = JSON.parse(await readFile(dataPath, "utf8"));
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error(`No school records found in ${dataPath}.`);
  }

  const byNormalizedName = new Map<string, SeedSchool>();
  for (const [index, rawSchool] of rawData.entries()) {
    const school = attachWellKnownAliases(parseSeedSchool(rawSchool, index));
    const existing = byNormalizedName.get(school.normalized_name);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...school.aliases])];
      existing.region ??= school.region;
      existing.code ??= school.code;
      existing.category ??= school.category;
      existing.motto ??= school.motto;
      continue;
    }
    byNormalizedName.set(school.normalized_name, school);
  }

  const allSchools = [...byNormalizedName.values()];
  const missingRegion = allSchools.filter((school) => !school.region);
  if (missingRegion.length > 0) {
    throw new Error(
      `${missingRegion.length} schools have no verified region; add their regions to ${dataPath} before seeding.`
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let insertedOrUpdated = 0;
  for (let offset = 0; offset < allSchools.length; offset += BATCH_SIZE) {
    const batch: SeedSchool[] = allSchools.slice(offset, offset + BATCH_SIZE).map((school) => ({
      ...school,
      school_type: school.school_type ?? "public",
    }));
    const { error } = await supabase
      .from("schools")
      .upsert(batch, { onConflict: "normalized_name", ignoreDuplicates: false });
    if (error) {
      throw new Error(`Seeding batch ${Math.floor(offset / BATCH_SIZE) + 1} failed: ${error.message}`);
    }
    insertedOrUpdated += batch.length;
    console.log(`Seeded ${Math.min(offset + batch.length, allSchools.length)}/${allSchools.length} schools`);
  }
  console.log(`Finished seeding ${insertedOrUpdated} unique school records from ${dataPath}.`);
}

main().catch((error: unknown) => {
  console.error("School database seeding failed.", error);
  process.exitCode = 1;
});
