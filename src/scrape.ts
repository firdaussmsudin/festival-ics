import * as cheerio from "cheerio";
import { writeFile } from "node:fs/promises";
import type { CandidateEntry } from "./types.js";

const SOURCE_URL =
  "https://www.screendaily.com/news/2026-film-festivals-and-markets-calendar-latest-dates/5211872.article";

// Matches entries shaped like: "SXSW, US - March 12-18"
// or "Cph:dox, Denmark - March 11-22". Deliberately loose — this is a
// best-effort extractor over prose, not a real parser. Every candidate
// gets reviewed by a human before it becomes canonical data (see diff.ts).
//
// NOTE: no ^/$ anchors — Screendaily's list renders as one continuous
// paragraph with entries separated by "·", not one-per-line, so we run
// this as a global match over the whole block instead of splitting by
// newline first.
const ENTRY_PATTERN =
  /(?<name>[A-Z][^,·]{1,60}),\s*(?<country>[^-·]{2,40}?)\s*-\s*(?<dateRange>[A-Za-z]+\s+\d{1,2}\s*-\s*(?:[A-Za-z]+\s+)?\d{1,2})/g;

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function parseDateRange(
  raw: string,
  year: number,
): { startDate: string; endDate: string } | null {
  // "March 12-18" or "March 12-April 2"
  const match = raw.match(
    /^([A-Za-z]+)\s+(\d{1,2})\s*-\s*(?:([A-Za-z]+)\s+)?(\d{1,2})$/,
  );
  if (!match) return null;
  const [, startMonthName, startDay, endMonthName, endDay] = match;
  const startMonth = MONTHS[startMonthName.toLowerCase()];
  const endMonth = endMonthName
    ? MONTHS[endMonthName.toLowerCase()]
    : startMonth;
  if (!startMonth || !endMonth) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${year}-${pad(startMonth)}-${pad(Number(startDay))}`,
    endDate: `${year}-${pad(endMonth)}-${pad(Number(endDay))}`,
  };
}

export async function scrapeScreendaily(
  year = new Date().getFullYear(),
): Promise<CandidateEntry[]> {
  const res = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "festival-ics-bot/0.1 (+github contribution bot)",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // The listing lives in the main article body. Adjust this selector if
  // Screendaily changes their template — that's the single point of
  // fragility in this whole pipeline.
  const articleRoot = $("article").length ? $("article") : $("body");

  // Build a text -> absolute URL map from every link inside the listing
  // BEFORE flattening to plain text (flattening loses the hrefs). Some
  // names may link to Screendaily's own tag/coverage page rather than the
  // festival's actual site — this is "best available link", not a
  // guarantee. Spot-check a few entries in data/candidates.json.
  const linksByText = new Map<string, string>();
  articleRoot.find("a[href]").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (!text || !href) return;
    try {
      linksByText.set(text, new URL(href, SOURCE_URL).toString());
    } catch {
      // ignore malformed hrefs (mailto:, javascript:, etc.)
    }
  });

  const bodyText = articleRoot
    .text()
    // normalize whitespace so multi-space/newline runs inside the
    // paragraph don't break the regex's \s+ expectations
    .replace(/\s+/g, " ")
    .trim();

  const candidates: CandidateEntry[] = [];

  for (const match of bodyText.matchAll(ENTRY_PATTERN)) {
    const { name, country, dateRange } = match.groups ?? {};
    if (!name || !country || !dateRange) continue;

    const parsed = parseDateRange(dateRange.trim(), year);
    if (!parsed) continue;

    const trimmedName = name.trim();

    candidates.push({
      name: trimmedName,
      country: country.trim(),
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      sourceUrl: SOURCE_URL,
      website: linksByText.get(trimmedName),
      rawText: match[0].trim(),
    });
  }

  return candidates;
}

async function main() {
  const candidates = await scrapeScreendaily();
  await writeFile(
    "data/candidates.json",
    JSON.stringify({ candidates }, null, 2),
  );
  console.log(
    `Wrote ${candidates.length} candidate entries to data/candidates.json`,
  );
}

// Only run when executed directly (not when imported by diff.ts etc.)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
