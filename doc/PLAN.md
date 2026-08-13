# jadauco.com — Build Plan

Static imitation-jewellery catalogue website.
Product data lives in a Google Sheet, product photos in a Google Drive folder, everything
else in markdown. Nothing hardcoded. Built for search visibility.

- **Status:** Plan agreed, implementation not started
- **Last updated:** 2026-08-13

---

## 1. Goals

1. A fast, beautiful online catalogue of imitation jewellery.
2. The client (non-technical) adds products by dropping photos into a **Google Drive folder** and filling a row in a **Google Sheet**, then pressing one button — nothing else.
3. Buyers enquire via **WhatsApp / phone**. No cart, no payments, no backend.
4. The site **ranks on Google** for imitation jewellery searches and shows rich product results.
5. Hosted free on **GitHub Pages** at the custom domain `jadauco.com`.

### Non-goals (explicitly out of scope for v1)
- Online payments / checkout
- User accounts, wishlists, reviews
- Inventory sync with any external system
- Multi-language site

---

## 2. Agreed decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Astro** (static output) | Zero JS by default, markdown-native content collections, built-in image optimisation, fully customisable |
| Product data | **Public Google Sheet** | The client already lives in spreadsheets. Bulk edits, sorting and price changes are trivial there and painful in markdown |
| Product photos | **Public Google Drive folder** | Drag-and-drop from a phone, no git, no GitHub UI |
| Site copy | **Markdown files in git** | Category copy, About, Care Guide, settings and labels are written once and version-controlled |
| Sync | **GitHub Action** — manual "Run workflow" button + daily schedule | Client presses one button; no webhooks, no server, no polling infrastructure |
| Generated files | **Committed to git** | Sheet and Drive are the input; git stays the audit log, the undo button, and the thing that builds |
| Hardcoding | **None** | Every visitor-facing string, number, colour and link is data |
| Buyer action | **Enquiry only** — WhatsApp deep link + click-to-call | Standard for imitation jewellery resellers |
| SKU | Sheet column, shown on page, injected into WhatsApp message | Client takes orders over chat by code |
| Price | **Optional** per product; falls back to "Price on enquiry" label | Client decides per item, no code change |
| Hosting | GitHub Pages + GitHub Actions | Free, zero ops, custom domain, auto HTTPS |
| Brand assets | Placeholder tokens until logo/hex codes are supplied | Swappable in one file |

### Frameworks considered and rejected

| Framework | Why not |
|---|---|
| **Hugo** | Fastest builds, but templating is awkward to customise and image processing is clunkier. Build speed is irrelevant at ~200 products. |
| **Eleventy** | Good and lightweight, but the image pipeline and schema validation would be hand-rolled — Astro gives both free. |
| **Next.js** (static export) | Ships a React runtime to every visitor for a site with almost no interactivity. Wrong tool, worse Core Web Vitals. |
| **Jekyll** | GitHub-native but Ruby toolchain, no image optimisation, dated DX. |
| **Plain HTML** | No markdown database, no image pipeline, every new product is manual HTML editing. Fails goal 2. |

### Content sources considered and rejected

| Source | Why not |
|---|---|
| **Markdown only** (the original plan) | Editing YAML frontmatter in the GitHub web UI is genuinely hard for a non-technical person — indentation errors, no undo, no bulk price change. Kept for site copy, dropped for product rows. |
| **Decap / Tina / Sveltia CMS** | A real admin UI, but needs OAuth, a backend proxy or a paid tier, and is one more thing to maintain and explain. Overkill for one editor. |
| **Airtable / Notion** | Better data model than Sheets, but the free tiers throttle API access and the client would have to learn a new tool. |
| **Hotlinking Drive images at runtime** | Drive is slow, uncacheable, rate-limited and can break links without warning. It also bypasses `astro:assets`, so no AVIF/WebP, no `srcset` — a direct hit to Core Web Vitals and goal 4. Images are downloaded and committed instead. |

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Framework | Astro (latest v5+), `output: 'static'` |
| Content | Astro Content Collections + `glob()` loader over `.md` |
| Validation | Zod schema per collection (build fails on bad data) |
| Images | `astro:assets` (Sharp) — AVIF/WebP, responsive `srcset`, lazy loading |
| Styling | Scoped CSS in `.astro` + CSS custom properties in `tokens.css`. Tailwind optional, not required |
| Sitemap | `@astrojs/sitemap` |
| Structured data | Hand-built JSON-LD components (Product, Organization, Breadcrumb, ItemList) |
| Interactivity | Vanilla JS islands only where needed (lightbox, filter, mobile nav) |
| CI/CD | GitHub Actions → GitHub Pages |
| Analytics | Configurable ID in settings; off by default |

---

## 4. Repository structure

