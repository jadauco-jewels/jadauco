/**
 * T-12 — turn issues into the sentences in S-7.
 *
 * The target reads like:
 *
 *   Row 14 (JD-ER-009): Category "neclaces" is not one of "bangles", "earrings", …
 *     → Leave Category empty to use the one in the product code, or type one of the names above.
 *
 * The row number is the one the client sees in Sheets. The hint is not optional decoration —
 * S-7 is satisfied only when the message tells her what to *do*, so a message without a fix is
 * a bug in this module.
 */

/** @param {import('./schema.mjs').RowIssue} issue */
export function formatIssue(issue) {
  const where = issue.sku ? `Row ${issue.row} (${issue.sku})` : `Row ${issue.row}`;
  const lines = [`${where}: ${issue.message}`];
  if (issue.hint) lines.push(`  → ${issue.hint}`);
  return lines.join('\n');
}

/**
 * Group by row so a row with four problems reads as one block rather than four unrelated
 * complaints scattered through the output.
 * @param {import('./schema.mjs').RowIssue[]} issues
 */
export function formatIssues(issues) {
  const byRow = new Map();
  for (const issue of issues) {
    if (!byRow.has(issue.row)) byRow.set(issue.row, []);
    byRow.get(issue.row).push(issue);
  }

  const blocks = [];
  for (const [, rowIssues] of [...byRow.entries()].sort(([a], [b]) => a - b)) {
    blocks.push(rowIssues.map(formatIssue).join('\n'));
  }
  return blocks.join('\n\n');
}

/** The headline the client reads first, before any detail. */
export function summariseFailure(issues) {
  const rows = new Set(issues.map((i) => i.row)).size;
  const problems = issues.length === 1 ? '1 problem' : `${issues.length} problems`;
  const where = rows === 1 ? '1 row' : `${rows} rows`;
  return (
    `The sync stopped: ${problems} in ${where}. ` +
    'Nothing was changed — the website is exactly as it was.'
  );
}
