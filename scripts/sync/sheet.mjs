/**
 * T-10 — fetch the sheet tabs as CSV and turn them into rows.
 *
 * Columns are located **by header text, never by position** (TASKS.md risk table): the client
 * is free to reorder columns or insert new ones, and only renaming a header breaks the mapping.
 */

import { parse } from 'csv-parse/sync';
import { SyncError } from './config.mjs';

/** Client-facing header → internal field. PLAN.md §5.1. */
export const PRODUCT_COLUMNS = {
  'Product Code': 'sku',
  'Product Name': 'title',
  Images: 'images',
  Description: 'description',
  'Selling Price': 'price',
  'List Price': 'listPrice',
  'In Stock': 'inStock',
  Status: 'status',
  'Publish Date': 'publishDate',
  'Base Metal': 'baseMetal',
  Finish: 'finish',
  Stones: 'stones',
  'Set Includes': 'setIncludes',
  'Earrings Included': 'earringsIncluded',
  Weight: 'weight',
  Featured: 'featured',
  Hero: 'hero',
  Sequence: 'sequence',
  Tags: 'tags',
  // Named "override" in the sheet because a `Category (auto)` helper column sits beside the
  // product code showing what the code already decided. Two columns headed Category, one of
  // them a formula, is how a client ends up typing into the wrong one.
  'Category override': 'category',
  'Slug override': 'slug',
  'SEO Title': 'seoTitle',
  'SEO Description': 'seoDescription',
};

/** §5.2 — the optional alt-text override tab. */
export const IMAGE_COLUMNS = {
  'Product Code': 'sku',
  'Image File Name': 'filename',
  'Alt Text': 'alt',
};

/** Headers a run cannot proceed without. */
const REQUIRED_PRODUCT_HEADERS = [
  'Product Code',
  'Product Name',
  'Images',
  'Description',
  'Status',
  'Publish Date',
];

/** Fields split on commas into arrays. */
const LIST_FIELDS = new Set(['images', 'stones', 'tags']);

/** Fields read as Sheets checkboxes. */
const BOOLEAN_FIELDS = new Set(['inStock', 'featured', 'hero', 'earringsIncluded']);

export const csvUrl = (sheetId, gid) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

/**
 * Google answers a request for a non-public sheet with 200 and an HTML sign-in page, not a 4xx.
 * Detecting that here is what turns the single most common setup mistake into a sentence the
 * client can act on, rather than a parse error forty lines deeper.
 */
function assertCsv(text, contentType, what) {
  const looksHtml =
    /^\s*<(!doctype|html)/i.test(text) || (contentType ?? '').includes('text/html');
  if (!looksHtml) return;
  throw new SyncError(`Google returned a sign-in page instead of the ${what} data.`, {
    hint:
      'The spreadsheet is not shared publicly. Open it, press Share, and set ' +
      '"General access" to "Anyone with the link" with the Viewer role.',
  });
}

/** Sheets writes TRUE/FALSE; humans write yes/y/1. Anything else is left for the schema. */
function coerceBoolean(value) {
  const v = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', '✓'].includes(v)) return true;
  if (['false', 'no', 'n', '0', ''].includes(v)) return false;
  return value.trim();
}

/**
 * Real data from the client's folder looks like `"IMG_5797.PNG , 5CEC…  Copy(2).JPG "` — split
 * on the comma and trim each piece, rather than splitting on ", ", or the trailing spaces
 * become part of the filename and nothing matches Drive.
 */
const splitList = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * @param {string} csv
 * @param {Record<string,string>} columnMap header → field
 * @param {string[]} requiredHeaders
 * @param {string} what for error messages
 * @param {number} headerRow 1-based sheet row the headers sit on
 */
export function parseTab(csv, columnMap, requiredHeaders, what, headerRow = 1) {
  /** @type {string[][]} */
  const records = parse(csv, { bom: true, relax_column_count: true, skip_empty_lines: false });
  if (records.length === 0) throw new SyncError(`The ${what} tab is empty.`);

  const headers = records[0].map((h) => h.trim());
  const missing = requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new SyncError(
      `The ${what} tab is missing ${missing.length === 1 ? 'a column' : 'columns'}: ` +
        `${missing.map((m) => `"${m}"`).join(', ')}.`,
      {
        hint:
          'Column headers are matched by their exact text, so a renamed header is invisible to ' +
          `the sync. Found: ${headers.filter(Boolean).join(', ')}`,
      },
    );
  }

  // Duplicated headers silently shadow one another otherwise — the later column would win and
  // the client would have no idea which of their two "Weight" columns was being read.
  const known = headers.filter((h) => h in columnMap);
  const duplicated = known.filter((h, i) => known.indexOf(h) !== i);
  if (duplicated.length) {
    throw new SyncError(
      `The ${what} tab has more than one "${duplicated[0]}" column.`,
      { hint: 'Delete or rename the duplicate, then run the sync again.' },
    );
  }

  const rows = [];
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    // 1-based sheet row, so an error can say "Row 14" and mean the row the client sees.
    const rowNumber = i + headerRow;

    const row = { __row: rowNumber };
    let hasContent = false;

    for (let c = 0; c < headers.length; c++) {
      const field = columnMap[headers[c]];
      if (!field) continue;
      const raw = (record[c] ?? '').trim();
      if (raw) hasContent = true;

      if (LIST_FIELDS.has(field)) row[field] = splitList(raw);
      else if (BOOLEAN_FIELDS.has(field)) row[field] = coerceBoolean(raw);
      else row[field] = raw;
    }

    // A blank row is how a spreadsheet looks between sections; it is not an error and it is
    // certainly not a product with no name.
    if (hasContent) rows.push(row);
  }

  return rows;
}

async function fetchCsv(url, what) {
  let response;
  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    throw new SyncError(`Could not reach Google Sheets to read the ${what} data: ${err.message}`);
  }

  if (response.status === 404) {
    throw new SyncError(`The sheet was not found (404) when reading the ${what} data.`, {
      hint: 'Check sheetId in catalogue.config.json against the id in the spreadsheet URL.',
    });
  }
  if (!response.ok) {
    throw new SyncError(
      `Google returned ${response.status} ${response.statusText} for the ${what} data.`,
    );
  }

  const text = await response.text();
  assertCsv(text, response.headers.get('content-type'), what);
  return text;
}

/**
 * Fetch and parse every configured tab.
 * @param {Awaited<ReturnType<import('./config.mjs').loadConfig>>} config
 * @param {{ fetchCsv?: typeof fetchCsv }} [deps] injection point for tests
 */
export async function fetchSheet(config, deps = {}) {
  const get = deps.fetchCsv ?? fetchCsv;

  const productCsv = await get(csvUrl(config.sheetId, config.tabs.products), 'products');
  const products = parseTab(
    productCsv,
    PRODUCT_COLUMNS,
    REQUIRED_PRODUCT_HEADERS,
    'products',
  );

  let images = [];
  if (config.tabs.images !== null) {
    const imageCsv = await get(csvUrl(config.sheetId, config.tabs.images), 'images');
    images = parseTab(
      imageCsv,
      IMAGE_COLUMNS,
      ['Product Code', 'Image File Name', 'Alt Text'],
      'images',
    );
  }

  return { products, images };
}
