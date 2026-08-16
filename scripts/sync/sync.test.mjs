/**
 * T-19 — the tests that matter.
 *
 * Every error in S-7 is triggered deliberately here, and each assertion checks the *message*,
 * not just that something failed. A validator that rejects the right row with an unreadable
 * message has not satisfied S-7.
 *
 * No network. The sheet is a fixture string, the Drive listing is a Map.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTab, PRODUCT_COLUMNS } from './sheet.mjs';
import { validate, slugify, loadCategories } from './schema.mjs';
import { formatIssues, summariseFailure } from './errors.mjs';
import { reconcile, generateAlt, withoutSyncedAt } from './reconcile.mjs';
import { renderProduct, stage, flush, buildRedirects } from './write.mjs';
import { buildReport } from './report.mjs';
import { SyncError } from './config.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { localImageName } from './images.mjs';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  skuRegex: /^JD-[A-Z]{2}-\d{3,}$/,
  minDescriptionWords: 40,
  requireAltText: false,
  image: { maxEdge: 1600, quality: 82, format: 'jpeg' },
  // The schema's default, not the repo's current setting — a fixture that tracked
  // catalogue.config.json would make these tests change meaning when that file is edited.
  orphans: 'stop',
};

const CATEGORIES = {
  byCode: new Map([
    ['NK', 'necklaces'],
    ['ER', 'earrings'],
    ['BG', 'bangles'],
  ]),
  names: ['bangles', 'earrings', 'necklaces'],
};

const DRIVE = new Map([
  ['photo-a.jpg', { id: 'id-a', name: 'photo-a.jpg', md5: 'aaa', size: 1000 }],
  ['photo-b.jpg', { id: 'id-b', name: 'photo-b.jpg', md5: 'bbb', size: 1000 }],
  ['IMG_9999.PNG', { id: 'id-c', name: 'IMG_9999.PNG', md5: 'ccc', size: 1000 }],
]);

/** Exactly at the limit is the interesting case, so this is deliberately 41 words. */
const WORDS_40 =
  'Handcrafted kundan bridal choker with matching jhumkas set on a brass base with a rich ' +
  'gold polish that catches light beautifully under wedding photography and keeps its shine ' +
  'through a long reception evening without tarnishing at all in normal everyday wear today.';

const HEADERS =
  'Product Code,Product Name,Images,Description,Selling Price,List Price,In Stock,Status,' +
  'Publish Date,Base Metal,Finish,Stones,Set Includes,Earrings Included,Weight,Featured,Hero,Sequence,' +
  'Tags,Category override,Slug override,SEO Title,SEO Description';

/** Build a CSV with one row per override, on top of a valid baseline. */
function sheetCsv(overrides = [{}]) {
  const base = {
    'Product Code': 'JD-NK-001',
    'Product Name': 'Kundan Bridal Choker Set',
    Images: 'photo-a.jpg',
    Description: WORDS_40,
    'Selling Price': '2499',
    'List Price': '3999',
    'In Stock': 'TRUE',
    Status: 'live',
    'Publish Date': '2026-08-13',
    'Base Metal': 'Brass',
    Finish: '22k gold polish',
    Stones: 'Kundan, pearl',
    'Set Includes': 'Necklace, earrings',
    'Earrings Included': 'TRUE',
    Weight: '120g',
    Featured: 'TRUE',
    Hero: '',
    Sequence: '',
    Tags: 'bridal, choker',
    'Category override': '',
    'Slug override': '',
    'SEO Title': '',
    'SEO Description': '',
  };

  const columns = HEADERS.split(',');
  const rows = overrides.map((override) => {
    const row = { ...base, ...override };
    return columns
      .map((c) => {
        const v = String(row[c] ?? '');
        return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      })
      .join(',');
  });

  return [HEADERS, ...rows].join('\n');
}

/** Parse + validate in one go, the way the orchestrator does. */
function check(overrides, { imageRows = [], config = CONFIG } = {}) {
  const rows = parseTab(sheetCsv(overrides), PRODUCT_COLUMNS, ['Product Code'], 'products');
  return validate({ rows, imageRows, config, categories: CATEGORIES, driveFiles: DRIVE });
}

