# Catalogue sync — user stories

Sheet + Drive → git → live site. Companion to `PLAN.md` §5 and §12.

- **Epic:** E-SYNC — the client runs the catalogue from a spreadsheet
- **Phase:** 4.5
- **Last updated:** 2026-08-13

**Personas**

| | Who | Cares about |
|---|---|---|
| **Meera** | the shop owner, non-technical | Getting a new piece online today, without asking anyone |
| **Vikash** | maintainer | The site never breaks, and he is not the bottleneck |
| **Buyer** | visitor from Google or Instagram | Fast pages, real photos, a price, a WhatsApp button |

---

## S-1 — Put a new product online without touching git

**As** Meera
**I want** to add a row to my sheet and drop photos in a Drive folder
**So that** the piece is on the website without me opening GitHub or writing markdown

**Acceptance criteria**
- Given a Drive folder containing `JD-NK-021-1.jpg` and `JD-NK-021-2.jpg`, and a `products` row with SKU `JD-NK-021` and `status: live`, and matching `images` rows
- When Meera presses **Run workflow**
- Then within ~5 minutes `https://jadauco.com/products/<slug>/` returns 200, shows both photos, the title, the price and a working WhatsApp button
- And the product appears in its category grid and in `sitemap.xml`
- And the commit that created it names the SKU in its message

---

## S-2 — Change many prices at once

**As** Meera
**I want** to edit the price column for 40 products and publish in one go
**So that** a festival price revision takes minutes, not an evening

**Acceptance criteria**
- Given 40 rows have their `price` changed
- When the sync runs
- Then exactly 40 `index.md` files change, no images are re-downloaded, and no other product is touched
- And the run summary lists each SKU with its old → new price
- And the `Product` JSON-LD `offers.price` on each page matches the new value

---

## S-3 — Mark a piece sold out

**As** Meera
**I want** to untick a checkbox
**So that** buyers stop enquiring about something I cannot supply

**Acceptance criteria**
- Given `inStock` is unticked for `JD-RG-002`
- When the sync runs
- Then the product page still exists at its URL, shows the `soldOut` label, and hides the enquiry CTA
- And its JSON-LD `availability` is `OutOfStock`
- And it is excluded from "featured" and "new arrivals" but remains in its category grid

---

## S-4 — Replace the photos on an existing product

**As** Meera
**I want** to overwrite a photo in Drive with a better shot, keeping the filename
**So that** the product page improves without me re-entering anything

**Acceptance criteria**
- Given `JD-NK-014-1.jpg` in Drive is replaced with different content under the same name
- When the sync runs
- Then the new image is downloaded, processed and committed, and `catalogue.lock.json` records the new checksum
- And the product's other images are not re-downloaded
- And the alt text from the `images` tab is preserved

**Note** — renaming a file in Drive is *not* the same as replacing it: the sync sees a deletion
plus an addition, and the `images` tab must be updated to match.

---

## S-5 — Work on a product before showing it

**As** Meera
**I want** to fill in a row while I still lack good photos or a description
**So that** my drafts live in the same place as everything else without leaking to the site

**Acceptance criteria**
- Given a row with `status: draft`
- When the sync runs
- Then no folder, page, sitemap entry or grid tile is generated for it
- And its row is **not** validated for `description` length or image references — a draft may be incomplete
- And the run summary counts it under "drafts skipped"

---

## S-6 — Discontinue a product without losing its Google ranking

**As** Vikash
**I want** discontinued pieces to keep their URLs
**So that** years of accumulated search value and inbound links are not thrown away

**Acceptance criteria**
- Given `JD-NK-003` is changed to `status: archived`
- When the sync runs
- Then its page still returns 200, shows an "no longer available" state, and hides the enquiry CTA
- And it disappears from every grid, filter, related-products list and RSS feed
- And it stays in `sitemap.xml`
- And it is never deleted from the repo by the sync

---

## S-7 — Be told exactly what is wrong, in my own words

**As** Meera
**I want** an error that names the row and the fix
**So that** I can correct it myself instead of messaging Vikash

