/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface scale — dark theme (Phase A: tokens refresh, the app
        // will move to a light theme in Phase B). Source: brand handoff.
        bg: {
          0: '#07070f',
          1: '#0d0c1b',
          2: '#121228',
          3: '#1a1a30',
        },
        card: {
          DEFAULT: 'rgba(255, 255, 255, 0.04)',
          hover: 'rgba(255, 255, 255, 0.07)',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          bright: 'rgba(255, 255, 255, 0.13)',
        },
        text: {
          1: '#eeedf2',
          2: '#8a8aae',
          3: '#46465e',
        },
        brand: {
          blue: '#5c8fff',
          'blue-deep': '#3d6be0',
          'blue-dim': 'rgba(92, 143, 255, 0.10)',
          cyan: '#2dd9ee',
          // Semantic — data states only.
          green: '#34d999',
          red: '#ff7272',
          orange: '#ffba4a',
        },
      },
      fontFamily: {
        head: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        site: '1120px',
      },
      boxShadow: {
        card: '0 2px 16px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
        float: '0 8px 40px rgba(0, 0, 0, 0.45)',
        'brand-glow': '0 0 24px rgba(92, 143, 255, 0.32)',
      },
    },
  },
  plugins: [],
}
