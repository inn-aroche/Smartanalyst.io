/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // SaaS app — light theme aligné App v2 (handoff Claude Design).
        // Source: README design_handoff_app_v2 §"Design Tokens".
        bg: {
          0: '#ECECF1', // page (neutre froid, légèrement plus froid que l'ancien #f2f2f7)
          1: '#ffffff', // card
          2: '#F5F5F9', // surf (surface secondaire — sidebar, inputs, zones)
          3: '#E5E5EC', // surf2 (surface tertiaire — pistes, segmented bg)
        },
        card: {
          DEFAULT: '#ffffff',
          hover: '#fbfbfd',
        },
        border: {
          DEFAULT: 'rgba(18, 18, 38, 0.09)',
          bright: 'rgba(18, 18, 38, 0.15)',
        },
        text: {
          1: '#14142a',
          2: '#5c5c78',
          3: '#9c9cb4',
        },
        brand: {
          blue: '#5c8fff', // blueBright — graphiques, accents
          'blue-deep': '#3d6be0', // blue — actions primaires
          'blue-dim': 'rgba(61, 107, 224, 0.10)',
          cyan: '#16a6be', // texte cyan
          'cyan-bright': '#2dd9ee', // point signal, accents secondaires
          green: '#1fa873',
          red: '#e0495c',
          amber: '#c2820e', // surveiller / warning
          orange: '#cf7d12', // legacy — à terme remplacer par amber
        },
      },
      backgroundImage: {
        'brand-grad': 'linear-gradient(135deg, #5c8fff 0%, #2dd9ee 100%)',
      },
      fontFamily: {
        head: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        site: '1120px',
        brief: '720px', // accueil narré BriefHome
      },
      boxShadow: {
        // Élévations design system App v2.
        card: '0 1px 2px rgba(18, 18, 38, 0.05), 0 4px 14px rgba(18, 18, 38, 0.06)',
        float: '0 14px 44px rgba(18, 18, 38, 0.13)',
        'brand-glow': '0 1px 2px rgba(18, 18, 38, 0.12), 0 6px 18px rgba(61, 107, 224, 0.22)',
        'brand-glow-hover': '0 1px 2px rgba(18, 18, 38, 0.12), 0 6px 18px rgba(61, 107, 224, 0.32)',
      },
      borderRadius: {
        brief: '16px', // T.radius pour le thème Brief
      },
    },
  },
  plugins: [],
}