```
jadauco.com/
├─ doc/
│  ├─ PLAN.md                        # this file
│  ├─ STORIES.md                     # catalogue sync — user stories
│  └─ TASKS.md                       # catalogue sync — implementation tasks
├─ catalogue.config.json             # sheet ID, Drive folder ID, sync rules — NOT secret
├─ catalogue.lock.json               # generated: Drive fileId + checksum per synced image
├─ public/
│  ├─ CNAME                          # jadauco.com
│  ├─ robots.txt                     # generated at build, see §10
│  ├─ favicon.svg
│  └─ brand/                         # logo files, once supplied
├─ scripts/
│  └─ sync/
│     ├─ index.mjs                   # entry point: fetch → validate → write → report
│     ├─ sheet.mjs                   # CSV fetch + parse, products tab + optional images tab
│     ├─ drive.mjs                   # folder listing, download, checksum cache
│     ├─ schema.mjs                  # Zod schema for the SHEET rows (distinct from content schema)
│     ├─ images.mjs                  # downscale, re-encode, strip EXIF
│     ├─ write.mjs                   # emit index.md, honour copy.md overrides
│     └─ report.mjs                  # human-readable summary → GITHUB_STEP_SUMMARY
├─ src/
│  ├─ content.config.ts              # collections + Zod schemas — the "database schema"
│  ├─ content/
│  │  ├─ site/
│  │  │  └─ settings.md              # global config: brand, contact, nav, labels, SEO defaults
│  │  ├─ categories/
│  │  │  ├─ necklaces.md
│  │  │  ├─ earrings.md
│  │  │  └─ ...
│  │  ├─ products/                   # ENTIRELY GENERATED by the sync — do not hand-edit
│  │  │  ├─ kundan-bridal-choker-set/
│  │  │  │  ├─ index.md              # generated from the sheet row
│  │  │  │  ├─ copy.md               # OPTIONAL, hand-written, git-owned: overrides the body
│  │  │  │  ├─ JD-NK-014-1.jpg       # downloaded from Drive, downscaled, committed
│  │  │  │  └─ JD-NK-014-2.jpg
│  │  │  └─ ...
│  │  └─ pages/
│  │     ├─ about.md
│  │     ├─ care-guide.md
│  │     └─ shipping-returns.md
│  ├─ components/
│  │  ├─ ProductCard.astro
│  │  ├─ ProductGallery.astro
│  │  ├─ EnquiryButton.astro
│  │  ├─ Breadcrumbs.astro
│  │  ├─ SEO.astro                   # all meta tags, one place
│  │  └─ jsonld/
│  │     ├─ ProductLd.astro
│  │     ├─ OrganizationLd.astro
│  │     └─ BreadcrumbLd.astro
│  ├─ layouts/
│  │  ├─ BaseLayout.astro
│  │  └─ ProductLayout.astro
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ products/index.astro
│  │  ├─ products/[...slug].astro
│  │  ├─ collections/[category].astro
│  │  ├─ [page].astro                # about, care-guide, shipping — from pages collection
│  │  ├─ 404.astro
│  │  └─ rss.xml.js                  # optional, new-arrivals feed
│  ├─ lib/
│  │  ├─ products.ts                 # query helpers: byCategory, featured, related, inStock
│  │  ├─ whatsapp.ts                 # builds deep link from the settings template
│  │  └─ seo.ts                      # title/description/canonical resolution
│  └─ styles/
│     ├─ tokens.css                  # brand colours, fonts, spacing, radii — SWAP HERE
│     └─ global.css
├─ .github/workflows/
│  ├─ deploy.yml                     # build + deploy to Pages
│  └─ sync-catalogue.yml             # the button the client presses, see §12
├─ astro.config.mjs
└─ package.json
```

**Decision — product folders, not flat files.** Each product is a folder containing `index.md` plus its own photos. This keeps a product and its images together (delete the folder = product fully gone), lets image paths stay relative (`./JD-NK-014-1.jpg`), and gives the sync a single unit to create, update or leave alone.

**Decision — `photos/` is gone.** Drive replaces it. There is no staging directory in the repo any more.

---

## 5. The data model

### 5.0 Who owns what

The single most important rule in this build. Every field has exactly one owner, and the
other side never writes to it.

| Data | Owner | Edited in | Notes |
|---|---|---|---|
| Product rows (code, name, price, specs, stock, tags…) | **Google Sheet**, tab `products` | Sheets | One row per product — the only tab the client touches |
| Image filenames | **Google Sheet**, `Images` column | Sheets | Comma-separated, in display order |
| Product photos | **Google Drive folder** | Drive | Flat folder, unique filenames |
| Alt text | **Generated by the sync** | — | From name, stones, finish and category. Overridable per image via the optional `images` tab (§5.2) |
| Product long description | **Sheet** `description` column | Sheets | Overridden by `copy.md` when that file exists |
| Hand-written product copy (optional) | **git** — `products/<slug>/copy.md` | Editor / GitHub | Escape hatch for hero products that deserve real SEO copy |
| Category names, order and copy | **git** — `categories/*.md` | Editor / GitHub | Written once, rarely changes |
| About / Care Guide / Shipping | **git** — `pages/*.md` | Editor / GitHub | |
| Brand, contact, labels, nav, SEO defaults | **git** — `site/settings.md` | Editor / GitHub | |
| Sheet ID, Drive folder ID, sync rules | **git** — `catalogue.config.json` | Editor | Not secret; the sheet is public anyway |

> **Rule: `src/content/products/` is generated output.** Anything hand-typed into an
> `index.md` there is destroyed on the next sync. The one exception is `copy.md`, which the
> sync reads and never writes. Every generated file carries a header comment saying so.

### 5.1 The `products` sheet tab

Headers are the client's own words, not developer field names — the sync maps them to internal
fields by header text, never by column position (§12.1 stage 1), so columns can be reordered or
have others inserted between them without breaking anything.

**What the client fills in every time**

| Column header | Required | Example | Rule |
|---|---|---|---|
| `Product Code` | yes | `JD-NK-014` | Primary key. Matches `^JD-[A-Z]{2}-\d{3,}$`. Must be unique. Its two-letter middle segment also decides the category (§5.1.1) |
| `Product Name` | yes | `Kundan Bridal Choker Set` | 3–70 characters. Also the source of the URL slug |
| `Images` | yes | `JD-NK-014-1.jpg, JD-NK-014-2.jpg` | Comma-separated Drive filenames **in display order** — the first is the main photo. Each must exist in the Drive folder, exactly, including case and extension |
| `Description` | yes | free text | Becomes the markdown body. Minimum 40 words — see §10.4 |
| `Selling Price` | no | `2499` | Blank → "Price on enquiry" |
| `List Price` | no | `3999` | The struck-through "was" price. Must exceed `Selling Price` when both are set |
| `In Stock` | yes | `TRUE` | Sheets checkbox |
| `Status` | yes | `live` | Dropdown: `live` \| `draft` \| `archived` — see §5.5 |
| `Publish Date` | yes | `2026-08-12` | Date picker, `YYYY-MM-DD` |

**Specification columns** — all optional, all free text, each rendered as one line in the
product's spec table and fed into the `Product` JSON-LD where a matching property exists.

