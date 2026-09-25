/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#0B0F17',
          dark: '#070A0F',
          light: '#111827',
        },
        panel: {
          DEFAULT: '#151D2A',
          hover: '#1B2536',
          active: '#101620',
        },
        hairline: '#222F44',
        'electric-cyan': {
          DEFAULT: '#0284C7',
          hover: '#0369A1',
          dim: 'rgba(2, 132, 199, 0.15)',
        },
        'grid-green': {
          DEFAULT: '#10B981',
          dim: 'rgba(16, 185, 129, 0.15)',
        },
        'caution-amber': {
          DEFAULT: '#F59E0B',
          dim: 'rgba(245, 158, 11, 0.15)',
        },
        'critical-red': {
          DEFAULT: '#EF4444',
          dim: 'rgba(239, 68, 68, 0.15)',
        },
        'steel-gray': '#94A3B8',
        'tech-white': '#F1F5F9',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
