#!/usr/bin/env node
/**
 * T-18 — the seven stages of PLAN.md §12.1.
 *
 *   1 Fetch  2 Validate  3 Reconcile  4 Download  5 Process  6 Write  7 Report
 *
 * Any stage failing aborts before a single file is written. `--dry-run` runs stages 1–5 and
 * reports what would happen (S-9), which is also how the local workflow in S-14 works: the
 * Action is a thin wrapper around this file and does nothing the developer cannot do.
 */

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { loadConfig, SyncError, PATHS } from './config.mjs';
import { fetchSheet } from './sheet.mjs';
import { listFolder, downloadFile, readLock, writeLock } from './drive.mjs';
import { validate, loadCategories } from './schema.mjs';
import { formatIssues, summariseFailure } from './errors.mjs';
import { processImage } from './images.mjs';
import { reconcile, readRepoProducts } from './reconcile.mjs';
import { stage, flush, buildRedirects } from './write.mjs';
import { buildReport, buildFailureReport, publish } from './report.mjs';

const DOWNLOAD_CONCURRENCY = 6;

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const unknown = [...flags].filter((f) => !['--dry-run', '--verbose'].includes(f));
  if (unknown.length) {
    throw new SyncError(`Unknown option ${unknown.join(', ')}`, {
      hint: 'Usage: npm run sync [-- --dry-run] [--verbose]',
    });
  }
  return { dryRun: flags.has('--dry-run'), verbose: flags.has('--verbose') };
}

/**
 * Hand values back to the workflow, when there is a workflow to hand them to.
 *
 * Values here originate in a spreadsheet the client edits, so they are untrusted input on the
 * way into `$GITHUB_OUTPUT`. A newline in a value would let a crafted cell append outputs of
 * its own, so every value is flattened to a single line and clipped. The SKU pattern already
 * makes this impossible; that is not a reason to depend on it.
 */
