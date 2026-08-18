import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createEvents, type EventAttributes } from "ics";
import { countries, continents } from "countries-list";
import type { FestivalDataset, FestivalEntry } from "./types.js";

type Continent =
  | "africa"
  | "asia"
  | "europe"
  | "north-america"
  | "south-america"
  | "oceania";

const CONTINENT_FILES: Record<string, Continent> = {
  Africa: "africa",
  Asia: "asia",
  Europe: "europe",
  "North America": "north-america",
  "South America": "south-america",
  Oceania: "oceania",
};

// Build the country-name lookup once instead of searching the
// countries list for every festival.
const countriesByName = new Map(
  Object.values(countries).map((country) => [country.name, country]),
);

function toDateArray(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);

  return [y, m, d];
}

function toEvent(entry: FestivalEntry): EventAttributes {
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
  };
}

function getContinent(countryName: string): Continent | undefined {
  const country = countriesByName.get(countryName);

  if (!country) {
    return undefined;
  }

  const continentName = continents[country.continent];

  return CONTINENT_FILES[continentName];
}

async function writeCalendar(filename: string, entries: FestivalEntry[]) {
  const events = entries.map(toEvent);

  const { error, value } = createEvents(events);

  if (error) {
    throw error;
  }

  await writeFile(`dist/${filename}`, value ?? "", "utf-8");

  console.log(`Wrote dist/${filename} with ${events.length} events.`);
}

async function main() {
  const raw = await readFile("data/festivals.json", "utf-8");

  const dataset = JSON.parse(raw) as FestivalDataset;

  await mkdir("dist", { recursive: true });

  /*
   * Generate the complete festival calendar.
   *
   * dist/festivals.ics
   */
  await writeCalendar("festivals.ics", dataset.festivals);

  /*
   * Group festivals by continent.
   */
  const continentEvents = new Map<Continent, FestivalEntry[]>();

  for (const entry of dataset.festivals) {
    const continent = getContinent(entry.country);

    if (!continent) {
      console.warn(
        `Could not determine continent for "${entry.name}" (${entry.country})`,
      );

      continue;
    }

    const events = continentEvents.get(continent) ?? [];

    events.push(entry);

    continentEvents.set(continent, events);
  }

  /*
   * Generate one calendar for each continent.
   *
   * dist/africa.ics
   * dist/asia.ics
   * dist/europe.ics
   * dist/north-america.ics
   * dist/south-america.ics
   * dist/oceania.ics
   */
  for (const continent of Object.values(CONTINENT_FILES)) {
    await writeCalendar(
      `${continent}.ics`,
      continentEvents.get(continent) ?? [],
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
