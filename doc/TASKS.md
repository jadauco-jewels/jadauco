# Catalogue sync — implementation tasks

Work breakdown for epic **E-SYNC** (`STORIES.md`). Phase 4.5 in `PLAN.md` §14.

- **Status:** not started
- **Last updated:** 2026-08-13
- **Sizes:** S ≈ half a day · M ≈ 1–2 days · L ≈ 3+ days

**Order of play.** T-01…T-04 are setup and can start immediately — they are the client's
dependencies and the riskiest unknowns. T-10…T-19 are the build. T-20…T-24 are handover.
T-05 (the spike) gates everything: do not build against an API that has not been proven from a
runner.

---

## A. Setup and access

| ID | Task | Size | Depends on | Serves |
|---|---|---|---|---|
| **T-01** | Create the Google Sheet on a **client-owned** account. Two tabs: `products`, `images`, with the columns in `PLAN.md` §5.1–5.2. | S | Open item 9 | S-1 |
| **T-02** | Add in-sheet data validation: dropdown for `category` (fed from a hidden `lists` tab) and `status`, checkboxes for `inStock`/`featured`, date picker for `publishDate`, conditional formatting flagging blank required cells. | S | T-01 | S-7 |
| **T-03** | Create the Drive folder, share **Anyone with the link → Viewer**, confirm with the client that public readability is understood and acceptable. | S | Open item 11 | S-1 |
| **T-04** | Google Cloud project → enable Drive API → create an API key → restrict it to the Drive API → store as the `GOOGLE_API_KEY` Actions secret. Document the rotation steps. | S | — | S-1 |
| **T-05** | **Spike (timeboxed, 1 day).** From a throwaway GitHub Actions runner, prove: (a) both tabs fetch as CSV without auth, (b) the Drive folder lists via `files.list` with the API key returning `id, name, md5Checksum, modifiedTime`, (c) a binary downloads via `files/<id>?alt=media`, (d) behaviour past 100 files (pagination) and on a file with no `md5Checksum`. Write the findings into `PLAN.md` §12.4. | M | T-03, T-04 | all |

> **If T-05 fails**, the fallback is a service account with the folder shared to its email —
> more setup, no public exposure. Decide before writing any sync code.

---

## B. Foundations in the site

| ID | Task | Size | Depends on | Serves |
|---|---|---|---|---|
| **T-06** | Extend `src/content.config.ts`: add `archived: boolean`, `syncedAt: datetime`, keep `alt` required. Regenerate the sample products to match. | S | Phase 1 | S-6 |
| **T-07** | Update `src/lib/products.ts` query helpers so grids, filters, related products, RSS and "featured" all exclude `archived`, while the detail route still renders it. | S | T-06 | S-6 |
| **T-08** | Product page: "no longer available" state for archived items — CTA suppressed, JSON-LD `availability` set, copy taken from `settings.md` labels. | S | T-07 | S-6 |
| **T-09** | `catalogue.config.json` + a loader that validates it on startup, so a malformed config fails immediately with a readable message rather than mid-run. | S | — | S-14 |

---

## C. The sync script

Built as separate modules under `scripts/sync/` so each is unit-testable without network access.

