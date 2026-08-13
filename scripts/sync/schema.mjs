/**
 * T-11 — validate the sheet rows. This is the gate that keeps a bad spreadsheet edit out of git.
 *
 * Every message here is written for Meera, not for us: it names the row she can see, the
 * product code she recognises, the value she typed, and what to do about it. That is the whole
 * of S-7, and it is a writing job as much as a coding one.
 *
 * Nothing in this file writes anything. It returns errors, and the caller decides.
 */

import { readdir, readFile } from 'node:fs/promises';
import { PATHS } from './config.mjs';

export const STATUSES = ['live', 'draft', 'archived'];

/** One thing wrong with one row. `field` is the client-facing column header. */
export class RowIssue {
  constructor({ row, sku, field, message, hint }) {
    Object.assign(this, { row, sku, field, message, hint });
  }
}

const list = (items) => items.map((i) => `"${i}"`).join(', ');
const countWords = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * Turn a product name into a URL slug. Only ever used for a product that has never been
 * published — once a slug is in the lock file it is frozen (§5.1.2).
 */
export function slugify(title) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Read the category files and their codes. Each category owns its own code (§5.1.1), so this
 * is the only place the code → category mapping comes from.
 */
export async function loadCategories(dir = PATHS.categories) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return { byCode: new Map(), names: [] };
  }

  const byCode = new Map();
  const names = [];

  for (const entry of entries.filter((e) => e.endsWith('.md'))) {
    const name = entry.replace(/\.md$/, '');
    names.push(name);
    const source = await readFile(`${dir}/${entry}`, 'utf8');
    const code = source.match(/^code:\s*["']?([A-Za-z]{2})["']?\s*$/m)?.[1];
    if (code) byCode.set(code.toUpperCase(), name);
  }

  return { byCode, names: names.sort() };
}

/** A price cell: blank is allowed and meaningful, text is not. */
function parsePrice(raw, { row, sku, field }, issues) {
  if (!raw) return undefined;
  // Tolerate what a spreadsheet produces — ₹2,499 or 2499.00 — but not "call us".
  const cleaned = raw.replace(/[₹,\s]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    issues.push(
      new RowIssue({
        row,
        sku,
        field,
        message: `${field} is "${raw}", which is not a number`,
        hint: `Type just the digits, like 2499. To show "Price on enquiry" instead, leave ${field} empty.`,
      }),
    );
    return undefined;
  }
  return value;
}

function parseDate(raw, { row, sku }, issues) {
  if (!raw) {
    issues.push(
      new RowIssue({
        row,
        sku,
        field: 'Publish Date',
        message: 'Publish Date is empty',
        hint: 'Type the date the piece went on sale, as YYYY-MM-DD — for example 2026-08-13.',
      }),
    );
    return undefined;
  }

  // Sheets may hand back DD/MM/YYYY depending on the file's locale.
  const slashed = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = slashed ? `${slashed[3]}-${slashed[2].padStart(2, '0')}-${slashed[1].padStart(2, '0')}` : raw;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    issues.push(
      new RowIssue({
        row,
        sku,
        field: 'Publish Date',
        message: `Publish Date is "${raw}", which is not a date`,
        hint: 'Use YYYY-MM-DD — for example 2026-08-13.',
      }),
    );
    return undefined;
  }
  return date;
}

/**
 * Validate one row and normalise it.
 * A `draft` row is deliberately let through with almost nothing checked (S-5): a draft is
 * allowed to be half-finished, that is what makes it a draft.
 */
