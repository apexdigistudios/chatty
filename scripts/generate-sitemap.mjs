import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root);
const origin = (process.env.SITE_URL || "https://www.gistme.online").replace(/\/+$/, "");
const lastmod = new Date().toISOString().slice(0, 10);
const routes = [
  ["/", "hourly", "1.0"],
  ["/explore", "daily", "0.9"],
  ["/trending", "hourly", "0.9"],
  ["/spotlight", "hourly", "0.8"],
  ["/schools", "weekly", "0.9"],
  ["/confessions", "daily", "0.7"],
  ["/shoutouts", "daily", "0.6"],
  ["/privacy", "yearly", "0.3"],
  ["/terms", "yearly", "0.3"],
];
const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const entries = routes.map(([route, changefreq, priority]) => ({
  loc: `${origin}${route}`,
  lastmod,
  changefreq,
  priority,
}));

async function getPublicSchoolEntries() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return [];

  const entries = [];
  try {
    for (let offset = 0; ; offset += 1000) {
      const url = new URL(`${supabaseUrl}/rest/v1/schools`);
      url.searchParams.set("select", "id,updated_at");
      url.searchParams.set("order", "name.asc");
      url.searchParams.set("limit", "1000");
      const response = await fetch(url, {
        headers: {
          apikey: anonKey,
          Range: `${offset}-${offset + 999}`,
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Supabase returned HTTP ${response.status}.`);
      }

      const schools = await response.json();
      if (!Array.isArray(schools)) throw new Error("Supabase returned an invalid school list.");
      for (const school of schools) {
        if (typeof school.id !== "string" || !/^[0-9a-f-]{36}$/i.test(school.id)) continue;
        const parsedUpdatedAt =
          typeof school.updated_at === "string" ? new Date(school.updated_at) : null;
        entries.push({
          loc: `${origin}/schools/${encodeURIComponent(school.id)}`,
          lastmod:
            parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime())
              ? parsedUpdatedAt.toISOString().slice(0, 10)
              : lastmod,
          changefreq: "weekly",
          priority: "0.7",
        });
      }
      if (schools.length < 1000) return entries;
    }
  } catch (error) {
    console.warn(
      "Could not load school URLs for the sitemap; static public routes will still be generated.",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

const schoolEntries = await getPublicSchoolEntries();
entries.push(...schoolEntries);
const sitemapEntries = entries.map((entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${escapeXml(entry.changefreq)}</changefreq>
    <priority>${escapeXml(entry.priority)}</priority>
  </url>`).join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>
`;
const output = resolve(root, "public", "sitemap.xml");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, sitemap, "utf8");
console.log(`Generated ${entries.length} sitemap URLs (${schoolEntries.length} schools) at ${output}`);