/** Assert that some issue's rendered text contains each fragment. */
function assertMessage(issues, ...fragments) {
  const text = formatIssues(issues);
  for (const fragment of fragments) {
    assert.ok(
      text.includes(fragment),
      `expected the message to mention ${JSON.stringify(fragment)}, got:\n${text}`,
    );
  }
}

// ── S-7: every error, deliberately triggered ────────────────────────────────────────────────

test('S-7 · unrecognised category code names the code and lists the valid ones', () => {
  const { issues } = check([{ 'Product Code': 'JD-ZZ-001' }]);
  assert.equal(issues.length, 1);
  assertMessage(issues, 'Row 2 (JD-ZZ-001)', '"ZZ"', '"BG", "ER", "NK"');
});

test('S-7 · a bad Category override lists the categories that exist', () => {
  const { issues } = check([{ 'Category override': 'neclaces' }]);
  assertMessage(issues, 'Category override "neclaces" is not one of', '"necklaces"');
});

test('S-7 · duplicate product code points at the first row that used it', () => {
  const { issues } = check([{}, { 'Product Name': 'Another Choker', Images: 'photo-b.jpg' }]);
  assertMessage(issues, 'Row 3 (JD-NK-001)', 'already used on row 2');
});

test('S-7 · duplicate slug names both products and the address they would share', () => {
  const { issues } = check([
    {},
    { 'Product Code': 'JD-NK-002', Images: 'photo-b.jpg' },
  ]);
  assertMessage(issues, '/products/kundan-bridal-choker-set/', 'JD-NK-001', 'row 2');
});

test('S-7 · bad product code format explains the shape', () => {
  const { issues } = check([{ 'Product Code': 'NK-1' }]);
  assertMessage(issues, 'is not in the right format', 'JD-NK-014');
});

test('S-7 · bad date is rejected with the format to use', () => {
  const { issues } = check([{ 'Publish Date': 'last tuesday' }]);
  assertMessage(issues, '"last tuesday", which is not a date', 'YYYY-MM-DD');
});

test('S-7 · a price that is not a number says so, and how to mean "on enquiry"', () => {
  const { issues } = check([{ 'Selling Price': 'call us' }]);
  assertMessage(issues, 'Selling Price is "call us", which is not a number', 'leave Selling Price empty');
});

test('a price written the way a spreadsheet formats it is accepted', () => {
  const { issues, products } = check([{ 'Selling Price': '₹2,499', 'List Price': '3,999' }]);
  assert.deepEqual(issues, []);
  assert.equal(products[0].price, 2499);
  assert.equal(products[0].listPrice, 3999);
});

test('S-7 · List Price not above Selling Price is caught with both numbers', () => {
  const { issues } = check([{ 'Selling Price': '2499', 'List Price': '1999' }]);
  assertMessage(issues, 'List Price (1999) is not higher than Selling Price (2499)');
});

test('S-7 · a short description reports the actual word count', () => {
  const { issues } = check([{ Description: 'Nice necklace, very pretty.' }]);
  assertMessage(issues, 'Description is 4 words; the minimum is 40');
});

test('S-7 · an Images entry not in Drive suggests the near-miss when there is one', () => {
  const { issues } = check([{ Images: 'img_9999.png' }]);
  assertMessage(issues, 'is not in the Drive folder', 'The folder has "IMG_9999.PNG"', 'including capital letters');
});

test('S-7 · an Images entry with no near-miss gets the general fix', () => {
  const { issues } = check([{ Images: 'nowhere.jpg' }]);
  assertMessage(issues, '"nowhere.jpg", which is not in the Drive folder', 'set Status to draft');
});

test('S-7 · one photo used by two products is rejected', () => {
  const { issues } = check([
    {},
    { 'Product Code': 'JD-NK-002', 'Product Name': 'Second Set' },
  ]);
  assertMessage(issues, '"photo-a.jpg" is already used by JD-NK-001 on row 2');
});

test('S-7 · an unknown Status lists the three that exist', () => {
  const { issues } = check([{ Status: 'published' }]);
  assertMessage(issues, 'Status is "published"', '"live", "draft", "archived"');
});

