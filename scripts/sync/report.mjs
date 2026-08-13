/**
 * T-17 — the summary the client reads instead of the logs.
 *
 * PLAN.md §12.6. Written to stdout and to `$GITHUB_STEP_SUMMARY`, which is what GitHub shows
 * on the run page and emails on failure. If this is unreadable, the client has no way to know
 * what the sync did, and every run becomes a question for Vikash.
 */

import { appendFile } from 'node:fs/promises';

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const noun = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** Right-align the counts so the eye can scan the column. PLAN.md §12.6. */
function countLine(count, label, detail = '') {
  return `${String(count).padStart(3)} ${label.padEnd(22)}${detail}`.trimEnd();
}

export function buildReport({
  result,
  config,
  provider,
  dryRun,
  startedAt,
  finishedAt,
}) {
  const {
    changedProducts,
    unchangedProducts,
    added,
    archived,
    drafts,
    downloaded,
    downloadedBytes,
    deleted,
    overrides,
    slugFrozen,
    warnings,
  } = result;

  const when = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(startedAt);

  const lines = [];
  lines.push(`Catalogue sync — ${when} IST${dryRun ? '  (DRY RUN — nothing was written)' : ''}`);
  lines.push('');

  const addedSkus = new Set(added.map((p) => p.sku));
  const updated = changedProducts.filter((p) => !addedSkus.has(p.sku));

  const skus = (items) => items.map((p) => p.sku).join(', ');

  if (added.length) {
    lines.push(countLine(added.length, `${noun(added.length, 'product')} added`, skus(added)));
  }
  if (updated.length) {
    lines.push(countLine(updated.length, `${noun(updated.length, 'product')} updated`, skus(updated)));
  }
  if (archived.length) {
    lines.push(countLine(archived.length, `${noun(archived.length, 'product')} archived`, skus(archived)));
  }
  if (downloaded) {
    lines.push(
      countLine(downloaded, `${noun(downloaded, 'image')} downloaded`, `${mb(downloadedBytes)} after processing`),
    );
  }
  if (deleted) {
    lines.push(countLine(deleted, `${noun(deleted, 'file')} removed`, 'no longer referenced'));
  }
  if (drafts.length) {
    lines.push(countLine(drafts.length, `${noun(drafts.length, 'draft')} skipped`, skus(drafts)));
  }
  lines.push(
    countLine(unchangedProducts.length, `${noun(unchangedProducts.length, 'product')} unchanged`),
  );

  if (!changedProducts.length && !deleted) {
    lines.push('');
    lines.push('Nothing changed. No commit was made.');
  }

  const notes = [];

  // Every product relying on generated alt text, because it is the one quality gap the client
  // can close themselves and will never notice unless told (§5.2).
  const generatedAlt = changedProducts
    .map((p) => ({ sku: p.sku, count: p.images.filter((i) => i.generatedAlt).length }))
    .filter((p) => p.count > 0);

  for (const { sku, count } of generatedAlt) {
    notes.push(
      `${sku} — alt text written automatically for ${plural(count, 'image')}. Add rows to the ` +
        '"images" tab to write your own; automatic text ranks worse in Google Images.',
    );
  }

  // A description that passed the minimum but is still thin enough to hurt (§10.4).
  const thin = changedProducts
    .map((p) => ({ sku: p.sku, words: p.description.trim().split(/\s+/).length }))
    .filter((p) => p.words < config.minDescriptionWords * 1.5);
  for (const { sku, words } of thin) {
    notes.push(`${sku} — description is ${words} words. Aim for ${config.minDescriptionWords * 2}+ so this page can rank.`);
  }

  for (const { sku, slug, derived } of slugFrozen) {
    notes.push(
      `${sku} — the product name changed, but the web address stays /products/${slug}/ ` +
        `(it would now read /products/${derived}/). This is deliberate: changing a live address ` +
        'throws away its Google ranking.',
    );
  }

  if (overrides.length) {
    notes.push(`Using hand-written copy.md instead of the sheet description: ${overrides.join(', ')}.`);
  }

  notes.push(...warnings);

  if (notes.length) {
    lines.push('');
    lines.push(notes.length === 1 ? 'Note' : 'Notes');
    for (const note of notes) lines.push(...wrap(`· ${note}`));
  }

  lines.push('');
  lines.push(
    `Read Drive with${provider === 'apiKey' ? ' the API key' : 'out an API key'}. ` +
      `Finished in ${((finishedAt - startedAt) / 1000).toFixed(1)}s.`,
  );

  return lines.join('\n');
}

/** Soft-wrap at 88 columns. A bulleted note hangs its continuations under the text. */
function wrap(text, width = 88) {
  const indent = text.startsWith('· ') ? '  ' : '';
  const lines = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current && `${current} ${word}`.length > width) {
      lines.push(current);
      current = indent + word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Failures get the same treatment — the client should never have to open the logs. */
export function buildFailureReport({ headline, detail, hint }) {
  const lines = [headline, ''];
  if (detail) lines.push(detail, '');
  if (hint) lines.push(...wrap(hint));
  return lines.join('\n');
}

export async function publish(text, { title = 'Catalogue sync' } = {}) {
  console.log(`\n${text}\n`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  // Fenced, so the alignment survives GitHub's markdown rendering.
  await appendFile(summaryPath, `## ${title}\n\n\`\`\`\n${text}\n\`\`\`\n`);
}
