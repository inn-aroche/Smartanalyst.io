import { defineConfig } from 'astro/config';

// Static output — uploaded to Hostinger Cloud as plain files.
// site = canonical URL, used for sitemap + canonical link tags.
export default defineConfig({
  site: 'https://smartanalyst.io',
  output: 'static',
  build: {
    format: 'directory',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
