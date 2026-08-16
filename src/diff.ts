import { readFile, writeFile } from "node:fs/promises";
import type { CandidateEntry, FestivalDataset } from "./types.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface DiffResult {
  newEntries: CandidateEntry[];
  changedEntries: {
    uid: string;
    name: string;
    field: "startDate" | "endDate";
    oldValue: string;
    newValue: string;
    sourceUrl: string;
  }[];
  unchangedCount: number;
}

/**
 * Deliberately conservative: only startDate/endDate are ever reported as
 * "changed" (the fields most likely to actually matter and most likely to
 * be mis-scraped). Nothing here writes to the canonical dataset — this
 * only produces a report for a human (or a PR) to act on.
 */
export function diff(
  candidates: CandidateEntry[],
  dataset: FestivalDataset
): DiffResult {
  const bySlug = new Map(
    dataset.festivals.map((f) => [slugify(f.name), f] as const)
  );

  const result: DiffResult = {
    newEntries: [],
    changedEntries: [],
    unchangedCount: 0,
  };

  for (const candidate of candidates) {
    const existing = bySlug.get(slugify(candidate.name));

    if (!existing) {
      result.newEntries.push(candidate);
      continue;
    }

    let changed = false;
    if (existing.startDate !== candidate.startDate) {
      result.changedEntries.push({
        uid: existing.uid,
        name: existing.name,
        field: "startDate",
        oldValue: existing.startDate,
        newValue: candidate.startDate,
        sourceUrl: candidate.sourceUrl,
      });
      changed = true;
    }
    if (existing.endDate !== candidate.endDate) {
      result.changedEntries.push({
        uid: existing.uid,
        name: existing.name,
        field: "endDate",
        oldValue: existing.endDate,
        newValue: candidate.endDate,
        sourceUrl: candidate.sourceUrl,
      });
      changed = true;
    }

    if (!changed) result.unchangedCount++;
  }

  return result;
}

function toMarkdown(result: DiffResult): string {
  const lines: string[] = ["# Festival data diff report", ""];

  if (result.newEntries.length) {
    lines.push("## New festivals found (not in dataset)", "");
    for (const c of result.newEntries) {
      lines.push(
        `- **${c.name}** (${c.country ?? "?"}) — ${c.startDate} to ${c.endDate}`,
        `  - source: ${c.sourceUrl}`,
        `  - raw line: \`${c.rawText}\``
      );
    }
    lines.push("");
  }

  if (result.changedEntries.length) {
    lines.push("## Changed dates", "");
    for (const c of result.changedEntries) {
      lines.push(
        `- **${c.name}** (\`${c.uid}\`): \`${c.field}\` ${c.oldValue} → ${c.newValue}`,
        `  - source: ${c.sourceUrl}`
      );
    }
    lines.push("");
  }

  lines.push(`_${result.unchangedCount} entries matched with no change._`);

  if (!result.newEntries.length && !result.changedEntries.length) {
    lines.push("", "No changes detected. Nothing to review.");
  }

  return lines.join("\n");
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

  const result = diff(candidates, dataset);
  const report = toMarkdown(result);

  await writeFile("data/diff-report.md", report);
  console.log(report);

  // Exit code 1 when there's something to review — lets a GitHub Action
  // decide whether to open a PR/issue at all.
  if (result.newEntries.length || result.changedEntries.length) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