test('S-7 · a checkbox column holding text explains how to make it a checkbox', () => {
  const { issues } = check([{ 'In Stock': 'sometimes' }]);
  assertMessage(issues, 'In Stock is "sometimes"', 'Data validation → Tick box');
});

test('S-7 · a Drive photo nothing references is a warning, not a failure', () => {
  const { issues, warnings } = check([{}]);
  assert.deepEqual(issues, [], 'unused photos must not stop the client publishing');
  assert.ok(warnings[0].includes('2 photos are in the Drive folder but not used'));
});

test('S-7 · the failure headline promises the site is untouched', () => {
  const { issues } = check([{ 'Product Code': 'JD-ZZ-001', 'Selling Price': 'free' }]);
  const headline = summariseFailure(issues);
  assert.ok(headline.includes('2 problems in 1 row'));
  assert.ok(headline.includes('the website is exactly as it was'));
});

test('every issue carries a fix — a message without one is a bug in T-12', () => {
  const { issues } = check([
    { 'Product Code': 'JD-ZZ-001', 'Selling Price': 'free', 'Publish Date': 'soon', Status: 'x' },
  ]);
  assert.ok(issues.length > 0);
  for (const issue of issues) {
    assert.ok(issue.hint && issue.hint.length > 20, `no usable hint on: ${issue.message}`);
  }
});

// ── S-5: drafts ─────────────────────────────────────────────────────────────────────────────

test('S-5 · a draft is not validated for description or images', () => {
  const { issues, products } = check([
    { Status: 'draft', Description: 'tbd', Images: '', 'Selling Price': '' },
  ]);
  assert.deepEqual(issues, []);
  assert.equal(products[0].status, 'draft');
});

test('S-5 · a draft still has to have a valid product code', () => {
  const { issues } = check([{ Status: 'draft', 'Product Code': 'nonsense' }]);
  assertMessage(issues, 'is not in the right format');
});

// ── S-8: orphans ────────────────────────────────────────────────────────────────────────────

test('S-8 · a product in the repo with no sheet row stops the run', () => {
  const repoProducts = new Map([
    ['JD-NK-014', { sku: 'JD-NK-014', slug: 'gone', dir: '/x/gone', files: [], source: '' }],
  ]);

  assert.throws(
    () =>
      reconcile({
        products: [],
        repoProducts,
        driveFiles: DRIVE,
        lock: { products: {}, images: {} },
        config: CONFIG,
        provider: 'apiKey',
      }),
    (err) => {
      assert.ok(err instanceof SyncError);
      assert.ok(err.message.includes('JD-NK-014 is in the repo'));
      assert.ok(err.hint.includes('set its Status to archived'));
      return true;
    },
  );
});

test('S-8 · orphans: "delete" removes the folder instead of stopping', () => {
  const repoProducts = new Map([
    ['JD-NK-014', { sku: 'JD-NK-014', slug: 'gone', dir: '/x/gone', files: [], source: '' }],
  ]);

  const plan = reconcile({
    products: [],
    repoProducts,
    driveFiles: DRIVE,
    lock: { products: {}, images: {} },
    config: { ...CONFIG, orphans: 'delete' },
    provider: 'apiKey',
  });

  assert.deepEqual(plan.pruneDirs, [{ sku: 'JD-NK-014', slug: 'gone', dir: '/x/gone' }]);
});

test('S-8 · a deleted product is named in the report, never removed in silence', () => {
  const report = buildReport({
    result: {
      changedProducts: [],
      unchangedProducts: [],
      added: [],
      archived: [],
      drafts: [],
      downloaded: 0,
      downloadedBytes: 0,
      deleted: 1,
      overrides: [],
      slugFrozen: [],
      warnings: [],
      removedProducts: [{ sku: 'JD-NK-014', slug: 'gone', dir: '/x/gone' }],
    },
    config: CONFIG,
    provider: 'apiKey',
    dryRun: false,
    startedAt: new Date('2026-08-14T10:00:00Z'),
    finishedAt: new Date('2026-08-14T10:00:05Z'),
  });

  assert.match(report, /1 product DELETED/);
  assert.match(report, /JD-NK-014/);
  assert.match(report, /\/products\/gone\/ will 404/);
  // The way back has to be in the message itself — nobody reads the docs at the moment a
  // page they wanted disappears.
  assert.match(report, /Version history/);
});

