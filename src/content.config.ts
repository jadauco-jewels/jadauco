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
        .default({}),

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
        email: z.string().email(),
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
        call: z.string(),
        priceOnEnquiry: z.string(),
        soldOut: z.string(),
        discount: z.string(),
        featured: z.string(),
        relatedTitle: z.string(),
        emptyCategory: z.string(),
        archived: z.string(),
        specifications: z.string(),
        newArrivals: z.string(),
      }),
      nav: z.array(z.object({ label: z.string(), href: z.string() })).min(1),
      social: z
        .object({
          instagram: z.string().url().optional(),
          facebook: z.string().url().optional(),
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
