/**
 * The Apps Script validator is a second implementation of `scripts/sync/schema.mjs`, and it runs
 * where neither we nor CI can see it. These tests exist so it cannot quietly drift out of
 * agreement with the real gate — because a client told "every row is good" who then watches the
 * publish fail has been actively misled, which is worse than having no check at all.
 *
 * `Code.gs` is loaded and executed as text, so what is tested is the exact file pasted into
 * the Apps Script editor — not a copy of its logic that could rot separately.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

import { parseTab, PRODUCT_COLUMNS } from '../sync/sheet.mjs';
import { validate } from '../sync/schema.mjs';

// ── load the real .gs file ──────────────────────────────────────────────────────────────────

const source = readFileSync(new URL('../../tools/apps-script/Code.gs', import.meta.url), 'utf8');
const sandbox = createContext({ Math, Date, Number, String, isNaN, RegExp });
runInContext(source, sandbox);

const { jadaucoCheckAll, jadaucoWordCount, jadaucoSplitList, DRIVE_FOLDER_ID } = sandbox;

/**
 * Values built inside the vm come from a different realm, so their arrays and objects have
 * different prototypes and `deepStrictEqual` rejects them however identical they look. This
 * round-trip brings them home; without it every structural assertion below fails on a
 * technicality rather than on the behaviour it is testing.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the .gs file loads without touching an Apps Script API at rule level', () => {
  assert.equal(typeof jadaucoCheckAll, 'function');
  assert.equal(typeof jadaucoWordCount, 'function');
});

test('the Drive folder id matches catalogue.config.json', () => {
  const config = JSON.parse(readFileSync(new URL('../../catalogue.config.json', import.meta.url), 'utf8'));
  assert.equal(
    DRIVE_FOLDER_ID,
    config.driveFolderId,
    'Validation.gs would check a different Drive folder than the sync downloads from',
  );
});

// ── fixtures ────────────────────────────────────────────────────────────────────────────────

const CONFIG = { skuRegex: /^JD-[A-Z]{2}-\d{3,}$/, minDescriptionWords: 40, requireAltText: false };
const CATEGORIES = {
  byCode: new Map([['NK', 'necklaces'], ['ER', 'earrings'], ['BG', 'bangles']]),
  names: ['bangles', 'earrings', 'necklaces'],
};
const DRIVE = ['photo-a.jpg', 'photo-b.jpg', 'IMG_9999.PNG'];

const WORDS_40 =
  'Handcrafted kundan bridal choker with matching jhumkas set on a brass base with a rich ' +
  'gold polish that catches light beautifully under wedding photography and keeps its shine ' +
  'through a long reception evening without tarnishing at all in normal everyday wear today.';

const BASE = {
  'Product Code': 'JD-NK-001',
  'Product Name': 'Kundan Bridal Choker Set',
  Status: 'live',
  'Selling Price': 2499,
  'List Price': 3999,
  'In Stock': true,
  Images: 'photo-a.jpg',
  'Base Metal': 'Brass',
  Finish: '22k gold polish',
  Stones: 'Kundan, pearl',
  'Set Includes': 'Necklace, earrings',
  'Earrings Included': true,
  Weight: '120g',
  Featured: true,
  Hero: false,
  Sequence: '',
  Tags: 'bridal, choker',
  'Publish Date': '2026-08-13',
  Description: WORDS_40,
  'Category override': '',
  'Slug override': '',
  'SEO Title': '',
  'SEO Description': '',
};

const COLUMNS = Object.keys(BASE);

/** Run the Apps Script rules. */
const scriptCheck = (records) => {
  const rows = records.map((r, i) => ({ ...r, __row: i + 2 }));
  const { results } = jadaucoCheckAll(rows, DRIVE);
  return rows.map((r) => results.find((res) => res.row === r.__row)?.problems ?? []);
};

