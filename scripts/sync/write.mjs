/**
 * T-16 — render the products and put them on disk.
 *
 * The rule the whole design rests on: **every write is staged in memory and flushed only once
 * every product has rendered successfully.** A crash halfway through leaves the repo exactly as
 * it was, which is what lets S-7 promise "the live site is completely unchanged" and S-9
 * promise that a dry run touches nothing.
 */

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PATHS } from './config.mjs';
import { withoutSyncedAt } from './reconcile.mjs';

const HEADER = [
  '# GENERATED FROM THE GOOGLE SHEET — DO NOT EDIT.',
  '# Any change here is overwritten by the next catalogue sync.',
  '# To change this product, edit its row in the sheet.',
];

/** YAML scalar quoting: only where it is actually needed, so the file stays readable. */
function yamlString(value) {
  const s = String(value);
  const needsQuotes =
    s === '' ||
    /^[\s]|[\s]$/.test(s) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /:\s/.test(s) ||
    /\s#/.test(s) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(s) ||
    /^[\d.+-]+$/.test(s);
  return needsQuotes ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
}

const yamlList = (items) => `[${items.map(yamlString).join(', ')}]`;
const isoDate = (date) => date.toISOString().slice(0, 10);

/**
 * Render one product's `index.md`.
 * @param {object} product
 * @param {{ body: string, syncedAt: string }} options
 */
export function renderProduct(product, { body, syncedAt }) {
  const lines = ['---', ...HEADER];

  lines.push(`sku: ${product.sku}`);
  lines.push(`title: ${yamlString(product.title)}`);
  lines.push(`category: ${product.category}`);
  if (product.price !== undefined) lines.push(`price: ${product.price}`);
  if (product.listPrice !== undefined) lines.push(`listPrice: ${product.listPrice}`);

  const specs = product.specs;
  const specLines = [];
  if (specs.baseMetal) specLines.push(`  baseMetal: ${yamlString(specs.baseMetal)}`);
  if (specs.finish) specLines.push(`  finish: ${yamlString(specs.finish)}`);
  if (specs.stones.length) specLines.push(`  stones: ${yamlList(specs.stones)}`);
  if (specs.setIncludes) specLines.push(`  setIncludes: ${yamlString(specs.setIncludes)}`);
  if (specs.earringsIncluded) specLines.push('  earringsIncluded: true');
  if (specs.weight) specLines.push(`  weight: ${yamlString(specs.weight)}`);
  if (specLines.length) lines.push('specs:', ...specLines);

  lines.push('images:');
  for (const image of product.images) {
    lines.push(`  - src: ${image.src}`);
    lines.push(`    alt: ${yamlString(image.alt)}`);
  }

  lines.push(`inStock: ${product.inStock}`);
  lines.push(`featured: ${product.featured}`);
  // Only written when true. `hero` arrived after the first catalogues were synced, and always
  // emitting it would rewrite every product file on the next run for a line that says false.
  if (product.hero) lines.push('hero: true');
  if (product.sequence !== undefined) lines.push(`sequence: ${product.sequence}`);
  lines.push(`archived: ${product.archived}`);
  if (product.tags.length) lines.push(`tags: ${yamlList(product.tags)}`);
  lines.push(`publishDate: ${isoDate(product.publishDate)}`);

  if (product.seo.title || product.seo.description) {
    lines.push('seo:');
    if (product.seo.title) lines.push(`  title: ${yamlString(product.seo.title)}`);
    if (product.seo.description) lines.push(`  description: ${yamlString(product.seo.description)}`);
  }

  lines.push(`syncedAt: ${syncedAt}`);
  lines.push('---', '', body.trim(), '');

  return lines.join('\n');
}

/**
 * S-10 — a hand-written `copy.md` beside `index.md` wins, and the sync never touches that file.
 * Returns the body plus whether an override was used, for the report.
 */
export async function resolveBody(product, existing) {
  if (existing?.hasCopyOverride) {
    const copy = await readFile(join(existing.dir, 'copy.md'), 'utf8');
    // Tolerate frontmatter in copy.md — someone will eventually add a title to it.
    const body = copy.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    if (body) return { body, override: true };
  }
  return { body: product.description, override: false };
}

/**
 * Build the complete set of files this run would write, without writing any of them.
 * `imageBytes` maps localPath → processed Buffer, filled in by the download/process stages.
 */
