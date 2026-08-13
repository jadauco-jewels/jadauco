# Board — live state

The working tracker for epic **E-SYNC**. `STORIES.md` says *why*, `TASKS.md` says *what*,
this file says *where it actually is right now*.

- **Sprint scope:** sync epic + the minimum site foundation it needs. UI (Phase 2–4) deferred.
- **Building against:** local fixtures. No Google Sheet, Drive folder or API key exists yet.
- **Last updated:** 2026-08-13

**Status legend** — `todo` · `doing` · `blocked` · `review` · `done`

---

## In flight

*(nothing — the sync epic is code-complete and verified against live data)*

## Ready — needs you, not code

| # | Task | Why it is yours | Story |
|---|---|---|---|
| 1 | Set `REPO` in `tools/apps-script/Code.gs` to the real `owner/repo` | Only you know the final repo name | S-1 |
| 2 | **T-29** — create the fine-grained PAT (**Contents: read and write**, this repo only), paste it into the sheet via *Jadauco → Set the GitHub token…* | Needs your GitHub account | S-1 |
| 3 | Paste `tools/apps-script/Code.gs` into the sheet's Apps Script, run `setUp` once, approve the scopes | Needs sheet ownership | S-1 |
| 4 | **T-02** — sheet data validation, per `doc/sheet/SHEET-SETUP.md` §3 | Ten minutes in Sheets | S-7 |
| 5 | **T-04** — Drive API key → `GOOGLE_API_KEY` secret | Turns the sync incremental; see below | S-11 |
| 6 | Push, then run *Actions → Sync catalogue* once to confirm the workflow end to end | First real CI run | S-1, S-13 |

> **On the API key.** Everything works without it today. What it buys is S-11: with a checksum
> the sync skips unchanged photos, and the run drops from "download all 15" to "download none".
> Wanted before the catalogue passes ~100 photos, not before the next commit.

## Blocked

| ID | Task | Blocked on | Who unblocks |
|---|---|---|---|
| T-02 | In-sheet data validation (dropdown, checkboxes, date picker, protected header) | Nothing — `doc/sheet/SHEET-SETUP.md` §3 has the steps | Client |
| T-04 | Google Cloud project → Drive API key → Actions secret | Open item 10. **No longer blocks the build** — it upgrades change detection from "download everything" to exact (§12.4.1) | Vikash |
| T-32 | Real photography to replace the line-art stand-ins | Client shoot | Client |
| T-33 | Lighthouse pass + a11y audit (Phase 4) | Wants a deployed URL to measure | — |
| T-23 | Load the real catalogue | T-21 | Client |
| T-24 | Full-catalogue verification, Lighthouse, repo size | T-23 | — |
| T-26 | Live walkthrough with Meera | T-25 | Client |

## Done