function validateRow(raw, { config, categories, driveFiles }, issues) {
  const row = raw.__row;
  const sku = raw.sku ?? '';
  const at = (field) => ({ row, sku, field });

  if (!sku) {
    issues.push(
      new RowIssue({
        ...at('Product Code'),
        message: 'Product Code is empty',
        hint: 'Every product needs a code like JD-NK-014. Delete the row if it is not a product.',
      }),
    );
    return null;
  }

  if (!config.skuRegex.test(sku)) {
    issues.push(
      new RowIssue({
        ...at('Product Code'),
        message: `Product Code "${sku}" is not in the right format`,
        hint: 'Codes look like JD-NK-014 — JD, then two capital letters for the category, then at least three digits.',
      }),
    );
  }

  const status = (raw.status || '').toLowerCase();
  if (!STATUSES.includes(status)) {
    issues.push(
      new RowIssue({
        ...at('Status'),
        message: `Status is "${raw.status}", which is not one of ${list(STATUSES)}`,
        hint: 'Pick one from the dropdown: live puts it on the site, draft hides it, archived keeps the page but takes it out of the grids.',
      }),
    );
    return null;
  }

  // Category comes from the code (§5.1.1), unless the row overrides it.
  const code = sku.split('-')[1]?.toUpperCase() ?? '';
  let category = raw.category?.toLowerCase() || categories.byCode.get(code);

  if (raw.category && !categories.names.includes(raw.category.toLowerCase())) {
    issues.push(
      new RowIssue({
        ...at('Category'),
        message: `Category "${raw.category}" is not one of ${list(categories.names)}`,
        hint: 'Leave Category empty to use the one in the product code, or type one of the names listed above.',
      }),
    );
    category = undefined;
  } else if (!category) {
    issues.push(
      new RowIssue({
        ...at('Product Code'),
        message: `Product Code "${sku}" has the category code "${code}", which does not match any category`,
        hint: `The codes that exist are ${list([...categories.byCode.keys()].sort())}. Either correct the product code, or fill the Category column with one of ${list(categories.names)}.`,
      }),
    );
  }

  const title = raw.title ?? '';
  if (!title) {
    issues.push(
      new RowIssue({ ...at('Product Name'), message: 'Product Name is empty', hint: 'Give the piece the name a customer would use, like "Kundan Bridal Choker Set".' }),
    );
  } else if (title.length < 3 || title.length > 70) {
    issues.push(
      new RowIssue({
        ...at('Product Name'),
        message: `Product Name is ${title.length} characters; it must be between 3 and 70`,
        hint: 'This becomes the page heading and the web address, so keep it short and descriptive.',
      }),
    );
  }

  const price = parsePrice(raw.price, at('Selling Price'), issues);
  const listPrice = parsePrice(raw.listPrice, at('List Price'), issues);

  if (price !== undefined && listPrice !== undefined && listPrice <= price) {
    issues.push(
      new RowIssue({
        ...at('List Price'),
        message: `List Price (${listPrice}) is not higher than Selling Price (${price})`,
        hint: 'List Price is the crossed-out "was" price, so it has to be the bigger number. Leave it empty if there is no discount.',
      }),
    );
  }

  const publishDate = parseDate(raw.publishDate, { row, sku }, issues);

  for (const field of ['inStock', 'featured', 'earringsIncluded']) {
    if (typeof raw[field] === 'string') {
      const header = { inStock: 'In Stock', featured: 'Featured', earringsIncluded: 'Earrings Included' }[field];
      issues.push(
        new RowIssue({
          ...at(header),
          message: `${header} is "${raw[field]}", which is not a tick or a blank`,
          hint: `Select the column, then Data → Data validation → Tick box, so it can only ever be ticked or empty.`,
        }),
      );
    }
  }

  const normalised = {
    row,
    sku,
    title,
    status,
    category,
    slugOverride: raw.slug || undefined,
    price,
    listPrice,
    description: raw.description ?? '',
    imageFilenames: raw.images ?? [],
    specs: {
      baseMetal: raw.baseMetal || undefined,
      finish: raw.finish || undefined,
      stones: raw.stones ?? [],
      setIncludes: raw.setIncludes || undefined,
      earringsIncluded: raw.earringsIncluded === true ? true : undefined,
      weight: raw.weight || undefined,
    },
    inStock: raw.inStock === true,
    featured: raw.featured === true,
    tags: raw.tags ?? [],
    publishDate,
    seo: { title: raw.seoTitle || undefined, description: raw.seoDescription || undefined },
  };

  // S-5 — a draft is exempt from everything below. It may have no photos and no description;
  // that is generally *why* it is still a draft.
  if (status === 'draft') return normalised;

  const words = countWords(normalised.description);
  if (words === 0) {
    issues.push(
      new RowIssue({ ...at('Description'), message: 'Description is empty', hint: 'This text is the product page, and the main thing Google reads. Write at least ' + `${config.minDescriptionWords} words about the piece.` }),
    );
  } else if (words < config.minDescriptionWords) {
    issues.push(
      new RowIssue({
        ...at('Description'),
        message: `Description is ${words} words; the minimum is ${config.minDescriptionWords}`,
        hint: 'Write about the stones, the finish, the occasion and how it wears. Short descriptions are the main reason catalogue pages fail to rank.',
      }),
    );
  }

  if (normalised.imageFilenames.length === 0) {
    issues.push(
      new RowIssue({
        ...at('Images'),
        message: 'Images is empty',
        hint: 'Type the photo filenames from the Drive folder, separated by commas, in the order they should appear. Set Status to draft if the photos are not ready.',
      }),
    );
  }

  for (const filename of normalised.imageFilenames) {
    if (driveFiles.has(filename)) continue;

    // Near-miss detection: case and extension are what people actually get wrong, and
    // "it is there, but spelt .PNG" is a far more useful message than "not found".
    const near = [...driveFiles.keys()].find((f) => f.toLowerCase() === filename.toLowerCase());
    issues.push(
      new RowIssue({
        ...at('Images'),
        message: `Images names "${filename}", which is not in the Drive folder`,
        hint: near
          ? `The folder has "${near}". Filenames must match exactly, including capital letters — copy it from Drive and paste it in.`
          : 'Check the spelling against Drive, including the .jpg or .png at the end. If the photo has not been uploaded yet, upload it or set Status to draft.',
      }),
    );
  }

  return normalised;
}

/**
 * Validate every row, plus the checks that only make sense across rows.
 *
 * @returns {{ products: object[], issues: RowIssue[], warnings: string[] }}
 */
