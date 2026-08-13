// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// PLAN.md §10.1 — an absolute `site` is what makes every generated URL canonical.
export default defineConfig({
  site: 'https://jadauco.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
