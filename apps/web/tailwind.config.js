/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // SaaS app — light theme. Source: SmartAnalyst Brand Guidelines,
        // theming section ("the app may ship light"). Semantic tokens only;
        // brand blue stays constant across themes.
        bg: {
          0: '#f2f2f7', // page
          1: '#ffffff', // card / panel
          2: '#f7f7fb', // raised surface (topbar, inputs)
          3: '#eeeef4', // highest surface
        },
        card: {
          DEFAULT: '#ffffff',
          hover: '#fbfbfd',
        },
        border: {
          DEFAULT: 'rgba(12, 12, 27, 0.09)',
          bright: 'rgba(12, 12, 27, 0.16)',
        },
        text: {
          1: '#14142a',
          2: '#5c5c78',
          3: '#9c9cb4',
        },
        brand: {
          blue: '#5c8fff',
          'blue-deep': '#3d6be0', // primary actions on light
          'blue-dim': 'rgba(61, 107, 224, 0.10)',
          cyan: '#2dd9ee',
          // Semantic on light — darkened for AA contrast.
          green: '#1fa873',
          red: '#e0495c',
          orange: '#cf7d12',
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
        card: '0 1px 2px rgba(12, 12, 27, 0.06), 0 4px 16px rgba(12, 12, 27, 0.07)',
        float: '0 12px 40px rgba(12, 12, 27, 0.12)',
        'brand-glow': '0 0 24px rgba(61, 107, 224, 0.18)',
      },
    },
  },
  plugins: [],
}