/** Run the real sync validator over the same records. */
function syncCheck(records) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const cell = (v) => (v === true ? 'TRUE' : v === false ? 'FALSE' : v ?? '');
  const csv = [
    COLUMNS.join(','),
    ...records.map((rec) => COLUMNS.map((c) => q(cell(rec[c]))).join(',')),
  ].join('\n');

  const rows = parseTab(csv, PRODUCT_COLUMNS, ['Product Code'], 'products');
  const driveFiles = new Map(DRIVE.map((n) => [n, { name: n }]));
  const { issues } = validate({ rows, imageRows: [], config: CONFIG, categories: CATEGORIES, driveFiles });
  return records.map((_, i) => issues.filter((issue) => issue.row === i + 2));
}

/**
 * The safety property: **the script must never be more permissive than the sync.**
 *
 * The reverse is allowed. On a duplicate the sync attaches its error to the second row and points
 * back at the first, while the script flags both — which is the more useful behaviour when you
 * are looking at a grid of cells and want to see the pair.
 */
function assertNeverMorePermissive(records, label) {
  const script = scriptCheck(records);
  const sync = syncCheck(records);

  records.forEach((_, i) => {
    if (sync[i].length === 0) return;
    assert.notEqual(
      script[i].length,
      0,
      `${label}, row ${i + 2}: the sync rejects this row but the script calls it fine — ` +
        `the client would have been told it was good.\n  sync says: ${sync[i].map((s) => s.message).join(' · ')}`,
    );
  });

  assert.equal(
    script.some((p) => p.length > 0),
    sync.some((issues) => issues.length > 0),
    `${label}: the two validators disagree on whether this catalogue can publish.\n` +
      `  script: ${script.map((p) => p.map((x) => x.message).join(' · ') || '(ok)').join(' | ')}\n` +
      `  sync  : ${sync.map((i) => i.map((s) => s.message).join(' · ') || '(ok)').join(' | ')}`,
  );

  return script;
}

// ── parity ──────────────────────────────────────────────────────────────────────────────────

test('a good row is called good by both', () => {
  assert.deepEqual(plain(assertNeverMorePermissive([BASE], 'valid row')[0]), []);
});

test('an empty row is not a product to either', () => {
  assert.deepEqual(plain(scriptCheck([{ ...BASE, 'Product Code': '' }])[0]), []);
});

const BROKEN = [
  ['a malformed product code', { 'Product Code': 'NK-1' }],
  ['an unknown category code', { 'Product Code': 'JD-ZZ-001' }],
  ['a name that is too short', { 'Product Name': 'AB' }],
  ['a name that is too long', { 'Product Name': 'x'.repeat(71) }],
  ['an empty name', { 'Product Name': '' }],
  ['an unknown status', { Status: 'published' }],
  ['an empty status', { Status: '' }],
  ['a non-numeric selling price', { 'Selling Price': 'call us' }],
  ['a list price below the selling price', { 'Selling Price': 2499, 'List Price': 1999 }],
  ['a list price equal to the selling price', { 'Selling Price': 2499, 'List Price': 2499 }],
  ['a missing publish date', { 'Publish Date': '' }],
  ['an unreadable publish date', { 'Publish Date': 'last tuesday' }],
  ['a description under forty words', { Description: 'Nice necklace, very pretty.' }],
  ['no images on a live product', { Images: '' }],
  ['a photo that is not in Drive', { Images: 'nowhere.jpg' }],
  ['a photo whose case is wrong', { Images: 'img_9999.png' }],
  ['a fractional sequence', { Sequence: 2.5 }],
  ['a zero sequence', { Sequence: 0 }],
  ['an over-long SEO description', { 'SEO Description': 'x'.repeat(161) }],
];

for (const [label, patch] of BROKEN) {
  test(`both reject ${label}`, () => {
    const [problems] = assertNeverMorePermissive([{ ...BASE, ...patch }], label);
    assert.notEqual(problems.length, 0, 'the script must say something, not fail silently');
    assert.ok(problems[0].column, 'every problem names the column it belongs to');
    assert.ok(problems[0].message.length > 20, 'the message has to be usable on its own');
  });
}

