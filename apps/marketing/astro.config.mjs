import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      // Root index is a JS redirect with noindex — keep it out of the sitemap.
      filter: (page) => !/^https:\/\/smartanalyst\.io\/?$/.test(page),
      // Tell crawlers about the EN/FR pairs so they index the right one per region.
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en-US',
          fr: 'fr-FR',
        },
      },
    }),
  ],
});