export async function stage({ plan, products, repoProducts, imageBytes, syncedAt }) {
  const files = new Map(); // absolute path → Buffer | string
  const overrides = [];
  const changedProducts = [];
  const unchangedProducts = [];

  for (const product of products) {
    if (product.status === 'draft') continue;

    const existing = repoProducts.get(product.sku);
    const { body, override } = await resolveBody(product, existing);
    if (override) overrides.push(product.sku);

    const dir = join(PATHS.products, product.slug);
    const markdown = renderProduct(product, { body, syncedAt });

    // "Changed" is decided by comparing the rendered text with what is on disk, ignoring
    // syncedAt. That is what makes S-2 exact — 40 price edits touch exactly 40 files — and
    // S-11 possible, where an unchanged catalogue produces no commit at all.
    //
    // The slug is compared as well as the text, because a product that has moved needs its
    // index.md written to the new folder even when nothing inside it changed. Editing only
    // `Slug override` does exactly that: identical markdown, different address. Without this
    // the old folder would be pruned as a rename and nothing written in its place.
    const isSame =
      existing &&
      existing.slug === product.slug &&
      withoutSyncedAt(existing.source) === withoutSyncedAt(markdown);

    if (isSame) {
      unchangedProducts.push(product);
    } else {
      changedProducts.push(product);
      files.set(join(dir, 'index.md'), markdown);
    }

    for (const image of product.images) {
      const bytes = imageBytes.get(image.job.localPath);
      if (bytes) files.set(join(dir, image.job.localName), bytes);
    }
  }

  // ── prune images the product no longer references ──
  const deletions = [];
  for (const product of products) {
    if (product.status === 'draft') continue;
    const existing = repoProducts.get(product.sku);
    if (!existing) continue;
    // A moved product's whole old folder goes below; picking over its contents first would
    // queue the same paths for deletion twice.
    if (existing.slug !== product.slug) continue;

    const keep = new Set([
      'index.md',
      'copy.md', // never ours to delete — S-10
      ...product.images.map((i) => i.job.localName),
    ]);
    for (const file of existing.files) {
      if (!keep.has(file)) deletions.push(join(existing.dir, file));
    }
  }

  // ── remove products whose row has gone, when config.orphans says to (S-8) ──
  // The whole folder, `copy.md` included. S-10 protects hand-written copy from being
  // overwritten by generated text, which is a different thing from keeping the copy of a
  // product that no longer exists — that would leave an orphan file no page ever reads.
  const removedProducts = plan.pruneDirs ?? [];
  for (const removed of removedProducts) deletions.push(removed.dir);

  // ── a product that has moved leaves its old folder behind ──
  // Now that the slug follows the sheet, a rename is routine rather than something the client
  // has to clean up in git. The old address keeps working through the redirect map, which is a
  // different mechanism from the folder — the folder has to go, or the site serves the product
  // at both addresses and the sitemap lists them both.
  const renamed = (plan.renames ?? []).filter((r) => r.dir);
  for (const rename of renamed) deletions.push(rename.dir);

  return {
    files,
    deletions,
    overrides,
    changedProducts,
    unchangedProducts,
    removedProducts,
    renamed,
  };
}

/**
 * Every address a product has previously had, pointing at the one it has now.
 *
 * Built from the lock rather than from this run's renames, so a link shared two renames ago
 * still resolves. Two rules keep it honest:
 *
 *  · a past address that is now some *live* product's address is dropped. Reusing a product
 *    code, or handing a slug from one product to another, would otherwise have the redirect
 *    shadow a real page — and the page is what the client actually meant to publish.
 *  · a product that has gone from the sheet takes its redirects with it, because `index.mjs`
 *    deletes its lock entry. A deleted product 404s; it does not redirect to a stranger.
 */
export function buildRedirects(lock, products) {
  const live = new Set(
    products.filter((p) => p.status !== 'draft' && p.slug).map((p) => p.slug),
  );

  const map = {};
  for (const entry of Object.values(lock.products)) {
    for (const old of entry.past ?? []) {
      if (old === entry.slug || live.has(old)) continue;
      map[`/products/${old}/`] = `/products/${entry.slug}/`;
    }
  }

  // Sorted, so the diff shows a genuinely new redirect rather than a reshuffle.
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Flush the staged set. Called once, after everything else has succeeded.
 *
 * **Deletions happen first.** Writing first and pruning afterwards looks safer, and was what
 * this did, but it cannot express a product moving into an address another product is moving
 * out of — the prune arrives after the write and takes the new page with it. Guarding by
 * comparing paths is not enough either: on a case-insensitive filesystem `White-beaded/` and
 * `white-beaded/` are the same folder under two names, so a rename that only changes case
 * looks like two unrelated paths and deletes the file it just wrote. Removing first makes both
 * cases fall out for free, because by the time anything is written every folder that had to go
 * is already gone.
 *
 * What this gives up is the guarantee that a crash *inside flush* leaves the tree untouched.
 * Every other stage still holds that line — nothing reaches here until all 7 stages have
 * succeeded and every byte is staged in memory — and the tree is a git checkout, so a
 * half-finished flush is recovered with `git checkout .` rather than from a backup.
 */
export async function flush({ files, deletions }) {
  // `recursive` because a deletion is either a single stale image or a whole product folder
  // whose row has gone; `force` so a file already removed by hand is not an error.
  for (const path of deletions) await rm(path, { force: true, recursive: true });

  const dirs = new Set([...files.keys()].map((f) => join(f, '..')));
  for (const dir of dirs) await mkdir(dir, { recursive: true });

  for (const [path, contents] of files) await writeFile(path, contents);

  return { written: files.size, deleted: deletions.length };
}