const ALLOWED = [
  ['a blank list price', { 'List Price': '' }],
  ['a blank selling price — price on enquiry', { 'Selling Price': '' }],
  ['a blank sequence', { Sequence: '' }],
  ['a sequence of exactly 1', { Sequence: 1 }],
  ['an SEO description of exactly 160', { 'SEO Description': 'x'.repeat(160) }],
  ['a name of exactly 3 characters', { 'Product Name': 'Kad' }],
  ['a name of exactly 70 characters', { 'Product Name': 'x'.repeat(70) }],
  ['an archived product', { Status: 'archived' }],
  ['a real Date object from Sheets', { 'Publish Date': new Date('2026-08-13') }],
  ['a price a spreadsheet formatted with a comma', { 'Selling Price': '2,499' }],
  ['two photos on one product', { Images: 'photo-a.jpg, photo-b.jpg' }],
];

for (const [label, patch] of ALLOWED) {
  test(`both allow ${label}`, () => {
    const [problems] = assertNeverMorePermissive([{ ...BASE, ...patch }], label);
    assert.deepEqual(plain(problems), [], `expected no problems, got: ${problems.map((p) => p.message).join(' · ')}`);
  });
}

test('S-5 · a draft is exempt from the photo and description rules in both', () => {
  const draft = { ...BASE, Status: 'draft', Images: '', Description: 'Not written yet.' };
  assert.deepEqual(plain(assertNeverMorePermissive([draft], 'half-finished draft')[0]), []);
});

test('a duplicate product code is caught, and both rows are named', () => {
  const rows = [BASE, { ...BASE, 'Product Name': 'Another Choker', Images: 'photo-b.jpg' }];
  const script = assertNeverMorePermissive(rows, 'duplicate code');
  assert.ok(script[0].some((p) => /more than one row/.test(p.message)));
  assert.ok(script[1].some((p) => /more than one row/.test(p.message)));
});

test('a duplicate product name is caught — two pages cannot share one address', () => {
  const rows = [BASE, { ...BASE, 'Product Code': 'JD-NK-002', Images: 'photo-b.jpg' }];
  const script = assertNeverMorePermissive(rows, 'duplicate name');
  assert.ok(script[0].some((p) => p.column === 'Product Name'));
});

test('one photo on two products is caught', () => {
  const rows = [BASE, { ...BASE, 'Product Code': 'JD-NK-002', 'Product Name': 'Second Set' }];
  const script = assertNeverMorePermissive(rows, 'shared photo');
  assert.ok(script[0].some((p) => /also used by JD-NK-002/.test(p.message)));
});

// ── things only the script can do ───────────────────────────────────────────────────────────

test('a wrong-case filename names the file that is actually there', () => {
  const [problems] = scriptCheck([{ ...BASE, Images: 'img_9999.png' }]);
  assert.match(problems[0].message, /IMG_9999\.PNG/);
  assert.match(problems[0].message, /capitals/i);
});

test('without the Drive listing, photo names are skipped rather than wrongly rejected', () => {
  const rows = [{ ...BASE, Images: 'anything-at-all.jpg', __row: 2 }];
  const { results } = jadaucoCheckAll(rows, null);
  assert.deepEqual(plain(results), [], 'an unreadable Drive folder must not invent errors');
});

test('a second live Hero warns without blocking', () => {
  const rows = [
    { ...BASE, Hero: true, __row: 2 },
    { ...BASE, 'Product Code': 'JD-ER-002', 'Product Name': 'Jhumkas', Images: 'photo-b.jpg', Hero: true, __row: 3 },
  ];
  const { results, warnings } = jadaucoCheckAll(rows, DRIVE);
  assert.deepEqual(plain(results), [], 'a second hero must never block a publish');
  assert.equal(warnings.filter((w) => /Hero ticked/.test(w)).length, 1);
});

test('a draft hero does not count towards the warning', () => {
  const rows = [
    { ...BASE, Hero: true, __row: 2 },
    { ...BASE, 'Product Code': 'JD-ER-002', 'Product Name': 'Jhumkas', Images: 'photo-b.jpg', Hero: true, Status: 'draft', __row: 3 },
  ];
  const { warnings } = jadaucoCheckAll(rows, DRIVE);
  assert.equal(warnings.filter((w) => /Hero ticked/.test(w)).length, 0);
});

test('photos in Drive that nothing uses are reported as a warning, not an error', () => {
  const { results, warnings } = jadaucoCheckAll([{ ...BASE, __row: 2 }], DRIVE);
  assert.deepEqual(plain(results), []);
  assert.ok(warnings.some((w) => /used by no product/.test(w)));
});

