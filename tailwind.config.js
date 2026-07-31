/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: '#0d1117',
          panel: '#161b22',
          card: '#161b22',
        },
        border: {
          subtle: '#30363d',
          interactive: '#30363d'
        },
        status: {
          green: '#238636',
          blue: '#2f81f7',
          amber: '#d29922',
          red: '#da3633'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
