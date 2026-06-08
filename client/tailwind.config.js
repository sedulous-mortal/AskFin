/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        handlee: ['Handlee', 'cursive'],
      },
    },
  },
  plugins: [],
};
