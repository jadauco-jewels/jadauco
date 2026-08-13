/**
 * T-09 — load and validate `catalogue.config.json`.
 *
 * S-14: a malformed config must fail immediately, with a message that says which key and what
 * it should be, rather than surfacing as a confusing error six stages later.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const PATHS = {
  config: join(REPO_ROOT, 'catalogue.config.json'),
  lock: join(REPO_ROOT, 'catalogue.lock.json'),
  products: join(REPO_ROOT, 'src/content/products'),
  categories: join(REPO_ROOT, 'src/content/categories'),
};

/** Providers for reading the Drive folder — see PLAN.md §12.4.1. */
export const DRIVE_PROVIDERS = /** @type {const} */ (['auto', 'apiKey', 'public']);

const ConfigSchema = z.object({
  sheetId: z
    .string()
    .min(1, 'sheetId is required — the long id in the sheet URL, between /d/ and /edit'),

  tabs: z.object({
    // A gid is a number, but it arrives from a URL and is written as a string in the config.
    products: z
      .string()
      .regex(/^\d+$/, 'tabs.products must be the numeric gid of the products tab, as a string'),
    // Null is meaningful: the images tab is genuinely optional (§5.2).
    images: z
      .string()
      .regex(/^\d+$/, 'tabs.images must be the numeric gid of the images tab, or null')
      .nullable()
      .default(null),
  }),

  driveFolderId: z
    .string()
    .min(1, 'driveFolderId is required — the id in the Drive folder URL, after /folders/'),

  driveProvider: z
    .enum(DRIVE_PROVIDERS, {
      error: `driveProvider must be one of ${DRIVE_PROVIDERS.join(', ')} — see PLAN.md §12.4.1`,
    })
    .default('auto'),

  image: z
    .object({
      maxEdge: z.number().int().min(200).max(6000).default(1600),
      quality: z.number().int().min(40).max(100).default(82),
      format: z.enum(['jpeg', 'webp']).default('jpeg'),
    })
    .default({}),

  requireAltText: z.boolean().default(false),
  minDescriptionWords: z.number().int().min(0).max(500).default(40),
  pullRequest: z.boolean().default(false),

  skuPattern: z
    .string()
    .default('^JD-[A-Z]{2}-\\d{3,}$')
    // Catch an unparseable pattern here rather than at the first row that uses it.
    .refine(
      (p) => {
        try {
          new RegExp(p);
          return true;
        } catch {
          return false;
        }
      },
      { error: 'skuPattern is not a valid regular expression' },
    ),
});

/** Raised for anything that should stop the run with a readable message, not a stack trace. */
export class SyncError extends Error {
  /** @param {string} message @param {{ hint?: string }} [opts] */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'SyncError';
    this.hint = opts.hint;
  }
}

/**
 * @param {string} [path] override, for tests
 * @returns {Promise<import('zod').infer<typeof ConfigSchema> & { skuRegex: RegExp }>}
 */
export async function loadConfig(path = PATHS.config) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new SyncError(`Cannot read ${path}`, {
      hint: 'catalogue.config.json must exist at the repo root. See PLAN.md §12.5 for its shape.',
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SyncError(`${path} is not valid JSON: ${err.message}`, {
      hint: 'A trailing comma or an unquoted key is the usual cause.',
    });
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const lines = result.error.issues.map((i) => {
      const key = i.path.join('.') || '(root)';
      return `  · ${key}: ${i.message}`;
    });
    throw new SyncError(`${path} is invalid:\n${lines.join('\n')}`);
  }

  return { ...result.data, skuRegex: new RegExp(result.data.skuPattern) };
}