// ── S-11 and §5.1.2: change detection and frozen slugs ──────────────────────────────────────

function planFor({ products, lock = { products: {}, images: {} }, repoProducts = new Map(), provider = 'apiKey' }) {
  return reconcile({ products, repoProducts, driveFiles: DRIVE, lock, config: CONFIG, provider });
}

test('S-11 · with a checksum, an unchanged image is not downloaded again', () => {
  const { products } = check([{}]);
  const slug = 'kundan-bridal-choker-set';
  const localName = localImageName(slug, 0, 'jpeg');

  const plan = planFor({
    products,
    lock: {
      products: { 'JD-NK-001': { slug } },
      images: { [`${slug}/${localName}`]: { driveMd5: 'aaa', outputSha: 'whatever' } },
    },
    repoProducts: new Map([
      ['JD-NK-001', { sku: 'JD-NK-001', slug, dir: '/x', files: ['index.md', localName], source: '' }],
    ]),
  });

  assert.equal(plan.imageJobs.length, 1);
  assert.equal(plan.imageJobs[0].needsDownload, false);
});

test('S-4 · a replaced photo with the same name has a new checksum, so it is fetched', () => {
  const { products } = check([{}]);
  const slug = 'kundan-bridal-choker-set';
  const localName = localImageName(slug, 0, 'jpeg');

  const plan = planFor({
    products,
    lock: {
      products: { 'JD-NK-001': { slug } },
      images: { [`${slug}/${localName}`]: { driveMd5: 'OLD-CHECKSUM' } },
    },
    repoProducts: new Map([
      ['JD-NK-001', { sku: 'JD-NK-001', slug, dir: '/x', files: ['index.md', localName], source: '' }],
    ]),
  });

  assert.equal(plan.imageJobs[0].needsDownload, true);
});

test('S-11 · without a checksum every image is fetched, and the run says so', () => {
  const { products } = check([{}]);
  const plan = planFor({ products, provider: 'public' });
  assert.equal(plan.imageJobs[0].needsDownload, true);
});

// ── the address follows the sheet ───────────────────────────────────────────────────────────
//
// These replace three tests that asserted the opposite: that the first published address was
// frozen for the life of the product. That rule kept a pendant at /cz-stone-bangle-set-of-four/
// however many times the sheet was corrected, and when a product code was reused it put two
// products at one address and silently dropped one of them. The address now follows the sheet;
// the old address is kept alive by a redirect instead.

test('a renamed product moves, and its old address redirects', () => {
  const { products } = check([{ 'Product Name': 'Kundan Bridal Choker Set Maroon' }]);
  const plan = planFor({
    products,
    lock: { products: { 'JD-NK-001': { slug: 'kundan-bridal-choker-set' } }, images: {} },
  });

  assert.equal(products[0].slug, 'kundan-bridal-choker-set-maroon');
  assert.deepEqual(plan.renames, [
    {
      sku: 'JD-NK-001',
      to: 'kundan-bridal-choker-set-maroon',
      from: ['kundan-bridal-choker-set'],
      dir: null,
    },
  ]);
});

test('Slug override decides the address, published or not', () => {
  const { products } = check([{ 'Slug override': 'a-better-name' }]);
  const plan = planFor({
    products,
    lock: {
      products: { 'JD-NK-001': { slug: 'kundan-bridal-choker-set', firstSyncedAt: 'x' } },
      images: {},
    },
  });

  assert.equal(products[0].slug, 'a-better-name');
  assert.deepEqual(plan.renames[0].from, ['kundan-bridal-choker-set']);
  // Nothing is ignored any more, so nothing has to be explained away.
  assert.equal(plan.warnings.filter((w) => w.includes('Slug override')).length, 0);
});

test('a Slug override is normalised like any other slug', () => {
  // A cell typed by hand is where capitals and spaces get in. Left alone they became a folder
  // name, and an address whose case a customer had to reproduce exactly.
  const { products } = check([{ 'Slug override': 'White-Beaded Temple Earrings' }]);
  planFor({ products, lock: { products: {}, images: {} } });
  assert.equal(products[0].slug, 'white-beaded-temple-earrings');
});

