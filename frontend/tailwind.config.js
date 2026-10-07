/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
          hover: '#059669',
          dim: 'rgba(16, 185, 129, 0.15)',
        },
        'caution-amber': {
          DEFAULT: '#F59E0B',
          hover: '#D97706',
          dim: 'rgba(245, 158, 11, 0.15)',
        },
        'critical-red': {
          DEFAULT: '#EF4444',
          hover: '#DC2626',
          dim: 'rgba(239, 68, 68, 0.15)',
        },
        'steel-gray': '#94A3B8',
        'tech-white': '#F1F5F9',
        // Semantic design tokens for Modern UI (Light & Dark)
        brand: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          500: '#0284C7',
          600: '#0369A1',
          700: '#075985',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-dark': '0 4px 20px -2px rgba(0, 0, 0, 0.45), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
        'glow-cyan': '0 0 20px -3px rgba(2, 132, 199, 0.4)',
        'glow-green': '0 0 20px -3px rgba(16, 185, 129, 0.4)',
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-subtle': 'pulseSubtle 2.5s ease-in-out infinite',
        'float-3d': 'float3d 4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.02)' },
        },
        float3d: {
          '0%, 100%': { transform: 'translateY(0px) rotateX(0deg)' },
          '50%': { transform: 'translateY(-4px) rotateX(4deg)' },
        },
      },
    },
  },
  plugins: [],
};