| ID | Task | Verified by |
|---|---|---|
| T-00 | Bootstrap — Astro 7.2.1, sharp 0.35, zod 4, csv-parse 7, Node 22 pinned via `.nvmrc`. 0 vulnerabilities | `npx astro sync` clean |
| T-06 | `content.config.ts` — four collections, `archived`, `syncedAt`, `specs`, `listPrice` | `astro sync` loads and validates all entries |
| T-06a | Seed content — settings, 4 categories, 3 pages, 3 sample products with real photos | as above |
| T-01 | Sheet created from `doc/sheet/products-template.csv` and shared link-readable | Live CSV fetch returns 3 rows |
| T-03 | Drive folder created and shared link-readable | Keyless listing returns 15 files |
| **T-05** | **Spike — passed, and better than hoped.** Sheet CSV, folder listing *and* download all work with **no credentials**. Findings in `PLAN.md` §12.4.1 | Run against the real sheet and folder, 13 Aug |
| T-09 | `catalogue.config.json` + validating loader, real IDs wired in | Loads clean |
| T-10 | `sheet.mjs` — headers matched by text, real trailing spaces trimmed, `Copy(2).JPG` preserved, 1-based row numbers | Parsed the live sheet: 3 rows, correct row numbers 2–4 |
| T-13 | `drive.mjs` — two providers, retry/backoff, duplicate-name guard, lock read/write | Listed 15 real files, downloaded a 1.4 MB PNG keyless |
| T-11 | `schema.mjs` — every S-7 check, 1-based row numbers, drafts exempt, near-miss filename detection | 44 tests; validated the live sheet clean |
| T-12 | `errors.mjs` — issues grouped by row, every one carrying a fix | Test asserts no issue may ship without a hint |
| T-14 | `images.mjs` — downscale to 1600px, mozjpeg q82, EXIF orientation baked in then stripped | 4.7 MB of PNGs → 316 KB of JPEG |
| T-15 | `reconcile.mjs` — orphans abort, slugs frozen, alt generated, per-provider change detection | S-8 fired on a real inconsistency; S-4 and S-11 unit-tested |
| T-16 | `write.mjs` — staged then flushed, `copy.md` never touched, unreferenced files pruned | Second run wrote zero files |
| T-17 | `report.mjs` — §12.6 summary, generated-alt and thin-description notes | Rendered against live data |
| T-18 | `index.mjs` — seven stages, `--dry-run`, `$GITHUB_OUTPUT` sanitised against sheet-sourced injection | Dry run wrote nothing; real run wrote 5 files |
| T-19 | 44 tests, no network — every S-7 error triggered and its *message* asserted | `npm test` 44/44 |
| T-20/21/22 | `sync-catalogue.yml` — three triggers, queued concurrency, SKU-named commit that skips a clean tree, PR mode | Reviewed; unrun until first push |
| T-27/28 | `tools/apps-script/Code.gs` — publish menu, debounced auto-publish, token prompt | Reviewed; unrun until installed |
| T-25 | `CONTRIBUTING-FOR-CLIENT.md` | Written; screenshots pending T-26 |
| **UI pass** | **Phase 2–4 built from the mockups** — tokens, layout, homepage, grid, category, product detail, static pages, 404 | `astro check` 0 errors, 17 pages, screenshots on desktop and mobile |
| T-07 | `products.ts` — `listed()` excludes archived, and every grid, filter, related strip and count goes through it | Detail route deliberately bypasses it, so S-6 holds |
| T-08 | Product page's three states: in stock, sold out, archived — CTA suppressed, JSON-LD `availability` switched | Rendered and verified |
| T-30 | `tokens.css` from `brand-kit/brand.css`, three woff2 faces self-hosted | No literal hex outside tokens.css |
| T-31 | `deploy.yml` replaces `preview.yml` — builds, runs `astro check`, deploys to Pages | Reviewed; unrun until first push |

---

## Log

| Date | Entry |
|---|---|
| 2026-08-13 | Board opened. Scope agreed: sync epic + minimal foundation, built against fixtures. |
| 2026-08-13 | **Data model revised** to the client's real columns. Category now derives from the product code; the `images` tab collapses into an `Images` column with generated alt text; `mrp` → `List Price`, discount computed not stored. `PLAN.md` §5.1–5.2.1 rewritten, CSV templates and `SHEET-SETUP.md` shipped. |
| 2026-08-13 | Client supplied the real sheet and Drive folder. **Fixtures abandoned — building against live data.** |
| 2026-08-13 | **T-05 spike passed with no credentials.** `files.list` 403s unauthenticated, but `embeddedfolderview` lists a link-shared folder and `drive.usercontent.google.com` downloads from it. No checksum in that path, so `drive.mjs` carries two providers. The service-account fallback in `TASKS.md` is dead. |
| 2026-08-13 | Auto-publish designed: Apps Script menu item + debounced `onEdit` → `repository_dispatch`, so the client never opens GitHub. Added as T-27…T-29. |
| 2026-08-13 | **Sync epic code-complete.** Ran end to end against the live sheet and folder: 2 products written, 3 photos downloaded and processed, second run wrote nothing. 44 tests pass. What is left is account work, listed under *Ready* — no code blocks it. |
| 2026-08-13 | **UI pass built from `doc/mockups`.** Six categories (maang-tikka and payal were in the mockup but not on disk), zero-JS header menu and product gallery, full JSON-LD, generated `robots.txt`, and the terms/privacy/disclaimer pages the footer had been linking into nothing. `deploy.yml` replaces `preview.yml`, so jadauco.com will serve the real site rather than the mockups on the next push. |
| 2026-08-13 | **Deviation from S-7, recorded deliberately.** "A Drive image that no row references" is a **warning**, not an error. The real folder has 11 such files against 4 in use — as an error it would block every publish over photos uploaded ahead of their rows. It is still reported every run. Say the word and it becomes fatal, or config-driven. |
