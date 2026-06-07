/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand (parked - update with final logo hex)
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
          950: '#022C22',
        },
        // Status (semantic - never change)
        status: {
          up: '#10B981',
          down: '#EF4444',
          pending: '#F59E0B',
          maintenance: '#3B82F6',
          paused: '#6B7280',
        },
      },
      fontFamily: {
        sans: ['System', 'Roboto'],
        mono: ['Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