export function validate({ rows, imageRows = [], config, categories, driveFiles }) {
  const issues = [];
  const warnings = [];

  const products = [];
  for (const raw of rows) {
    const product = validateRow(raw, { config, categories, driveFiles }, issues);
    if (product) products.push(product);
  }

  // ── duplicate product codes ──
  const seenSku = new Map();
  for (const p of products) {
    const first = seenSku.get(p.sku);
    if (first) {
      issues.push(
        new RowIssue({
          row: p.row,
          sku: p.sku,
          field: 'Product Code',
          message: `Product Code "${p.sku}" is already used on row ${first.row}`,
          hint: 'Every product needs its own code. If this is a second colour or size, give it its own code and its own row.',
        }),
      );
    } else {
      seenSku.set(p.sku, p);
    }
  }

  // ── duplicate slugs ──
  // Checked on the derived slug, because two differently-named products can still collide.
  const seenSlug = new Map();
  for (const p of products) {
    if (p.status === 'draft' || !p.title) continue;
    const slug = p.slugOverride ?? slugify(p.title);
    p.derivedSlug = slug;

    if (!slug) {
      issues.push(
        new RowIssue({
          row: p.row,
          sku: p.sku,
          field: 'Product Name',
          message: `Product Name "${p.title}" cannot be turned into a web address`,
          hint: 'The name needs at least some letters or numbers in it. Add a word, or fill the Slug column by hand.',
        }),
      );
      continue;
    }

    const first = seenSlug.get(slug);
    if (first) {
      issues.push(
        new RowIssue({
          row: p.row,
          sku: p.sku,
          field: 'Product Name',
          message: `"${p.title}" would use the same web address as ${first.sku} on row ${first.row} (/products/${slug}/)`,
          hint: 'Two products cannot share an address. Change one of the names, or set a different value in the Slug column.',
        }),
      );
    } else {
      seenSlug.set(slug, p);
    }
  }

  // ── one photo, one product ──
  const claimed = new Map();
  for (const p of products) {
    if (p.status === 'draft') continue;
    for (const filename of p.imageFilenames) {
      const first = claimed.get(filename);
      if (first) {
        issues.push(
          new RowIssue({
            row: p.row,
            sku: p.sku,
            field: 'Images',
            message: `"${filename}" is already used by ${first.sku} on row ${first.row}`,
            hint: 'Each photo belongs to one product. Upload a separate photo for this one, or remove the filename from one of the two rows.',
          }),
        );
      } else {
        claimed.set(filename, p);
      }
    }
  }

  // ── alt-text overrides from the optional images tab ──
  const altByFilename = new Map();
  const bySku = new Map(products.map((p) => [p.sku, p]));

  for (const imageRow of imageRows) {
    const product = bySku.get(imageRow.sku);
    if (!product) {
      issues.push(
        new RowIssue({
          row: imageRow.__row,
          sku: imageRow.sku,
          field: 'Product Code',
          message: `the images tab has a row for "${imageRow.sku}", which is not a product`,
          hint: 'Check the code against the products tab, or delete this row.',
        }),
      );
      continue;
    }
    if (!product.imageFilenames.includes(imageRow.filename)) {
      issues.push(
        new RowIssue({
          row: imageRow.__row,
          sku: imageRow.sku,
          field: 'Image File Name',
          message: `"${imageRow.filename}" is not one of ${imageRow.sku}'s photos`,
          hint: `That product's Images column lists ${list(product.imageFilenames)}. Alt text can only be written for a photo the product actually uses.`,
        }),
      );
      continue;
    }
    if (!imageRow.alt || imageRow.alt.length < 10) {
      issues.push(
        new RowIssue({
          row: imageRow.__row,
          sku: imageRow.sku,
          field: 'Alt Text',
          message: 'Alt Text is too short to be useful',
          hint: 'Describe what is in the photo in a sentence — "Gold kundan choker with pearl drops on a maroon background". This is what Google Images reads.',
        }),
      );
      continue;
    }
    altByFilename.set(imageRow.filename, imageRow.alt);
  }

  for (const p of products) p.altOverrides = altByFilename;

  // ── photos in Drive that nothing uses ──
  // A warning, not an error: an unused photo is almost always one uploaded ahead of the row
  // being written, and failing the run for it would stop the client publishing everything
  // else. It is still reported, because a photo nobody references is usually a typo.
  const used = new Set(products.flatMap((p) => p.imageFilenames));
  const unused = [...driveFiles.keys()].filter((f) => !used.has(f));
  if (unused.length) {
    warnings.push(
      `${unused.length} ${unused.length === 1 ? 'photo is' : 'photos are'} in the Drive folder but not used by any product: ` +
        `${unused.slice(0, 8).join(', ')}${unused.length > 8 ? `, and ${unused.length - 8} more` : ''}. ` +
        'Either add them to a product\'s Images column, or delete them from Drive.',
    );
  }

  if (config.requireAltText && imageRows.length === 0) {
    issues.push(
      new RowIssue({
        row: 1,
        sku: '',
        field: 'images tab',
        message: 'requireAltText is on, but there is no images tab',
        hint: 'Either add the images tab with alt text for every photo, or set requireAltText to false in catalogue.config.json.',
      }),
    );
  }

  return { products, issues, warnings };
}
