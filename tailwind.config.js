/** @type {import('tailwindcss').Config} */
module.exports = {
  // Belangrijk: Dit vertelt Tailwind waar het moet kijken om classes te vinden.
  // Zonder dit worden er geen styles gegenereerd!
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      // Je kunt hier eventueel je eigen kleuren of fonts uitbreiden
    },
  },
  plugins: [],
}
