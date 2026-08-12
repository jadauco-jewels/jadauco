# suchimukhi.com — Build Plan

Static imitation-jewellery catalogue website.
Markdown is the only database. Nothing hardcoded. Built for search visibility.

- **Status:** Plan agreed, implementation not started
- **Last updated:** 2026-08-12

---

## 1. Goals

1. A fast, beautiful online catalogue of imitation jewellery.
2. The client (non-technical) adds products by dropping photos and editing a small markdown file — nothing else.
3. Buyers enquire via **WhatsApp / phone**. No cart, no payments, no backend.
4. The site **ranks on Google** for imitation jewellery searches and shows rich product results.
5. Hosted free on **GitHub Pages** at the custom domain `suchimukhi.com`.

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
| Content store | **Markdown files only** | No DB, no CMS, no JSON. Git is the audit log and undo button |
| Hardcoding | **None** | Every visitor-facing string, number, colour and link is data |
| Buyer action | **Enquiry only** — WhatsApp deep link + click-to-call | Standard for imitation jewellery resellers |
| SKU | In frontmatter, shown on page, injected into WhatsApp message | Client takes orders over chat by code |
| Price | **Optional** per product; falls back to "Price on enquiry" label | Client decides per item, no code change |
| Hosting | GitHub Pages + GitHub Actions | Free, zero ops, custom domain, auto HTTPS |
| Brand assets | Placeholder tokens until logo/hex codes are supplied | Swappable in one file |
| Photo → markdown automation | **Deferred**, contract designed now (§12) | Discussed later, drop-in when ready |

### Frameworks considered and rejected

| Framework | Why not |
|---|---|
| **Hugo** | Fastest builds, but templating is awkward to customise and image processing is clunkier. Build speed is irrelevant at ~200 products. |
| **Eleventy** | Good and lightweight, but the image pipeline and schema validation would be hand-rolled — Astro gives both free. |
| **Next.js** (static export) | Ships a React runtime to every visitor for a site with almost no interactivity. Wrong tool, worse Core Web Vitals. |
| **Jekyll** | GitHub-native but Ruby toolchain, no image optimisation, dated DX. |
| **Plain HTML** | No markdown database, no image pipeline, every new product is manual HTML editing. Fails goal 2. |

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
suchimukhi.com/
├─ doc/
│  └─ PLAN.md                        # this file
├─ photos/                           # raw client uploads (staging area for the future Action)
│  └─ README.md                      # naming rules for the client
├─ public/
│  ├─ CNAME                          # suchimukhi.com
│  ├─ robots.txt                     # generated at build, see §10
│  ├─ favicon.svg
│  └─ brand/                         # logo files, once supplied
├─ scripts/
│  └─ new-product.mjs                # local CLI: scaffold a product .md from photos
├─ src/
│  ├─ content.config.ts              # collections + Zod schemas — the "database schema"
│  ├─ content/
│  │  ├─ site/
│  │  │  └─ settings.md              # global config: brand, contact, nav, labels, SEO defaults
│  │  ├─ categories/
│  │  │  ├─ necklaces.md
│  │  │  ├─ earrings.md
│  │  │  └─ ...
│  │  ├─ products/
│  │  │  ├─ SM-NK-014-kundan-bridal-choker/
│  │  │  │  ├─ index.md
│  │  │  │  ├─ SM-NK-014-1.jpg
│  │  │  │  └─ SM-NK-014-2.jpg
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
│  └─ photos-to-markdown.yml         # deferred, see §12
├─ astro.config.mjs
└─ package.json
```

**Decision — product folders, not flat files.** Each product is a folder containing `index.md` plus its own photos. This keeps a product and its images together (delete the folder = product fully gone), lets image paths stay relative (`./SM-NK-014-1.jpg`), and makes the future upload automation trivial.

---

## 5. Markdown as the database

### 5.1 Product record — `src/content/products/<slug>/index.md`

```markdown
---
sku: SM-NK-014
title: Kundan Bridal Choker Set
category: necklaces
price: 2499                     # optional — omit for "Price on enquiry"
mrp: 3999                       # optional — enables strike-through + discount badge
material: [kundan, pearl]
colour: gold
weight: 120g                    # optional
images:
  - src: ./SM-NK-014-1.jpg
    alt: Gold kundan bridal choker with pearl drops on a maroon background
  - src: ./SM-NK-014-2.jpg
    alt: Close-up of the kundan stone work on the choker centrepiece