// ── the small helpers ───────────────────────────────────────────────────────────────────────

test('word count matches the sync on the awkward cases', () => {
  assert.equal(jadaucoWordCount(''), 0);
  assert.equal(jadaucoWordCount('   '), 0);
  assert.equal(jadaucoWordCount('one'), 1);
  assert.equal(jadaucoWordCount('  two   words  '), 2);
  assert.equal(jadaucoWordCount('line\nbreaks\tcount'), 3);
  assert.equal(jadaucoWordCount(WORDS_40), 42);
});

test('the images list splits and trims the way the sync does', () => {
  assert.deepEqual(plain(jadaucoSplitList('a.jpg, b.jpg')), ['a.jpg', 'b.jpg']);
  assert.deepEqual(plain(jadaucoSplitList('a.jpg,,b.jpg')), ['a.jpg', 'b.jpg']);
  assert.deepEqual(plain(jadaucoSplitList('  ')), []);
  assert.deepEqual(plain(jadaucoSplitList('')), []);
});

test('Hero counts whether it is a tick box or the text a CSV import leaves behind', () => {
  const two = (heroValue) => [
    { ...BASE, Hero: heroValue, __row: 2 },
    { ...BASE, 'Product Code': 'JD-ER-002', 'Product Name': 'Jhumkas', Images: 'photo-b.jpg', Hero: heroValue, __row: 3 },
  ];
  for (const value of [true, 'TRUE', 'true']) {
    const { warnings } = jadaucoCheckAll(two(value), DRIVE);
    assert.equal(
      warnings.filter((w) => /Hero ticked/.test(w)).length,
      1,
      `Hero as ${JSON.stringify(value)} should have counted`,
    );
  }
  for (const value of [false, 'FALSE', '']) {
    const { warnings } = jadaucoCheckAll(two(value), DRIVE);
    assert.equal(warnings.filter((w) => /Hero ticked/.test(w)).length, 0);
  }
});

test('every menu item points at a function that exists in the same file', () => {
  // "Script function not found: checkCatalogue" is what a menu entry whose target lives in a
  // file nobody pasted looks like from the client's side. One file, and this test, is the fix.
  const targets = [...source.matchAll(/\.addItem\('[^']*',\s*'([^']+)'\)/g)].map((m) => m[1]);
  const defined = new Set([...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]));

  assert.ok(targets.length >= 6, `expected the whole menu, found ${targets.length} items`);
  for (const target of targets) {
    assert.ok(defined.has(target), `the Jadauco menu calls ${target}(), which is not defined in Code.gs`);
  }
  assert.ok(defined.has('setUp'), 'setUp is what the client runs to grant permissions');
  assert.ok(defined.has('onOpen'), 'onOpen is what builds the menu');
});

// ── how the marks get painted ───────────────────────────────────────────────────────────────
// Per-cell setBackground/setNote is one round trip to Google each, and it is what made the first
// version take minutes. These tests fail if anyone reintroduces it.

/** Records every call the script makes against the spreadsheet. */
function fakeSheet() {
  const calls = [];
  const range = {
    setBackgrounds: (grid) => { calls.push({ fn: 'setBackgrounds', grid }); return range; },
    setNotes: (grid) => { calls.push({ fn: 'setNotes', grid }); return range; },
    setBackground: (v) => { calls.push({ fn: 'setBackground', v }); return range; },
    setNote: (v) => { calls.push({ fn: 'setNote', v }); return range; },
    clearNote: () => { calls.push({ fn: 'clearNote' }); return range; },
  };
  return {
    calls,
    sheet: { getRange: (...args) => { calls.push({ fn: 'getRange', args }); return range; } },
  };
}

const paintFixture = (problemsByRow = {}) => {
  const headers = ['Product Code', 'Product Name', 'Status', 'Images'];
  const rows = [{ __row: 2 }, { __row: 3 }, { __row: 4 }];
  const results = Object.entries(problemsByRow).map(([row, problems]) => ({ row: Number(row), problems }));
  return { headers, rows, report: { results, warnings: [] } };
};

