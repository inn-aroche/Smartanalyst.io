#!/usr/bin/env node
// Génère les Open Graph images par page (1200x630) en SVG statique.
//
// Pourquoi un générateur :
//   - éviter de dupliquer le markup SVG (logo, grid, gradients) dans 10
//     fichiers à la main
//   - garder la cohérence visuelle si on tweak les couleurs / typo
//   - permettre d'ajouter une page = ajouter une entrée dans VARIANTS
//
// Output : apps/marketing/public/og/<slug>.svg
//
// Re-run après modif :
//   node apps/marketing/scripts/generate-og-images.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../public/og')

// Chaque variant a un titre principal en 2 lignes + un sub. La 2e ligne reçoit
// le gradient brand (effet "wordmark") pour pop dans le feed.
const VARIANTS = [
  {
    slug: 'pricing',
    title1: 'Smart prices.',
    title2: 'Smarter answers.',
    sub1: 'Free trial, no card required.',
    sub2: 'Cancel any time — no claw-back.',
  },
  {
    slug: 'security',
    title1: 'Built for marketers.',
    title2: 'Secured for ops.',
    sub1: 'EU hosting · Encrypted tokens · RLS by default.',
    sub2: 'GDPR-ready by design — not as an afterthought.',
  },
  {
    slug: 'product',
    title1: 'Causes, evidence,',
    title2: 'next actions.',
    sub1: 'Not a dashboard. A senior analyst, but typed.',
    sub2: 'Ask anything about your marketing — get a real answer.',
  },
  {
    slug: 'beta',
    title1: 'Private beta.',
    title2: 'Join the waitlist.',
    sub1: 'A handful of marketers, carefully picked.',
    sub2: 'We onboard you one by one.',
  },
  {
    slug: 'status',
    title1: 'All systems',
    title2: 'operational.',
    sub1: 'Real-time status — API, database, cache.',
    sub2: 'Open access. No paywall, no sign-up.',
  },
]

function svgFor({ title1, title2, sub1, sub2 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#07070F"/>
      <stop offset="1" stop-color="#0D0C1B"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5C8FFF"/>
      <stop offset="1" stop-color="#2DD9EE"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.25" r="0.6">
      <stop offset="0" stop-color="#5C8FFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#5C8FFF" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <g stroke="rgba(255,255,255,0.022)" stroke-width="1">
    <path d="M0 90 H1200 M0 180 H1200 M0 270 H1200 M0 360 H1200 M0 450 H1200 M0 540 H1200"/>
    <path d="M120 0 V630 M240 0 V630 M360 0 V630 M480 0 V630 M600 0 V630 M720 0 V630 M840 0 V630 M960 0 V630 M1080 0 V630"/>
  </g>

  <g transform="translate(80,72)">
    <g transform="scale(0.875)">
      <rect x="8" y="40" width="11" height="16" rx="3" fill="#5C8FFF" opacity="0.45"/>
      <rect x="22.5" y="26" width="11" height="30" rx="3" fill="url(#brand)" opacity="0.78"/>
      <rect x="37" y="12" width="11" height="44" rx="3" fill="url(#brand)"/>
      <circle cx="42.5" cy="8" r="5" fill="#2DD9EE"/>
    </g>
    <text x="76" y="40" font-family="Plus Jakarta Sans, DM Sans, system-ui, sans-serif" font-size="30" font-weight="700" letter-spacing="-0.6" fill="#EEEDF2">SmartAnalyst</text>
  </g>

  <text x="80" y="290" font-family="Plus Jakarta Sans, DM Sans, system-ui, sans-serif" font-size="76" font-weight="800" fill="#EEEDF2" letter-spacing="-2.6">
    ${title1}
  </text>
  <text x="80" y="380" font-family="Plus Jakarta Sans, DM Sans, system-ui, sans-serif" font-size="76" font-weight="800" fill="url(#brand)" letter-spacing="-2.6">
    ${title2}
  </text>

  <text x="80" y="460" font-family="DM Sans, system-ui, sans-serif" font-size="26" fill="#8A8AAE">
    ${sub1}
  </text>
  <text x="80" y="498" font-family="DM Sans, system-ui, sans-serif" font-size="26" fill="#8A8AAE">
    ${sub2}
  </text>

  <g transform="translate(80,560)">
    <text x="0" y="22" font-family="DM Mono, ui-monospace, monospace" font-size="18" fill="#46465E">smartanalyst.io</text>
  </g>
</svg>
`
}

await fs.mkdir(OUT_DIR, { recursive: true })
for (const v of VARIANTS) {
  const file = path.join(OUT_DIR, `${v.slug}.svg`)
  await fs.writeFile(file, svgFor(v), 'utf8')
  console.log(`✓ ${path.relative(process.cwd(), file)}`)
}
console.log(`\nGenerated ${VARIANTS.length} OG images.`)
