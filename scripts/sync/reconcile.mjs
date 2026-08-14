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
    slugFrozen: [],
  };

  const sheetSkus = new Set(products.map((p) => p.sku));

  // ── S-8: a product in the repo with no row in the sheet stops the run ──
  // A vanished row is treated as a mis-click, never as an instruction to delete a page that
  // Google has already indexed.
  const orphans = [...repoProducts.values()].filter((r) => !sheetSkus.has(r.sku));
  if (orphans.length) {
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

  for (const product of products) {
    // ── S-5: drafts generate nothing at all ──
    if (product.status === 'draft') {
      plan.drafts.push(product);
      continue;
    }

    // ── §5.1.2: the slug is frozen on first publish ──
    const locked = lock.products[product.sku];
    const derived = product.slugOverride ?? slugify(product.title);
    const slug = locked?.slug ?? derived;

    if (locked?.slug && locked.slug !== derived && !product.slugOverride) {
      plan.slugFrozen.push({ sku: product.sku, slug: locked.slug, derived });
    }

    // Typing into Slug override after a product has published does nothing — the lock wins on
    // the line above, and that is correct: the freeze is what stops a rename quietly throwing
    // away a page's Google ranking. What was wrong was doing it in silence. Say no out loud.
    if (product.slugOverride && locked?.slug && locked.slug !== product.slugOverride) {
      plan.warnings.push(
        `${product.sku} has "Slug override" set to "${product.slugOverride}", but its address ` +
          `was frozen as "${locked.slug}" when it was first published, so the override is ` +
          'being ignored. Changing a published address loses its Google ranking — if you ' +
          'genuinely need to move this page, it has to be done deliberately, with a redirect.',
      );
    }

    product.slug = slug;
    product.archived = product.status === 'archived';
    if (product.archived) plan.archived.push(product);

    const existing = repoProducts.get(product.sku);

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