async function emitOutputs(values) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  const { appendFile } = await import('node:fs/promises');
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${String(value).replace(/[\r\n]+/g, ' ').slice(0, 2000)}`,
  );
  await appendFile(path, `${lines.join('\n')}\n`);
}

/** Run jobs with a small concurrency cap — polite to Drive, and much faster than serial. */
async function pooled(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function run({ dryRun = false, verbose = false } = {}) {
  const startedAt = new Date();
  const step = (n, message) => verbose && console.error(`[${n}/7] ${message}`);

  const config = await loadConfig();

  // ── 1 Fetch ──
  step(1, 'Reading the sheet and the Drive folder');
  const [sheet, folder, categories, lock, repoProducts] = await Promise.all([
    fetchSheet(config),
    listFolder(config),
    loadCategories(),
    readLock(),
    readRepoProducts(),
  ]);

  if (categories.byCode.size === 0) {
    throw new SyncError('No categories are defined.', {
      hint:
        'src/content/categories/ must contain at least one .md file with a `code:` in its ' +
        'frontmatter — that code is what maps a product code like JD-NK-014 to a category.',
    });
  }

  // ── 2 Validate ──
  step(2, `Checking ${sheet.products.length} rows`);
  const { products, issues, warnings } = validate({
    rows: sheet.products,
    imageRows: sheet.images,
    config,
    categories,
    driveFiles: folder.files,
  });

  if (issues.length) {
    // S-7: fail before writing anything, and say exactly what to fix.
    await publish(
      buildFailureReport({ headline: summariseFailure(issues), detail: formatIssues(issues) }),
      { title: 'Catalogue sync — failed' },
    );
    return { ok: false, issues };
  }

  // ── 3 Reconcile ──
  step(3, 'Working out what changed');
  const plan = reconcile({
    products,
    repoProducts,
    driveFiles: folder.files,
    lock,
    config,
    provider: folder.provider,
  });

  // ── 4 Download + 5 Process ──
  const toFetch = plan.imageJobs.filter((j) => j.needsDownload);
  step(4, `Downloading ${toFetch.length} of ${plan.imageJobs.length} images`);

  const imageBytes = new Map();
  let downloaded = 0;
  let downloadedBytes = 0;

  await pooled(toFetch, DOWNLOAD_CONCURRENCY, async (job) => {
    const raw = await downloadFile(job.driveFile, { provider: folder.provider });
    const processed = await processImage(raw, config.image, job.driveFile.name);

    // On the keyless provider every image is re-downloaded, so this is the check that keeps
    // git history flat: if the processed bytes hash the same as last time, the file on disk is
    // already correct and is left alone (§12.4.1).
    if (job.previous?.outputSha === processed.sha) return;

    imageBytes.set(job.localPath, processed.buffer);
    lock.images[job.localPath] = {
      driveId: job.driveFile.id,
      driveName: job.driveFile.name,
      driveMd5: job.driveFile.md5 ?? null,
      outputSha: processed.sha,
      bytes: processed.bytes,
      width: processed.width,
      height: processed.height,
    };
    downloaded++;
    downloadedBytes += processed.bytes;
  });

  // ── 6 Write ──
  step(6, 'Rendering products');
  const syncedAt = startedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const staged = await stage({
    plan,
    products,
    repoProducts,
    imageBytes,
    syncedAt,
  });

  // The lock no longer decides a product's address — the sheet does. What it keeps is the
  // history: every address this product has had, so `buildRedirects` can keep them all
  // working. Recorded for every published product, not only the ones that changed this run.
  for (const product of products) {
    if (product.status === 'draft') continue;
    const previous = lock.products[product.sku];
    const past = new Set(previous?.past ?? []);
    if (previous?.slug) past.add(previous.slug);
    past.delete(product.slug);

    lock.products[product.sku] = {
      slug: product.slug,
      firstSyncedAt: previous?.firstSyncedAt ?? syncedAt,
      ...(past.size ? { past: [...past].sort() } : {}),
    };
  }

  // A moved product's images are re-keyed under the new slug by `reconcile`, which leaves the
  // old keys describing files that were just deleted. Left behind they would grow without
  // limit and, worse, make a later move back to the old address think its photos are already
  // on disk.
  for (const rename of staged.renamed) {
    for (const old of rename.from) {
      for (const key of Object.keys(lock.images)) {
        if (key.startsWith(`${old}/`)) delete lock.images[key];
      }
    }
  }

  // A deleted product takes its lock entry with it. Leaving the frozen slug behind would mean
  // that re-typing the same product code months later silently resurrects the old URL and the
  // old first-synced date, which is the opposite of what "the sheet is the truth" should mean.
  for (const removed of staged.removedProducts) {
    delete lock.products[removed.sku];
    for (const key of Object.keys(lock.images)) {
      if (key.startsWith(`${removed.slug}/`)) delete lock.images[key];
    }
  }

  // ── the redirect map ──
  // Staged alongside everything else so it lands in the same commit as the move it describes;
  // a deploy that had the new address but not the redirect would 404 the old one. Only staged
  // when it actually differs, to preserve S-11: an unchanged catalogue writes nothing at all.
  const redirects = `${JSON.stringify(buildRedirects(lock, products), null, 2)}\n`;
  const currentRedirects = await readFile(PATHS.redirects, 'utf8').catch(() => null);
  if (redirects !== currentRedirects) staged.files.set(PATHS.redirects, redirects);

  let flushed = { written: 0, deleted: 0 };
  if (!dryRun) {
    flushed = await flush(staged);
    if (staged.files.size || staged.deletions.length) await writeLock(lock);
  }

  // ── 7 Report ──
  const result = {
    ...staged,
    added: plan.added,
    archived: plan.archived,
    drafts: plan.drafts,
    renamed: staged.renamed,
    downloaded,
    downloadedBytes,
    deleted: dryRun ? staged.deletions.length : flushed.deleted,
    warnings: [...warnings, ...folder.warnings, ...plan.warnings],
  };

  await publish(
    buildReport({
      result,
      config,
      provider: folder.provider,
      dryRun,
      startedAt,
      finishedAt: new Date(),
    }),
  );

  const changed = staged.changedProducts.length + staged.deletions.length;

  // T-21 — the workflow builds its commit message from these, so the message names the SKUs
  // rather than saying "sync" for the hundredth time.
  await emitOutputs({
    changed: String(changed),
    // Removed products are named too — a commit that deletes two pages should say so in its
    // subject line, not read as an ordinary sync.
    skus: [
      ...staged.changedProducts.map((p) => p.sku),
      ...staged.removedProducts.map((r) => `−${r.sku}`),
    ].join(', '),
    pull_request: String(config.pullRequest),
  });

  return { ok: true, result, changed };
}

// Only run when invoked directly, so the module stays importable from tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scripts/sync')) {
  try {
    const { ok } = await run(parseArgs(process.argv));
    process.exit(ok ? 0 : 1);
  } catch (err) {
    if (err instanceof SyncError) {
      await publish(buildFailureReport({ headline: err.message, hint: err.hint }), {
        title: 'Catalogue sync — failed',
      });
      process.exit(1);
    }
    throw err;
  }
}
