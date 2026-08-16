export type FestivalCategory =
  | "festival"
  | "market"
  | "festival-and-market"
  | "awards-ceremony";

export type FestivalStatus =
  | "confirmed"
  | "tentative"
  | "cancelled"
  | "rescheduled";

export interface FestivalEntry {
  uid: string;
  name: string;
  country: string;
  city?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  timezone?: string;
  category: FestivalCategory;
  status: FestivalStatus;
  website?: string;
  sourceUrl: string;
  notes?: string;
}

export interface FestivalDataset {
  festivals: FestivalEntry[];
}

/**
 * A candidate is what the scraper produces before anything touches the
 * canonical dataset. It deliberately omits fields the scraper can't infer
 * confidently (uid, timezone, category) — promote.ts fills those in with
 * defaults when a candidate becomes a new entry.
 */
export interface CandidateEntry {
  name: string;
  country?: string;
  startDate: string;
  endDate: string;
  sourceUrl: string;
  website?: string; // href found on the name, if any — may point to
  // Screendaily's own tag page rather than the
  // festival's official site; spot-check before trusting
  rawText: string; // the original line, kept for review
}
