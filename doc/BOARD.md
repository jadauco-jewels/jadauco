# Board — live state

The working tracker for epic **E-SYNC**. `STORIES.md` says *why*, `TASKS.md` says *what*,
this file says *where it actually is right now*.

- **Sprint scope:** sync epic + the minimum site foundation it needs. UI (Phase 2–4) deferred.
- **Building against:** local fixtures. No Google Sheet, Drive folder or API key exists yet.
- **Last updated:** 2026-08-14

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
| 7 | **T-43** — in the live sheet, replace the `Category (auto)` formula (the new one is in `doc/sheet/SHEET-SETUP.md` §4) and re-paste `tools/apps-script/Code.gs` | The repo cannot edit the sheet; until both are done the sheet still offers `TK` and `PY`, which the publish now rejects | S-7 |

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
| T-34 | **Adaptive photo mat** — `src/lib/mat.ts` samples each photo's border colour at build time and paints its frame that colour, so mixed-shape and dark-background photography sits in the grid without a seam | Built and screenshotted; `astro check` 0 errors, 44 tests pass |
| T-35 | **`Hero` column** — a second tick, separate from `Featured`, choosing the one piece at the top of the homepage. Warns rather than fails on a second tick; falls back to the newest photographed featured piece when nobody ticks one | 6 new tests; verified end to end by ticking Hero on a `featured: false` product and watching the homepage hero move |
| T-42 | **Portrait photos were being clipped** — `height: 100%` on an image inside an `aspect-ratio` frame resolves as indefinite, so a tall photo sized itself from its own ratio and overflowed the square. Fixed with `position: absolute; inset: 0` on the tile, shot and thumb images | Measured in a real browser at 430/820/1440px: every frame square, every image contained, none clipped |
| T-41 | **Sheet moved** — new catalogue sheet `12jVsctH…` (catalogue tab gid `1855666634`) and new Drive folder `1LXjqKty…`, both in `catalogue.config.json` | `npm run validate` clean against the new pair: 3 rows, 2 live, 1 draft |
| T-40 | **Apps Script validator** — *Jadauco → Check the catalogue*, merged into the single `tools/apps-script/Code.gs` that reddens the cells at fault and puts the reason in each cell's note. Plus an `instructions` tab explaining every column and who fills it in | 45 tests load the real `.gs` file and assert it is never more permissive than `schema.mjs` |
| T-39 | **`npm run validate`** — `scripts/sync/validate.mjs`, stages 1–3 and stop. Same validator, same messages, no downloads and no writes | Run against the live sheet: clean in seconds, where `--dry-run` takes minutes |
| T-43 | **Catalogue shape changed** — maang tikka and payal hidden, pendants added. A `hidden` flag on the category schema, honoured by `categories()` and by the sync's `loadCategories()`, so a hidden category leaves the site *and* stops being a code the sheet may use | 2 new tests + a drift guard tying `Code.gs` and the `Category (auto)` formula to the category files; build drops to 5 collection pages and the sitemap |
| T-38 | **`Sequence` column** — hand-set running order, blank means "no opinion" and sorts last. `newArrivals()` deliberately keeps date ordering | 4 new tests; verified by numbering the second product and watching it move to the front |
| T-37 | **`Category override` / `Slug override`** — renamed so they cannot be confused with the `Category (auto)` helper, plus a warning when a slug override is ignored because the address is already frozen | 51 tests pass, including a new one for the frozen-override warning |
| T-36 | **Sheet layout reorganised** — columns grouped, `Description` moved out of column D, two ignored `(auto)` helper columns showing the derived category and web address, `SHEET-SETUP.md` §4 rewritten with freeze/group/colour steps | Template re-validated through the real parser: 0 issues, 0 warnings, slugs unchanged |

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
| 2026-08-14 | **The image clipping was CSS, not photography.** A portrait photo in the grid had its bottom cut off — on the choker, both earrings. `object-fit: contain` cannot clip, so the box had to be wrong: measuring in a real browser gave a 226×226 frame holding a 224×**285** image. The frame takes its height from `aspect-ratio: 1`, and a percentage height resolved against an aspect-ratio-derived height is treated as indefinite, so `height: 100%` silently became `auto`; the image sized itself from its own ratio and `overflow: hidden` took the rest. Landscape photos fitted, which is exactly why it read as a photography problem. `position: absolute; inset: 0` gives a definite box. It predates the adaptive mat and was only visible once real photography arrived — the line-art stand-ins are all square. |
| 2026-08-14 | **The in-sheet check started as a formula and became Apps Script.** A `Check` column holding one 1,364-character formula came back from Sheets as `#ERROR!`, and there was no way to run Sheets locally to find out which construct it disliked. That was the smaller problem: the formula could never read the Drive folder, so the three mistakes that actually cost a publish — a filename not in Drive, one photo on two products, a photo nothing uses — were exactly the ones it could not catch. The script runs as the client, so it lists the folder and checks all three, marks the offending cells red and puts the reason in each cell's note. The parity discipline carried over and got better: instead of a hand-written Sheets evaluator, `scripts/sheet/validation.test.mjs` loads the **actual `.gs` file** into a vm and cross-checks it against `schema.mjs`, so what is tested is what gets pasted. The asserted property is one-directional — *the script must never be more permissive than the sync* — because a client told "every row is good" who then watches a publish fail has been actively misled. Shipped briefly as a second `.gs` file and merged back into one after the second file went in holding a copy of the first: Apps Script shares one namespace across files, so that both hid `checkCatalogue` and redefined every publish function. A test now asserts every menu item resolves to a function in the same file. |
| 2026-08-14 | **`Sequence` added, and it caught a trap in `newArrivals()`.** Every grid was newest-first with no way to pin anything. `Sequence` sorts lowest-first with blank as Infinity, so numbering three pieces pins those three and leaves the rest untouched. The number is global, not per-category — a category page contains one category, so `1,2,3` reads literally there, while on the all-jewellery page the same numbers interleave and float each category's best piece up. One column, correct in both places. The trap: `newArrivals()` was `listed().slice(0, limit)`, so changing the central sort would have silently made "new arrivals" mean "whatever the client numbered". It now sorts by date explicitly — nothing renders it yet, but the name is a promise. |
| 2026-08-14 | **`npm run validate` added** (T-39). `--dry-run` already changed nothing, but reached that answer by downloading and re-encoding every photo — minutes, on the keyless provider, to answer "is this row right?". The new script runs stages 1–3 and stops: same validator, same messages, seconds. |
| 2026-08-14 | **`Slug` was a silent no-op, and a test was lying about it.** `reconcile.mjs` resolves `locked?.slug ?? derived`, so once a product has published the lock always wins and the `Slug` column does nothing — but the `slugFrozen` report was only raised when there was *no* override, so setting one on a published product was ignored **and** unreported. The existing test "an explicit Slug column overrides the frozen one, silently" asserted this behaviour while passing an *empty* lock, so it never exercised the frozen case it was named after. Renamed the test, added one that does exercise it, and the sync now warns instead of ignoring in silence. The lock still wins — that freeze is what protects the ranking. |
| 2026-08-14 | **`Category` / `Slug` renamed to `Category override` / `Slug override`** (T-37). With a `Category (auto)` formula column now sitting beside the product code, two columns headed *Category* — one a formula, one an override — is how a client ends up typing into the wrong one. Coordinated change: `PRODUCT_COLUMNS`, error text, tests, template and the client CSV all moved together, because headers are matched by exact text and a stale sheet header goes silently unread. |
| 2026-08-14 | **`Featured` was doing two jobs.** It filled the homepage strip *and*, by being the first featured row with a photo, silently decided the piece at the top of the page — so there was no way to feature something without risking the hero, or to choose a hero that was not featured. Split into two ticks (T-35). Two doc bugs found while doing it and fixed: `SHEET-SETUP.md` listed only four of the six category codes (`TK` and `PY` were missing, so a valid code looked invalid), and the blank-cell conditional formatting covered `A2:D1000` while claiming to cover five required columns — it reached four of them, and `Status` was not counted at all. |
| 2026-08-14 | **The supplier photos contradict `brand-kit/GUIDELINES.md`.** The guidelines ask for cream or sand grounds and say to avoid black velvet; every photo the client has supplied is shot on black velvet, in mixed portrait and landscape. In a cream tile that read as a hole punched in the page, a different shape in every tile. Fixed in code by T-34 rather than by argument: each frame is painted the photo's own background colour, so the letterboxing is invisible and the grid is square again. A photo shot the way the guidelines ask for snaps back to cream and none of it applies. **Open question for the client:** amend the photography guideline to bless velvet, or keep it and reshoot as T-32? The site now looks right either way, so this is a brand call, not a blocker. |
| 2026-08-14 | **Maang tikka and payal hidden, pendants introduced** (T-43). Deleting the two category files was the obvious move and the wrong one: the copy and the SEO are written, and the client may stock them again. Instead a `hidden: true` flag, honoured in the one place `categories()` that every grid, the nav, the footer, the 404 page and `getStaticPaths` already go through — the same chokepoint argument as `listed()` and `archived`. The part worth recording is that hiding a category is **not** purely a front-end change: `loadCategories()` in the sync had to skip hidden ones too, otherwise `JD-TK-001` would still validate and publish a product whose category link 404s. Now it is rejected in the sheet with the list of codes that do exist. Three copies of the code table exist by necessity — the category files own it, `Code.gs` checks against it, and the `Category (auto)` formula shows it — so a test now asserts all three agree, because forgetting one is otherwise silent. **The live sheet still carries the old formula and the old script until the client updates both — item 7 under *Ready*.** |
| 2026-08-14 | **`orphans` became a setting, and the catalogue now runs on `delete`** (T-44). Two rows had their product codes rewritten in place — `JD-ER-001` Temple Lakshmi Jhumkas → `JD-PD-002` Temple Lakshmi Pendant, `JD-BG-001` CZ Stone Bangle Set → `JD-PD-001` CZ Stone Pendant — and S-8 stopped the run. The client's challenge was fair: the sheet is the source of truth, Google Sheets keeps its own version history, so why is the sync defending a repo that is only a build artifact? The honest answer is narrower than S-8 was written to imply — sheet history restores **rows**, not **rankings**, and the only thing S-8 ever protected was a URL already in Google's index. This catalogue is three days old and Search Console was verified today, so there is no index to protect and the safety net was costing more than it was worth. Hence a setting rather than an argument: `orphans: "stop" \| "delete"`, schema default `stop` so a fresh deployment is safe, `catalogue.config.json` set to `delete` for now. Deleting takes the folder, the lock entry and the image lock entries — leaving the frozen slug behind would mean re-typing the same code months later silently resurrecting the old URL and first-synced date. The report names every deletion, its dead URL and the way back, because the one thing worse than a deletion you meant is one you discover as a 404. Worth revisiting once the catalogue has been indexed a few months. |
