// Every color is a CSS variable, so components never need `dark:` prefixes.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)', surface: 'var(--bg-surface)', card: 'var(--bg-card)', input: 'var(--bg-input)', elevated: 'var(--bg-elevated)',
        accent: { DEFAULT: 'var(--accent)', dark: 'var(--accent-dark)', soft: 'var(--accent-soft)', text: 'var(--accent-text)', cyan: 'var(--accent-cyan)', green: 'var(--accent-green)', yellow: 'var(--accent-yellow)', red: 'var(--accent-red)' },
        ink: { DEFAULT: 'var(--text-primary)', soft: 'var(--text-secondary)', muted: 'var(--text-muted)' },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        sans: ['Inter', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)', glow: 'var(--shadow-glow)' },
      transitionTimingFunction: { out: 'var(--ease-out)' },
    },
  },
  plugins: [],
};
