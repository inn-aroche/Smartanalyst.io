// Bundle du script StandardTag.
//
// Sortie : dist/sa.js (IIFE minifié, target ES2018, browsers modernes).
// Le script expose un global `Smartanalyst` côté window une fois chargé.
// Cible: < 3 KB gzipped (cf docs/SMARTTAG_ARCHITECTURE.md §2.1).

import { build, context } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const SHARED = {
  entryPoints: ['src/index.ts'],
  outfile: 'dist/sa.js',
  bundle: true,
  format: 'iife',
  // global var inutile — on s'attache manuellement à window dans src/index.ts
  // pour éviter qu'esbuild génère un wrapper supplémentaire.
  target: ['es2018'],
  minify: true,
  legalComments: 'none',
  define: {
    // Defaults pour les vars d'env du tag. Surchargeables au build via
    // `--define:` (pour shipper des builds par-env si besoin un jour).
    __SA_DEFAULT_ENDPOINT__: JSON.stringify(
      process.env.SA_DEFAULT_ENDPOINT || 'https://api.smartanalyst.io/api/v1/track',
    ),
    __SA_VERSION__: JSON.stringify(process.env.SA_VERSION || '0.1.0'),
  },
}

async function once() {
  await build(SHARED)
  const bytes = readFileSync(SHARED.outfile)
  const gz = gzipSync(bytes)
  // eslint-disable-next-line no-console
  console.log(
    `▸ ${SHARED.outfile}: ${bytes.length} bytes raw, ${gz.length} bytes gzipped (${(gz.length / 1024).toFixed(2)}KB)`,
  )
  if (gz.length > 3072) {
    // eslint-disable-next-line no-console
    console.warn(`⚠  gzipped exceeds 3 KB target (${gz.length} bytes)`)
  }
}

async function buildForTests() {
  // Compile les modules purs (sanitize.ts) en ESM non-bundlé pour que les
  // tests Node puissent les importer directement. Évite d'ajouter tsx /
  // ts-node comme dépendance juste pour ~20 lignes de helpers.
  await build({
    entryPoints: ['src/sanitize.ts'],
    outfile: 'dist/sanitize.mjs',
    format: 'esm',
    target: ['es2020'],
    bundle: false,
    minify: false,
  })
}

if (process.argv.includes('--watch')) {
  const ctx = await context(SHARED)
  await ctx.watch()
  // eslint-disable-next-line no-console
  console.log('▸ watching for changes…')
} else if (process.argv.includes('--tests')) {
  await buildForTests()
} else {
  await once()
}
