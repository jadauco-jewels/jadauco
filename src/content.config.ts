import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * The build-time schema — PLAN.md §5.8.
 *
 * This is the *second* of two schemas and it validates generated markdown, not the sheet.
 * Its errors are aimed at us: they catch bugs in the sync. The client-facing gate that keeps a
 * bad spreadsheet edit out of git lives in `scripts/sync/schema.mjs`, and its errors are
 * written for Meera. Both must pass.
 */

const seo = z
  .object({
    title: z.string().optional(),
    description: z.string().max(160).optional(),
  })
  .optional();

const products = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/products' }),
  schema: ({ image }) =>
    z.object({
      sku: z.string().regex(/^JD-[A-Z]{2}-\d{3,}$/),
      title: z.string().min(3).max(70),
      // A reference, so a product pointing at a category that does not exist fails the build.
      category: reference('categories'),
      price: z.number().positive().optional(),
      listPrice: z.number().positive().optional(),

      // PLAN.md §5.1 — the client's specification columns, all optional.
      specs: z
        .object({
          baseMetal: z.string().optional(),
          finish: z.string().optional(),
          stones: z.array(z.string()).default([]),
          setIncludes: z.string().optional(),
          earringsIncluded: z.boolean().optional(),
          weight: z.string().optional(),
        })
        .default({ stones: [] }),

      images: z
        .array(
          z.object({
            src: image(),
            // Mandatory, and long enough to be a real sentence: alt text is both an
            // accessibility requirement and a Google Images ranking signal (§10.4).
            alt: z.string().min(10),
          }),
        )
        .min(1),

      inStock: z.boolean().default(true),
      featured: z.boolean().default(false),
      // The one piece that stands in the ring at the top of the homepage. Distinct from
      // `featured`, which fills the strip further down — see products.ts `heroProduct`.
      hero: z.boolean().default(false),
      // Hand-set running order, lowest first. Absent means "no opinion", which sorts after
      // every numbered piece rather than before it — see products.ts `byPriority`.
      sequence: z.number().int().positive().optional(),
      // S-6 — archived products keep their URL and their page, and leave every grid.
      archived: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      publishDate: z.coerce.date(),
      seo,
      // Written by the sync so a stale page is identifiable without reading git history.
      syncedAt: z.coerce.date().optional(),
    })
    // A struck-through price lower than the real one would render a negative discount and put
    // a contradiction into the Product JSON-LD. §5.2.1.
    .refine((p) => !(p.price && p.listPrice) || p.listPrice > p.price, {
      message: 'listPrice must be greater than price',
      path: ['listPrice'],
    }),
});

const categories = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/categories' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // §5.1.1 — the product-code segment that maps to this category. Sole owner of the
      // mapping; the sync reads it rather than carrying a duplicate table in its config.
      code: z
        .string()
        .regex(/^[A-Z]{2}$/, 'Category code must be exactly two capital letters, e.g. NK'),
      order: z.number().int().default(99),
      // A category we are not selling yet, or not selling any more. It keeps its file — the
      // copy, the SEO and the code are all written and worth keeping — but it leaves the nav,
      // the homepage, the footer and the sitemap, and its collection page is not built.
      // The sync refuses its code too (schema.mjs `loadCategories`), so a JD-TK-001 typed into
      // the sheet is rejected with a message rather than published into a page that 404s.
      hidden: z.boolean().default(false),
      // Which line-art stand-in represents this category, and stands in for any
      // product still waiting on a photograph. Ids live in Icons.astro.
      art: z.enum(['necklace', 'haar', 'pendant', 'jhumka', 'bangle', 'tikka', 'ring', 'payal']),
      // One line under the category name on the homepage. Not the body copy.
      blurb: z.string().min(20).max(140),
      banner: image().optional(),
      bannerAlt: z.string().min(10).optional(),
      seo,
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int().default(99),
    updated: z.coerce.date().optional(),
    seo,
  }),
});

const site = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/site' }),
  schema: ({ image }) =>
    z.object({
      brand: z.object({
        name: z.string(),
        tagline: z.string(),
        logo: image().optional(),
        logoAlt: z.string(),
      }),
      contact: z.object({
        // E.164, because it is pasted straight into a wa.me link.
        whatsapp: z.string().regex(/^\+\d{8,15}$/),
        phone: z.string().regex(/^\+\d{8,15}$/),
        email: z.email(),
        city: z.string(),
        state: z.string(),
        country: z.string().length(2),
      }),
      currency: z.object({
        code: z.string().length(3),
        symbol: z.string(),
        locale: z.string(),
      }),
      enquiry: z.object({
        template: z.string(),
      }),
      // Every visitor-facing string. PLAN.md §5.7: if it could ever change, it is data.
      labels: z.object({
        enquire: z.string(),
        enquireShort: z.string(),
        call: z.string(),
        priceOnEnquiry: z.string(),
        soldOut: z.string(),
        soldOutBody: z.string(),
        askRestock: z.string(),
        inStock: z.string(),
        save: z.string(),
        featured: z.string(),
        newFlag: z.string(),
        relatedTitle: z.string(),
        emptyCategory: z.string(),
        archived: z.string(),
        archivedBody: z.string(),
        specifications: z.string(),
        newArrivals: z.string(),
        allJewellery: z.string(),
        messagePreview: z.string(),
        hours: z.string(),
      }),
      nav: z.array(z.object({ label: z.string(), href: z.string() })).min(1),
      footerLinks: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
      // The strip under the enquiry band — claims we are prepared to stand behind.
      trust: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
      // Rendered verbatim in the footer. Imitation jewellery sold without this is
      // asking for a dispute, so it is content, not decoration.
      legal: z.array(z.string()).default([]),
      social: z
        .object({
          instagram: z.url().optional(),
          facebook: z.url().optional(),
        })
        .default({}),
      seo: z.object({
        siteName: z.string(),
        defaultTitle: z.string(),
        titleTemplate: z.string(),
        defaultDescription: z.string().max(160),
        defaultOgImage: image().optional(),
        twitterHandle: z.string().optional(),
        // Empty string means "do not render the tag at all".
        googleSiteVerification: z.string().default(''),
        analyticsId: z.string().default(''),
      }),
    }),
});

export const collections = { products, categories, pages, site };