| ID | Task | Size | Depends on | Serves |
|---|---|---|---|---|
| **T-10** | `sheet.mjs` — fetch both tabs as CSV, parse to rows, trim whitespace, coerce Sheets booleans (`TRUE`/`FALSE`), split comma lists. Handle a sheet that returns an HTML sign-in page instead of CSV (the classic "not shared publicly" failure) with a specific error. | M | T-05 | S-1, S-7 |
| **T-11** | `schema.mjs` — Zod schema per tab plus cross-row checks: unique SKU, unique slug, category exists on disk, `mrp > price`, description word count, every `images.sku` resolves to a product row. Errors carry a 1-based sheet row number. | M | T-10, T-09 | S-7 |
| **T-12** | Error formatter — turns Zod issues into the sentences in S-7. This is a writing task as much as a coding one; each message names the row, the SKU, the offending value and the fix. | S | T-11 | S-7 |
| **T-13** | `drive.mjs` — paginated `files.list`, filename → `{id, md5Checksum, size}` map, download with 3 retries and exponential backoff, read/write `catalogue.lock.json`. | M | T-05 | S-11 |
| **T-14** | `images.mjs` — sharp: downscale to `maxEdge`, re-encode at `quality`, strip EXIF. Reject non-decodable files with a clear message naming the Drive filename. | S | T-13 | S-11 |
| **T-15** | Reconcile — diff sheet rows against the repo and lock file into `added / updated / unchanged / drafts / archived / orphaned`. Orphans (in repo, not in sheet) abort the run per S-8. | M | T-11, T-13 | S-8, S-11 |
| **T-16** | `write.mjs` — emit `index.md` with the DO-NOT-EDIT header, resolve `copy.md` overrides, prune image files no longer referenced, write the lock file. All writes staged and flushed only after every stage has succeeded. | M | T-15 | S-1, S-10 |
| **T-17** | `report.mjs` — the §12.6 summary to stdout and `$GITHUB_STEP_SUMMARY`, including the auto-generated-alt and short-description warnings. | S | T-15 | S-7, S-9 |
| **T-18** | `index.mjs` — orchestrate the seven stages, support `--dry-run`, exit non-zero on validation failure, never leave a partial write. | M | T-10…T-17 | S-9, S-14 |
| **T-19** | Tests: fixture CSVs and a mocked Drive listing covering every error in S-7, plus the no-change case asserting zero writes. | M | T-18 | S-7, S-11 |

---

## D. Automation

| ID | Task | Size | Depends on | Serves |
|---|---|---|---|---|
| **T-20** | `.github/workflows/sync-catalogue.yml` — `workflow_dispatch` with a `dry_run` input, daily cron at 02:30 UTC, Node setup, npm cache, run the sync, publish the summary. | S | T-18 | S-1, S-13 |
| **T-21** | Commit and push step: skip cleanly when the tree is unchanged, write a message naming the SKUs, and support `pullRequest: true` as an alternative path. Confirm the push triggers `deploy.yml`. | S | T-20 | S-1, S-2 |
| **T-22** | Concurrency guard so two runs (button + cron) cannot race, and a run started while a deploy is in flight queues rather than conflicts. | S | T-21 | S-13 |

---

## E. Load and handover

| ID | Task | Size | Depends on | Serves |
|---|---|---|---|---|
| **T-23** | Load the real catalogue: client fills the sheet and uploads photos, then run and fix until the sync is green. Expect this to surface data problems no test caught. | L | T-21 | all |
| **T-24** | Full-catalogue verification: site builds clean, Lighthouse 95+ on a synced product page, repo size checked against the S-11 budget, sitemap and JSON-LD spot-checked. | M | T-23 | S-11 |
| **T-25** | `CONTRIBUTING-FOR-CLIENT.md` — plain language, screenshots of the sheet, the Drive folder, the Run workflow button, and the three most likely error messages with their fixes. | M | T-23 | S-7 |
| **T-26** | Live walkthrough: Meera adds one product unaided, start to finish, while Vikash stays silent. Anything she hesitates over is a bug in T-25 or T-12, not in her. | S | T-25 | Epic DoD |

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Drive API listing does not work with a plain API key on a link-shared folder | Blocks the whole design | T-05 spike, before any build work. Service-account fallback documented |
| Client renames files in Drive | Images vanish from pages | Filename rules in T-25; the sync reports orphaned Drive files rather than silently ignoring them |
| Sheet columns get reordered or renamed by the client | Sync fails | Parse by header name, never by position (T-10). Protect the header row in Sheets (T-02) |
| Repo grows past comfortable git limits | Slow clones, Actions timeouts | Downscale at sync time (T-14); measure in T-24; Git LFS if the catalogue passes ~1000 products |
| Google changes the public CSV export endpoint | Sync breaks with no warning | Daily cron surfaces it within 24h; the Sheets API with the same key is the documented fallback |
| Descriptions from a spreadsheet are short and thin | The SEO strategy in §10.4 underperforms | `minDescriptionWords` gate (T-11), warnings in the report (T-17), `copy.md` for hero products (T-16) |
