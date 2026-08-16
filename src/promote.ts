import { readFile, writeFile } from "node:fs/promises";
import { slugify } from "./slug.js";
import type {
  CandidateEntry,
  FestivalDataset,
  FestivalEntry,
} from "./types.js";

const UID_DOMAIN = "festival-ics.example"; // change to your real domain later

function candidateToEntry(candidate: CandidateEntry): FestivalEntry {
  const year = candidate.startDate.slice(0, 4);
  return {
    uid: `${slugify(candidate.name)}-${year}@${UID_DOMAIN}`,
    name: candidate.name,
    country: candidate.country ?? "",
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    category: "festival", // default guess — cheap to bulk-correct later
    status: "confirmed", // default guess — same
    website: candidate.website,
    sourceUrl: candidate.sourceUrl,
    notes: "",
  };
}

/**
 * Merges candidates into the dataset:
 *  - matches an existing entry by slugified name -> updates startDate/
 *    endDate/sourceUrl ONLY IF they actually differ, so a run that finds
 *    no real changes produces zero diff (and therefore no PR — see
 *    .github/workflows/scrape.yml, which only opens a PR when the
 *    working tree actually changed).
 *  - fills in `website` on an existing entry ONLY if it doesn't already
 *    have one — never overwrites a link you (or a contributor) fixed by
 *    hand.
 *  - no match -> appends a brand-new entry with generated defaults.
 *  - entries in the dataset that AREN'T in this candidate batch (e.g.
 *    something you added by hand that the scraper doesn't cover) are
 *    never touched or removed.
 */
function mergeAll(
  candidates: CandidateEntry[],
  dataset: FestivalDataset,
): { dataset: FestivalDataset; changed: boolean } {
  const bySlug = new Map(
    dataset.festivals.map((f) => [slugify(f.name), f] as const),
  );

  let changed = false;

  for (const candidate of candidates) {
    const slug = slugify(candidate.name);
    const existing = bySlug.get(slug);

    if (existing) {
      const datesChanged =
        existing.startDate !== candidate.startDate ||
        existing.endDate !== candidate.endDate;
      if (datesChanged) {
        existing.startDate = candidate.startDate;
        existing.endDate = candidate.endDate;
        existing.sourceUrl = candidate.sourceUrl;
        changed = true;
      }

      if (!existing.website && candidate.website) {
        existing.website = candidate.website;
        changed = true;
      }
      // otherwise: no-op — don't touch an entry that hasn't actually changed
    } else {
      const newEntry = candidateToEntry(candidate);
      bySlug.set(slug, newEntry);
      dataset.festivals.push(newEntry);
      changed = true;
    }
  }

  if (changed) {
    // keep the file in a stable, readable order — only re-sort when
    // something actually changed, so an unchanged run doesn't reorder
    // (and therefore doesn't diff) the file for no reason
    dataset.festivals.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return { dataset, changed };
}

async function main() {
  const [candidatesRaw, datasetRaw] = await Promise.all([
    readFile("data/candidates.json", "utf-8"),
    readFile("data/festivals.json", "utf-8"),
  ]);

  const { candidates } = JSON.parse(candidatesRaw) as {
    candidates: CandidateEntry[];
  };
  const dataset = JSON.parse(datasetRaw) as FestivalDataset;

  const before = dataset.festivals.length;
  const { dataset: merged, changed } = mergeAll(candidates, dataset);

  if (!changed) {
    console.log("No changes — festivals.json left untouched.");
    return;
  }

  const added = merged.festivals.length - before;
  await writeFile(
    "data/festivals.json",
    JSON.stringify(merged, null, 2) + "\n",
  );
  console.log(
    `Merged: ${added} new, ${
      candidates.length - added
    } existing entries had date/website changes. data/festivals.json now has ${
      merged.festivals.length
    } entries.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
