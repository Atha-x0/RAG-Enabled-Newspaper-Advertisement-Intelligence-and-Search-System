/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/app/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: '#1e293b',
          foreground: '#f8fafc',
        },
        primary: {
          DEFAULT: '#6366f1',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#3b82f6',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#10b981',
          foreground: '#ffffff',
        }
      },
    },
  },
  plugins: [],
}