**Acceptance criteria**
- Given row 14 has `category: neclaces`
- When the sync runs
- Then it fails before writing anything
- And the summary reads like `Row 14 (JD-ER-009): category "neclaces" is not one of necklaces, earrings, bangles, rings`
- And GitHub emails Meera that the run failed
- And the live site is completely unchanged

**Errors that must be caught this way:** unknown category, duplicate SKU, duplicate slug, bad
SKU format, bad date, price that is not a number, `mrp` ≤ `price`, description under the
minimum word count, an `images` row pointing at a filename that is not in Drive, a Drive image
that no row references.

---

## S-8 — Survive an accidental row deletion

**As** Vikash
**I want** a vanished sheet row to stop the sync rather than delete a page
**So that** one mis-click in a spreadsheet cannot 404 an indexed URL

**Acceptance criteria**
- Given `JD-NK-014` exists in `src/content/products/` but has no row in the sheet
- When the sync runs
- Then it fails with `JD-NK-014 is in the repo but not in the sheet. To delist it, set status to archived. To remove it permanently, delete the folder in git.`
- And nothing is written

---

## S-9 — Check before publishing

**As** Meera
**I want** to validate my sheet without changing the site
**So that** I can fix problems before I commit to a release

**Acceptance criteria**
- Given the workflow is run with `dry_run: true`
- When it completes
- Then the full summary is produced — adds, updates, warnings, errors
- And no file is written, no commit is made, no deploy is triggered
- And the exit code still reflects whether validation passed

---

## S-10 — Write premium copy for a hero product

**As** Vikash
**I want** to hand-write long-form SEO copy for the products worth ranking
**So that** the flagship pages beat competitors, while the long tail stays in the sheet

**Acceptance criteria**
- Given `src/content/products/<slug>/copy.md` exists
- When the sync runs
- Then that file's contents become the page body and the sheet's `description` is ignored for this product
- And the sync never writes to, moves or deletes `copy.md`
- And the run summary notes which products are using an override

---

## S-11 — Keep the sync fast and the repo small

**As** Vikash
**I want** unchanged images left alone
**So that** a daily sync of 200 products is cheap and git history does not balloon

**Acceptance criteria**
- Given nothing has changed since the last run
- When the sync runs
- Then zero images are downloaded, zero files change, and no commit is created
- And the run finishes in under 90 seconds
- And a first-time sync of 200 products × 3 photos produces under ~150 MB of committed images

---

## S-12 — Keep site copy in git

**As** Vikash
**I want** category copy, About, Care Guide and settings to stay in markdown
**So that** the writing that ranks is version-controlled, reviewable and outside a spreadsheet

**Acceptance criteria**
- Given the sync runs
- Then no file under `categories/`, `pages/` or `site/` is read, written or deleted
- And a category referenced by the sheet but missing from `categories/` is a validation error, not an auto-created stub

---

## S-13 — Catch edits nobody published

**As** Vikash
**I want** a scheduled run once a day
**So that** a sheet edit made without pressing the button still reaches the site

**Acceptance criteria**
- Given the schedule fires at 08:00 IST
- When there are pending changes, they are published exactly as a manual run would publish them
- And when there are none, the run finishes green with no commit
- And a failure emails Vikash, not only Meera

---

## S-14 — Develop and debug the sync locally

**As** Vikash
**I want** `npm run sync` to do exactly what the Action does
**So that** I can fix problems without pushing commits to find out

**Acceptance criteria**
- Given a local `.env` with `GOOGLE_API_KEY`
- When `npm run sync -- --dry-run` is run
- Then it produces the same validation output as the Action, against the same live sheet
- And `npm run sync` writes the same files the Action would, leaving the commit to the developer

---

## Epic definition of done

- [ ] Meera adds a product end-to-end, unaided, while Vikash watches and says nothing
- [ ] Every error in S-7 has been triggered deliberately and produces a message Meera understands
- [ ] A full 200-product sync completes and the site builds clean afterwards
- [ ] Lighthouse on a synced product page still scores 95+ across the board
- [ ] `CONTRIBUTING-FOR-CLIENT.md` exists, with screenshots, and Meera has followed it once
- [ ] The sheet, the Drive folder and the API key are owned by accounts the client keeps
