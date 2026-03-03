/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cartola: {
          green: '#1a6b3c',
          dark: '#0d3d22',
          gold: '#f5a623'
        }
      }
    }
  },
  plugins: []
};
