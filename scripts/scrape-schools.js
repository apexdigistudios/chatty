#!/usr/bin/env node

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("node:fs/promises");
const path = require("node:path");

const SOURCE_URL =
  process.env.SCHOOLS_SOURCE_URL ||
  "https://en.wikipedia.org/wiki/List_of_senior_high_schools_in_Ghana";
const OUTPUT_PATH = path.resolve(__dirname, "../supabase/seed-schools.json");
const SOURCE_LICENSE = SOURCE_URL.includes("wikipedia.org")
  ? "CC BY-SA 4.0; see source URL and article history"
  : "Check source terms before reuse";
const REGIONS = [
  "Ahafo Region",
  "Ashanti Region",
  "Bono East Region",
  "Bono Region",
  "Central Region",
  "Eastern Region",
  "Greater Accra Region",
  "North East Region",
  "Northern Region",
  "Oti Region",
  "Savannah Region",
  "Upper East Region",
  "Upper West Region",
  "Volta Region",
  "Western North Region",
  "Western Region",
];

function normalizeSchoolName(name) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(?:senior\s+high|shs|college|school)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRegion(sectionHeading, locationText) {
  const context = `${sectionHeading} ${locationText}`.toLocaleLowerCase("en");
  return REGIONS.find((region) => context.includes(region.toLocaleLowerCase("en"))) ?? null;
}

function inferSchoolType(typeText) {
  const value = typeText.toLocaleLowerCase("en");
  if (value.includes("technical")) return "technical";
  if (value.includes("private")) return "private";
  if (value.includes("mission")) return "mission";
  return "public";
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The school CSV contains an unclosed quoted field.");
  cells.push(cell);
  return cells;
}

function readStructuredRecords(text, extension) {
  if (extension === ".json") {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("The input JSON must contain an array of school records.");
    return parsed.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) return null;
      return {
        name,
        normalized_name: normalizeSchoolName(name),
        code: typeof row.code === "string" && row.code.trim() ? row.code.trim() : null,
        region: typeof row.region === "string" && row.region.trim() ? row.region.trim() : null,
        category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
        motto: typeof row.motto === "string" && row.motto.trim() ? row.motto.trim() : null,
        aliases: Array.isArray(row.aliases)
          ? [...new Set(row.aliases.filter((alias) => typeof alias === "string").map(normalizeSchoolName).filter(Boolean))]
          : [],
        school_type: ["private", "mission", "technical"].includes(row.school_type)
          ? row.school_type
          : "public",
        source_url: "local structured source",
        source_license: "Provided structured source",
        source_location: null,
      };
    }).filter(Boolean);
  }

  if (extension !== ".csv") {
    throw new Error("Structured input must be a .json or .csv file.");
  }
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) throw new Error("The school CSV is empty.");
  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLocaleLowerCase("en").replace(/\s+/g, "_"));
  const get = (cells, ...keys) => {
    const index = headers.findIndex((header) => keys.includes(header));
    return index >= 0 ? (cells[index] || "").trim() : "";
  };
  return lines.map((line, index) => {
    const cells = parseCsvLine(line);
    const name = get(cells, "name", "school", "school_name");
    if (!name) return null;
    const aliasText = get(cells, "aliases", "alias");
    const typeText = get(cells, "school_type", "type", "ownership");
    return {
      name,
      normalized_name: normalizeSchoolName(name),
      code: get(cells, "code", "cssps_code") || null,
      region: get(cells, "region") || null,
      category: get(cells, "category") || null,
      motto: get(cells, "motto") || null,
      aliases: [...new Set(aliasText.split(/[;|]/).map(normalizeSchoolName).filter(Boolean))],
      school_type: inferSchoolType(typeText),
      source_url: "local structured source",
      source_license: "Provided structured source",
      source_location: null,
      _row: index + 2,
    };
  }).filter(Boolean);
}

function extractRecords(html) {
  const $ = cheerio.load(html);
  const schoolRows = new Map();
  $("table.wikitable").each((_, table) => {
    const headerTexts = $(table).find("tr").first().find("th").map((__, cell) =>
      $(cell).text().replace(/\[[^\]]+\]/g, "").trim().toLocaleLowerCase("en")
    ).get();
    const schoolIndex = headerTexts.findIndex((text) => text.includes("school"));
    const typeIndex = headerTexts.findIndex((text) => text.includes("type"));
    const locationIndex = headerTexts.findIndex((text) =>
      text.includes("location") || text.includes("region")
    );
    if (schoolIndex < 0) return;

    $(table).find("tr").slice(1).each((__, row) => {
      const cells = $(row).children("th, td");
      if (cells.length <= schoolIndex) return;
      const schoolCell = cells.eq(schoolIndex);
      const linkedName = schoolCell.find("a").first().text().trim();
      const name = linkedName || schoolCell.text().replace(/\[[^\]]+\]/g, "").trim();
      const normalizedName = normalizeSchoolName(name);
      if (!name || !normalizedName || /^(senior high schools?|school)$/i.test(name)) return;

      const typeText = typeIndex >= 0 ? cells.eq(typeIndex).text().trim() : "";
      const locationText = locationIndex >= 0 ? cells.eq(locationIndex).text().trim() : "";
      let sectionHeading = "";
      const heading = $(table).prevAll("h2, h3, h4").first();
      if (heading.length) sectionHeading = heading.text().replace(/\[[^\]]+\]/g, "");

      const record = {
        name,
        normalized_name: normalizedName,
        code: null,
        region: inferRegion(sectionHeading, locationText),
        category: /\bcategory\s+[a-e]\b/i.test(typeText)
          ? typeText.match(/\bcategory\s+[a-e]\b/i)[0]
          : null,
        motto: null,
        aliases: [],
        school_type: inferSchoolType(typeText),
        source_url: SOURCE_URL,
        source_license: SOURCE_LICENSE,
        source_location: locationText || null,
      };
      const existing = schoolRows.get(normalizedName);
      if (existing) {
        if (!existing.region && record.region) existing.region = record.region;
        if (!existing.code && record.code) existing.code = record.code;
        if (!existing.category && record.category) existing.category = record.category;
        if (existing.school_type === "public" && record.school_type !== "public") {
          existing.school_type = record.school_type;
        }
      } else {
        schoolRows.set(normalizedName, record);
      }
    });
  });
  return [...schoolRows.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : process.env.SCHOOLS_SOURCE_FILE;
  let records;
  let source = SOURCE_URL;
  if (inputPath) {
    const text = await fs.readFile(inputPath, "utf8");
    records = readStructuredRecords(text, path.extname(inputPath).toLocaleLowerCase("en"));
    source = inputPath;
  } else {
    const response = await axios.get(SOURCE_URL, {
      timeout: 45_000,
      headers: {
        "User-Agent": "GistMeSchoolDirectoryImporter/1.0 (school data import; contact: support@gistme.online)",
      },
      maxContentLength: 20 * 1024 * 1024,
    });
    records = extractRecords(response.data);
  }
  if (records.length < 100) {
    throw new Error(`Only found ${records.length} schools from ${source}; refusing to overwrite the seed file.`);
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  const withRegion = records.filter((record) => record.region).length;
  const withCategory = records.filter((record) => record.category).length;
  console.log(`Collected ${records.length} unique school records from ${source}`);
  if (records.length < 700) {
    console.warn("This scrape is not a complete Ghana SHS master list; enrich it with a verified comprehensive source.");
  }
  console.log(`Region values found: ${withRegion}; CSSPS codes/mottos are not provided by this directory.`);
  console.log(`Category values found: ${withCategory}`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("School directory scrape failed.", error);
  process.exitCode = 1;
});
