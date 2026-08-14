import { getCollection, type CollectionEntry } from 'astro:content';

export type Product = CollectionEntry<'products'>;
export type Category = CollectionEntry<'categories'>;

/**
 * T-07 — the query layer, and the single reason S-6 holds.
 *
 * `listed()` is what every grid, filter, feed and related-products strip calls,
 * and it excludes archived products. The detail route deliberately does not use
 * it: an archived product keeps its URL and still renders, which is the whole
 * point of archiving rather than deleting.
 *
 * If a new grid is ever added and it calls getCollection directly, S-6 breaks
 * silently — so grids call these helpers and nothing else.
 */

/** Every product the sync has written, archived ones included. Detail routes only. */
export async function allProducts(): Promise<Product[]> {
  return getCollection('products');
}

/** Newest first. The order every grid used before `Sequence` existed, and the tie-breaker now. */
const newestFirst = (a: Product, b: Product) =>
  b.data.publishDate.valueOf() - a.data.publishDate.valueOf();

/**
 * The running order: `Sequence` first, then newest.
 *
 * A blank Sequence sorts as Infinity, so numbering three pieces 1–3 puts exactly those three at
 * the front and leaves everything else in the order it already had. That is the property worth
 * protecting — the client can pin the top of a category without having to number the whole
 * catalogue to keep the rest sane.
 *
 * The number is global rather than per-category, and that is deliberate: a category page only
 * contains one category, so numbering earrings 1–10 orders the earrings page exactly as written,
 * while on the all-jewellery page the same numbers interleave and float each category's best
 * piece towards the top. One column, and it reads correctly in both places.
 */
function byPriority(a: Product, b: Product): number {
  const sa = a.data.sequence ?? Infinity;
  const sb = b.data.sequence ?? Infinity;
  // Infinity === Infinity, so two unnumbered pieces fall through to the date rather than
  // producing Infinity - Infinity, which is NaN and would leave the sort order undefined.
  if (sa !== sb) return sa - sb;
  return newestFirst(a, b);
}

/** Everything that may appear in a grid: not archived. Sequence first, then newest. */
export async function listed(): Promise<Product[]> {
  const products = await getCollection('products', ({ data }) => !data.archived);
  return products.sort(byPriority);
}

export async function byCategory(categoryId: string): Promise<Product[]> {
  const products = await listed();
  return products.filter((p) => p.data.category.id === categoryId);
}

export async function featured(limit = 6): Promise<Product[]> {
  const products = await listed();
  const picked = products.filter((p) => p.data.featured);
  // A homepage with three tiles because nobody ticked Featured looks broken, so
  // the newest pieces fill the gap rather than leaving it.
  const filler = products.filter((p) => !p.data.featured);
  return [...picked, ...filler].slice(0, limit);
}

/**
 * Deliberately not `listed()`, which now honours Sequence. "New arrivals" is a claim about
 * dates, and a hand-set running order must not be able to put a six-month-old piece at the
 * top of it.
 */
export async function newArrivals(limit = 6): Promise<Product[]> {
  return [...(await listed())].sort(newestFirst).slice(0, limit);
}

/**
 * The piece that stands in the ring at the top of the homepage.
 *
 * `Hero` in the sheet is a separate tick from `Featured`, because "on the homepage" and "the
 * homepage" are different decisions. Ticking two is a sync warning, not an error, so this has
 * to resolve it rather than trust it: the first ticked piece that is actually photographed
 * wins, and if nobody has ticked one — or the ticked one has no photo yet — the newest
 * featured piece stands in. The homepage is never left without a hero because of a checkbox.
 */
export async function heroProduct(pool?: Product[]): Promise<Product | undefined> {
  const candidates = pool ?? (await featured(6));
  const photographed = (p: Product) => p.data.images.length > 0;

  return (
    candidates.find((p) => p.data.hero && photographed(p)) ??
    (await listed()).find((p) => p.data.hero && photographed(p)) ??
    candidates.find(photographed) ??
    candidates[0]
  );
}

/**
 * Same category first, then anything sharing a tag. Never the product itself,
 * and never an archived one.
 */
export async function related(product: Product, limit = 3): Promise<Product[]> {
  const products = (await listed()).filter((p) => p.id !== product.id);
  const tags = new Set(product.data.tags);

  const scored = products
    .map((p) => {
      let score = 0;
      if (p.data.category.id === product.data.category.id) score += 10;
      score += p.data.tags.filter((t) => tags.has(t)).length;
      return { product: p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.product);
}

/** Categories in their configured order. */
export async function categories(): Promise<Category[]> {
  const all = await getCollection('categories');
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** Counts per category id, for the homepage tiles. Archived excluded, per S-6. */
export async function categoryCounts(): Promise<Map<string, number>> {
  const products = await listed();
  const counts = new Map<string, number>();
  for (const product of products) {
    const id = product.data.category.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The numbers in the hero. Derived, so they can never go stale. */
export async function catalogueFacts() {
  const products = await listed();
  const cats = await categories();
  const prices = products
    .map((p) => p.data.price)
    .filter((p): p is number => typeof p === 'number');

  return {
    designs: products.length,
    categories: cats.length,
    from: prices.length ? Math.min(...prices) : null,
  };
}
