-- 019_set_provider_icon_urls.sql
-- Pointe `icon_url` des providers vers les PNGs hébergés sur le site
-- vitrine (apps/marketing/public/connectors/). CF Pages les sert avec CDN.
--
-- Pour les futurs providers, set icon_url directement dans l'INSERT seed
-- (cf migration 012 pour le pattern).

UPDATE integration_providers SET icon_url = 'https://smartanalyst.io/connectors/ga4.png',         updated_at = NOW() WHERE source = 'ga4';
UPDATE integration_providers SET icon_url = 'https://smartanalyst.io/connectors/facebook.png',    updated_at = NOW() WHERE source = 'meta_ads';
UPDATE integration_providers SET icon_url = 'https://smartanalyst.io/connectors/shopify.png',     updated_at = NOW() WHERE source = 'shopify';
UPDATE integration_providers SET icon_url = 'https://smartanalyst.io/connectors/stripe.png',      updated_at = NOW() WHERE source = 'stripe';
