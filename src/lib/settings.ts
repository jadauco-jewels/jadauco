import { getEntry } from 'astro:content';

/**
 * The one place `settings.md` is read. Everything visitor-facing comes through
 * here, so PLAN.md §5.7's rule — no brand name, phone number, ₹ or menu label
 * inside a component — is enforced by there being nowhere else to get them.
 */
export async function getSettings() {
  const entry = await getEntry('site', 'settings');
  if (!entry) {
    throw new Error(
      'src/content/site/settings.md is missing. Every page reads it; the site cannot build without it.',
    );
  }
  return entry.data;
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
