#!/usr/bin/env node
/**
 * `npm run validate` — check the sheet, change nothing, download nothing.
 *
 * This is stages 1–3 of the seven in `index.mjs` and then it stops. `--dry-run` already reports
 * what a sync *would* do, but it gets there by downloading and re-encoding every photo, which on
 * the keyless Drive provider means the whole folder every time. That is a minute or two of
 * waiting to answer "did I fill the row in correctly", which is the question actually being
 * asked ninety percent of the time.
 *
 * So: read the sheet, list the Drive folder by name only, run the same validator the sync runs,
 * and print the same errors. Same gate, seconds instead of minutes. Nothing here can write.
 */

import process from 'node:process';
import { loadConfig, SyncError } from './config.mjs';
import { fetchSheet } from './sheet.mjs';
import { listFolder, readLock } from './drive.mjs';
import { validate, loadCategories } from './schema.mjs';
import { formatIssues, summariseFailure } from './errors.mjs';
import { reconcile, readRepoProducts } from './reconcile.mjs';
import { buildFailureReport, publish } from './report.mjs';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function run() {
  const config = await loadConfig();

  const [sheet, folder, categories, lock, repoProducts] = await Promise.all([
    fetchSheet(config),
    listFolder(config),
    loadCategories(),
    readLock(),
    readRepoProducts(),
  ]);

  const { products, issues, warnings } = validate({
    rows: sheet.products,
    imageRows: sheet.images,
    config,
    categories,
    driveFiles: folder.files,
  });

  if (issues.length) {
    await publish(
      buildFailureReport({ headline: summariseFailure(issues), detail: formatIssues(issues) }),
      { title: 'Catalogue check — problems found' },
    );
    return { ok: false, issues };
  }

  // Reconcile too, because the checks that only fail here — a product in the repo with no row
  // in the sheet (S-8) — are exactly the ones a client cannot see by looking at the sheet.
  const plan = reconcile({
    products,
    repoProducts,
    driveFiles: folder.files,
    lock,
    config,
    provider: folder.provider,
  });

  const live = products.filter((p) => p.status === 'live');
  const lines = [
    `The sheet is good. ${plural(sheet.products.length, 'row')} checked, nothing written.`,
    '',
    `  ${plural(live.length, 'product')} live · ${plan.drafts.length} draft · ${plan.archived.length} archived`,
    `  ${plural(plan.added.length, 'product')} would be added`,
    `  ${plural(plan.imageJobs.filter((j) => j.needsDownload).length, 'photo')} would be downloaded`,
  ];

  for (const frozen of plan.slugFrozen) {
    lines.push(
      `  · ${frozen.sku} keeps the address /products/${frozen.slug}/ — its name now suggests ` +
        `"${frozen.derived}", but the address was frozen when it was first published.`,
    );
  }

  const allWarnings = [...warnings, ...folder.warnings, ...plan.warnings];
  if (allWarnings.length) {
    lines.push('', `${plural(allWarnings.length, 'warning')}:`);
    for (const warning of allWarnings) lines.push(`  · ${warning}`);
  }

  await publish(lines.join('\n'), { title: 'Catalogue check' });
  return { ok: true, products, warnings: allWarnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length > 2) {
    console.error('Usage: npm run validate   (this command takes no options)');
    process.exit(2);
  }
  try {
    const { ok } = await run();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    if (err instanceof SyncError) {
      await publish(buildFailureReport({ headline: err.message, hint: err.hint }), {
        title: 'Catalogue check — failed',
      });
      process.exit(1);
    }
    throw err;
  }
}
