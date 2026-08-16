/**
 * T-15 — work out what actually needs to change.
 *
 * This is where S-8 and S-11 live. Nothing here writes; it produces a plan, and `write.mjs`
 * carries it out only once every stage has succeeded.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SyncError, PATHS } from './config.mjs';
import { slugify } from './schema.mjs';
import { localImageName } from './images.mjs';

/**
 * What is already committed: slug → { sku, dir, files }.
 * Read from the generated `index.md` rather than assumed from the folder name, because the
 * folder name is the slug and the SKU is what identifies the product.
 */
export async function readRepoProducts(dir = PATHS.products) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }

  const found = new Map();
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const slug = entry.name;
    let source;
    try {
      source = await readFile(join(dir, slug, 'index.md'), 'utf8');
    } catch {
      // A folder with no index.md is not a product. Left alone deliberately — the sync only
      // owns what it created, and deleting an unrecognised folder is not its business.
      continue;
    }

    const sku = source.match(/^sku:\s*(\S+)\s*$/m)?.[1];
    if (!sku) continue;

    const files = await readdir(join(dir, slug)).catch(() => []);
    found.set(sku, {
      sku,
      slug,
      dir: join(dir, slug),
      files,
      source,
      hasCopyOverride: files.includes('copy.md'),
    });
  }
  return found;
}

/**
 * Strip the one field that changes on every run, so "has this product actually changed?" can be
 * answered by comparing text. Without this, every product rewrites every run and S-11's
 * zero-write promise is impossible.
 */
export const withoutSyncedAt = (markdown) => markdown.replace(/^syncedAt:.*$\n?/m, '');

/**
 * @returns a plan describing every change, and nothing performed yet.
 */
export function reconcile({ products, repoProducts, driveFiles, lock, config, provider }) {
  const plan = {
    added: [],
    updated: [],
    unchanged: [],
    drafts: [],
    archived: [],
    imageJobs: [],
    pruneDirs: [],
    warnings: [],
    renames: [],
  };

  const sheetSkus = new Set(products.map((p) => p.sku));

  // ── S-8: a product in the repo with no row in the sheet ──
  // Which of the two readings of a vanished row is right — "a mis-click" or "I deleted it" —
  // depends on how much the page is worth, so `config.orphans` decides rather than this file.
  const orphans = [...repoProducts.values()].filter((r) => !sheetSkus.has(r.sku));
  if (orphans.length && config.orphans === 'stop') {
    const lines = orphans.map(
      (o) =>
        `  · ${o.sku} is in the repo (src/content/products/${o.slug}/) but not in the sheet.`,
    );
    throw new SyncError(
      `${orphans.length} ${orphans.length === 1 ? 'product has' : 'products have'} ` +
        `disappeared from the sheet:\n${lines.join('\n')}`,
      {
        hint:
          'To take a product off the site, set its Status to archived — the page stays up and ' +
          'keeps its Google ranking. To remove it permanently, delete its folder in git. ' +
          'A row deleted by accident should be put back.',
      },
    );
  }

  // `orphans: "delete"` — the sheet is the whole truth, so the folder goes with the row. The
  // page 404s from the next deploy, and the only way back is the sheet's version history plus
  // git, which is the trade the setting exists to make. Every one is named in the report: a
  // deletion nobody meant is bad enough without also being silent.
  if (orphans.length) {
    for (const orphan of orphans) {
      plan.pruneDirs.push({ sku: orphan.sku, slug: orphan.slug, dir: orphan.dir });
    }
  }

  for (const product of products) {
    // ── S-5: drafts generate nothing at all ──
    if (product.status === 'draft') {
      plan.drafts.push(product);
      continue;
    }

    // ── the address always follows the sheet ──
    // This used to freeze on first publish, so the lock decided the URL for the rest of the
    // product's life. That protected a page's ranking, but it meant the site could disagree
    // with the sheet indefinitely — a pendant stuck at /cz-stone-bangle-set-of-four/ — and
    // when a code was reused it silently put two products at one address, and one of them
    // simply vanished. The sheet is the truth; old addresses are kept working by a redirect
    // (see `plan.renames` and the map written to src/redirects.json) rather than by refusing
    // to move.
    const locked = lock.products[product.sku];
    const slug = product.derivedSlug ?? slugify(product.slugOverride ?? product.title);

    product.slug = slug;
    product.archived = product.status === 'archived';
    if (product.archived) plan.archived.push(product);

    const existing = repoProducts.get(product.sku);

    // Where this product used to live. The folder on disk is the authority — the lock can be
    // stale or hand-edited, and it is the folder that has to be cleaned up either way — but
    // the lock is consulted too, so a slug that moved twice keeps redirecting from all of its
    // previous addresses rather than only the most recent one.
    const previous = [...(locked?.past ?? []), locked?.slug, existing?.slug].filter(
      (s) => s && s !== slug,
    );
    if (previous.length) {
      plan.renames.push({
        sku: product.sku,
        to: slug,
        from: [...new Set(previous)],
        // Only a folder that genuinely exists can be pruned; a stale lock entry has none.
        dir: existing && existing.slug !== slug ? existing.dir : null,
      });
    }

    // ── the images this product should end up with ──
    product.images = product.imageFilenames.map((filename, index) => {
      const driveFile = driveFiles.get(filename);
      const localName = localImageName(slug, index, config.image.format);
      const localPath = `${slug}/${localName}`;
      const previous = lock.images[localPath];

      // With an API key, Drive's own MD5 answers "has this file changed?" for free. Without
      // one there is no checksum to compare, so the only way to know is to fetch it and hash
      // what comes out — correct, but it costs a download every run (§12.4.1).
      const unchanged =
        provider === 'apiKey' &&
        previous &&
        driveFile.md5 &&
        previous.driveMd5 === driveFile.md5 &&
        existing?.files.includes(localName);

      const job = {
        sku: product.sku,
        slug,
        driveFile,
        localName,
        localPath,
        previous,
        needsDownload: !unchanged,
      };
      plan.imageJobs.push(job);

      return {
        src: `./${localName}`,
        alt: product.altOverrides?.get(filename) ?? generateAlt(product, index),
        generatedAlt: !product.altOverrides?.has(filename),
        job,
      };
    });

    if (!existing) plan.added.push(product);
    else product.__existing = existing;
  }

  return plan;
}

/**
 * §5.2 — alt text when the client has not written their own.
 *
 * Weaker than a human sentence, which is why every use is reported. But an accurate, specific
 * sentence built from the row's own fields still beats the alternative, which in practice is a
 * filename or nothing at all.
 */
export function generateAlt(product, index) {
  const detail = [product.specs.finish, product.specs.stones.join(' and ')]
    .filter(Boolean)
    .join(', ');

  const base = detail
    ? `${product.title} — ${detail}`
    : `${product.title} — ${product.category} by Jadauco`;

  // Second and later photos are different views of the same piece, and repeating one sentence
  // across every image of a product is its own kind of useless.
  return index === 0 ? base : `${base} (view ${index + 1})`;
}