inStock: true
featured: true
tags: [bridal, party-wear, choker]
publishDate: 2026-08-12
seo:                            # optional per-product overrides
  title: Kundan Bridal Choker Set — Suchi Mukhi
  description: Handcrafted kundan bridal choker with matching jhumkas...
---

Handcrafted kundan choker with matching jhumkas. Anti-tarnish gold polish,
adjustable dori, free size. Perfect for weddings and receptions.

Comes in a protective pouch.
```

The markdown **body** is the long description — rendered as rich HTML, and the single most important SEO asset per product (see §10.4).

### 5.2 Category record — `src/content/categories/necklaces.md`

```markdown
---
title: Necklaces
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

### 5.3 Global settings — `src/content/site/settings.md`

The single source of truth for everything that would otherwise be hardcoded.

```markdown
---
brand:
  name: Suchi Mukhi
  tagline: Imitation jewellery for every occasion
  logo: ./logo.svg
  logoAlt: Suchi Mukhi
contact:
  whatsapp: "+919XXXXXXXXX"
  phone: "+919XXXXXXXXX"
  email: hello@suchimukhi.com
  city: <city>
  state: <state>
  country: IN
currency:
  code: INR
  symbol: "₹"
  locale: en-IN
enquiry:
  template: "Hi Suchi Mukhi, I'm interested in {title} ({sku}) — {url}"
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
  siteName: Suchi Mukhi
  defaultTitle: Suchi Mukhi — Imitation Jewellery Online
  titleTemplate: "%s | Suchi Mukhi"
  defaultDescription: Handpicked imitation jewellery...
  defaultOgImage: ./og-default.jpg
  twitterHandle: "@..."
  googleSiteVerification: ""
  analyticsId: ""
---
```

> **Rule: no `.astro` file may contain the brand name, a phone number, `₹`, a hex colour, or a menu label.** If a value could ever change, it is data.

### 5.4 Schema definition — `src/content.config.ts`

Sketch of the contract that makes markdown safe as a database:

