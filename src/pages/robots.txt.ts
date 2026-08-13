import type { APIRoute } from 'astro';

/**
 * PLAN.md §10.1 — generated, not a static file, so the sitemap URL can never
 * point at the wrong host after a domain change.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('sitemap-index.xml', site)}`, ''].join(
      '\n',
    ),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
