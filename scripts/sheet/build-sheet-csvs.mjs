#!/usr/bin/env node
/**
 * Build the importable CSVs for the two tabs of the catalogue sheet.
 *
 * `node scripts/sheet/build-sheet-csvs.mjs`
 *
 * Kept as a script rather than three hand-edited CSVs because the instructions tab describes the
 * catalogue tab column by column: edit one by hand and the other goes stale silently. Here the
 * column list has one home, and `Category (auto)` derives its formula from it.
 *
 * Validation lives in `tools/apps-script/Validation.gs`, not in a column here. A formula could
 * never see the Drive folder, which is where the mistakes that actually cost a publish are.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'doc/sheet';

/** CSV field quoting. */
const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (rows) => rows.map((r) => r.map(q).join(',')).join('\n') + '\n';

// ── the catalogue tab ───────────────────────────────────────────────────────────────────────

export const COLUMNS = [
  'Product Code',
  'Category (auto)',
  'Product Name',
  'Status',
  'Selling Price',
  'List Price',
  'In Stock',
  'Images',
  'Base Metal',
  'Finish',
  'Stones',
  'Set Includes',
  'Earrings Included',
  'Weight',
  'Featured',
  'Hero',
  'Sequence',
  'Tags',
  'Publish Date',
  'Description',
  'Category override',
  'Slug override',
  'SEO Title',
  'SEO Description',
];