| Column header | Example | Maps to |
|---|---|---|
| `Base Metal` | `Brass` | `material` |
| `Finish` | `22k gold polish` | `material`, and the colour filter facet |
| `Stones` | `Kundan, pearl` | `material`, comma-separated |
| `Set Includes` | `Necklace, 1 pair earrings, maang tikka` | `isRelatedTo` / spec line |
| `Earrings Included` | checkbox | spec line — a yes/no for necklace sets |
| `Weight` | `120g` | `weight` |

**Occasional columns** — usually left blank, kept to the right of the sheet.

| Column header | Example | Rule |
|---|---|---|
| `Featured` | checkbox | Promotes to the homepage grid |
| `Tags` | `bridal, party wear` | Comma separated. Drives related products and filter chips |
| `Category` | `necklaces` | **Override only.** Blank means "derive from the product code" (§5.1.1) |
| `Slug` | `kundan-bridal-choker-set` | **Override only.** Blank means "derive from the product name" (§5.1.2) |
| `SEO Title` | | Overrides the generated `<title>` |
| `SEO Description` | | ≤160 characters |

Data validation is configured **in the sheet itself** — a dropdown for `Status`, checkboxes for
`In Stock`, `Featured` and `Earrings Included`, a date picker for `Publish Date`, and
conditional formatting that reddens a blank required cell — so the client is steered away from
typos before the sync ever runs.

#### 5.1.1 Category comes from the product code

`JD-NK-014` → `NK` → `necklaces`. Each category file declares its own code in frontmatter
(`code: NK`), so the mapping has exactly one owner and adding a category means creating one
file rather than editing a file *and* a config. An unrecognised code is a validation error
naming the code and listing the valid ones.

This is one less column to fill and one less thing to get wrong: the client already types a
code that encodes the category, so asking them to state it twice only creates a way for the
two to disagree. The `Category` column exists as an override for the rare piece whose code
says one thing and whose shelf says another.

#### 5.1.2 Slugs are derived once, then frozen

The URL slug comes from `Product Name`, lowercased and hyphenated. Once a product has been
published, its slug is recorded in `catalogue.lock.json` and **never recomputed** — renaming
`Kundan Bridal Choker Set` to `Kundan Bridal Choker Set (Maroon)` changes the page's title but
not its URL, so the SEO value banked against that URL survives (§11.4). Deliberately changing a
live URL means filling the `Slug` column by hand and accepting the redirect work.

### 5.2 Alt text

Alt text is **generated by the sync**, from the product name, stones, finish and category —
`Kundan Bridal Choker Set — gold-plated necklace with kundan and pearl`. Every product using
generated alt text is listed in the run summary (§12.6), because hand-written alt text ranks
better in Google Images and the hero products deserve it.

An optional second tab, `images`, overrides the generated text for individual photos:

| Column | Required | Example |
|---|---|---|
| `Product Code` | yes | `JD-NK-014` |
| `Image File Name` | yes | `JD-NK-014-1.jpg` |
| `Alt Text` | yes | `Gold kundan bridal choker with pearl drops on a maroon background` |

The tab is optional in full: if it does not exist, the sync uses generated text everywhere. A
row referring to a filename absent from the `Images` column of its product is an error, not a
silent no-op. Set `requireAltText: true` in `catalogue.config.json` to make generated alt text
a hard failure instead of a warning, once the client is ready to write their own.

### 5.2.1 Prices, and the number nobody types

Two prices are entered — `List Price` and `Selling Price` — and the discount percentage is
**computed**, never stored:

```
discount = round((listPrice − sellingPrice) / listPrice × 100)
```

A discount column would be a third number free to contradict the first two, and a page whose
visible "40% off" disagrees with its JSON-LD `offers.price` is precisely the markup mismatch
that costs rich results. Derived, the badge and the structured data cannot drift.

`Selling Price` blank renders the `priceOnEnquiry` label and emits an offer without a price
rather than inventing one. `List Price` blank means no strike-through and no badge.

### 5.3 The Drive folder

A single flat folder, shared **Anyone with the link → Viewer**.

- Filenames must be unique across the whole folder and stable — renaming a file in Drive
  makes the sync see it as a deletion plus an addition.
- Recommended upload: min 1200×1200px, square, plain background, JPG. The sync downscales
  and re-encodes anyway, so oversized phone photos are fine.
- Nothing private goes in this folder. It is world-readable by design.

### 5.4 Generated product record — `src/content/products/<slug>/index.md`

```markdown
---
# GENERATED FROM THE GOOGLE SHEET — DO NOT EDIT.
# Any change here is overwritten by the next catalogue sync.
# To change this product, edit its row in the sheet.
sku: JD-NK-014
title: Kundan Bridal Choker Set
category: necklaces
price: 2499
listPrice: 3999
specs:
  baseMetal: Brass
  finish: 22k gold polish
  stones: [Kundan, pearl]
  setIncludes: Necklace, 1 pair earrings, maang tikka
  earringsIncluded: true
  weight: 120g
images:
  - src: ./JD-NK-014-1.jpg
    alt: Gold kundan bridal choker with pearl drops on a maroon background
  - src: ./JD-NK-014-2.jpg
    alt: Close-up of the kundan stone work on the choker centrepiece
inStock: true
featured: true
archived: false
tags: [bridal, party-wear, choker]
publishDate: 2026-08-12
seo:
  title: Kundan Bridal Choker Set — Jadauco
  description: Handcrafted kundan bridal choker with matching jhumkas...
syncedAt: 2026-08-13T09:14:22Z
---

Handcrafted kundan choker with matching jhumkas. Anti-tarnish gold polish,
adjustable dori, free size. Perfect for weddings and receptions.
```

The markdown **body** is the long description — rendered as rich HTML, and the single most
important SEO asset per product (see §10.4). It comes from the sheet's `description` column,
unless `copy.md` sits beside `index.md`, in which case that file wins and the sheet column is
ignored for this product.

### 5.5 Status, and why nothing is ever deleted

