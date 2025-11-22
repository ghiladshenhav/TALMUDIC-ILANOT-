/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          light: '#F0F4F3',
          dark: '#FDFBF7',  // "Paper White" - mapped to 'dark' key for instant theme switch
        },
        surface: {
          light: '#FFFFFF',
          dark: '#F4F1EA',  // Slightly darker parchment - was Pure White
        },
        primary: {
          DEFAULT: '#4A5D4A', // Sage Green - was Deep Emerald Green
          hover: '#047857', // Keep original hover for now, or adjust to a sage hover
          foreground: '#FFFFFF'
        },
        secondary: {
          DEFAULT: '#8FBC8F', // Dark Sea Green - was Light Gray
          foreground: '#1F2937'
        },
        text: {
          light: '#051410',
          dark: '#2C2C2C',  // Dark Charcoal - was "Ink Black"
          muted: '#5A5A5A'  // Medium Gray - was Gray 500
        },
        border: {
          light: '#E2E8F0',
          dark: '#D3D3C0'   // Soft border - was Gray 200
        },
        ai: {
          primary: '#A4755A', // Terracotta/Bronze for AI - was Violet 600
          surface: '#F0EBE5'  // Light warm gray for AI surface - was Violet 50
        },
        // Legacy/Semantic mappings to ensure compatibility
        'subtext-dark': '#5A5A5A', // Medium Gray - was #6B7280
        'card-dark': '#EAE7DE', // Card background - was #FFFFFF
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