test('a product that has moved twice redirects from both of its old addresses', () => {
  const { products } = check([{ 'Slug override': 'third-name' }]);
  const plan = planFor({
    products,
    lock: {
      products: { 'JD-NK-001': { slug: 'second-name', past: ['first-name'] } },
      images: {},
    },
  });

  assert.equal(products[0].slug, 'third-name');
  assert.deepEqual(plan.renames[0].from, ['first-name', 'second-name']);
});

test('a redirect never shadows a live page', () => {
  // The case that lost JD-ER-001: a code is reused, so one product's new address is another
  // product's old one. The page has to win, or the client publishes something nobody can reach.
  const lock = {
    products: {
      'JD-ER-001': { slug: 'temple-earrings', past: [] },
      'JD-ER-002': { slug: 'beaded-earrings', past: ['temple-earrings'] },
    },
    images: {},
  };
  const live = [
    { sku: 'JD-ER-001', slug: 'temple-earrings', status: 'live' },
    { sku: 'JD-ER-002', slug: 'beaded-earrings', status: 'live' },
  ];

  assert.deepEqual(buildRedirects(lock, live), {});
});

test('a redirect is emitted when the old address is genuinely free', () => {
  const lock = {
    products: { 'JD-NK-001': { slug: 'new-address', past: ['old-address'] } },
    images: {},
  };
  const live = [{ sku: 'JD-NK-001', slug: 'new-address', status: 'live' }];

  assert.deepEqual(buildRedirects(lock, live), {
    '/products/old-address/': '/products/new-address/',
  });
});

// ── S-6: archived ───────────────────────────────────────────────────────────────────────────

