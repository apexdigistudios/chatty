import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = (process.env.SITE_URL || "https://www.gistme.online").replace(/\/+$/, "");
const lastmod = new Date().toISOString().slice(0, 10);
const routes = [
  ["/", "hourly", "1.0"],
  ["/explore", "daily", "0.9"],
  ["/trending", "hourly", "0.9"],
  ["/spotlight", "hourly", "0.8"],
  ["/login", "monthly", "0.3"],
  ["/register", "monthly", "0.4"],
  ["/privacy", "yearly", "0.3"],
  ["/terms", "yearly", "0.3"],
];
const entries = routes.map(([route, changefreq, priority]) => `  <url>
    <loc>${origin}${route}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
const output = resolve(root, "public", "sitemap.xml");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, sitemap, "utf8");
console.log(`Generated ${routes.length} sitemap URLs at ${output}`);
