/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          0: '#06060b',
          1: '#0c0c17',
          2: '#111120',
        },
        card: {
          DEFAULT: 'rgba(255, 255, 255, 0.035)',
          hover: 'rgba(255, 255, 255, 0.06)',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.07)',
          bright: 'rgba(255, 255, 255, 0.13)',
        },
        text: {
          1: '#edecea',
          2: '#74748c',
          3: '#3e3e52',
        },
        brand: {
          blue: '#3d82ff',
          'blue-dim': 'rgba(61, 130, 255, 0.09)',
          cyan: '#22d3ee',
          green: '#34d399',
          red: '#f87171',
          orange: '#fbbf24',
        },
      },
      fontFamily: {
        head: ['Syne', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
      maxWidth: {
        site: '1120px',
      },
    },
  },
  plugins: [],
}