/** Spreadsheet letter for a header, so the formulas below never hard-code a column. */
const col = (name) => {
  const i = COLUMNS.indexOf(name);
  if (i === -1) throw new Error(`no such column: ${name}`);
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// Must match the non-hidden files in src/content/categories/ — those own the mapping (§5.1.1),
// and this is the copy the spreadsheet shows the client. TK maang tikka and PY payal are
// hidden while they are not stocked, so they are deliberately absent: typing JD-TK-001 should
// read "⚠ unknown code" in the sheet, exactly as the sync will reject it.
const CATEGORY_CODES = [
  ['NK', 'Necklaces'],
  ['ER', 'Earrings'],
  ['BG', 'Bangles'],
  ['RG', 'Rings'],
  ['PD', 'Pendants'],
];

const UNKNOWN_CODE = '⚠ unknown code';

/** Shows what the product code just decided, so a mistyped code is visible immediately. */
export const buildCategoryFormula = (r) => {
  const a = `${col('Product Code')}${r}`;
  const pairs = CATEGORY_CODES.map(([code, name]) => `"${code}","${name}"`).join(',');
  return `=IF(${a}="","",SWITCH(MID(${a},4,2),${pairs},"${UNKNOWN_CODE}"))`;
};

/** Turn a plain record into a row, filling the two formula columns for its sheet row number. */
function row(record, r) {
  return COLUMNS.map((name) => {
    if (name === 'Category (auto)') return buildCategoryFormula(r);
    return record[name] ?? '';
  });
}

const DESCRIPTIONS = {
  necklace:
    'Handcrafted kundan bridal choker with matching jhumkas, set on a brass base with a rich ' +
    '22k gold polish. The pearl drop fringe catches light beautifully under wedding photography. ' +
    'An adjustable dori at the back gives a free size fit, and the anti-tarnish finish keeps it ' +
    'looking new through a long reception evening.',
  earrings:
    'Temple style gold plated jhumkas with a Lakshmi motif and small pearl drops along the rim. ' +
    'Light enough to wear through a full day of festivities, with secure push-back fittings. The ' +
    'oxidised detailing sits beautifully against silk sarees and traditional cotton weaves alike, ' +
    'making these an easy everyday festival piece.',
  bangles:
    'A set of four gold polished bangles with cubic zirconia stone work running along the outer ' +
    'edge. Sold as a set and sized 2.6, they stack neatly with plain kadas or can be worn on ' +
    'their own. The brass base is coated to resist tarnishing through regular wear.',
};

/** The template: invented products, every cell filled, so each column shows its own shape. */
const TEMPLATE = [
  {
    'Product Code': 'JD-NK-001', 'Product Name': 'Kundan Bridal Choker Set', Status: 'live',
    'Selling Price': '2499', 'List Price': '3999', 'In Stock': 'TRUE',
    Images: 'JD-NK-001-1.jpg, JD-NK-001-2.jpg, JD-NK-001-3.jpg',
    'Base Metal': 'Brass', Finish: '22k gold polish', Stones: 'Kundan, pearl',
    'Set Includes': 'Necklace, 1 pair earrings, maang tikka', 'Earrings Included': 'TRUE',
    Weight: '120g', Featured: 'TRUE', Hero: 'TRUE', Sequence: '1',
    Tags: 'bridal, choker, party wear', 'Publish Date': '2026-08-13',
    Description: DESCRIPTIONS.necklace,
    'Category override': 'necklaces', 'Slug override': 'kundan-bridal-choker-set',
    'SEO Title': 'Kundan Bridal Choker Set with Earrings and Maang Tikka',
    'SEO Description':
      'Handcrafted kundan choker with jhumkas and maang tikka. Brass base, 22k gold polish, ' +
      'adjustable dori. Dispatched in 2-5 days.',
  },
  {
    'Product Code': 'JD-ER-001', 'Product Name': 'Temple Lakshmi Jhumkas', Status: 'live',
    'Selling Price': '899', 'List Price': '1299', 'In Stock': 'TRUE',
    Images: 'JD-ER-001-1.jpg, JD-ER-001-2.jpg',
    'Base Metal': 'Brass', Finish: 'Antique gold with oxidised detail',
    Stones: 'Pearl, synthetic ruby', 'Set Includes': '1 pair earrings',
    'Earrings Included': 'TRUE', Weight: '28g', Featured: 'TRUE', Hero: 'FALSE', Sequence: '2',
    Tags: 'temple, jhumka, festive', 'Publish Date': '2026-08-13',
    Description: DESCRIPTIONS.earrings,
    'Category override': 'earrings', 'Slug override': 'temple-lakshmi-jhumkas',
    'SEO Title': 'Temple Lakshmi Jhumkas in Antique Gold Finish',
    'SEO Description':
      'Temple style jhumkas with a Lakshmi motif and pearl drops. Nickel-free push-back ' +
      'fittings, 28g the pair. Dispatched in 2-5 days.',
  },
  {
    'Product Code': 'JD-BG-001', 'Product Name': 'CZ Stone Bangle Set of Four', Status: 'draft',
    'Selling Price': '1450', 'List Price': '1899', 'In Stock': 'TRUE',
    Images: 'JD-BG-001-1.jpg, JD-BG-001-2.jpg',
    'Base Metal': 'Brass', Finish: 'Gold polish', Stones: 'Cubic zirconia',
    'Set Includes': 'Set of 4 bangles', 'Earrings Included': 'FALSE', Weight: '95g',
    Featured: 'FALSE', Hero: 'FALSE', Sequence: '3',
    Tags: 'bangles, stackable, everyday', 'Publish Date': '2026-08-13',
    Description: DESCRIPTIONS.bangles,
    'Category override': 'bangles', 'Slug override': 'cz-stone-bangle-set-of-four',
    'SEO Title': 'CZ Stone Bangles, Set of Four in Gold Polish',
    'SEO Description':
      'Four gold polished bangles with cubic zirconia edging, sized 2.6. Brass base with an ' +
      'anti-tarnish coat. Dispatched in 2-5 days.',
  },
];

/** The live catalogue, in the sheet's own row order. Real prices, real Drive filenames. */
const CURRENT = [
  {
    'Product Code': 'JD-ER-001', 'Product Name': 'Temple Lakshmi Jhumkas', Status: 'live',
    'Selling Price': '4000', 'List Price': '6000', 'In Stock': 'TRUE',
    Images: '76B37786-C0C2-471E-B8FF-16CB693576CB.png',
    'Base Metal': 'Brass', Finish: 'Antique gold with oxidised detail',
    Stones: 'Pearl, synthetic ruby', 'Set Includes': '1 pair earrings',
    'Earrings Included': 'TRUE', Weight: '28g', Featured: 'TRUE', Hero: 'TRUE', Sequence: '1',
    Tags: 'temple, jhumka, festive', 'Publish Date': '2026-08-13',
    Description: DESCRIPTIONS.earrings,
    'Category override': 'earrings', 'Slug override': 'temple-lakshmi-jhumkas',
    'SEO Title': 'Temple Lakshmi Jhumkas in Antique Gold Finish',
    'SEO Description':
      'Temple style jhumkas with a Lakshmi motif and pearl drops. Brass, antique gold with ' +
      'oxidised detail, 28g the pair. Dispatched in 2-5 days.',
  },
  {
    'Product Code': 'JD-BG-001', 'Product Name': 'CZ Stone Bangle Set of Four', Status: 'draft',
    'Selling Price': '1450',
    // Left blank deliberately: a struck-through "was" price is a claim about the shop's own
    // pricing, not a formatting example, so it is not ours to invent.
    'List Price': '',
    'In Stock': 'TRUE',
    Images: '5CEC5331-B97E-494C-87DF-5B5AEDC3AF6F Copy(2).JPG',
    'Base Metal': 'Brass', Finish: 'Gold polish', Stones: 'Cubic zirconia',
    'Set Includes': 'Set of 4 bangles', 'Earrings Included': 'FALSE', Weight: '95g',
    Featured: 'FALSE', Hero: 'FALSE', Sequence: '3',
    Tags: 'bangles, stackable, everyday', 'Publish Date': '2026-08-13',
    Description: DESCRIPTIONS.bangles,
    'Category override': 'bangles', 'Slug override': 'cz-stone-bangle-set-of-four',
    'SEO Title': 'CZ Stone Bangles, Set of Four in Gold Polish',
    'SEO Description':
      'Four gold polished bangles with cubic zirconia edging, sized 2.6. Brass base, ' +
      'anti-tarnish coat, 95g. Dispatched in 2-5 days.',
  },
  {
    'Product Code': 'JD-NK-001', 'Product Name': 'Kundan Bridal Choker Set', Status: 'live',
    'Selling Price': '1800', 'List Price': '3999', 'In Stock': 'TRUE',
    Images: 'DD5AE623-EDBC-4032-9B60-ED4E34799653.png',
    'Base Metal': 'Brass', Finish: 'Antique gold with oxidised detail',
    Stones: 'Kundan, pearl', 'Set Includes': 'Necklace, 1 pair earrings, maang tikka',
    'Earrings Included': 'TRUE', Weight: '120g', Featured: 'FALSE', Hero: 'FALSE', Sequence: '2',
    Tags: 'bridal, choker, party wear', 'Publish Date': '2026-08-13',
    Description: DESCRIPTIONS.necklace,
    'Category override': 'necklaces', 'Slug override': 'kundan-bridal-choker-set',
    'SEO Title': 'Kundan Bridal Choker Set with Earrings and Maang Tikka',
    'SEO Description':
      'Kundan bridal choker with jhumkas and maang tikka. Brass base, antique gold finish, ' +
      'adjustable dori, 120g. Dispatched in 2-5 days.',
  },
];

// ── the instructions tab ────────────────────────────────────────────────────────────────────

/**
 * The instructions tab, four columns wide: what the column is called, whether the client types in
 * it at all, what it means, and one real example. The second column is the one that matters —
 * "who fills this in" is the question a spreadsheet never answers on its own.
 */
const BLANK = ['', '', '', ''];
const TITLE = (t) => [t, '', '', ''];
const HEAD = () => ['Column', 'Do you fill it in?', 'What it means, and what to type', 'Example'];
const R = (col, who, what, example) => [col, who, what, example ?? ''];
const NOTE = (t) => [t, '', '', ''];

const TYPE = 'Yes — type it';
const TICK = 'Yes — tick box';
const PICK = 'Yes — pick from list';
const AUTO = 'NO — automatic';
const RARE = 'Usually leave empty';

const INSTRUCTIONS = [
  TITLE('JADAUCO CATALOGUE — WHAT EVERY COLUMN MEANS'),
  BLANK,

  TITLE('THE TWO TABS'),
  R('catalogue', '', 'Every product, one per row. The only tab the website reads.', ''),
  R('instructions', '', 'This tab. Notes only — the website ignores it completely.', ''),
  BLANK,

  TITLE('HOW TO ADD A PRODUCT'),
  R('1', '', 'Put the photos in the Drive folder.', ''),
  R('2', '', 'Add one row in the catalogue tab. Work left to right.', ''),
  R('3', '', 'Jadauco menu → Check the catalogue. It marks any cell that is wrong in red.', ''),
  R('4', '', 'Hover a red cell to read what is wrong with it. Fix, and check again.', ''),
  R('5', '', 'Jadauco menu → Publish to the website. Live in about four minutes.', ''),
  BLANK,

  TITLE('THE ONE COLUMN YOU NEVER TYPE IN'),
  HEAD(),
  R('Category (auto)', AUTO, 'Shows which category the Product Code just chose, so you can see it is right. Says "unknown code" if the two letters are not a real category. Do not type here.', 'Necklaces'),
  NOTE('If you overwrite it by mistake: copy the cell above it and paste it back down.'),
  BLANK,

  TITLE('EVERY PRODUCT NEEDS THESE'),
  HEAD(),
  R('Product Code', TYPE, 'JD, then two letters for the category, then three or more digits. Must be unique. Once a product has published, NEVER change it — it is that product\'s identity.', 'JD-NK-001'),
  R('Product Name', TYPE, 'What a customer would call it. Becomes the page heading and the web address, so write it properly.', 'Kundan Bridal Choker Set'),
  R('Status', PICK, 'live = on the site. draft = hidden, still being worked on. archived = discontinued, page kept alive for its Google ranking.', 'live'),
  R('Images', TYPE, 'The photo filenames from Drive, separated by commas, in the order they should appear. The first is the main photo. Must match Drive exactly, capital letters included.', 'JD-NK-001-1.jpg, JD-NK-001-2.jpg'),
  R('Publish Date', TYPE, 'The date the piece went on sale. Used for New arrivals.', '2026-08-13'),
  R('Description', TYPE, 'At least 40 words. The biggest single thing deciding whether Google finds this page. Write about the piece — the stones, the occasion, how it wears.', 'Handcrafted kundan bridal choker with matching jhumkas, set on a brass base…'),
  BLANK,

  TITLE('PRICE AND STOCK'),
  HEAD(),
  R('Selling Price', TYPE, 'What the customer pays. Plain number — no rupee sign, no commas. Leave empty and the page says "Price on enquiry".', '2499'),
  R('List Price', TYPE, 'The crossed-out "was" price. Must be HIGHER than Selling Price. Leave empty for no crossed-out price. The discount percentage is worked out for you.', '3999'),
  R('In Stock', TICK, 'Ticked = orderable. Unticked = the page stays up but shows "Sold out" and hides the WhatsApp button.', 'TRUE'),
  BLANK,

  TITLE('SPECIFICATION — fill what applies, leave the rest empty'),
  HEAD(),
  R('Base Metal', TYPE, 'What the piece is made of. Becomes a line in the specification table.', 'Brass'),
  R('Finish', TYPE, 'The plating or polish.', 'Antique gold with oxidised detail'),
  R('Stones', TYPE, 'Comma separated.', 'Kundan, pearl'),
  R('Set Includes', TYPE, 'What is actually in the box.', 'Necklace, 1 pair earrings, maang tikka'),
  R('Earrings Included', TICK, 'Ticked adds an "Earrings: Included" line to the specification table.', 'TRUE'),
  R('Weight', TYPE, 'With the unit.', '120g'),
  BLANK,

  TITLE('WHERE IT APPEARS ON THE SITE'),
  HEAD(),
  R('Featured', TICK, 'Puts it in the strip down the homepage, "On the tray this week". Tick as many as you like — the six newest show.', 'TRUE'),
  R('Hero', TICK, 'Tick ONE piece only. It stands in the ring at the very top of the homepage. If two are ticked the publish report warns you and uses the higher row. If none are ticked the newest featured piece is used.', 'TRUE'),
  R('Sequence', TYPE, 'The running order, lowest first. Number ONLY the pieces you want at the top — 1, 2, 3. Empty means "no opinion" and the piece falls in behind the numbered ones, newest first.', '1'),
  R('Tags', TYPE, 'Comma separated. Drives "You may also like" and the filter buttons.', 'bridal, choker, party wear'),
  BLANK,

  TITLE('THE LAST FOUR — almost always empty'),
  HEAD(),
  R('Category override', RARE, 'Forces a different category. Only needed when a piece that has ALREADY published belongs somewhere else — you cannot fix the Product Code, because a new code reads as a new product and loses the page.', 'bangles'),
  R('Slug override', RARE, 'Sets the web address by hand. Only works BEFORE a product first publishes; after that the address is frozen and this is ignored.', 'kundan-bridal-choker-set'),
  R('SEO Title', RARE, 'Empty gives "Product Name | Jadauco", which is fine. Fill it only for a piece you are deliberately trying to rank on Google.', 'Kundan Bridal Choker Set with Earrings and Maang Tikka'),
  R('SEO Description', RARE, 'Empty uses the first 158 characters of your Description, which is fine. Maximum 160 characters if you do fill it.', 'Handcrafted kundan choker with jhumkas and maang tikka. Brass base, 22k gold polish.'),
  BLANK,

  TITLE('THE CATEGORY CODES — the two letters in the Product Code'),
  ['Code', 'Category', '', ''],
  ...CATEGORY_CODES.map(([code, name]) => [code, name, '', '']),
  BLANK,

  TITLE('CHECKING BEFORE YOU PUBLISH'),
  NOTE('Jadauco menu → Check the catalogue. It runs the same rules the publish runs, and it can'),
  NOTE('read the Drive folder, so it catches the photo mistakes too:'),
  NOTE('  · a filename in Images that is not actually in Drive — it names the file that IS there'),
  NOTE('  · the same photo used by two different products'),
  NOTE('  · a photo sitting in Drive that no row uses'),
  NOTE('Every cell at fault turns red with the reason in a note. Hover to read it.'),
  NOTE('Jadauco menu → Clear the check marks removes the red once you are done.'),
  NOTE('A clean check means the publish will go through. That is the whole point of it.'),
  BLANK,

  TITLE('NEVER DO THESE'),
  NOTE('· Never change a Product Code once it has published.'),
  NOTE('· Never rename a column header — the website finds columns by their exact text.'),
  NOTE('· Never move the headers off row 1.'),
  NOTE('· Never type in Category (auto) — it is worked out for you.'),
  NOTE('· Renaming a product changes its heading, never its web address. That is deliberate — it protects the Google ranking.'),
  NOTE('· This sheet is readable by anyone with the link. No cost prices, no supplier names, no customer data.'),
];

// ── write ───────────────────────────────────────────────────────────────────────────────────

function write(name, rows) {
  const path = join(OUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, csv(rows));
  console.log(`  ${path}  (${rows.length} rows × ${rows[0].length} cols)`);
}

const catalogue = (records) => [COLUMNS, ...records.map((rec, i) => row(rec, i + 2))];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('written:');
  write('catalogue-tab-TEMPLATE.csv', catalogue(TEMPLATE));
  write('catalogue-tab-CURRENT.csv', catalogue(CURRENT));
  write('instructions-tab.csv', INSTRUCTIONS);
}
