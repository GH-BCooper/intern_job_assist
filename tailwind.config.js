/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        /**
         * Warm gold -> coral accent, now resolved at *runtime* from CSS custom
         * properties so Settings can swap the whole palette with no rebuild.
         * index.css holds the Coral defaults; lib/accent.ts writes the others.
         */
        primary: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950) / <alpha-value>)',
        },
        accent: {
          50: 'rgb(var(--color-accent-50) / <alpha-value>)',
          100: 'rgb(var(--color-accent-100) / <alpha-value>)',
          200: 'rgb(var(--color-accent-200) / <alpha-value>)',
          300: 'rgb(var(--color-accent-300) / <alpha-value>)',
          400: 'rgb(var(--color-accent-400) / <alpha-value>)',
          500: 'rgb(var(--color-accent-500) / <alpha-value>)',
          600: 'rgb(var(--color-accent-600) / <alpha-value>)',
          700: 'rgb(var(--color-accent-700) / <alpha-value>)',
          800: 'rgb(var(--color-accent-800) / <alpha-value>)',
          900: 'rgb(var(--color-accent-900) / <alpha-value>)',
          950: 'rgb(var(--color-accent-950) / <alpha-value>)',
        },
        // Bright, airy warm neutrals for light mode
        light: {
          50: '#FFFFFF',
          100: '#FFFDFA',
          200: '#FEF7EC',
          300: '#F3E7D3',
          400: '#DCC7A8',
          500: '#A99175',
          600: '#7C6851',
          700: '#5C4C39',
          800: '#3D3325',
          900: '#231C11',
          950: '#140F08',
        },
        // Warm brown/mauve neutrals for dark mode
        dark: {
          50: '#F7F1E8',
          100: '#EFE7DB',
          200: '#DED4D0',
          300: '#C4B6B6',
          400: '#A9A0A0',
          500: '#8C8380',
          600: '#6A6052',
          700: '#514937',
          800: '#3A3324',
          900: '#2A2417',
          950: '#1B170E',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(35, 28, 17, 0.04), 0 8px 24px -12px rgba(35, 28, 17, 0.10)',
        lift: '0 2px 4px rgba(35, 28, 17, 0.05), 0 18px 40px -18px rgba(35, 28, 17, 0.18)',
        glow: '0 0 0 1px rgba(251, 146, 60, 0.25), 0 12px 32px -12px rgba(251, 146, 60, 0.35)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': { '0%': { transform: 'scale(.8)', opacity: '.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
        'mesh-drift': {
          '0%': { transform: 'rotate(0deg) scale(1.15)' },
          '50%': { transform: 'rotate(180deg) scale(1.3)' },
          '100%': { transform: 'rotate(360deg) scale(1.15)' },
        },
        'draw-in': { '0%': { strokeDashoffset: '400' }, '100%': { strokeDashoffset: '0' } },
        'count-up': { '0%': { opacity: '0', transform: 'translateY(6px) scale(.97)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out both',
        'slide-up': 'slide-up .28s cubic-bezier(.22,1,.36,1) both',
        'slide-in-right': 'slide-in-right .3s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scale-in .2s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        'mesh-drift': 'mesh-drift 38s linear infinite',
        'draw-in': 'draw-in 1.1s ease-out both',
        'count-up': 'count-up .4s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
};
