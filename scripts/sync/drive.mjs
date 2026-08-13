/**
 * T-13 — read the Drive folder and download the photos.
 *
 * Two providers behind one interface, per the T-05 spike (PLAN.md §12.4.1):
 *
 *   apiKey  files.list with md5Checksum — exact change detection, proper pagination. Production.
 *   public  embeddedfolderview HTML — works with no credentials at all, but gives no checksum,
 *           so change detection degrades to hashing the processed output.
 *
 * This is the only module that knows how Drive is authenticated. If the access model ever
 * changes again, nothing outside this file needs to move.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SyncError, PATHS } from './config.mjs';

const LIST_PAGE_SIZE = 1000;
const RETRIES = 3;
const RETRY_BASE_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** Which provider a run will actually use. `auto` resolves on the presence of a key. */
export function resolveProvider(config, apiKey) {
  if (config.driveProvider === 'auto') return apiKey ? 'apiKey' : 'public';
  if (config.driveProvider === 'apiKey' && !apiKey) {
    throw new SyncError('driveProvider is "apiKey" but GOOGLE_API_KEY is not set.', {
      hint:
        'Either add the secret, or set driveProvider to "auto" in catalogue.config.json to fall ' +
        'back to keyless public access. See PLAN.md §12.4.1.',
    });
  }
  return config.driveProvider;
}

async function withRetries(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // A 4xx will not fix itself; only back off for transport and 5xx failures.
      if (err instanceof SyncError && err.fatal) throw err;
      if (attempt < RETRIES) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw new SyncError(`${label} failed after ${RETRIES} attempts: ${lastError.message}`);
}

// ─── apiKey provider ────────────────────────────────────────────────────────────────────────

async function listViaApi(folderId, apiKey) {
  const files = [];
  let pageToken;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('fields', 'nextPageToken, files(id, name, md5Checksum, size, mimeType)');
    url.searchParams.set('pageSize', String(LIST_PAGE_SIZE));
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const page = await withRetries('Listing the Drive folder', async () => {
      const response = await fetch(url);
      if (response.status === 403 || response.status === 401) {
        const err = new SyncError(
          `Drive refused the API key (${response.status}) when listing the folder.`,
          {
            hint:
              'Check that the key is restricted to the Drive API and not to a referrer or IP, ' +
              'and that the folder is shared as "Anyone with the link".',
          },
        );
        err.fatal = true;
        throw err;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    });

    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    md5: f.md5Checksum ?? null,
    size: f.size ? Number(f.size) : null,
  }));
}

// ─── public provider ────────────────────────────────────────────────────────────────────────

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

/**
 * Scrape the keyless folder view. Returns names and file IDs and nothing else — no checksum,
 * no size, and a date with no year, which is why this provider cannot do change detection.
 */
async function listViaPublicHtml(folderId) {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;

  const html = await withRetries('Listing the Drive folder', async () => {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  });

  const files = [];
  const entry = /id="entry-([A-Za-z0-9_-]+)"[\s\S]*?flip-entry-title">([^<]*)</g;
  let match;
  while ((match = entry.exec(html)) !== null) {
    files.push({ id: match[1], name: decodeEntities(match[2]).trim(), md5: null, size: null });
  }

  if (files.length === 0) {
    throw new SyncError('The Drive folder listing came back empty.', {
      hint:
        'Either the folder is not shared as "Anyone with the link", or driveFolderId in ' +
        'catalogue.config.json is wrong. Check the id after /folders/ in the folder URL.',
    });
  }

  return files;
}

// ─── public interface ───────────────────────────────────────────────────────────────────────

/**
 * List the folder as a filename → file map.
 * @returns {Promise<{ provider: string, files: Map<string, {id:string,name:string,md5:string|null,size:number|null}>, warnings: string[] }>}
 */
export async function listFolder(config, { apiKey = process.env.GOOGLE_API_KEY, deps = {} } = {}) {
  const provider = resolveProvider(config, apiKey);
  const list = deps.list ?? (provider === 'apiKey' ? listViaApi : listViaPublicHtml);
  const raw = await list(config.driveFolderId, apiKey);

  const warnings = [];
  const files = new Map();
  const duplicates = new Set();

  for (const file of raw) {
    // Drive genuinely allows two files with the same name in one folder, and then nothing in
    // the sheet can unambiguously refer to either of them.
    if (files.has(file.name)) duplicates.add(file.name);
    files.set(file.name, file);
  }

  if (duplicates.size) {
    throw new SyncError(
      `The Drive folder contains more than one file named ${[...duplicates]
        .map((d) => `"${d}"`)
        .join(', ')}.`,
      {
        hint:
          'Filenames must be unique in the folder, because the sheet refers to photos by name. ' +
          'Rename or delete the duplicate, then update the Images column to match.',
      },
    );
  }

  if (provider === 'public') {
    warnings.push(
      'Reading Drive without an API key: every image is downloaded on every run, because the ' +
        'keyless listing has no checksum to compare. Set GOOGLE_API_KEY to make the sync ' +
        'incremental (PLAN.md §12.4.1).',
    );
    // The keyless endpoint's behaviour past a few hundred files is unproven; a suspiciously
    // round count is the only signal available that it may have silently truncated.
    if (files.size % 100 === 0) {
      warnings.push(
        `The folder listed exactly ${files.size} files. The keyless listing has no documented ` +
          'page limit, so this may be a truncated page — verify against Drive, and set ' +
          'GOOGLE_API_KEY, which paginates properly.',
      );
    }
  }

  return { provider, files, warnings };
}

/** Download one file's bytes. */
export async function downloadFile(file, { provider, apiKey = process.env.GOOGLE_API_KEY } = {}) {
  const url =
    provider === 'apiKey'
      ? `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`
      : `https://drive.usercontent.google.com/download?id=${file.id}&export=download`;

  return withRetries(`Downloading "${file.name}"`, async () => {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const type = response.headers.get('content-type') ?? '';
    // The keyless endpoint answers with an HTML interstitial rather than an error when a file
    // is too large to virus-scan or has stopped being public.
    if (type.includes('text/html')) {
      throw new Error(
        `Drive returned a web page instead of the image. The file may no longer be shared publicly.`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  });
}

// ─── lock file ──────────────────────────────────────────────────────────────────────────────

/**
 * `catalogue.lock.json` is what makes the sync incremental and idempotent. It records, per
 * committed image, where it came from and what it hashed to — and per product, the frozen slug
 * (§5.1.2), which is the thing standing between a renamed product and a dead URL.
 */
export const EMPTY_LOCK = { version: 1, products: {}, images: {} };

export async function readLock(path = PATHS.lock) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return {
      version: parsed.version ?? 1,
      products: parsed.products ?? {},
      images: parsed.images ?? {},
    };
  } catch (err) {
    if (err.code === 'ENOENT') return structuredClone(EMPTY_LOCK);
    throw new SyncError(`${path} is unreadable: ${err.message}`, {
      hint: 'Delete it to force a full re-sync — it is generated, not hand-written.',
    });
  }
}

export async function writeLock(lock, path = PATHS.lock) {
  // Sorted keys, so a lock file diff shows what actually changed rather than a reordering.
  const sorted = {
    version: lock.version ?? 1,
    products: Object.fromEntries(Object.entries(lock.products).sort(([a], [b]) => (a < b ? -1 : 1))),
    images: Object.fromEntries(Object.entries(lock.images).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}