test('S-6 · an archived product still renders, marked archived', () => {
  const { products } = check([{ Status: 'archived' }]);
  const plan = planFor({ products });
  assert.equal(plan.archived.length, 1);
  assert.equal(products[0].archived, true);

  const markdown = renderProduct(products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' });
  assert.match(markdown, /^archived: true$/m);
});

// ── Hero: the one piece at the top of the homepage ──────────────────────────────────────────

test('Hero is read as a tick, separately from Featured', () => {
  const { products, issues } = check([{ Featured: '', Hero: 'TRUE' }]);
  assert.equal(issues.length, 0);
  assert.equal(products[0].hero, true);
  assert.equal(products[0].featured, false, 'Hero must not imply Featured');
});

test('an unticked Hero is false, not undefined', () => {
  const { products } = check([{}]);
  assert.equal(products[0].hero, false);
});

test('typing into the Hero column instead of ticking is an error naming the column', () => {
  const { issues } = check([{ Hero: 'yes please' }]);
  assertMessage(issues, 'Hero', 'not a tick or a blank');
});

test('two ticked Heroes warn and name the winner, but do not fail the run', () => {
  const { issues, warnings } = check([
    { 'Product Code': 'JD-NK-001', Hero: 'TRUE' },
    {
      'Product Code': 'JD-ER-002',
      'Product Name': 'Temple Lakshmi Jhumkas',
      Images: 'photo-b.jpg',
      Hero: 'TRUE',
    },
  ]);
  assert.equal(issues.length, 0, 'a second hero must never block a publish');
  const hero = warnings.filter((w) => w.includes('Hero ticked'));
  assert.equal(hero.length, 1);
  assert.match(hero[0], /JD-NK-001/);
  assert.match(hero[0], /JD-ER-002/);
});

test('a draft with Hero ticked does not count towards the warning', () => {
  const { warnings } = check([
    { 'Product Code': 'JD-NK-001', Hero: 'TRUE' },
    {
      'Product Code': 'JD-ER-002',
      'Product Name': 'Temple Lakshmi Jhumkas',
      Images: 'photo-b.jpg',
      Hero: 'TRUE',
      Status: 'draft',
    },
  ]);
  assert.equal(warnings.filter((w) => w.includes('Hero ticked')).length, 0);
});

test('hero is written to the markdown only when it is ticked', () => {
  const ticked = check([{ Hero: 'TRUE' }]);
  planFor(ticked);
  assert.match(
    renderProduct(ticked.products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' }),
    /^hero: true$/m,
  );

  // Absent rather than `hero: false` — every product file predates this column, and always
  // emitting the line would rewrite the whole catalogue on the next sync to say nothing.
  const unticked = check([{}]);
  planFor(unticked);
  assert.doesNotMatch(
    renderProduct(unticked.products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' }),
    /^hero:/m,
  );
});

test('S-7 · an over-long SEO Description is caught here, not by the build', () => {
  // content.config.ts caps this at 160. Without the check in the sync it passes validation, gets
  // committed, and takes the deploy down instead of telling the client to shorten a cell.
  const { issues } = check([{ 'SEO Description': 'x'.repeat(161) }]);
  assertMessage(issues, 'SEO Description is 161 characters; the maximum is 160');

  assert.equal(check([{ 'SEO Description': 'x'.repeat(160) }]).issues.length, 0, '160 is allowed');
});

// ── Sequence: the hand-set running order ────────────────────────────────────────────────────

test('Sequence is read as a number', () => {
  const { products, issues } = check([{ Sequence: '3' }]);
  assert.equal(issues.length, 0);
  assert.equal(products[0].sequence, 3);
});

test('a blank Sequence is undefined, not 0 — "no opinion" is not "first"', () => {
  const { products } = check([{}]);
  assert.equal(products[0].sequence, undefined);
});

test('S-7 · a Sequence that is not a whole number says what to type', () => {
  assertMessage(check([{ Sequence: 'first' }]).issues, 'Sequence is "first"', 'whole number of 1 or more');
  assertMessage(check([{ Sequence: '0' }]).issues, 'Sequence is "0"');
  assertMessage(check([{ Sequence: '2.5' }]).issues, 'Sequence is "2.5"');
});

test('sequence is written to the markdown only when it is set', () => {
  const numbered = check([{ Sequence: '2' }]);
  planFor(numbered);
  assert.match(
    renderProduct(numbered.products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' }),
    /^sequence: 2$/m,
  );

  const blank = check([{}]);
  planFor(blank);
  assert.doesNotMatch(
    renderProduct(blank.products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' }),
    /^sequence:/m,
  );
});

// ── S-1, S-2 and S-10: what gets written ────────────────────────────────────────────────────

test('the generated file carries the do-not-edit header', () => {
  const { products } = check([{}]);
  planFor({ products });
  const markdown = renderProduct(products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' });
  assert.match(markdown, /# GENERATED FROM THE GOOGLE SHEET — DO NOT EDIT\./);
  assert.match(markdown, /# To change this product, edit its row in the sheet\./);
});

test('a value that would break YAML is quoted', () => {
  const { products } = check([{ 'Product Name': 'Choker: The Sequel', Weight: '120' }]);
  planFor({ products });
  const markdown = renderProduct(products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' });
  assert.match(markdown, /^title: "Choker: The Sequel"$/m);
  assert.match(markdown, /^ {2}weight: "120"$/m);
});

test('S-11 · comparing two runs ignores syncedAt', () => {
  const { products } = check([{}]);
  planFor({ products });
  const a = renderProduct(products[0], { body: WORDS_40, syncedAt: '2026-08-13T00:00:00Z' });
  const b = renderProduct(products[0], { body: WORDS_40, syncedAt: '2027-01-01T00:00:00Z' });
  assert.notEqual(a, b);
  assert.equal(withoutSyncedAt(a), withoutSyncedAt(b));
});

test('S-11 · an unchanged product stages no file at all', async () => {
  const { products } = check([{}]);
  const plan = planFor({ products });
  const existing = renderProduct(products[0], { body: WORDS_40, syncedAt: '2020-01-01T00:00:00Z' });

  const repoProducts = new Map([
    [
      'JD-NK-001',
      {
        sku: 'JD-NK-001',
        slug: products[0].slug,
        dir: '/x',
        files: ['index.md', 'kundan-bridal-choker-set-1.jpg'],
        source: existing,
        hasCopyOverride: false,
      },
    ],
  ]);

  const staged = await stage({
    plan,
    products,
    repoProducts,
    imageBytes: new Map(),
    syncedAt: '2026-08-13T00:00:00Z',
  });

  assert.equal(staged.files.size, 0, 'nothing may be written when nothing changed');
  assert.equal(staged.deletions.length, 0);
  assert.equal(staged.unchangedProducts.length, 1);
});

test('S-2 · a price change rewrites exactly one file and re-downloads nothing', async () => {
  const before = check([{}]).products[0];
  const after = check([{ 'Selling Price': '2199' }]).products[0];

  const plan = planFor({ products: [after] });
  const existing = renderProduct(
    Object.assign(before, { slug: 'kundan-bridal-choker-set', archived: false, images: [{ src: './kundan-bridal-choker-set-1.jpg', alt: generateAlt(before, 0) }] }),
    { body: WORDS_40, syncedAt: '2020-01-01T00:00:00Z' },
  );

  const staged = await stage({
    plan,
    products: [after],
    repoProducts: new Map([
      [
        'JD-NK-001',
        {
          sku: 'JD-NK-001',
          slug: 'kundan-bridal-choker-set',
          dir: '/x',
          files: ['index.md', 'kundan-bridal-choker-set-1.jpg'],
          source: existing,
          hasCopyOverride: false,
        },
      ],
    ]),
    imageBytes: new Map(),
    syncedAt: '2026-08-13T00:00:00Z',
  });

  assert.equal(staged.files.size, 1);
  assert.ok([...staged.files.keys()][0].endsWith('index.md'));
  assert.match([...staged.files.values()][0], /^price: 2199$/m);
});

// These two run `flush` against a real directory rather than inspecting the plan, because both
// bugs they cover were in the *order* the filesystem was touched, which a plan cannot show.

test('a product moving into the address another is vacating survives the flush', async () => {
  // The regression that lost JD-ER-001 for two days. Codes were renumbered in the sheet, so one
  // product moved out of /temple-green-emerald-polki-earrings/ in the same run as another moved
  // in. Flushing writes before deletes threw the new page away seconds after writing it, and
  // the run still reported success.
  const root = await mkdtemp(join(tmpdir(), 'jadauco-swap-'));
  const shared = join(root, 'shared-address');
  await mkdir(shared, { recursive: true });
  await writeFile(join(shared, 'index.md'), 'the product that is moving out');

  await flush({
    files: new Map([[join(shared, 'index.md'), 'the product that is moving in']]),
    deletions: [shared], // vacated by its previous occupant in this same run
  });

  assert.equal(await readFile(join(shared, 'index.md'), 'utf8'), 'the product that is moving in');
  await rm(root, { recursive: true, force: true });
});

test('a rename that only changes case survives the flush', async () => {
  // macOS and Windows treat these as one folder under two names, so the delete of the old name
  // lands on the file just written under the new one. Linux does not, which is exactly why this
  // reached production: CI was green and the site lost three pages.
  const root = await mkdtemp(join(tmpdir(), 'jadauco-case-'));
  const oldDir = join(root, 'White-beaded-temple-earrings');
  const newDir = join(root, 'white-beaded-temple-earrings');
  await mkdir(oldDir, { recursive: true });
  await writeFile(join(oldDir, 'index.md'), 'old');

  await flush({
    files: new Map([[join(newDir, 'index.md'), 'new']]),
    deletions: [oldDir],
  });

  assert.equal(await readFile(join(newDir, 'index.md'), 'utf8'), 'new');
  await rm(root, { recursive: true, force: true });
});

test('a vacated folder nobody is moving into is deleted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jadauco-prune-'));
  const abandoned = join(root, 'old-address');
  await mkdir(abandoned, { recursive: true });
  await writeFile(join(abandoned, 'index.md'), 'gone');

  await flush({ files: new Map(), deletions: [abandoned] });

  assert.equal(existsSync(abandoned), false);
  await rm(root, { recursive: true, force: true });
});

// ── §5.2: generated alt text ────────────────────────────────────────────────────────────────

test('generated alt text describes the actual piece', () => {
  const { products } = check([{}]);
  assert.equal(
    generateAlt(products[0], 0),
    'Kundan Bridal Choker Set — 22k gold polish, Kundan and pearl',
  );
});

test('later photos of the same piece do not repeat one sentence', () => {
  const { products } = check([{}]);
  assert.match(generateAlt(products[0], 1), /\(view 2\)$/);
});

test('an images-tab row overrides the generated text', () => {
  const alt = 'Gold kundan bridal choker with pearl drops on a maroon background';
  const { products, issues } = check([{}], {
    imageRows: [{ __row: 2, sku: 'JD-NK-001', filename: 'photo-a.jpg', alt }],
  });
  assert.deepEqual(issues, []);
  assert.equal(products[0].altOverrides.get('photo-a.jpg'), alt);
});

test('an images-tab row for a photo the product does not use is rejected', () => {
  const { issues } = check([{}], {
    imageRows: [{ __row: 2, sku: 'JD-NK-001', filename: 'photo-b.jpg', alt: 'a'.repeat(30) }],
  });
  assertMessage(issues, '"photo-b.jpg" is not one of JD-NK-001\'s photos');
});

test('an images-tab row for an unknown product is rejected', () => {
  const { issues } = check([{}], {
    imageRows: [{ __row: 2, sku: 'JD-XX-999', filename: 'photo-a.jpg', alt: 'a'.repeat(30) }],
  });
  assertMessage(issues, 'is not a product');
});

// ── T-10: the sheet reader ──────────────────────────────────────────────────────────────────

test('a renamed header is reported by name, with what was found', () => {
  const csv = sheetCsv().replace('Product Code', 'SKU');
  assert.throws(
    () => parseTab(csv, PRODUCT_COLUMNS, ['Product Code'], 'products'),
    (err) => {
      assert.ok(err.message.includes('missing a column: "Product Code"'));
      assert.ok(err.hint.includes('Found:'));
      return true;
    },
  );
});

test('two columns with the same header are rejected rather than silently shadowed', () => {
  const csv = sheetCsv().replace('Weight,', 'Weight,Weight,').replace(/^(JD-.*)$/m, '$1,');
  assert.throws(() => parseTab(csv, PRODUCT_COLUMNS, [], 'products'), /more than one "Weight" column/);
});

test('filenames keep their spaces and brackets, and lose the padding around commas', () => {
  const rows = parseTab(
    sheetCsv([{ Images: '"a b(2).JPG , c.png "' }]).replace('"""', '"').replace('"""', '"'),
    PRODUCT_COLUMNS,
    [],
    'products',
  );
  assert.deepEqual(rows[0].images, ['a b(2).JPG', 'c.png']);
});

test('row numbers are the ones the client sees in the spreadsheet', () => {
  const rows = parseTab(sheetCsv([{}, {}, {}]), PRODUCT_COLUMNS, [], 'products');
  assert.deepEqual(rows.map((r) => r.__row), [2, 3, 4]);
});

test('a blank row between sections is not a product', () => {
  const csv = `${sheetCsv()}\n,,,,,,,,,,,,,,,,,,,,\n`;
  const rows = parseTab(csv, PRODUCT_COLUMNS, [], 'products');
  assert.equal(rows.length, 1);
});

// ── slugs ───────────────────────────────────────────────────────────────────────────────────

test('slugify produces clean, stable URLs', () => {
  assert.equal(slugify('Kundan Bridal Choker Set'), 'kundan-bridal-choker-set');
  assert.equal(slugify('Gold & Pearl Set (2026)'), 'gold-and-pearl-set-2026');
  assert.equal(slugify('  Trailing —  dashes  '), 'trailing-dashes');
});

// ── categories on disk ──────────────────────────────────────────────────────────────────────

test('category codes are read from the category files themselves', async () => {
  const categories = await loadCategories();
  assert.equal(categories.byCode.get('NK'), 'necklaces');
  assert.equal(categories.byCode.get('ER'), 'earrings');
  assert.equal(categories.byCode.get('PD'), 'pendants');
  assert.ok(categories.names.includes('bangles'));
});

test('a hidden category is not a category the sync will publish into', async () => {
  const categories = await loadCategories();
  // The files are still there — hidden, not deleted — so this is about the sync's view of them.
  assert.equal(categories.byCode.get('TK'), undefined);
  assert.equal(categories.byCode.get('PY'), undefined);
  assert.ok(!categories.names.includes('maang-tikka'));
  assert.ok(!categories.names.includes('payal'));
});
