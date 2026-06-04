/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
      colors: {
        navy: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c2d4ff',
          300: '#93b3ff',
          400: '#5d8aff',
          500: '#2d63ff',
          600: '#1240f0',
          700: '#0d2fcc',
          800: '#102899',
          900: '#0f2276',
          950: '#0a1540',
        },
        dark: {
          900: '#0d1b2e',
          800: '#112040',
          700: '#1a2f50',
          600: '#243d63',
          500: '#2e4d7a',
        },
        light: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716b',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
      },
    },
  },
  plugins: [],
};
