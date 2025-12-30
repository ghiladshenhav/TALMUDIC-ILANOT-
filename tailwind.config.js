/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // NATURE FOREST THEME - Talmudic Ilanot
        background: {
          light: '#f5f0e1', // Warm parchment cream
          dark: '#0a1f0a',  // Deep forest dark
        },
        surface: {
          light: '#faf8f3', // Soft cream
          dark: '#132613',  // Forest surface
        },
        primary: {
          DEFAULT: '#10B981', // Emerald green
          hover: '#34D399',   // Lighter emerald
          foreground: '#f5f0e1', // Cream text on primary
          muted: '#065f46',   // Dark emerald
        },
        secondary: {
          DEFAULT: '#8B6914', // Warm gold/sepia
          foreground: '#f5f0e1',
          hover: '#a67c00',
        },
        text: {
          light: '#1a3d1a', // Dark forest green for light mode
          dark: '#e8e4d9',  // Warm cream for dark mode
          muted: '#6b8e6b', // Muted forest green
        },
        border: {
          light: '#c4b896', // Warm tan
          dark: '#1a4d2e',  // Forest green border
        },
        ai: {
          primary: '#34D399', // Bright emerald for AI
          surface: '#0f2f0f', // Dark forest AI surface
        },
        success: '#22c55e',   // Green
        warning: '#d4a418',   // Warm gold
        error: '#ef4444',     // Red
        info: '#10B981',      // Emerald

        // Forest accent colors
        forest: {
          deep: '#0a1f0a',
          dark: '#132613',
          mid: '#1a4d2e',
          light: '#2d5a3d',
          bright: '#10B981',
        },
        bark: {
          dark: '#3d2914',
          mid: '#5c3d1a',
          light: '#8B6914',
        },
        cream: {
          dark: '#d4c9a8',
          DEFAULT: '#f5f0e1',
          light: '#faf8f3',
        },

        // Legacy/Semantic mappings for compatibility
        'subtext-dark': '#6b8e6b',
        'card-dark': '#132613',
        'background-dark': '#0a1f0a',
        'surface-dark': '#1a3a1a',
        'text-dark': '#e8e4d9',
        'border-dark': '#1a4d2e',
        'primary-hover': '#34D399',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        'display': ['"Outfit"', 'sans-serif'],
        'body': ['"Inter"', 'sans-serif'],
        'serif': ['"Merriweather"', 'serif'], // Added for academic text
      }
    },
  },
  plugins: [],
}
