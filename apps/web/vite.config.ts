import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Bundle splitting (next-steps B) — sortir les libs vendor du chunk
    // applicatif pour ameliorer le cache navigateur : un deploy de l'app
    // n'invalide pas le cache des libs (qui changent rarement).
    rollupOptions: {
      output: {
        manualChunks: {
          // React + React-DOM + Router = couche framework, ~140 kB gzip.
          // Stable, change uniquement aux upgrades majeurs.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // React Query = cache/fetch logic, utilise partout.
          query: ['@tanstack/react-query'],
          // PostHog est lazy via lib/tracking.ts mais autant le sortir au
          // cas ou il finit dans le main chunk via une import statique.
          analytics: ['posthog-js'],
        },
      },
    },
    // Le warning < 500 kB n'a pas de sens apres splitting (react-vendor
    // depasse ce seuil meme gzipe). On le coupe a 600 pour eviter le bruit
    // CI sans masquer une vraie regression future.
    chunkSizeWarningLimit: 600,
  },
})
