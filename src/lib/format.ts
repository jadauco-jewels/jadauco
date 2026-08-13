import type { Settings } from './settings';

/**
 * Money, in the locale the settings name. Never hand-formatted, and never with
 * a hardcoded ₹ — PLAN.md §5.7.
 */
export function price(amount: number, settings: Settings) {
  return new Intl.NumberFormat(settings.currency.locale, {
    style: 'currency',
    currency: settings.currency.code,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * §5.2.1 — the discount is *derived*, never stored. Two entered numbers can
 * never disagree with a third that does not exist.
 */
export function discountPercent(sellingPrice?: number, listPrice?: number) {
  if (!sellingPrice || !listPrice || listPrice <= sellingPrice) return null;
  return Math.round(((listPrice - sellingPrice) / listPrice) * 100);
}

export function saving(sellingPrice?: number, listPrice?: number) {
  if (!sellingPrice || !listPrice || listPrice <= sellingPrice) return null;
  return listPrice - sellingPrice;
}

/** Fill {placeholders} in a label from settings. */
export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * The one-line signature under a product tile: metal · finish · what it is.
 * Built from whichever spec fields the client actually filled in.
 */
export function specLine(specs: {
  baseMetal?: string;
  finish?: string;
  stones?: string[];
  setIncludes?: string;
  weight?: string;
}) {
  return [specs.baseMetal, specs.finish, specs.stones?.join(', ') || specs.setIncludes]
    .filter(Boolean)
    .slice(0, 3) as string[];
}

/**
 * A meta description when the page has no hand-written one: the opening of the
 * body, trimmed at a sentence boundary rather than mid-word. PLAN.md §10.2
 * wants 140–160 characters.
 */
export function excerpt(body: string, max = 158) {
  const text = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= max) return text;

  const clipped = text.slice(0, max);
  const lastStop = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '));
  if (lastStop > max * 0.6) return clipped.slice(0, lastStop + 1);
  return `${clipped.slice(0, clipped.lastIndexOf(' '))}…`;
}
