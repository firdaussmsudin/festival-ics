# festival-ics

Scrapes film festival dates, keeps them as a reviewable, git-tracked JSON
dataset, and publishes a subscribable `.ics` feed.

## How it fits together

```
data/festivals.json       <- canonical dataset (the "database")
data/festival.schema.json <- JSON Schema, validated in CI on every PR

src/scrape.ts   -> reads a source (Screendaily), writes data/candidates.json
src/diff.ts     -> compares candidates.json against festivals.json,
                   writes data/diff-report.md. Never edits festivals.json.
src/validate.ts -> validates festivals.json against the schema + extra
                   checks (duplicate uid, startDate > endDate)
src/generate-ics.ts -> reads festivals.json, writes dist/festivals.ics
```

Nothing writes to `data/festivals.json` automatically. The scrape workflow
only opens a GitHub issue with a diff report; a human turns that into an
actual edit/PR to `festivals.json`. This is deliberate — see the comments
in `src/diff.ts` and `.github/workflows/scrape.yml`.

## Local setup

```bash
npm install
npm run scrape      # -> data/candidates.json
npm run diff        # -> data/diff-report.md (exit code 1 if there's anything to review)
npm run validate    # checks data/festivals.json against the schema
npm run build:ics   # -> dist/festivals.ics
```

## Adding/editing a festival

Edit `data/festivals.json` directly and open a PR. `uid` should stay
stable across years except for the year in the prefix (e.g.
`cannes-2026@...` -> `cannes-2027@...` next edition) so calendar apps
update the event in place instead of duplicating it. `sourceUrl` is
required so reviewers can check the claim.

CI runs `npm run validate` on every PR that touches `data/festivals.json`.

## Publishing

`.github/workflows/deploy.yml` regenerates the `.ics` file and publishes
it via GitHub Pages whenever `data/festivals.json` changes on `main`.
Enable Pages in repo Settings (source: "GitHub Actions") and the feed
will be live at:

```
https://<you>.github.io/<repo>/festivals.ics
```

That's the URL people paste into "Subscribe from URL" in Google
Calendar / Apple Calendar / Outlook. Point a custom domain at it later
via Cloudflare if you want a nicer link.

## Known limitations (v1)

- `src/scrape.ts` parses Screendaily's page as prose with a regex — it
  will silently miss entries or need adjusting if they change their
  template. Treat scraper output as *suggestions*, never ground truth.
- Matching candidates to existing entries is by slugified name only; a
  festival that's renamed between scrapes will show up as "new" rather
  than "changed" until you notice and fix it manually.
- No timezone-aware event times — everything is treated as an all-day
  date range, which matches how festival dates are usually reported.
