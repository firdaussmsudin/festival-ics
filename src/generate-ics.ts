import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createEvents, type EventAttributes } from "ics";
import type { FestivalDataset, FestivalEntry } from "./types.js";

function toDateArray(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m, d];
}

function toEvent(entry: FestivalEntry): EventAttributes {
  // ics wants end date exclusive-of-time as an all-day event's day AFTER
  // the last day when using date-only arrays with no end time — but the
  // `ics` package's own convention is end date = last full day, inclusive,
  // when both start/end omit time. We rely on that documented behavior.
  const title =
    entry.status === "cancelled"
      ? `[CANCELLED] ${entry.name}`
      : entry.status === "rescheduled"
      ? `[RESCHEDULED] ${entry.name}`
      : entry.name;

  return {
    uid: entry.uid,
    title,
    start: toDateArray(entry.startDate),
    end: toDateArray(entry.endDate),
    startInputType: "local",
    location: [entry.city, entry.country].filter(Boolean).join(", "),
    url: entry.website,
    description: [
      entry.category,
      entry.notes,
      entry.website ? `Website: ${entry.website}` : undefined,
      `Source: ${entry.sourceUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    status:
      entry.status === "cancelled"
        ? "CANCELLED"
        : entry.status === "tentative"
        ? "TENTATIVE"
        : "CONFIRMED",
    // All-day events: omit explicit UTC/timezone handling entirely and
    // let calendar apps treat this as a whole-day block rather than
    // dealing with per-timezone start/end times.
  };
}

async function main() {
  const raw = await readFile("data/festivals.json", "utf-8");
  const dataset = JSON.parse(raw) as FestivalDataset;

  const events = dataset.festivals.map(toEvent);
  const { error, value } = createEvents(events);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  await mkdir("dist", { recursive: true });
  await writeFile("dist/festivals.ics", value ?? "");
  console.log(`Wrote dist/festivals.ics with ${events.length} events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