| `status` | Page generated? | In grids / sitemap? | Use |
|---|---|---|---|
| `live` | yes | yes | Normal |
| `draft` | **no** | no | Being photographed, priced, or written |
| `archived` | yes, at its original URL | no grids, stays in sitemap | Discontinued but the URL has SEO value |

A SKU that simply **disappears** from the sheet is treated as an accident: the sync fails with
`JD-NK-014 exists in the repo but not in the sheet`. Delisting is a deliberate act — set
`status` to `archived`. This prevents one mis-sorted or accidentally deleted spreadsheet row
from silently 404-ing a page that Google has already indexed.

### 5.6 Category record — `src/content/categories/necklaces.md` (git-owned)

```markdown
---
title: Necklaces
code: NK                      # §5.1.1 — the product-code segment that maps here
order: 1
banner: ./necklaces-banner.jpg
bannerAlt: A display of gold-plated imitation necklaces
seo:
  title: Imitation Necklaces Online — Kundan, Temple & Party Wear
  description: Shop gold-plated imitation necklaces...
---

Our necklace collection spans kundan bridal chokers, temple jewellery
haars and everyday party-wear chains.
```

This body copy renders above/below the product grid — it is what makes a category page rank rather than being a thin, content-less grid.

### 5.7 Global settings — `src/content/site/settings.md` (git-owned)

The single source of truth for everything that would otherwise be hardcoded.

```markdown
---
brand:
  name: Jadauco
  tagline: Imitation jewellery for every occasion
  logo: ./logo.svg
  logoAlt: Jadauco
contact:
  whatsapp: "+919XXXXXXXXX"
  phone: "+919XXXXXXXXX"
  email: hello@jadauco.com
  city: <city>
  state: <state>
  country: IN
currency:
  code: INR
  symbol: "₹"
  locale: en-IN
enquiry:
  template: "Hi Jadauco, I'm interested in {title} ({sku}) — {url}"
labels:
  enquire: Enquire on WhatsApp
  call: Call us
  priceOnEnquiry: Price on enquiry
  soldOut: Sold out
  featured: Featured
  relatedTitle: You may also like
  emptyCategory: New pieces coming soon.
nav:
  - { label: Home, href: / }
  - { label: All Jewellery, href: /products }
  - { label: About, href: /about }
social:
  instagram: https://instagram.com/...
  facebook: https://facebook.com/...
seo:
  siteName: Jadauco
  defaultTitle: Jadauco — Imitation Jewellery Online
  titleTemplate: "%s | Jadauco"
  defaultDescription: Handpicked imitation jewellery...
  defaultOgImage: ./og-default.jpg
  twitterHandle: "@..."
  googleSiteVerification: ""
  analyticsId: ""
---
```

> **Rule: no `.astro` file may contain the brand name, a phone number, `₹`, a hex colour, or a menu label.** If a value could ever change, it is data.

### 5.8 Schema definition — `src/content.config.ts`

There are now **two** schemas, and they do different jobs:

1. **`scripts/sync/schema.mjs`** validates the *sheet rows* — before anything is written.
   Its errors are aimed at the client: `Row 14: category "neclaces" is not one of
   necklaces, earrings, bangles`.
2. **`src/content.config.ts`** validates the *generated markdown* — at build time. Its errors
   are aimed at us, and catch bugs in the sync itself.

Both must pass. The sheet schema is the gate that keeps a bad spreadsheet edit from ever
reaching git; the content schema is the backstop that keeps a broken sync from reaching the web.

Sketch of the content-collection contract:

```ts
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const products = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/products' }),
  schema: ({ image }) => z.object({
    sku: z.string().regex(/^JD-[A-Z]{2}-\d{3,}$/),
    title: z.string().min(3).max(70),
    category: reference('categories'),          // must exist, else build fails
    price: z.number().positive().optional(),
    listPrice: z.number().positive().optional(),
    specs: z.object({
      baseMetal: z.string().optional(),
      finish: z.string().optional(),
      stones: z.array(z.string()).default([]),
      setIncludes: z.string().optional(),
      earringsIncluded: z.boolean().optional(),
      weight: z.string().optional(),
    }).default({}),
    images: z.array(z.object({
      src: image(),                             // validated + optimised
      alt: z.string().min(10),                  // alt text is MANDATORY (SEO + a11y)
    })).min(1),
    inStock: z.boolean().default(true),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    publishDate: z.coerce.date(),
    seo: z.object({
      title: z.string().optional(),
      description: z.string().max(160).optional(),
    }).optional(),
  }),
});
```

Similar schemas for `categories`, `pages`, `site`.

**What this buys us:** a missing SKU, a category that doesn't exist, a price typed as text, a broken image path, or a missing alt text **fails the build with a clear error**. The live site is never updated with broken data. This is the safety net that makes a client-editable spreadsheet safe as a database.

### 5.9 Derived, never hand-written

Everything below is a query over the collections — no manual linking, ever:

- Homepage featured grid, new arrivals
- Category pages and their product grids
- Related products (same category / shared tags)
- Nav dropdown of categories
- Filter chips (stones, finish, price band) built from actual data
- `sitemap.xml`, breadcrumbs, internal links
- Product URLs, derived from folder name → a product can never 404 or be orphaned

---

## 6. URL / page map

Clean, keyword-bearing, permanent URLs. Slugs are derived from the folder name, so the client controls them by naming the folder.

| URL | Source | Purpose |
|---|---|---|
| `/` | `index.astro` + collections | Hero, featured, categories, new arrivals |
| `/products/` | products collection | All jewellery, paginated, filterable |
| `/products/<slug>/` | `products/<slug>/index.md` | Product detail + enquiry |
| `/collections/<category>/` | `categories/<cat>.md` | Category landing + grid + SEO copy |
| `/about/`, `/care-guide/`, `/shipping-returns/` | pages collection | Trust/authority content |
| `/404` | `404.astro` | Suggests categories, keeps visitors on site |
| `/sitemap-index.xml` | `@astrojs/sitemap` | Submitted to Search Console |
| `/robots.txt` | generated | Points at sitemap |
| `/rss.xml` | optional | New arrivals feed |

