/**
 * T-14 — turn a Drive download into a file fit to commit.
 *
 * PLAN.md §9: 200 products × 3 photos at 4 MB each is ~2.4 GB of git history. At ~200 KB it is
 * ~120 MB, which GitHub handles comfortably. This module is the difference between those two
 * numbers, and it runs once per image ever — the build-time pipeline in `astro:assets` does the
 * AVIF/WebP/srcset work on every build afterwards.
 */

import sharp from 'sharp';
import { SyncError } from './config.mjs';
import { sha256 } from './drive.mjs';

const EXTENSION = { jpeg: 'jpg', webp: 'webp' };

/** The committed filename — derived from the slug, never copied from Drive. See §12.4.2. */
export function localImageName(slug, index, format) {
  return `${slug}-${index + 1}.${EXTENSION[format] ?? 'jpg'}`;
}

/**
 * @param {Buffer} buffer raw bytes from Drive
 * @param {{maxEdge:number, quality:number, format:'jpeg'|'webp'}} options
 * @param {string} sourceName the Drive filename, for error messages
 */
export async function processImage(buffer, options, sourceName) {
  const { maxEdge, quality, format } = options;

  let pipeline = sharp(buffer, { failOn: 'error' });

  let metadata;
  try {
    metadata = await pipeline.metadata();
  } catch (err) {
    throw new SyncError(`"${sourceName}" could not be read as an image.`, {
      hint:
        'It may be a HEIC file, a video, or a damaged upload. Open it on your phone, export it ' +
        `as JPG, and upload that instead. (${err.message})`,
    });
  }

  if (!metadata.width || !metadata.height) {
    throw new SyncError(`"${sourceName}" has no readable width or height.`, {
      hint: 'Re-export it as a JPG and upload it again.',
    });
  }

  // .rotate() with no argument bakes in the EXIF orientation, which matters because sharp
  // strips metadata by default — without this a phone photo taken sideways stays sideways.
  pipeline = pipeline.rotate().resize(maxEdge, maxEdge, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  pipeline =
    format === 'webp'
      ? pipeline.webp({ quality })
      : pipeline.jpeg({ quality, mozjpeg: true, progressive: true });

  let output;
  try {
    output = await pipeline.toBuffer({ resolveWithObject: true });
  } catch (err) {
    throw new SyncError(`"${sourceName}" could not be processed: ${err.message}`, {
      hint: 'Re-export it as a JPG and upload it again.',
    });
  }

  return {
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
    bytes: output.data.length,
    // The hash of the *processed* output. On the keyless Drive provider this is the only
    // change signal available, so it is what decides whether a file is rewritten (§12.4.1).
    sha: sha256(output.data),
    sourceBytes: buffer.length,
  };
}
