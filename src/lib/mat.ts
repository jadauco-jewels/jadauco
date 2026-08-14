import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import sharp from 'sharp';
import type { ImageMetadata } from 'astro';

/**
 * The mat — the colour a photo's frame is painted so the photo has no edge.
 *
 * GUIDELINES.md §Photography asks for cream or sand backgrounds and says to avoid black velvet.
 * The supplier photographs the client actually receives are shot on black velvet. Contained
 * inside a cream tile that reads as a hole punched in the page, and because the photos are not
 * all the same shape the hole is a different shape in every tile.
 *
 * Rather than pick a single frame colour and be wrong for half the catalogue, each photo is
 * sampled once and its frame is painted the colour of its own background. The letterboxing that
 * `object-fit: contain` produces then falls on a colour identical to the photo's own edge, so it
 * is invisible: every tile is a clean square, nothing is cropped, and there is no seam. A photo
 * shot the way the guidelines ask for snaps back to the page cream (see SNAP_TO_CREAM), so
 * getting the photography right makes this machinery disappear rather than fight it.
 */

export interface Mat {
  /** CSS colour for the frame behind the photo. */
  color: string;
  /** True when the mat is dark enough that ink-on-mat text and borders stop reading. */
  dark: boolean;
}

/** The page ground. A mat this light is snapped to it — see `sample`. */
const CREAM = '#fffdf8';

/**
 * Above this relative luminance a mat is treated as "the photographer did it right" and replaced
 * with the page cream. Without this, six correctly-shot photos would each get their own slightly
 * different off-white and the grid would lose the flat cream ground the brand is built on.
 */
const SNAP_TO_CREAM = 0.82;

/** Below this, ink text and the hairline border stop reading and the tile flips to light-on-dark. */
const DARK_BELOW = 0.45;

export const CREAM_MAT: Mat = { color: CREAM, dark: false };

/** Ring width, in pixels of the downsampled square, that counts as "the photo's border". */
const RING = 3;
const SIZE = 40;

/** WCAG relative luminance, 0–1. */
function luminance(r: number, g: number, b: number): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sample one image's mat from its border pixels.
 *
 * The image is squashed to a small square — `fit: 'fill'`, deliberately not preserving aspect, so
 * all four edges of the original are represented no matter its shape — and the outer ring is read.
 * The statistic is a *median*, not a mean: a piece that runs off one edge of the frame, or a
 * bright specular hit in a corner, moves a mean and leaves a median alone.
 */
export async function sample(file: string): Promise<Mat> {
  const { data, info } = await sharp(file)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onRing = x < RING || y < RING || x >= width - RING || y >= height - RING;
      if (!onRing) continue;
      const i = (y * width + x) * channels;
      reds.push(data[i]);
      greens.push(data[i + 1]);
      blues.push(data[i + 2]);
    }
  }

  const r = median(reds);
  const g = median(greens);
  const b = median(blues);
  const l = luminance(r, g, b);

  if (l >= SNAP_TO_CREAM) return CREAM_MAT;
  return { color: `#${hex(r)}${hex(g)}${hex(b)}`, dark: l < DARK_BELOW };
}

/**
 * Every product photo on disk, by filename stem.
 *
 * The stem is the join between an `ImageMetadata` and the file it came from. Astro gives no
 * filesystem path on that object, and its `src` differs between dev (`/@fs/…/name.jpg?origWidth=…`)
 * and build (`/_astro/name.hash.jpg`) — but the original basename survives into both, and the sync
 * guarantees these names are unique because it derives every one of them from the product slug
 * (see scripts/sync/images.mjs `localImageName`).
 */
let index: Promise<Map<string, string>> | null = null;

function stem(src: string): string {
  return basename(src.split('?')[0]).split('.')[0];
}

async function buildIndex(): Promise<Map<string, string>> {
  const root = join(process.cwd(), 'src/content/products');
  const found = new Map<string, string>();

  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(jpe?g|png|webp|avif)$/i.test(entry.name)) continue;
    found.set(stem(entry.name), join(entry.parentPath ?? root, entry.name));
  }
  return found;
}

/** Sampling is pure and the files do not change mid-build, so each one is read exactly once. */
const cache = new Map<string, Promise<Mat>>();

/**
 * The mat for a product photo. Falls back to the page cream for anything that cannot be located
 * or read — an unmatted tile is the design as it stands today, so the failure is invisible.
 */
export async function matFor(image: ImageMetadata | undefined): Promise<Mat> {
  if (!image?.src) return CREAM_MAT;

  index ??= buildIndex();
  const file = (await index).get(stem(image.src));
  if (!file) return CREAM_MAT;

  let pending = cache.get(file);
  if (!pending) {
    pending = sample(file).catch(() => CREAM_MAT);
    cache.set(file, pending);
  }
  return pending;
}

/** Inline style for a frame element, consumed by the `--mat` custom property in global.css. */
export function matStyle(mat: Mat): string {
  return `--mat:${mat.color}`;
}