test('marks are painted in exactly two writes, however many faults there are', () => {
  const { calls, sheet } = fakeSheet();
  const { headers, rows, report } = paintFixture({
    2: [{ column: 'Product Code', message: 'bad code' }, { column: 'Images', message: 'no photos' }],
    4: [{ column: 'Status', message: 'bad status' }],
  });

  sandbox.jadaucoPaintMarks({ sheet, headers, rows }, report);

  const writes = calls.filter((c) => c.fn !== 'getRange');
  assert.deepEqual(writes.map((w) => w.fn), ['setBackgrounds', 'setNotes']);
  assert.equal(calls.filter((c) => c.fn === 'getRange').length, 1, 'one getRange, not one per cell');
  assert.equal(calls.filter((c) => c.fn === 'setBackground' || c.fn === 'setNote').length, 0);
});

test('the painted grid marks the right cells and leaves the rest untouched', () => {
  const { calls, sheet } = fakeSheet();
  const { headers, rows, report } = paintFixture({
    2: [{ column: 'Product Code', message: 'bad code' }],
    4: [{ column: 'Status', message: 'bad status' }],
  });

  sandbox.jadaucoPaintMarks({ sheet, headers, rows }, report);
  const bg = plain(calls.find((c) => c.fn === 'setBackgrounds').grid);
  const notes = plain(calls.find((c) => c.fn === 'setNotes').grid);

  assert.equal(bg.length, 3, 'one grid row per catalogue row');
  assert.equal(bg[0].length, headers.length, 'one grid column per header');

  assert.equal(bg[0][0], '#f4c7c3');   // row 2, Product Code
  assert.equal(notes[0][0], 'bad code');
  assert.equal(bg[2][2], '#f4c7c3');   // row 4, Status
  assert.equal(notes[2][2], 'bad status');

  // A clean row must come back as null, not white — the client's own colour bands live there.
  assert.deepEqual(bg[1], [null, null, null, null]);
  assert.deepEqual(notes[1], ['', '', '', '']);
});

test('two faults on one cell are joined, not silently dropped', () => {
  const { calls, sheet } = fakeSheet();
  const { headers, rows, report } = paintFixture({
    2: [
      { column: 'Product Code', message: 'first problem' },
      { column: 'Product Code', message: 'second problem' },
    ],
  });

  sandbox.jadaucoPaintMarks({ sheet, headers, rows }, report);
  const note = plain(calls.find((c) => c.fn === 'setNotes').grid)[0][0];
  assert.match(note, /first problem/);
  assert.match(note, /second problem/);
});

test('clearing paints an empty grid rather than skipping the write', () => {
  const { calls, sheet } = fakeSheet();
  const { headers, rows } = paintFixture();

  sandbox.jadaucoPaintMarks({ sheet, headers, rows }, null);
  const bg = plain(calls.find((c) => c.fn === 'setBackgrounds').grid);
  assert.deepEqual(bg, [[null, null, null, null], [null, null, null, null], [null, null, null, null]]);
});

test('trailing rows that only carry validation are not read as products', () => {
  // Tick boxes and the Status dropdown are applied to whole columns, which is enough to make
  // Sheets call a thousand rows "data". Reading and painting all of them is work about nothing.
  const headers = ['Product Code', 'Product Name', 'Status'];
  const values = [headers, ['JD-NK-001', 'Choker', 'live'], ['JD-ER-001', 'Jhumkas', 'live']];
  for (let i = 0; i < 997; i++) values.push(['', '', '']);

  sandbox.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => (name === 'catalogue'
        ? { getDataRange: () => ({ getValues: () => values }) }
        : null),
    }),
  };

  const data = sandbox.jadaucoReadCatalogue();
  assert.equal(data.rows.length, 2, `expected 2 products, read ${data.rows.length} rows`);
  assert.deepEqual(plain(data.rows).map((r) => r.__row), [2, 3]);
});

test('a missing catalogue tab fails with a sentence naming the fix', () => {
  sandbox.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheetByName: () => null }),
  };
  assert.throws(() => sandbox.jadaucoReadCatalogue(), /no tab called "catalogue"/);
});