**URL rules:** lowercase, hyphenated, no dates, no IDs in the path, trailing slash consistent, never changed once published (if a slug must change, add a redirect entry — see §11.4).

---

## 7. Design system — no hardcoded styling

`src/styles/tokens.css` holds every brand decision as CSS custom properties:

```css
:root {
  --color-brand:        #800020;   /* PLACEHOLDER — swap for real logo colour */
  --color-brand-accent: #C9A227;   /* PLACEHOLDER — gold */
  --color-bg: …; --color-surface: …; --color-text: …; --color-muted: …;
  --font-display: …; --font-body: …;
  --radius-card: …; --space-…: …; --shadow-…: …;
}
```

- Components reference `var(--color-brand)` only. Zero literal hex values outside this file.
- When the logo and hex codes arrive: edit this one file, whole site restyles.
- Dark mode: define the palette on `:root`, override under `@media (prefers-color-scheme: dark)`. Decide later — jewellery photography usually reads best on a light, neutral background.
- Fonts self-hosted (`woff2`, `font-display: swap`, preloaded) — no Google Fonts request, better LCP and no third-party dependency.

---

## 8. Enquiry flow (no backend)

1. Product page renders an **Enquire on WhatsApp** button and a **click-to-call** link.
2. The link is built at build time from `settings.md`:
   `https://wa.me/<whatsapp>?text=<encodeURIComponent(template)>`
   with `{title}`, `{sku}`, `{url}`, `{price}` substituted from the product.
3. Client receives a message that already contains the product name, code, and link — they never have to ask "which one?".
4. A floating WhatsApp button on all pages uses a generic template from settings.
5. Sold-out products (`inStock: false`) render the `soldOut` label and suppress the enquiry CTA — and are excluded from `sitemap.xml` availability signals, not deleted (keeps the URL and its SEO value alive).

---

## 9. Image pipeline

The single biggest performance factor for a jewellery catalogue. It now has two stages:
**sync-time** (Drive → repo, once per image) and **build-time** (repo → browser, every build).

**Sync-time, in `scripts/sync/images.mjs`:**
- Downscale to max 1600px on the long edge, re-encode JPEG at quality 82, strip EXIF.
  A 4 MB phone photo becomes roughly 150–250 KB before it is ever committed.
- This matters for repo size: 200 products × 3 photos at 4 MB each would be ~2.4 GB of git
  history. At 200 KB it is ~120 MB, which GitHub handles comfortably. If the catalogue ever
  grows past ~1000 products, revisit with Git LFS.
- Skip anything whose Drive `md5Checksum` matches `catalogue.lock.json` — unchanged photos
  are never re-downloaded or re-committed.

**Build-time, unchanged:**
- Client uploads a 4 MB phone photo → build ships a ~40 KB AVIF/WebP.
- `astro:assets` generates AVIF + WebP + fallback, with a full `srcset` for mobile/tablet/desktop.
- Explicit `width`/`height` on every image → **zero layout shift (CLS 0)**.
- Above-the-fold hero and the first product image use `loading="eager"` + `fetchpriority="high"`; everything else `loading="lazy"`.
- Grid thumbnails are square-cropped to a fixed aspect ratio for a tidy catalogue look.
- Alt text is **required by the schema** — no product can ship without it. Feeds Google Images, which is a major traffic source for jewellery.
- Product gallery: lightbox is a tiny vanilla-JS island, loaded only on product pages.
- Recommended client upload guidance (documented in `CONTRIBUTING-FOR-CLIENT.md`): min 1200×1200px, square, plain/neutral background, good light, JPG.

---

## 10. SEO — full plan

This site should be **findable**. SEO is not a bolt-on; it is designed into the content model.

### 10.1 Technical foundation
- **Static HTML, server-rendered at build.** Every word is in the HTML source — no JS required to see content. This is the strongest possible technical SEO position.
- **`site: 'https://jadauco.com'`** in `astro.config.mjs` so every generated URL is absolute and canonical.
- **`@astrojs/sitemap`** → `/sitemap-index.xml`, auto-updated on every build, includes every product, category and page.
- **`robots.txt`** allowing all crawlers, referencing the sitemap.
- **Canonical tag** on every page, self-referencing; paginated pages canonical to themselves (not to page 1).
- **HTTPS** via GitHub Pages + custom domain; `www` → apex redirect chosen and enforced consistently.
- **Trailing-slash consistency** — one form only, to avoid duplicate URLs.
- **404 page** that links back to categories.
- **No JS-blocked content, no infinite scroll** — pagination uses real, crawlable `<a href>` links.
- **Clean, keyword-bearing URLs** — `/collections/necklaces/`, `/products/kundan-bridal-choker-set/`.

