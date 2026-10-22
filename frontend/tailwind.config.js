/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Shadcn UI Semantic Design Tokens (HSL CSS Variables)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // WCAG AA / AAA Accessible Status Color System
        status: {
          success: {
            text: "hsl(var(--status-success-text))",
            bg: "hsl(var(--status-success-bg))",
            border: "hsl(var(--status-success-border))",
          },
          warning: {
            text: "hsl(var(--status-warning-text))",
            bg: "hsl(var(--status-warning-bg))",
            border: "hsl(var(--status-warning-border))",
          },
          danger: {
            text: "hsl(var(--status-danger-text))",
            bg: "hsl(var(--status-danger-bg))",
            border: "hsl(var(--status-danger-border))",
          },
          info: {
            text: "hsl(var(--status-info-text))",
            bg: "hsl(var(--status-info-bg))",
            border: "hsl(var(--status-info-border))",
          },
          neutral: {
            text: "hsl(var(--status-neutral-text))",
            bg: "hsl(var(--status-neutral-bg))",
            border: "hsl(var(--status-neutral-border))",
          },
        },

        // Legacy Theme Tokens preserved for 100% backward compatibility
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
        brand: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          500: '#0284C7',
          600: '#0369A1',
          700: '#075985',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // Soft elevation dynamic shadows
        'elevation-sm': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'elevation-md': '0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
        'elevation-lg': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-dark': '0 4px 20px -2px rgba(0, 0, 0, 0.45), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
        'glow-cyan': '0 0 20px -3px rgba(2, 132, 199, 0.4)',
        'glow-green': '0 0 20px -3px rgba(16, 185, 129, 0.4)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
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
