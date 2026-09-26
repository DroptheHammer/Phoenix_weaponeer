/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DCS-inspired color palette
        'dcs-dark': '#1a1a2e',
        // Hover and selected rows (AttackList, ThreatList) used this before it existed.
        'dcs-darker': '#10101f',
        'dcs-navy': '#16213e',
        'dcs-blue': '#0f3460',
        'dcs-accent': '#e94560',
      },
      fontFamily: {
        'mono': ['Consolas', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}