### 10.2 On-page meta (all data-driven, one `SEO.astro` component)
- `<title>` — per-page from frontmatter, else generated from the record, wrapped in `titleTemplate` from settings. 50–60 chars.
- `<meta name="description">` — per-page, else auto-derived from the markdown body's first sentences. 140–160 chars.
- **Open Graph** — `og:title`, `og:description`, `og:image` (the product's first photo, auto-resized to 1200×630), `og:type`, `og:url`, `og:site_name`, `og:locale`.
- **Twitter Card** — `summary_large_image`.
- **One `<h1>` per page**, semantic `<h2>`/`<h3>` structure, `<main>`/`<nav>`/`<article>` landmarks.
- `lang="en-IN"` on `<html>`.
- **Google Search Console verification** meta tag read from `settings.md` (empty = not rendered).

### 10.3 Structured data (JSON-LD) — this is what wins rich results
- **`Product`** on every product page: `name`, `sku`, `image[]`, `description`, `brand`, `material`, `color`, and an **`Offers`** block with `price`, `priceCurrency` from settings, and `availability` (`InStock` / `OutOfStock`). When price is omitted, the offer is emitted without a price rather than with a fake one. *Result: price, availability and image can appear directly in Google results.*
- **`BreadcrumbList`** on product and category pages → breadcrumb trail in search results instead of a raw URL.
- **`ItemList`** on category pages → carousel eligibility.
- **`Organization`** / **`LocalBusiness`** site-wide, built from `settings.md`: name, logo, `sameAs` social links, contact point, address. *Result: knowledge panel eligibility and brand-search dominance.*
- **`WebSite`** with `SearchAction` if on-site search is added.
- All JSON-LD is generated from the same markdown fields that render on the page — so structured data and visible content can never drift apart (a common cause of Google penalties).

### 10.4 Content strategy — the part that actually decides rankings
Technical SEO gets you indexed; content gets you ranked.

- **Every product needs a unique markdown body.** Duplicated or empty descriptions across 200 products is the #1 reason catalogue sites fail to rank. Enforce a minimum body length as a build warning.
- **Category pages carry real copy** (150–300 words from the category `.md` body), not just a grid.
- **Descriptive, keyword-natural titles** — "Kundan Bridal Choker Set" beats "Necklace 14".
- **Long-tail targets** are where the wins are: *"artificial jewellery online India"*, *"imitation bridal necklace set"*, *"gold plated jhumka earrings online"*, *"temple jewellery imitation"*, plus city-level terms if the client sells locally.
- **Internal linking** — related products, category cross-links, breadcrumbs. Every product reachable within 2 clicks of the homepage.
- **Trust/authority pages** — About, Care Guide, Shipping & Returns. Thin e-commerce sites without these underperform; they also serve real customer questions.
- **Alt text on every image** (schema-enforced) → Google Images traffic.
- **Blog/guides collection** (optional phase 3) — "How to care for imitation jewellery", "Bridal jewellery checklist". Pure long-tail traffic, same markdown model.

### 10.5 Off-page / getting found
- Submit sitemap to **Google Search Console** and **Bing Webmaster Tools** on day 1.
- Create a **Google Business Profile** if there's a physical presence — dominant for local jewellery searches.
- Link the site from **Instagram/Facebook bio** — those are where jewellery buyers already are, and it's the fastest path to first indexation.
- Consistent **NAP** (name, address, phone) between the site and all listings.
- Get listed in relevant local/wholesale directories.

### 10.6 Performance as an SEO factor (Core Web Vitals)
Google ranks on real-user experience. Targets:

| Metric | Target |
|---|---|
| LCP | < 1.5s |
| CLS | 0 |
| INP | < 100ms |
| Lighthouse Performance / SEO / Best Practices / A11y | 95+, aiming 100 |
| JS shipped on a product page | < 15 KB |
| Page weight (product page, above fold) | < 300 KB |

Achieved by: zero-JS-by-default, self-hosted fonts, AVIF/WebP with explicit dimensions, no third-party scripts, prefetching internal links on hover.

### 10.7 Measurement
- Google Search Console: impressions, position, coverage errors, Core Web Vitals report.
- Optional privacy-light analytics (Plausible/Umami) — ID lives in `settings.md`, disabled if empty. No Google Analytics unless explicitly wanted (it costs performance and needs a cookie banner).

---

## 11. Hosting & deployment

### 11.1 GitHub Pages
- Repo: public (or private with Pages enabled on a paid plan).
- Deploy via **GitHub Actions** (`withastro/action` → `actions/deploy-pages`), not the legacy branch method.
- Every push to `main` = build + deploy, typically under 2 minutes.

### 11.2 Custom domain
- `public/CNAME` containing `jadauco.com`.
- DNS at the registrar: four `A` records to GitHub Pages IPs for the apex, plus a `CNAME` for `www` → `<user>.github.io`.
- Enable **Enforce HTTPS** in repo settings once the certificate provisions.

### 11.3 Build safety
- CI runs `astro check` + `astro build` on every PR. **A schema violation blocks the merge** — bad data never reaches production.
- Optional Lighthouse CI budget check on PRs.

### 11.4 Redirects
GitHub Pages has no server-side redirects. If a product slug must ever change, use Astro's `redirects` config to emit a meta-refresh + canonical stub page at the old URL. Preferred solution: **don't change slugs.**

---

## 12. Catalogue sync — Sheet + Drive → git

### 12.1 The pipeline

`.github/workflows/sync-catalogue.yml` runs `node scripts/sync` in seven stages. Any stage
failing aborts the whole run **before a single file is written** — the repo is never left
half-synced.

| # | Stage | What it does | Fails when |
|---|---|---|---|
| 1 | **Fetch** | Pull the `products` tab as CSV (and `images` if configured); list the Drive folder via the Drive API | Sheet or folder is not publicly shared; API key invalid |
| 2 | **Validate** | Zod-check every row; check code uniqueness, slug uniqueness, category code recognised, `List Price > Selling Price`, every filename in `Images` resolving to a real Drive file | Any row is invalid — reported by row number |
| 3 | **Reconcile** | Diff the sheet against the repo and `catalogue.lock.json`: new / changed / unchanged / missing-from-sheet | A repo product has no sheet row (see §5.5) |
| 4 | **Download** | Fetch only images whose Drive `md5Checksum` differs from the lock file | Download fails after 3 retries |
| 5 | **Process** | Downscale, re-encode, strip EXIF (§9) | Source file is not a decodable image |
| 6 | **Write** | Emit `index.md` per product; honour `copy.md`; prune images no longer referenced; update `catalogue.lock.json` | — |
| 7 | **Report** | Write a readable summary to the Actions job summary | — |

Then: `git commit` + `push` to `main` → the existing `deploy.yml` picks it up → live in ~2 min.

### 12.2 Triggers

```yaml
on:
  repository_dispatch:        # fired from the sheet itself — the primary path
    types: [sync-catalogue]
  workflow_dispatch:          # the manual button, for us and as a backstop
    inputs:
      dry_run:                # validate and report, write nothing
        type: boolean
        default: false
  schedule:
    - cron: '30 2 * * *'      # 08:00 IST daily, catches anything the other two missed
```

**The client never opens GitHub.** An Apps Script bound to the spreadsheet gives them a
**Jadauco → Publish to website** menu item; clicking it POSTs to GitHub's `repository_dispatch`
endpoint, which starts the sync. Roughly four minutes later the site is live. Meera's whole
workflow stays inside Drive and Sheets, which is the point of goal 2.

Three triggers, in order of how they are actually used:

| Trigger | Latency | Why it exists |
|---|---|---|
| `repository_dispatch` from the sheet menu | ~4 min | The deliberate act — Meera has finished editing and wants it live |
| `repository_dispatch` from a debounced timer | ~10 min | Catches the edit she forgot to publish, without her doing anything |
| `schedule` | ≤ 24 h | Catches a broken token or a failed dispatch. Green with no commit when there is nothing to do |
| `workflow_dispatch` | manual | Ours — and the `dry_run` path in S-9 |

**Why the timer is debounced.** A naive `onEdit` trigger fires on every cell change, so a
festival price revision across 40 rows (S-2) would queue 40 builds. Instead `onEdit` only sets a
`dirty` flag in Script Properties, and a ten-minute time-driven trigger reads that flag, fires
one dispatch, and clears it. Forty edits become one build.

**The token.** `repository_dispatch` needs a fine-grained PAT scoped to this repository alone,
with a single permission — `actions: write` — stored in the Apps Script's Script Properties.
Script Properties are not visible to someone holding the sheet's view-only link; only editors
can open the bound script. The token is still the one genuine secret in this design, so it gets
an expiry and a documented rotation, exactly as `GOOGLE_API_KEY` does in §12.4.

### 12.3 Why commit straight to `main`, not a PR

The original plan opened a PR because the generated stub had placeholder alt text and no
description — it needed a human to finish it. That is no longer true: the sheet carries real
prices, real descriptions and real alt text, and stage 2 rejects the row if it does not. The
review gate moved from "a human reads the diff" to "the validator proves the data is complete",
which is faster and more reliable for the failure modes that actually occur.

Set `"pullRequest": true` in `catalogue.config.json` to switch back to PR mode if the client
ever wants a second pair of eyes.

### 12.4 Access and secrets

| Item | Where | Notes |
|---|---|---|
| `GOOGLE_API_KEY` | GitHub Actions secret | Restrict to the Drive API only, in the Google Cloud console |
| Sheet ID, `gid`s, Drive folder ID | `catalogue.config.json`, in git | Not secret — both resources are public by design |

Sheet CSV is read from the public export endpoint (no API key needed). Drive **listing**
needs the API key, because there is no public way to enumerate a folder's contents.

**The security trade-off, stated plainly:** the sheet and the Drive folder are readable by
anyone who has or guesses the URL. For a product catalogue that is about to be published
anyway, that is acceptable. It means: no cost prices, no supplier names, no customer data, no
personal photos in either resource. Ever.

#### 12.4.1 Spike findings — T-05, run 13 Aug 2026

Run against the real sheet and the real Drive folder, from this machine, with **no credentials
of any kind**.

| # | Question | Result |
|---|---|---|
| a | Sheet fetches as CSV without auth | **Yes.** `…/export?format=csv&gid=0` → `200 text/csv`, headers and rows exactly as written |
| b | Folder lists without an API key | **Yes**, but not via `files.list`, which returns `403 PERMISSION_DENIED — Method doesn't allow unregistered callers`. The `drive.google.com/embeddedfolderview?id=…` HTML endpoint lists a link-shared folder unauthenticated, giving **filename and file ID** for all 15 files |
| c | Binary downloads without a key | **Yes.** `drive.usercontent.google.com/download?id=<fileId>&export=download` → `200 image/png`, 1.3 MB, decodes in sharp |
| d | Metadata quality of the keyless listing | **Poor.** No `md5Checksum`, no byte size, and the only date is a day-level string with no year (`Aug 11`) |
| e | Pagination past 100 files | **Unproven.** 15 files is far below any cap. `files.list` paginates properly with `pageToken`; the HTML endpoint's behaviour at 200+ files is unknown |

**What this means.** The pipeline runs end-to-end today with no API key, which unblocks the
whole build. But S-4 (replace a photo, same filename) and S-11 (unchanged images are never
re-downloaded) both rest on comparing a checksum, and the keyless listing has no checksum to
compare. A day-granularity date with no year cannot stand in for one.

So `drive.mjs` carries **two providers behind one interface**:

| Provider | Listing | Change detection | Use |
|---|---|---|---|
| `apiKey` | `files.list` + `pageToken`, `fields=id,name,md5Checksum,size` | Exact — Drive's own MD5 vs `catalogue.lock.json` | **Production.** The daily cron and every real sync |
| `public` | `embeddedfolderview` HTML scrape | Degraded — download, process, hash the *output*, write only if it differs | Development, and a working fallback if the key is ever lost or revoked |

The degraded mode still satisfies S-11's *repo* budget — identical bytes are never committed, so
git history stays flat — but not its bandwidth or its 90-second target, because every image is
fetched on every run. It is a fallback, not the plan.

**Consequences for the build**

1. **T-04 (the API key) is no longer a blocker.** It is a performance and correctness upgrade,
   wanted before go-live, not before the first line of code.
2. The service-account fallback in `TASKS.md` is **not needed**. Link-shared public access
   works; the only thing an API key buys is metadata.
3. **Pagination past 100 files stays an open risk** on the keyless path, and is a reason to
   have the key in place before the catalogue passes ~100 photos.

#### 12.4.2 Drive filenames are renamed on the way in

The real folder contains `IMG_5797.PNG` and
`5CEC5331-B97E-494C-87DF-5B5AEDC3AF6F Copy(2).JPG` — phone exports, with spaces, parentheses
and upper-case extensions. Those names are never committed. The sync writes
`<slug>-<n>.jpg`, so the choker's first photo lands as
`products/kundan-bridal-choker-set/kundan-bridal-choker-set-1.jpg`.

Three reasons, in order of weight: Google Images reads the filename as a ranking signal and a
UUID says nothing; a space or a bracket in a committed path is a recurring source of build
breakage; and macOS is case-insensitive while the CI runner is not, so `.JPG` versus `.jpg`
is a bug waiting for the first Linux build. The mapping from Drive file ID to committed path
lives in `catalogue.lock.json`, which is what makes the rename reversible and idempotent.

### 12.5 `catalogue.config.json`

```jsonc
{
  "sheetId": "1AbC...",
  "tabs": { "products": "0", "images": null },        // gid per tab; images is optional
  "driveFolderId": "1XyZ...",
  // NB: no category map here — each categories/*.md declares its own `code` (§5.1.1)
  "image": { "maxEdge": 1600, "quality": 82, "format": "jpeg" },
  "requireAltText": false,     // true = generated alt is an error, not a warning
  "minDescriptionWords": 40,
  "pullRequest": false,        // true = open a PR instead of pushing to main
  "skuPattern": "^JD-[A-Z]{2}-\\d{3,}$"
}
```

### 12.6 The sync report

Written to `$GITHUB_STEP_SUMMARY`, so the client sees it in the Actions run without reading
logs. GitHub emails them automatically when a run fails.

```
Catalogue sync — 13 Aug 2026, 08:00 IST

  4 products added        JD-NK-021, JD-ER-009, JD-ER-010, JD-BG-004
  2 products updated      JD-NK-014 (price 2499 → 2199), JD-RG-002 (sold out)
  1 product archived      JD-NK-003
 11 images downloaded     3.1 MB after processing
198 products unchanged

Warnings
  · JD-ER-009 — alt text auto-generated for 2 images. Add rows to the "images"
    tab to write your own; auto text ranks worse in Google Images.
  · JD-BG-004 — description is 22 words. Aim for 40+ so this page can rank.
```

### 12.7 Local development

`npm run sync` runs the same script against the same sheet with `GOOGLE_API_KEY` from a local
`.env`. `npm run sync -- --dry-run` validates and reports without writing. This is how the
sync is developed and debugged; the Action is a thin wrapper around it.

---

## 13. Client workflow (the daily reality)

**Adding a product** — 3 steps, no code, no git:
1. Drag the photos into the Drive folder, named `<SKU>-1.jpg`, `<SKU>-2.jpg`.
2. Add one row to the `products` tab, listing those filenames in the `Images` column.
3. Open the repo's **Actions → Sync catalogue → Run workflow**, and press the button.

Roughly four minutes later the product is live. If a field is wrong, the sync stops, nothing is
written, GitHub emails them, and the run summary says which row and what to fix —
**the live site stays untouched**.

**Other everyday edits** — change a price, mark sold out, feature on the homepage, retag,
reorder photos, discontinue an item: edit the cell, press the button. Bulk price changes are
now a spreadsheet fill-down instead of 40 file edits.

**What still needs git** (rare, and usually us rather than the client): category copy, About /
Care Guide / Shipping pages, brand settings, labels, nav.

A one-page `CONTRIBUTING-FOR-CLIENT.md` in plain language — with screenshots of the sheet, the
Drive folder and the Run workflow button — will be written alongside the build.

---

## 14. Implementation phases

**Phase 1 — Foundation**
Astro project init, `content.config.ts` with all four collections and full Zod schemas, `settings.md`, `tokens.css` with placeholder brand, BaseLayout, 3–5 hand-written sample products for development (later replaced by synced ones).

**Phase 2 — Core pages**
Homepage, all-products grid with pagination, category pages, product detail with gallery + enquiry, static pages, 404.

**Phase 3 — SEO layer**
`SEO.astro`, all JSON-LD components, sitemap integration, robots.txt, OG image generation, breadcrumbs, internal linking, Search Console + Bing submission.

**Phase 4 — Polish & performance**
Lightbox, filters, mobile nav, self-hosted fonts, Lighthouse pass to 95+, accessibility audit.

**Phase 4.5 — Catalogue sync** *(new; see `STORIES.md` and `TASKS.md`)*
Sheet and Drive set up, `scripts/sync` built and tested locally, `sync-catalogue.yml` wired up,
real catalogue loaded from the sheet. Runs in parallel with Phase 4 — it depends only on the
Phase 1 schema, not on the finished UI.

**Phase 5 — Go live**
GitHub Pages + DNS for `jadauco.com`, HTTPS, real logo and brand colours swapped into `tokens.css`, real WhatsApp number, catalogue synced from the sheet.

**Phase 6 — Handover & growth**
Client documentation and a live walkthrough, optional blog collection, RSS, analytics.

---

## 15. Open items

| # | Item | Owner | Needed by |
|---|---|---|---|
| 1 | Logo files (SVG preferred) + exact brand hex codes | Vikash | Phase 5 (placeholders until then) |
| 2 | Real WhatsApp number, phone, email, city/state | Vikash | Phase 5 |
| 3 | Final category list and their display order | Client | Phase 1 |
| 4 | SKU category codes (NK, ER, BG, RG, …) | Client | Phase 1 |
| 5 | `www` vs apex as the canonical domain | Vikash | Phase 5 |
| 6 | Registrar / DNS access for `jadauco.com` | Vikash | Phase 5 |
| 7 | Analytics: none / Plausible / GA4 | Vikash | Phase 6 |
| 8 | Dark mode: yes or no | Vikash | Phase 4 |
| 9 | Google account that owns the sheet and Drive folder — must be one the client controls long-term, not a personal account that could be lost | Client | Phase 4.5 |
| 10 | Google Cloud project + Drive API key | Vikash | Phase 4.5 |
| 11 | Confirm the client is comfortable with the sheet and folder being publicly readable (§12.4) | Both | Phase 4.5 |
| 12 | Who presses the sync button, and how often | Client | Phase 6 |