```ts
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const products = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/products' }),
  schema: ({ image }) => z.object({
    sku: z.string().regex(/^SM-[A-Z]{2}-\d{3,}$/),
    title: z.string().min(3).max(70),
    category: reference('categories'),          // must exist, else build fails
    price: z.number().positive().optional(),
    mrp: z.number().positive().optional(),
    material: z.array(z.string()).default([]),
    colour: z.string().optional(),
    weight: z.string().optional(),
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

**What this buys us:** a missing SKU, a category that doesn't exist, a price typed as text, a broken image path, or a missing alt text **fails the build with a clear error**. The live site is never updated with broken data. This is the safety net that makes markdown-as-database safe for a non-technical client.

### 5.5 Derived, never hand-written

Everything below is a query over the collections — no manual linking, ever:

- Homepage featured grid, new arrivals
- Category pages and their product grids
- Related products (same category / shared tags)
- Nav dropdown of categories
- Filter chips (material, colour, price band) built from actual data
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

The single biggest performance factor for a jewellery catalogue.

- Client uploads a 4 MB phone photo → build ships a ~40 KB AVIF/WebP.
- `astro:assets` generates AVIF + WebP + fallback, with a full `srcset` for mobile/tablet/desktop.
- Explicit `width`/`height` on every image → **zero layout shift (CLS 0)**.
- Above-the-fold hero and the first product image use `loading="eager"` + `fetchpriority="high"`; everything else `loading="lazy"`.
- Grid thumbnails are square-cropped to a fixed aspect ratio for a tidy catalogue look.
- Alt text is **required by the schema** — no product can ship without it. Feeds Google Images, which is a major traffic source for jewellery.
- Product gallery: lightbox is a tiny vanilla-JS island, loaded only on product pages.
- Recommended client upload guidance (documented in `photos/README.md`): min 1200×1200px, square, plain/neutral background, good light, JPG.

---

## 10. SEO — full plan

This site should be **findable**. SEO is not a bolt-on; it is designed into the content model.

### 10.1 Technical foundation
- **Static HTML, server-rendered at build.** Every word is in the HTML source — no JS required to see content. This is the strongest possible technical SEO position.
- **`site: 'https://suchimukhi.com'`** in `astro.config.mjs` so every generated URL is absolute and canonical.
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
- `public/CNAME` containing `suchimukhi.com`.
- DNS at the registrar: four `A` records to GitHub Pages IPs for the apex, plus a `CNAME` for `www` → `<user>.github.io`.
- Enable **Enforce HTTPS** in repo settings once the certificate provisions.

### 11.3 Build safety
- CI runs `astro check` + `astro build` on every PR. **A schema violation blocks the merge** — bad data never reaches production.
- Optional Lighthouse CI budget check on PRs.

### 11.4 Redirects
GitHub Pages has no server-side redirects. If a product slug must ever change, use Astro's `redirects` config to emit a meta-refresh + canonical stub page at the old URL. Preferred solution: **don't change slugs.**

---

## 12. Photo → markdown automation (deferred, contract defined now)

To be discussed and built later; the folder contract below is designed now so it drops in without rework.

**Intended flow:**
1. Client uploads photos to `photos/` via the GitHub web UI (drag and drop, works from a phone browser).
2. Filename convention carries the minimum data, e.g. `NK-kundan-bridal-choker-1.jpg` (`NK` = category code, trailing `-1`/`-2` = image order).
3. A GitHub Action on push to `photos/`:
   - groups files by product,
   - allocates the next SKU for that category code,
   - creates `src/content/products/<slug>/`, moves the images in,
   - writes an `index.md` stub with `sku`, `title` (title-cased from filename), `category`, `images[]` and placeholder alt text,
   - opens a **pull request** rather than committing to `main`.
4. Client (or you) fills in price and description by editing the markdown in the PR, then merges. Site is live minutes later.

**Why a PR, not a direct commit:** the stub has placeholder alt text and no description; merging it straight to `main` would publish weak-SEO pages. The PR is the review gate.

**Interim (before the Action exists):** `scripts/new-product.mjs` does the same job locally via `npm run new-product`.

---

## 13. Client workflow (the daily reality)

**Adding a product** — 3 steps, no code:
1. Create a folder under `src/content/products/` named as the desired URL slug.
2. Upload the photos into it via the GitHub web UI.
3. Create `index.md`, copy the template from an existing product, fill in the fields. Commit.

Site rebuilds and deploys automatically. If a required field is wrong, the Action fails and emails them — **the live site stays untouched**.

**Other everyday edits** (all single-line frontmatter changes): mark sold out, change price, feature on homepage, retag, reorder photos.

A one-page `CONTRIBUTING-FOR-CLIENT.md` in plain language (with screenshots of the GitHub web UI) will be written alongside the build.

---

## 14. Implementation phases

**Phase 1 — Foundation**
Astro project init, `content.config.ts` with all four collections and full Zod schemas, `settings.md`, `tokens.css` with placeholder brand, BaseLayout, 3–5 sample products for development.

**Phase 2 — Core pages**
Homepage, all-products grid with pagination, category pages, product detail with gallery + enquiry, static pages, 404.

**Phase 3 — SEO layer**
`SEO.astro`, all JSON-LD components, sitemap integration, robots.txt, OG image generation, breadcrumbs, internal linking, Search Console + Bing submission.

**Phase 4 — Polish & performance**
Lightbox, filters, mobile nav, self-hosted fonts, Lighthouse pass to 95+, accessibility audit.

**Phase 5 — Go live**
GitHub Pages + DNS for `suchimukhi.com`, HTTPS, real logo and brand colours swapped into `tokens.css`, real WhatsApp number, real product catalogue loaded.

**Phase 6 — Automation & growth**
Photo→markdown Action, client documentation, optional blog collection, RSS, analytics.

---

## 15. Open items

| # | Item | Owner | Needed by |
|---|---|---|---|
| 1 | Logo files (SVG preferred) + exact brand hex codes | Vikash | Phase 5 (placeholders until then) |
| 2 | Real WhatsApp number, phone, email, city/state | Vikash | Phase 5 |
| 3 | Final category list and their display order | Client | Phase 1 |
| 4 | SKU category codes (NK, ER, BG, RG, …) | Client | Phase 1 |
| 5 | `www` vs apex as the canonical domain | Vikash | Phase 5 |
| 6 | Registrar / DNS access for `suchimukhi.com` | Vikash | Phase 5 |
| 7 | Photo filename convention sign-off | Both | Phase 6 |
| 8 | Analytics: none / Plausible / GA4 | Vikash | Phase 6 |
| 9 | Dark mode: yes or no | Vikash | Phase 4 |
