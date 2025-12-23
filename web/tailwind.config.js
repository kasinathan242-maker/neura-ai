/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f', // Ultra dark
        surface: '#13131f',    // Slightly lighter
        primary: '#6d28d9',    // Deep Violet
        secondary: '#be185d',  // Pink
        accent: '#0ea5e9',     // Sky Blue
        glass: 'rgba(255, 255, 255, 0.05)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
