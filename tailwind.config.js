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
        // Warm gold -> coral accent, shared across light & dark themes
        primary: {
          50: '#FFF9E6',
          100: '#FFF3CC',
          200: '#FFEDB9',
          300: '#FFDD93',
          400: '#FFCB56',
          500: '#FFA259',
          600: '#F2884A',
          700: '#FF7E7E',
          800: '#E0625F',
          900: '#B84A47',
        },
        // Warm cream/stone neutrals for light mode
        light: {
          50: '#FFFDF8',
          100: '#FBF2DD',
          200: '#F5E7C4',
          300: '#E8D2A0',
          400: '#C9AD79',
          500: '#A8895E',
          600: '#8A6F4C',
          700: '#6B5539',
          800: '#4A3A28',
          900: '#2B2013',
        },
        // Warm brown/mauve neutrals for dark mode
        dark: {
          50: '#F2EAE0',
          100: '#F2EAE0',
          200: '#DED4D0',
          300: '#C4B6B6',
          400: '#A9A0A0',
          500: '#948C8C',
          600: '#7E7474',
          700: '#5C5442',
          800: '#4A4230',
          900: '#39311D',
          950: '#241F12',
        },
      },
    },
  },
  plugins: [],
};
